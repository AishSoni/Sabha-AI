"""Turn identity, reservation, idempotency, and event journal.

Process-lifetime store satisfies the Phase 02 private milestone; durable
multi-worker leases/fencing remain assigned to Phase 04. SQLite ledger below
proves atomic reservation/finalization with real SQL transactions.
"""

import asyncio
import hashlib
import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


class TurnConflict(Exception):
    pass


class IdempotencyConflict(Exception):
    pass


class ProtocolConflict(Exception):
    pass


class TurnNotFound(Exception):
    pass


PENDING = "pending"
RUNNING = "running"
COMPLETED = "completed"
FAILED = "failed"
CANCELLED = "cancelled"

TERMINAL = {COMPLETED, FAILED, CANCELLED}


def _payload_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


@dataclass
class TurnRecord:
    turn_id: str
    meeting_id: str
    participant_id: str
    idempotency_key: str
    state: str = PENDING
    created_at: float = 0.0
    updated_at: float = 0.0
    context_snapshot: dict[str, Any] = field(default_factory=dict)
    result_message_id: Optional[str] = None
    terminal_reason: Optional[str] = None
    usage: dict[str, int] = field(default_factory=dict)
    usage_completeness: str = "unknown"
    cost: float = 0.0
    invocation_count: int = 0
    tool_call_count: int = 0


