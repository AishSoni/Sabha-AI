"""Editable user-message queue (CONTRACTS section 5).

Only user messages queue. Pending entries are excluded from transcripts and
running-turn snapshots. Edit/remove contend with dispatch on the same
revision-guarded predicate: exactly one outcome wins. Dispatch transitions the
entry and inserts the message atomically. Draining is FIFO; late arrivals join
the tail and never overtake earlier entries. No automatic AI turn starts.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.modules.meetings.domain import (
    MAX_QUEUE_CHARS,
    MAX_QUEUE_PENDING,
    validate_queue_content,
)

PENDING = "pending"
DISPATCHED = "dispatched"
REMOVED = "removed"


class QueueValidation(Exception):
    pass


class QueueConflict(Exception):
    """Stale revision, duplicate delivery, or idempotency mismatch."""

    def __init__(self, code: str, current: Optional[dict] = None):
        super().__init__(code)
        self.code = code
        self.current = current or {}


class QueueCapacity(Exception):
    pass


@dataclass
class QueueEntry:
    entry_id: str
    meeting_id: str
    owner_id: str
    seq: int
    content: str
    revision: int = 1
    state: str = PENDING
    idempotency_key: str = ""
    message_id: Optional[str] = None
    created_at: float = 0.0
    updated_at: float = 0.0


def _entry_dict(entry: QueueEntry) -> dict:
    return {
        "entry_id": entry.entry_id,
        "seq": entry.seq,
        "content": entry.content,
        "revision": entry.revision,
        "state": entry.state,
        "message_id": entry.message_id,
    }


class InMemoryQueue:
    """Process-lifetime queue; one asyncio lock serializes submit/edit/
    remove/dispatch exactly like the SQL predicate must."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._entries: dict[str, QueueEntry] = {}
        self._by_key: dict[str, str] = {}
        self._seq = 0

    def _pending(self, meeting_id: str) -> list[QueueEntry]:
        return sorted(
            (e for e in self._entries.values()
             if e.meeting_id == meeting_id and e.state == PENDING),
            key=lambda e: e.seq,
        )

    async def submit(
        self,
        meeting_id: str,
        owner_id: str,
        content: str,
        idempotency_key: Optional[str] = None,
        *,
        meeting_active: bool = True,
        has_active_work: bool = False,
    ) -> tuple[str, QueueEntry]:
        """Same use case decides: idle active meeting commits immediately,
        otherwise the message queues. Returns (committed|queued, entry)."""
        try:
            text = validate_queue_content(content)
        except ValueError as exc:
            raise QueueValidation(str(exc)) from exc
        async with self._lock:
            if idempotency_key and idempotency_key in self._by_key:
                existing = self._entries[self._by_key[idempotency_key]]
                if existing.content != text or existing.meeting_id != meeting_id:
                    raise QueueConflict("idempotency_conflict", _entry_dict(existing))
                return ("queued" if existing.state == PENDING else "committed", existing)
            if not meeting_active:
                raise QueueValidation("meeting_not_active")
            if not has_active_work:
                entry = QueueEntry(
                    entry_id=str(uuid.uuid4()), meeting_id=meeting_id,
                    owner_id=owner_id, seq=0, content=text,
                    idempotency_key=idempotency_key or "",
                    created_at=time.time(), updated_at=time.time(),
                )
                if idempotency_key:
                    self._by_key[idempotency_key] = entry.entry_id
                self._entries[entry.entry_id] = entry
                return ("committed", entry)
            if len(self._pending(meeting_id)) >= MAX_QUEUE_PENDING:
                raise QueueCapacity("queue_full")
            self._seq += 1
            entry = QueueEntry(
                entry_id=str(uuid.uuid4()), meeting_id=meeting_id,
                owner_id=owner_id, seq=self._seq, content=text,
                idempotency_key=idempotency_key or "",
                created_at=time.time(), updated_at=time.time(),
            )
            if idempotency_key:
                self._by_key[idempotency_key] = entry.entry_id
            self._entries[entry.entry_id] = entry
            return ("queued", entry)

    async def edit(self, entry_id: str, owner_id: str, content: str,
                   expected_revision: int) -> QueueEntry:
        try:
            text = validate_queue_content(content)
        except ValueError as exc:
            raise QueueValidation(str(exc)) from exc
        async with self._lock:
            entry = self._entries.get(entry_id)
            if entry is None or entry.owner_id != owner_id:
                raise QueueConflict("not_found", {})
            if entry.state == DISPATCHED:
                raise QueueConflict("already_dispatched", _entry_dict(entry))
            if entry.state != PENDING:
                raise QueueConflict("not_pending", _entry_dict(entry))
            if entry.revision != expected_revision:
                raise QueueConflict("revision_conflict", _entry_dict(entry))
            entry.content = text
            entry.revision += 1
            entry.updated_at = time.time()
            return entry

    async def remove(self, entry_id: str, owner_id: str,
                     expected_revision: int) -> QueueEntry:
        async with self._lock:
            entry = self._entries.get(entry_id)
            if entry is None or entry.owner_id != owner_id:
                raise QueueConflict("not_found", {})
            if entry.state == DISPATCHED:
                raise QueueConflict("already_dispatched", _entry_dict(entry))
            if entry.state != PENDING:
                raise QueueConflict("not_pending", _entry_dict(entry))
            if entry.revision != expected_revision:
                raise QueueConflict("revision_conflict", _entry_dict(entry))
            entry.state = REMOVED
            entry.revision += 1
            entry.updated_at = time.time()
            return entry

    async def list_pending(self, meeting_id: str) -> list[QueueEntry]:
        async with self._lock:
            return list(self._pending(meeting_id))

    async def pending_count(self, meeting_id: str) -> int:
        async with self._lock:
            return len(self._pending(meeting_id))

    async def mark_dispatched(self, entry_id: str, message_id: str) -> QueueEntry:
        """Terminal drain step: only the drain owner calls this, holding the
        same lock, so a racing edit either wins first or sees dispatched."""
        async with self._lock:
            entry = self._entries.get(entry_id)
            if entry is None or entry.state != PENDING:
                raise QueueConflict("not_pending", {})
            entry.state = DISPATCHED
            entry.message_id = message_id
            entry.updated_at = time.time()
            return entry


