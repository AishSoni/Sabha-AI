"""Durable execution coordinator: lease claims, fencing, heartbeats, startup
reconciliation and bounded retry classification (CONTRACTS sections 3, 8).

One active execution reservation per meeting covers a pending/running turn or
an ending attempt. Claims persist with a fencing token and expiry; an old
worker that lost its lease, was reset, or expired cannot finalize afterwards.
Restart recovery separates safe unstarted work (retryable) from uncertain
already-started provider work (interrupted, never auto-replayed). Expired jobs
are terminalized with visible status while committed effects are retained.
"""

from __future__ import annotations

import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

from app.modules.meetings.store import TurnConflict


class LeaseConflict(TurnConflict):
    """A live execution already holds the meeting reservation."""


class Fenced(Exception):
    """The holder lost its lease: it must not finalize or commit further."""


RETRYABLE = "retryable"
TERMINAL = "terminal"
INTERRUPTED = "interrupted"

# Failure kinds that are safe to retry without risking a duplicate paid call.
_RETRYABLE_PREFIXES = ("transport_", "timeout", "rate_limit", "unavailable")


def classify_retry(code: str, *, started_provider_work: bool) -> str:
    """Bounded retry classification. Work that may already have reached the
    provider is never silently replayed: it reconciles as interrupted."""
    if started_provider_work:
        return INTERRUPTED
    if code.startswith(_RETRYABLE_PREFIXES):
        return RETRYABLE
    return TERMINAL


_COORDINATOR_SCHEMA = """
CREATE TABLE IF NOT EXISTS execution_leases (
    meeting_id TEXT PRIMARY KEY,
    holder_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    fencing_token INTEGER NOT NULL,
    generation INTEGER NOT NULL DEFAULT 1,
    lease_expires_at REAL NOT NULL,
    started_provider_work INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'claimed',
    created_at REAL NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lease_history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    disposition TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    recorded_at REAL NOT NULL DEFAULT 0
);
"""