class InMemoryTurnStore:
    """Process-lifetime turn coordination with monotonic event journal."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._turns: dict[str, TurnRecord] = {}
        self._active_by_meeting: dict[str, str] = {}
        self._idempotency: dict[str, str] = {}
        self._payload_hashes: dict[str, str] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}
        self._effects: dict[str, dict[str, Any]] = {}
        self._invocation_ids: set[str] = set()

    async def reserve(
        self,
        meeting_id: str,
        participant_id: str,
        idempotency_key: str,
        context_snapshot: Optional[dict[str, Any]] = None,
    ) -> TurnRecord:
        snapshot = context_snapshot or {}
        payload = {"meeting_id": meeting_id, "participant_id": participant_id, **snapshot}
        # Transcript boundary is provenance, not request identity: exclude the
        # volatile message-id list so idempotent retry returns the original
        # result after the first execution appended its message.
        digest_payload = {k: v for k, v in payload.items() if k != "message_ids"}
        digest = _payload_hash(digest_payload)
        async with self._lock:
            if idempotency_key in self._idempotency:
                existing_id = self._idempotency[idempotency_key]
                if self._payload_hashes.get(idempotency_key) != digest:
                    raise IdempotencyConflict("idempotency key reused with different payload")
                return self._turns[existing_id]
            if meeting_id in self._active_by_meeting:
                raise TurnConflict("turn_in_progress")
            now = time.time()
            turn_id = str(uuid.uuid4())
            record = TurnRecord(
                turn_id=turn_id,
                meeting_id=meeting_id,
                participant_id=participant_id,
                idempotency_key=idempotency_key,
                state=PENDING,
                created_at=now,
                updated_at=now,
                context_snapshot=snapshot,
            )
            self._turns[turn_id] = record
            self._active_by_meeting[meeting_id] = turn_id
            self._idempotency[idempotency_key] = turn_id
            self._payload_hashes[idempotency_key] = digest
            self._events[turn_id] = []
            return record

    async def mark_running(self, turn_id: str) -> TurnRecord:
        async with self._lock:
            record = self._require(turn_id)
            if record.state == PENDING:
                record.state = RUNNING
                record.updated_at = time.time()
            return record

    async def get(self, turn_id: str) -> TurnRecord:
        async with self._lock:
            return self._require(turn_id)

    async def get_active(self, meeting_id: str) -> Optional[TurnRecord]:
        async with self._lock:
            turn_id = self._active_by_meeting.get(meeting_id)
            if turn_id is None:
                return None
            return self._turns[turn_id]

    async def append_event(self, turn_id: str, event_type: str, data: Optional[dict] = None) -> dict:
        async with self._lock:
            self._require(turn_id)
            journal = self._events.setdefault(turn_id, [])
            sequence = len(journal) + 1
            event = {
                "version": 2,
                "event_id": f"{turn_id}:{sequence}",
                "sequence": sequence,
                "turn_id": turn_id,
                "type": event_type,
                "data": data or {},
            }
            journal.append(event)
            return event

    async def list_events(self, turn_id: str, after: int = 0) -> list[dict]:
        async with self._lock:
            self._require(turn_id)
            return [e for e in self._events.get(turn_id, []) if e["sequence"] > after]

    async def finalize(
        self,
        turn_id: str,
        state: str,
        message_id: Optional[str] = None,
        usage: Optional[dict] = None,
        cost: float = 0.0,
        terminal_reason: Optional[str] = None,
    ) -> TurnRecord:
        """Idempotent terminal transition; retry returns the original record."""
        async with self._lock:
            record = self._require(turn_id)
            if record.state in TERMINAL:
                return record
            record.state = state
            record.result_message_id = message_id
            record.terminal_reason = terminal_reason
            if usage is not None:
                record.usage = dict(usage)
            record.cost = cost
            record.updated_at = time.time()
            self._active_by_meeting.pop(record.meeting_id, None)
            return record

    async def request_cancel(self, turn_id: str) -> bool:
        """Best-effort cancel; loses the race if already terminal."""
        async with self._lock:
            record = self._require(turn_id)
            if record.state in TERMINAL:
                return False
            record.state = CANCELLED
            record.terminal_reason = "cancel_requested"
            record.updated_at = time.time()
            self._active_by_meeting.pop(record.meeting_id, None)
            return True

    async def record_effect(
        self, execution_id: str, arguments: dict[str, Any], effect: dict[str, Any]
    ) -> tuple[dict[str, Any], bool]:
        """Idempotent communication effect. Returns (effect, created).

        Same execution id with different arguments is a protocol conflict.
        """
        digest = _payload_hash(arguments)
        async with self._lock:
            existing = self._effects.get(execution_id)
            if existing is not None:
                if existing["args_hash"] != digest:
                    raise ProtocolConflict("execution identity reused with different arguments")
                return existing["effect"], False
            self._effects[execution_id] = {"args_hash": digest, "effect": effect}
            return effect, True

    async def record_invocation(self, invocation_id: str, usage: dict[str, Any]) -> bool:
        """Deduplicate provider usage on invocation identity. Returns created."""
        async with self._lock:
            if invocation_id in self._invocation_ids:
                return False
            self._invocation_ids.add(invocation_id)
            return True

    def _require(self, turn_id: str) -> TurnRecord:
        record = self._turns.get(turn_id)
        if record is None:
            raise TurnNotFound(f"unknown turn {turn_id}")
        return record


class SqliteTurnLedger:
    """Real-SQL reservation/finalization proving atomicity and rollback.

    Uses stdlib sqlite3 so transaction tests run offline. Mirrors the
    reservation/finalization contract the Supabase RPC must uphold.
    """

    def __init__(self, path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS turns (
                turn_id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                participant_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                payload_hash TEXT NOT NULL,
                state TEXT NOT NULL,
                result_message_id TEXT,
                usage_json TEXT NOT NULL DEFAULT '{}',
                cost REAL NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_active_meeting
                ON turns(meeting_id) WHERE state IN ('pending','running');
            CREATE TABLE IF NOT EXISTS turn_events (
                turn_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                type TEXT NOT NULL,
                data_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (turn_id, sequence)
            );
            """
        )

    def reserve(
        self, meeting_id: str, participant_id: str, idempotency_key: str, payload: dict
    ) -> str:
        digest = _payload_hash(payload)
        turn_id = str(uuid.uuid4())
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            row = self._conn.execute(
                "SELECT turn_id, payload_hash FROM turns WHERE idempotency_key=?",
                (idempotency_key,),
            ).fetchone()
            if row is not None:
                if row[1] != digest:
                    self._conn.execute("ROLLBACK")
                    raise IdempotencyConflict("idempotency key reused with different payload")
                self._conn.execute("ROLLBACK")
                return row[0]
            self._conn.execute(
                "INSERT INTO turns(turn_id,meeting_id,participant_id,idempotency_key,"
                "payload_hash,state) VALUES(?,?,?,?,?,?)",
                (turn_id, meeting_id, participant_id, idempotency_key, digest, PENDING),
            )
            self._conn.execute("COMMIT")
            return turn_id
        except sqlite3.IntegrityError as exc:
            try:
                self._conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            message = str(exc).lower()
            if "idx_active_meeting" in message or "unique" in message:
                # Distinguish active-turn race from idempotency race via lookup.
                existing = self._conn.execute(
                    "SELECT turn_id FROM turns WHERE idempotency_key=?", (idempotency_key,)
                ).fetchone()
                if existing is not None:
                    return existing[0]
                raise TurnConflict("turn_in_progress") from exc
            raise

    def finalize(
        self,
        turn_id: str,
        state: str,
        message_id: Optional[str] = None,
        usage: Optional[dict] = None,
        cost: float = 0.0,
        fail_after_message: bool = False,
    ) -> None:
        """Atomic message/cost/terminal write. fail_after_message simulates a
        crash between writes to prove rollback."""
        self._conn.execute("BEGIN IMMEDIATE")
        try:
            self._conn.execute(
                "UPDATE turns SET state=?, result_message_id=?, usage_json=?, cost=? "
                "WHERE turn_id=? AND state NOT IN ('completed','failed','cancelled')",
                (state, message_id, json.dumps(usage or {}), cost, turn_id),
            )
            if fail_after_message:
                raise RuntimeError("injected failure between message and terminal writes")
            self._conn.execute(
                "INSERT OR IGNORE INTO turn_events(turn_id,sequence,type,data_json) "
                "VALUES(?,?,?,?)",
                (turn_id, 1, f"turn_{state}", json.dumps({"message_id": message_id})),
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get(self, turn_id: str) -> dict:
        row = self._conn.execute(
            "SELECT turn_id,meeting_id,participant_id,state,result_message_id,"
            "usage_json,cost FROM turns WHERE turn_id=?",
            (turn_id,),
        ).fetchone()
        if row is None:
            raise TurnNotFound(turn_id)
        return {
            "turn_id": row[0],
            "meeting_id": row[1],
            "participant_id": row[2],
            "state": row[3],
            "result_message_id": row[4],
            "usage": json.loads(row[5]),
            "cost": row[6],
        }