_QUEUE_SCHEMA = """
CREATE TABLE IF NOT EXISTS queue_entries (
    entry_id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    content TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'pending',
    idempotency_key TEXT NOT NULL DEFAULT '',
    message_id TEXT,
    created_at REAL NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_seq
    ON queue_entries(meeting_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_idem
    ON queue_entries(meeting_id, idempotency_key)
    WHERE idempotency_key <> '';
CREATE TABLE IF NOT EXISTS queue_messages (
    message_id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL UNIQUE,
    meeting_id TEXT NOT NULL,
    content TEXT NOT NULL
);
"""


class SqliteQueueStore:
    """Real-SQL queue proving revision-guarded edit/dispatch races and
    atomic dispatch (entry transition + message insert in one transaction).

    Each instance owns its connection; tests race independent instances
    against the same file so exactly one contender wins.
    """

    def __init__(self, path: Optional[str] = None):
        self._path = path or str(Path(tempfile.mkdtemp()) / "queue.db")
        self._local = threading.local()

    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._path, check_same_thread=False,
                                   isolation_level=None, timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_QUEUE_SCHEMA)
            self._local.conn = conn
        return conn

    def submit(self, meeting_id: str, owner_id: str, content: str,
               idempotency_key: str = "", *, has_active_work: bool = True) -> dict:
        text = validate_queue_content(content)
        if len(text) > MAX_QUEUE_CHARS:
            raise QueueValidation("oversized message")
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            if idempotency_key:
                row = conn.execute(
                    "SELECT entry_id, content, meeting_id, state FROM queue_entries "
                    "WHERE meeting_id=? AND idempotency_key=?",
                    (meeting_id, idempotency_key)).fetchone()
                if row is not None:
                    if row[1] != text or row[2] != meeting_id:
                        conn.execute("ROLLBACK")
                        raise QueueConflict("idempotency_conflict")
                    conn.execute("ROLLBACK")
                    return {"entry_id": row[0], "duplicate": True}
            count = conn.execute(
                "SELECT COUNT(*) FROM queue_entries WHERE meeting_id=? AND state='pending'",
                (meeting_id,)).fetchone()[0]
            if count >= MAX_QUEUE_PENDING:
                conn.execute("ROLLBACK")
                raise QueueCapacity("queue_full")
            top = conn.execute(
                "SELECT COALESCE(MAX(seq),0) FROM queue_entries WHERE meeting_id=?",
                (meeting_id,)).fetchone()[0]
            entry_id = str(uuid.uuid4())
            now = time.time()
            conn.execute(
                "INSERT INTO queue_entries(entry_id,meeting_id,owner_id,seq,content,"
                "revision,state,idempotency_key,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (entry_id, meeting_id, owner_id, top + 1, text, 1,
                 PENDING, idempotency_key, now, now))
            conn.execute("COMMIT")
            return {"entry_id": entry_id, "duplicate": False}
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def edit(self, entry_id: str, owner_id: str, content: str,
             expected_revision: int) -> dict:
        text = validate_queue_content(content)
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT state, revision, owner_id FROM queue_entries WHERE entry_id=?",
                (entry_id,)).fetchone()
            if row is None or row[2] != owner_id:
                conn.execute("ROLLBACK")
                raise QueueConflict("not_found")
            state, revision = row[0], row[1]
            if state == DISPATCHED:
                conn.execute("ROLLBACK")
                raise QueueConflict("already_dispatched")
            if state != PENDING:
                conn.execute("ROLLBACK")
                raise QueueConflict("not_pending")
            if revision != expected_revision:
                conn.execute("ROLLBACK")
                raise QueueConflict("revision_conflict")
            cur = conn.execute(
                "UPDATE queue_entries SET content=?, revision=revision+1, updated_at=? "
                "WHERE entry_id=? AND revision=? AND state='pending'",
                (text, time.time(), entry_id, expected_revision))
            if cur.rowcount != 1:
                conn.execute("ROLLBACK")
                raise QueueConflict("revision_conflict")
            conn.execute("COMMIT")
            return {"entry_id": entry_id, "revision": expected_revision + 1}
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def remove(self, entry_id: str, owner_id: str, expected_revision: int) -> None:
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            cur = conn.execute(
                "UPDATE queue_entries SET state='removed', revision=revision+1 "
                "WHERE entry_id=? AND owner_id=? AND revision=? AND state='pending'",
                (entry_id, owner_id, expected_revision))
            if cur.rowcount != 1:
                conn.execute("ROLLBACK")
                state = conn.execute(
                    "SELECT state FROM queue_entries WHERE entry_id=?",
                    (entry_id,)).fetchone()
                raise QueueConflict(
                    "already_dispatched" if state and state[0] == DISPATCHED
                    else "revision_conflict")
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def dispatch_next(self, meeting_id: str, owner_id: str,
                      fail_after_insert: bool = False) -> Optional[dict]:
        """Atomically transition the oldest pending entry and insert its
        message. Crash injection between the writes proves rollback."""
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT entry_id, content, revision FROM queue_entries "
                "WHERE meeting_id=? AND owner_id=? AND state='pending' "
                "ORDER BY seq LIMIT 1",
                (meeting_id, owner_id)).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                return None
            entry_id, content, revision = row
            cur = conn.execute(
                "UPDATE queue_entries SET state='dispatched', revision=revision+1 "
                "WHERE entry_id=? AND state='pending' AND revision=?",
                (entry_id, revision))
            if cur.rowcount != 1:
                conn.execute("ROLLBACK")
                return None
            message_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO queue_messages(message_id,entry_id,meeting_id,content) "
                "VALUES(?,?,?,?)", (message_id, entry_id, meeting_id, content))
            if fail_after_insert:
                raise RuntimeError("injected crash between dispatch writes")
            conn.execute("COMMIT")
            return {"entry_id": entry_id, "message_id": message_id,
                    "content": content}
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def pending(self, meeting_id: str) -> list[dict]:
        conn = self._conn()
        return [
            {"entry_id": r[0], "content": r[1], "revision": r[2], "seq": r[3]}
            for r in conn.execute(
                "SELECT entry_id, content, revision, seq FROM queue_entries "
                "WHERE meeting_id=? AND state='pending' ORDER BY seq",
                (meeting_id,)).fetchall()
        ]

    def message_count(self, meeting_id: str) -> int:
        return self._conn().execute(
            "SELECT COUNT(*) FROM queue_messages WHERE meeting_id=?",
            (meeting_id,)).fetchone()[0]

    def entry_state(self, entry_id: str) -> Optional[str]:
        row = self._conn().execute(
            "SELECT state FROM queue_entries WHERE entry_id=?",
            (entry_id,)).fetchone()
        return row[0] if row else None

    @property
    def path(self) -> str:
        return self._path

    def peer(self) -> "SqliteQueueStore":
        """Independent connection to the same database for race tests."""
        return SqliteQueueStore(path=self._path)
