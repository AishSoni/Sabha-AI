"""Real-database durable turn queue test double (spec 07).

Unlike the in-memory doubles, every operation here goes through the actual
queue RPCs against the disposable Postgres database. That is deliberate: the
guarantees under test (unique request keys, one executing turn per meeting,
lease expiry, fence rejection, effect dedupe) only exist at the database
boundary.

The world is intentionally small and explicit. A test can seed a meeting,
submit FIFO work, run two independent workers, advance a fake clock, and
observe operations/events/attempts directly.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import threading
import uuid
from typing import Awaitable, Callable

from tests.doubles.clock import FakeClock
from tests.doubles.supabase_stub import stub_for


def _json_hash(value: dict) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class QueueWorker:
    """One worker identity; each RPC call is an independent DB connection."""

    def __init__(self, world: "DurableQueueWorld", name: str):
        self.world = world
        self.name = name

    def claim(self, meeting_id: str | None = None, *, global_limit: int = 10):
        result = self.world.stub.rpc(
            "claim_next_turn_operation",
            {
                "p_claimant": self.name,
                "p_lease_seconds": self.world.lease_seconds,
                "p_global_limit": global_limit,
                "p_now": self.world.clock.now(),
                "p_meeting_id": meeting_id,
            },
        ).execute()
        return result.data

    def renew(self, operation: dict):
        result = self.world.stub.rpc(
            "renew_turn_operation_lease",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_lease_seconds": self.world.lease_seconds,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def start(self, operation: dict, settings: dict | None = None):
        result = self.world.stub.rpc(
            "start_turn_operation",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_effective_settings": settings or {"provider": "scripted", "model": "scripted"},
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def begin_attempt(
        self,
        operation: dict,
        *,
        attempt_id: str | None = None,
        provider: str = "scripted",
        model: str = "scripted",
    ) -> int | None:
        result = self.world.stub.rpc(
            "begin_turn_attempt",
            {
                "p_operation_id": operation["id"],
                "p_attempt_id": attempt_id or str(uuid.uuid4()),
                "p_expected_fence": operation["fence_version"],
                "p_provider": provider,
                "p_model": model,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data

    def complete_attempt(
        self,
        attempt_id: str,
        *,
        usage: dict | None = None,
        cost: float = 0.0,
        provider_request_id: str = "req-1",
    ) -> bool:
        result = self.world.stub.rpc(
            "complete_turn_attempt",
            {
                "p_attempt_id": attempt_id,
                "p_usage": usage or {"prompt_tokens": 1, "completion_tokens": 1},
                "p_cost": cost,
                "p_provider_request_id": provider_request_id,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def fail_attempt(self, attempt_id: str, status: str = "unknown", code: str = "provider_error"):
        result = self.world.stub.rpc(
            "fail_turn_attempt",
            {
                "p_attempt_id": attempt_id,
                "p_status": status,
                "p_error_code": code,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def publish(
        self,
        operation: dict,
        *,
        message: dict | None = None,
        usage: dict | None = None,
        cost: float = 0.0,
    ) -> dict:
        result = self.world.stub.rpc(
            "publish_turn_operation",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_message": message or self.world.final_message(operation),
                "p_usage": usage or {"prompt_tokens": 1, "completion_tokens": 1},
                "p_cost": cost,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data

    def fail(self, operation: dict, status: str = "interrupted", code: str = "unknown_outcome"):
        result = self.world.stub.rpc(
            "fail_turn_operation",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_status": status,
                "p_error_code": code,
                "p_error_message": "terminal test outcome",
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def cancel(self, operation: dict):
        result = self.world.stub.rpc(
            "cancel_turn_operation",
            {
                "p_operation_id": operation["id"],
                "p_meeting_id": operation["meeting_id"],
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data

    def append_event(
        self,
        operation: dict,
        event_type: str,
        payload: dict | None = None,
        *,
        event_id: str | None = None,
    ) -> dict | None:
        result = self.world.stub.rpc(
            "append_turn_event",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_event_id": event_id or str(uuid.uuid4()),
                "p_type": event_type,
                "p_payload": payload or {},
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data

    def disagreement(self, operation: dict, *, invocation_id: str = "inv-1", call_id: str = "call-1"):
        result = self.world.stub.rpc(
            "record_turn_disagreement",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_invocation_id": invocation_id,
                "p_call_id": call_id,
                "p_source_ai_id": operation["participant_id"],
                "p_target_name": "The CTO",
                "p_topic": "test conflict",
                "p_reasoning": "testing",
                "p_severity": 3,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data

    def consensus(self, operation: dict, *, invocation_id: str = "inv-1", call_id: str = "call-1"):
        result = self.world.stub.rpc(
            "record_turn_consensus",
            {
                "p_operation_id": operation["id"],
                "p_expected_fence": operation["fence_version"],
                "p_invocation_id": invocation_id,
                "p_call_id": call_id,
                "p_participants": ["The Investor", "The CTO"],
                "p_topic": "test agreement",
                "p_strength": 4,
                "p_now": self.world.clock.now(),
            },
        ).execute()
        return result.data


class DurableQueueWorld:
    """Seeded meeting/participant plus real queue RPCs."""

    def __init__(self, db, *, lease_seconds: int = 30, clock: FakeClock | None = None):
        self.db = db
        self.stub = stub_for(db)
        self.lease_seconds = lease_seconds
        self.clock = clock or FakeClock()

    # -- seeding ------------------------------------------------------------
    def seed_active_meeting(self, *, name: str = "Queue meeting") -> tuple[str, str]:
        meeting_id = str(
            self.db.query(
                """
                INSERT INTO meetings (name, agenda, status)
                VALUES (%s, %s, 'active')
                RETURNING id
                """,
                (name, "Queue agenda"),
            )[0][0]
        )
        participant_id = str(
            self.db.query(
                """
                INSERT INTO ai_participants
                    (meeting_id, name, role, system_prompt, provider_config)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                RETURNING id
                """,
                (
                    meeting_id,
                    "The Analyst",
                    "Data Analyst",
                    "You are The Analyst.",
                    json.dumps({"provider": "scripted", "model": "scripted"}),
                ),
            )[0][0]
        )
        return meeting_id, participant_id

    def insert_message(
        self,
        meeting_id: str,
        content: str,
        *,
        sender_type: str = "user",
        sender_name: str = "User",
        request_key: str | None = None,
    ) -> str:
        return str(
            self.db.query(
                """
                INSERT INTO messages
                    (meeting_id, sender_type, sender_name, content, request_key)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (meeting_id, sender_type, sender_name, content, request_key),
            )[0][0]
        )

    # -- admission ----------------------------------------------------------
    def submit(
        self,
        meeting_id: str,
        participant_id: str,
        *,
        key: str,
        settings: dict | None = None,
        max_queued: int = 10,
    ) -> dict:
        payload = {
            "meeting_id": meeting_id,
            "participant_id": participant_id,
            "settings": settings or {},
        }
        result = self.stub.rpc(
            "admit_turn_operation",
            {
                "p_meeting_id": meeting_id,
                "p_participant_id": participant_id,
                "p_request_key": key,
                "p_payload_hash": _json_hash(payload),
                "p_payload": payload,
                "p_max_queued": max_queued,
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def worker(self, name: str) -> QueueWorker:
        return QueueWorker(self, name)

    # -- observation --------------------------------------------------------
    def status(self, operation_id: str, meeting_id: str | None = None) -> str | None:
        meeting_id = meeting_id or self.operation(operation_id)["meeting_id"]
        result = self.stub.rpc(
            "get_turn_operation_status",
            {"p_operation_id": operation_id, "p_meeting_id": meeting_id},
        ).execute()
        if result.data is None:
            return None
        raw = result.data["status"]
        return {
            "pending": "queued",
            "processing": "executing",
            "done": "completed",
        }.get(raw, raw)

    def operation(self, operation_id: str) -> dict:
        rows = self.db.query(
            "SELECT * FROM operations WHERE id = %s", (operation_id,)
        )
        assert rows, f"operation {operation_id} not found"
        columns = [
            "id", "request_key", "claimant", "status", "fence_version", "admission",
            "created_at", "updated_at", "meeting_id", "participant_id", "kind",
            "payload_hash", "payload", "lease_expires_at", "started_at",
            "execution_started_at", "completed_at", "cancelled_at",
            "context_boundary", "effective_settings", "final_message_id",
            "error_code", "error_message", "cancel_requested_at", "attempt_count",
        ]
        row = dict(zip(columns, rows[0]))
        for key in ("id", "meeting_id", "participant_id", "final_message_id"):
            if row[key] is not None:
                row[key] = str(row[key])
        return row

    def list_operations(self, meeting_id: str) -> list[dict]:
        result = self.stub.rpc(
            "list_turn_operations",
            {"p_meeting_id": meeting_id, "p_limit": 100},
        ).execute()
        return result.data or []

    def events(self, operation_id: str, meeting_id: str, after: int = 0, limit: int = 500):
        result = self.stub.rpc(
            "read_turn_events",
            {
                "p_operation_id": operation_id,
                "p_meeting_id": meeting_id,
                "p_after_sequence": after,
                "p_limit": limit,
            },
        ).execute()
        return result.data or []

    def messages(self, meeting_id: str) -> list[dict]:
        rows = self.db.query(
            """
            SELECT id, sender_name, content, operation_id, sequence
            FROM messages WHERE meeting_id = %s ORDER BY sequence
            """,
            (meeting_id,),
        )
        return [
            {
                "id": str(r[0]),
                "sender_name": r[1],
                "content": r[2],
                "operation_id": str(r[3]) if r[3] else None,
                "sequence": r[4],
            }
            for r in rows
        ]

    def disagreement_rows(self, meeting_id: str) -> list[dict]:
        rows = self.db.query(
            """
            SELECT id, operation_id, invocation_id, call_id, topic
            FROM disagreements WHERE meeting_id = %s ORDER BY created_at
            """,
            (meeting_id,),
        )
        return [
            {
                "id": str(r[0]),
                "operation_id": str(r[1]) if r[1] else None,
                "invocation_id": r[2],
                "call_id": r[3],
                "topic": r[4],
            }
            for r in rows
        ]

    def consensus_rows(self, meeting_id: str) -> list[dict]:
        rows = self.db.query(
            """
            SELECT id, operation_id, invocation_id, call_id, topic
            FROM consensus WHERE meeting_id = %s ORDER BY created_at
            """,
            (meeting_id,),
        )
        return [
            {
                "id": str(r[0]),
                "operation_id": str(r[1]) if r[1] else None,
                "invocation_id": r[2],
                "call_id": r[3],
                "topic": r[4],
            }
            for r in rows
        ]

    def total_cost(self, meeting_id: str) -> float:
        return float(
            self.db.query("SELECT total_cost FROM meetings WHERE id = %s", (meeting_id,))[0][0]
        )

    def inference_count(self, meeting_id: str) -> int:
        return int(
            self.db.query(
                "SELECT COUNT(*) FROM inference_events WHERE meeting_id = %s",
                (meeting_id,),
            )[0][0]
        )

    # -- lifecycle helpers --------------------------------------------------
    def recover(self) -> dict:
        result = self.stub.rpc(
            "recover_turn_operations",
            {"p_now": self.clock.now()},
        ).execute()
        return result.data

    def cancel_for_meeting(self, meeting_id: str, reason: str = "meeting_closed") -> int:
        result = self.stub.rpc(
            "cancel_turn_operations_for_meeting",
            {
                "p_meeting_id": meeting_id,
                "p_reason": reason,
                "p_now": self.clock.now(),
            },
        ).execute()
        return int(result.data or 0)

    def final_message(self, operation: dict, content: str = "A completed turn.") -> dict:
        return {
            "id": str(uuid.uuid4()),
            "sender_id": operation["participant_id"],
            "sender_name": "The Analyst",
            "content": content,
            "citations": [],
            "tool_artifacts": {"calls": []},
            "thinking_content": "reasoning",
            "estimated_cost": 0.0,
            "effective_generation": {"provider": "scripted", "model": "scripted"},
        }

    # -- concurrency harness -------------------------------------------------
    def run_pair(self, first: Callable[[], Awaitable], second: Callable[[], Awaitable]):
        barrier = threading.Barrier(2, timeout=10)
        results: list = [None, None]
        errors: list = [None, None]

        def runner(index: int, call: Callable[[], Awaitable]) -> None:
            try:
                barrier.wait()
                value = call()
                results[index] = asyncio.run(value) if inspect.isawaitable(value) else value
            except BaseException as exc:  # noqa: BLE001 - surfaced by the test
                errors[index] = exc
                barrier.abort()

        calls = (first, second)
        threads = [
            threading.Thread(target=runner, args=(index, calls[index]))
            for index in range(2)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        for error in errors:
            if error is not None:
                raise error
        return results[0], results[1]