class DurableCoordinator:
    """SQLite-backed lease coordinator. Each instance owns its connection so
    tests race independent instances the way independent workers race."""

    def __init__(self, path: Optional[str] = None,
                 now_fn: Optional[Callable[[], float]] = None) -> None:
        self._path = path or str(Path(tempfile.mkdtemp()) / "leases.db")
        self._now = now_fn or time.time
        self._local = threading.local()

    @property
    def path(self) -> str:
        return self._path

    def peer(self) -> "DurableCoordinator":
        return DurableCoordinator(path=self._path, now_fn=self._now)

    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._path, check_same_thread=False,
                                   isolation_level=None, timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_COORDINATOR_SCHEMA)
            self._local.conn = conn
        return conn

    def claim(self, meeting_id: str, holder_id: str, kind: str,
              ttl_seconds: float = 30.0, generation: int = 1) -> int:
        """Persist a lease claim. Returns the fencing token. A live holder
        wins; an expired or terminal holder is taken over."""
        now = self._now()
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT holder_id, kind, fencing_token, lease_expires_at, state, "
                "generation FROM execution_leases WHERE meeting_id=?",
                (meeting_id,)).fetchone()
            if row is not None:
                live = row[4] in ("claimed", "running") and row[3] > now
                if live:
                    conn.execute("ROLLBACK")
                    raise LeaseConflict("turn_in_progress")
            token = (row[2] + 1) if row is not None else 1
            conn.execute(
                "INSERT OR REPLACE INTO execution_leases(meeting_id,holder_id,kind,"
                "fencing_token,generation,lease_expires_at,started_provider_work,"
                "state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (meeting_id, holder_id, kind, token, generation, now + ttl_seconds,
                 0, "claimed", now, now))
            conn.execute("COMMIT")
            return token
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def heartbeat(self, meeting_id: str, holder_id: str, fencing_token: int,
                  ttl_seconds: float = 30.0) -> bool:
        """Renew the lease. False means fenced: stop without finalizing.

        A lapsed lease is never resurrected by a late heartbeat."""
        now = self._now()
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT holder_id, fencing_token, state, lease_expires_at "
                "FROM execution_leases WHERE meeting_id=?", (meeting_id,)).fetchone()
            if (row is None or row[0] != holder_id or row[1] != fencing_token
                    or row[2] not in ("claimed", "running") or row[3] <= now):
                conn.execute("ROLLBACK")
                return False
            conn.execute(
                "UPDATE execution_leases SET lease_expires_at=?, state='running', "
                "updated_at=? WHERE meeting_id=?", (now + ttl_seconds, now, meeting_id))
            conn.execute("COMMIT")
            return True
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def mark_provider_started(self, meeting_id: str, holder_id: str,
                              fencing_token: int) -> bool:
        """Record that a paid provider call may be in flight. After this,
        recovery treats the outcome as uncertain and never replays it."""
        conn = self._conn()
        cur = conn.execute(
            "UPDATE execution_leases SET started_provider_work=1, updated_at=? "
            "WHERE meeting_id=? AND holder_id=? AND fencing_token=? "
            "AND state IN ('claimed','running') AND lease_expires_at > ?",
            (self._now(), meeting_id, holder_id, fencing_token, self._now()))
        return cur.rowcount == 1

    def complete(self, meeting_id: str, holder_id: str, fencing_token: int,
                 disposition: str) -> bool:
        """Terminalize the holder's lease. False means fenced: the caller
        must not commit any result or terminal state."""
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT holder_id, fencing_token, kind, generation, state, "
                "lease_expires_at FROM execution_leases WHERE meeting_id=?",
                (meeting_id,)).fetchone()
            now = self._now()
            if (row is None or row[0] != holder_id or row[1] != fencing_token
                    or row[4] not in ("claimed", "running") or row[5] <= now):
                conn.execute("ROLLBACK")
                return False
            conn.execute(
                "UPDATE execution_leases SET state='terminal', updated_at=? "
                "WHERE meeting_id=?", (now, meeting_id))
            conn.execute(
                "INSERT INTO lease_history(meeting_id,holder_id,kind,disposition,"
                "recorded_at) VALUES(?,?,?,?,?)",
                (meeting_id, holder_id, row[2], disposition, now))
            conn.execute("COMMIT")
            return True
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def revoke_generation(self, meeting_id: str, new_generation: int) -> None:
        """Reset/expiry boundary: terminalize the current holder so its next
        heartbeat or finalization is fenced. The generation marker is stored
        so a fresh claim starts a new fenced epoch."""
        conn = self._conn()
        now = self._now()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT holder_id, kind FROM execution_leases WHERE meeting_id=?",
                (meeting_id,)).fetchone()
            if row is not None:
                conn.execute(
                    "UPDATE execution_leases SET state='terminal', generation=?, "
                    "updated_at=? WHERE meeting_id=?",
                    (new_generation, now, meeting_id))
                conn.execute(
                    "INSERT INTO lease_history(meeting_id,holder_id,kind,"
                    "disposition,recorded_at) VALUES(?,?,?,?,?)",
                    (meeting_id, row[0], row[1], "revoked", now))
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def holder_generation(self, meeting_id: str) -> Optional[int]:
        row = self._conn().execute(
            "SELECT generation FROM execution_leases WHERE meeting_id=?",
            (meeting_id,)).fetchone()
        return row[0] if row else None

    def reconcile(self, now: Optional[float] = None) -> list[dict]:
        """Startup recovery. Expired unstarted work is safe to retry;
        expired work that may have reached the provider reconciles as
        interrupted without replay. Committed history is retained."""
        moment = now if now is not None else self._now()
        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            rows = conn.execute(
                "SELECT meeting_id, holder_id, kind, started_provider_work "
                "FROM execution_leases WHERE state IN ('claimed','running') "
                "AND lease_expires_at <= ?", (moment,)).fetchall()
            report = []
            for meeting_id, holder_id, kind, started in rows:
                disposition = INTERRUPTED if started else "failed_safe"
                conn.execute(
                    "UPDATE execution_leases SET state='terminal', updated_at=? "
                    "WHERE meeting_id=?", (moment, meeting_id))
                conn.execute(
                    "INSERT INTO lease_history(meeting_id,holder_id,kind,"
                    "disposition,recorded_at) VALUES(?,?,?,?,?)",
                    (meeting_id, holder_id, kind, disposition, moment))
                report.append({"meeting_id": meeting_id, "holder_id": holder_id,
                               "kind": kind, "disposition": disposition})
            conn.execute("COMMIT")
            return report
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def history(self, meeting_id: str) -> list[dict]:
        return [
            {"holder_id": r[0], "kind": r[1], "disposition": r[2]}
            for r in self._conn().execute(
                "SELECT holder_id, kind, disposition FROM lease_history "
                "WHERE meeting_id=? ORDER BY seq", (meeting_id,)).fetchall()
        ]

    def new_holder_id(self, prefix: str = "turn") -> str:
        return f"{prefix}-{uuid.uuid4()}"
