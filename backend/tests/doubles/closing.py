"""Real-database closing harness (spec 08).

Every helper goes through the actual closing RPCs against the
disposable Postgres database. The database is the only place the
admission/drain/commit guarantees exist, so these helpers deliberately
avoid an in-memory oracle.
"""

from __future__ import annotations

from tests.doubles.durable_queue import DurableQueueWorld

ENDING_MARKER = "📋 **MEETING ENDED**"


class ClosingWorld:
    def __init__(self, db, *, lease_seconds: int = 30):
        self.db = db
        self.queue = DurableQueueWorld(db, lease_seconds=lease_seconds)
        self.stub = self.queue.stub
        self.clock = self.queue.clock

    # -- seeding ------------------------------------------------------------
    def seed_active_meeting(self, *, name: str = "Closing meeting") -> tuple[str, str]:
        return self.queue.seed_active_meeting(name=name)

    def add_participant(self, meeting_id: str, name: str, role: str = "Participant") -> str:
        return str(
            self.db.query(
                """
                INSERT INTO ai_participants
                    (meeting_id, name, role, system_prompt, provider_config)
                VALUES (%s, %s, %s, %s, '{}'::jsonb)
                RETURNING id
                """,
                (meeting_id, name, role, f"You are {name}."),
            )[0][0]
        )

    # -- turns --------------------------------------------------------------
    def submit(self, meeting_id: str, participant_id: str, *, key: str) -> dict:
        return self.queue.submit(meeting_id, participant_id, key=key)

    def worker(self, name: str = "worker-1"):
        return self.queue.worker(name)

    def claim_running(self, meeting_id: str, *, name: str = "worker-1") -> dict:
        worker = self.worker(name)
        operation = worker.claim(meeting_id)
        assert operation is not None
        assert worker.start(operation)
        return operation

    def complete_running(self, operation: dict, *, content: str = "Running turn finished.") -> dict:
        worker = self.worker("worker-1")
        return worker.publish(operation, message=self.queue.final_message(operation, content))

    def turn_status(self, operation_id: str) -> str | None:
        return self.queue.status(operation_id)

    # -- closing ------------------------------------------------------------
    def request(
        self,
        meeting_id: str,
        *,
        key: str = "close-1",
        mode: str = "vote",
        summary_settings: dict | None = None,
    ) -> dict:
        result = self.stub.rpc(
            "request_meeting_closing",
            {
                "p_meeting_id": meeting_id,
                "p_request_key": key,
                "p_mode": mode,
                "p_summary_settings": summary_settings or {},
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def read(self, meeting_id: str) -> dict:
        result = self.stub.rpc(
            "read_meeting_closing", {"p_meeting_id": meeting_id}
        ).execute()
        return result.data

    def closing(self, meeting_id: str) -> dict | None:
        return self.read(meeting_id)["closing"]

    def close_stage(self, closing: dict) -> str:
        current = self.db.query(
            "SELECT stage FROM meeting_closings WHERE id = %s", (closing["id"],)
        )
        assert current
        return current[0][0]

    def mark_stage(self, closing: dict, expected: str, next_stage: str) -> bool:
        result = self.stub.rpc(
            "mark_closing_stage",
            {
                "p_closing_id": closing["id"],
                "p_expected_stage": expected,
                "p_next_stage": next_stage,
                "p_now": self.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def fail(self, closing: dict, expected: str, *, code: str = "boom", message: str = "boom") -> bool:
        result = self.stub.rpc(
            "fail_meeting_closing",
            {
                "p_closing_id": closing["id"],
                "p_expected_stage": expected,
                "p_error_code": code,
                "p_error_message": message,
                "p_now": self.clock.now(),
            },
        ).execute()
        return bool(result.data)

    def retry(self, closing: dict) -> bool:
        result = self.stub.rpc(
            "retry_meeting_closing",
            {"p_closing_id": closing["id"], "p_now": self.clock.now()},
        ).execute()
        return bool(result.data)

    def reject(self, closing: dict) -> bool:
        result = self.stub.rpc(
            "reject_meeting_closing",
            {"p_closing_id": closing["id"], "p_now": self.clock.now()},
        ).execute()
        return bool(result.data)

    def abort(self, closing: dict) -> bool:
        result = self.stub.rpc(
            "abort_meeting_closing",
            {"p_closing_id": closing["id"], "p_now": self.clock.now()},
        ).execute()
        return bool(result.data)

    def checkpoint_summary(self, closing: dict, text: str) -> bool:
        """Direct checkpoint for lifecycle tests (the real RPC arrives with
        summary accounting in the next slice)."""
        with self.db.connect() as conn:
            conn.execute(
                """
                UPDATE meeting_closings
                SET summary_text = %s, updated_at = %s
                WHERE id = %s AND stage = 'summarizing'
                """,
                (text, self.clock.now(), closing["id"]),
            )
        return True

    def complete(self, closing: dict) -> dict:
        result = self.stub.rpc(
            "complete_meeting_closing",
            {"p_closing_id": closing["id"], "p_now": self.clock.now()},
        ).execute()
        return result.data

    # -- voting checkpoints -------------------------------------------------
    def start_voting(self, closing: dict) -> dict:
        result = self.stub.rpc(
            "start_closing_voting",
            {"p_closing_id": closing["id"], "p_now": self.clock.now()},
        ).execute()
        return result.data

    def begin_vote(
        self,
        closing: dict,
        participant_id: str,
        *,
        attempt_id: str,
        lease_seconds: int = 30,
        provider: str = "scripted",
        model: str = "scripted",
        settings: dict | None = None,
    ) -> dict:
        result = self.stub.rpc(
            "begin_closing_vote_attempt",
            {
                "p_closing_id": closing["id"],
                "p_participant_id": participant_id,
                "p_attempt_id": attempt_id,
                "p_lease_seconds": lease_seconds,
                "p_provider": provider,
                "p_model": model,
                "p_settings": settings or {},
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def finish_vote(
        self,
        closing: dict,
        participant_id: str,
        *,
        attempt_id: str,
        vote: bool | None = True,
        reason: str = "because",
        status: str = "completed",
        usage: dict | None = None,
        usage_kind: str | None = "reported",
        price_kind: str | None = "metered",
        estimated_cost: float = 0.01,
        reported_cost: float | None = 0.012,
        provider: str = "scripted",
        model: str = "scripted",
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> dict:
        result = self.stub.rpc(
            "finish_closing_vote_attempt",
            {
                "p_closing_id": closing["id"],
                "p_participant_id": participant_id,
                "p_attempt_id": attempt_id,
                "p_provider": provider,
                "p_model": model,
                "p_status": status,
                "p_vote": vote,
                "p_reason": reason,
                "p_usage": usage,
                "p_usage_kind": usage_kind,
                "p_price_kind": price_kind,
                "p_estimated_cost": estimated_cost,
                "p_reported_cost": reported_cost,
                "p_error_code": error_code,
                "p_error_message": error_message,
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def votes(self, meeting_id: str) -> list[dict]:
        return self.read(meeting_id)["votes"]

    # -- summary checkpoints ------------------------------------------------
    def reserve_summary(
        self,
        closing: dict,
        *,
        attempt_id: str,
        lease_seconds: int = 30,
    ) -> dict:
        result = self.stub.rpc(
            "reserve_closing_summary_attempt",
            {
                "p_closing_id": closing["id"],
                "p_attempt_id": attempt_id,
                "p_lease_seconds": lease_seconds,
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def save_summary(
        self,
        closing: dict,
        *,
        attempt_id: str,
        text: str,
        purpose: str = "summary",
        usage: dict | None = None,
        usage_kind: str | None = "reported",
        price_kind: str | None = "metered",
        estimated_cost: float = 0.02,
        reported_cost: float | None = 0.025,
        provider: str = "scripted",
        model: str = "scripted",
    ) -> dict:
        result = self.stub.rpc(
            "save_closing_summary_checkpoint",
            {
                "p_closing_id": closing["id"],
                "p_attempt_id": attempt_id,
                "p_summary_text": text,
                "p_provider": provider,
                "p_model": model,
                "p_purpose": purpose,
                "p_usage": usage,
                "p_usage_kind": usage_kind,
                "p_price_kind": price_kind,
                "p_estimated_cost": estimated_cost,
                "p_reported_cost": reported_cost,
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    def vote_row(self, closing: dict, participant_id: str) -> dict:
        return self.db.query(
            """
            SELECT status, attempt_id, attempt_number, attempt_lease_expires_at,
                   vote, reason, usage, usage_kind, price_kind, estimated_cost,
                   reported_cost, error_code
            FROM closing_votes
            WHERE closing_id = %s AND participant_id = %s
            """,
            (closing["id"], participant_id),
        )[0]

    def ledger_rows(self, meeting_id: str) -> list[tuple]:
        return self.db.query(
            """
            SELECT id, purpose, usage, usage_kind, price_kind, estimated_cost,
                   reported_cost
            FROM inference_events
            WHERE meeting_id = %s
            ORDER BY created_at, id
            """,
            (meeting_id,),
        )

    def inference_count(self, meeting_id: str) -> int:
        return self.queue.inference_count(meeting_id)

    def total_cost(self, meeting_id: str) -> float:
        return self.queue.total_cost(meeting_id)

    # -- lifecycle guards ---------------------------------------------------
    def archive(self, meeting_id: str) -> dict:
        result = self.stub.rpc(
            "archive_meeting_guarded",
            {"p_meeting_id": meeting_id, "p_now": self.clock.now()},
        ).execute()
        return result.data

    def unarchive(self, meeting_id: str) -> dict:
        result = self.stub.rpc(
            "unarchive_meeting_guarded",
            {"p_meeting_id": meeting_id, "p_now": self.clock.now()},
        ).execute()
        return result.data

    def append_message(
        self,
        meeting_id: str,
        *,
        key: str = "message-1",
        content: str = "Director note",
    ) -> dict:
        result = self.stub.rpc(
            "append_user_message",
            {
                "p_meeting_id": meeting_id,
                "p_message": {
                    "sender_type": "user",
                    "sender_name": "User",
                    "content": content,
                    "request_key": key,
                },
                "p_now": self.clock.now(),
            },
        ).execute()
        return result.data

    # -- lifecycle observations --------------------------------------------
    def meeting_status(self, meeting_id: str) -> str:
        return self.db.query(
            "SELECT status FROM meetings WHERE id = %s", (meeting_id,)
        )[0][0]

    def archived_at(self, meeting_id: str):
        return self.db.query(
            "SELECT archived_at FROM meetings WHERE id = %s", (meeting_id,)
        )[0][0]

    def pending_turn_count(self, meeting_id: str) -> int:
        return int(
            self.db.query(
                "SELECT COUNT(*) FROM operations WHERE meeting_id = %s AND status = 'pending'",
                (meeting_id,),
            )[0][0]
        )

    def final_summary_count(self, meeting_id: str) -> int:
        return int(
            self.db.query(
                "SELECT COUNT(*) FROM messages WHERE meeting_id = %s AND content LIKE %s",
                (meeting_id, ENDING_MARKER + "%"),
            )[0][0]
        )

    def message_count(self, meeting_id: str) -> int:
        return int(
            self.db.query(
                "SELECT COUNT(*) FROM messages WHERE meeting_id = %s", (meeting_id,)
            )[0][0]
        )

    def run_pair(self, first, second):
        return self.queue.run_pair(first, second)
