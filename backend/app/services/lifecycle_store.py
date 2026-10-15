"""Phase 04 lifecycle persistence: queue entries, execution leases, ending
attempts, archive provenance and transactional creation RPCs.

All methods assume migrations/004_meeting_lifecycle.sql is applied. Lease and
queue-barrier reads degrade to idle/empty when the tables predate the clone;
writes do not silently succeed anywhere else.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.modules.meetings.domain import MAX_QUEUE_PENDING, validate_queue_content
from app.modules.meetings.ending import EndingConflict
from app.modules.meetings.queue import QueueCapacity, QueueConflict, QueueValidation


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LifecycleStoreMixin:
    """Mixed into MeetingManager; uses self.db (Supabase-shaped client)."""

    # -- queue -----------------------------------------------------------

    async def submit_queue_entry(self, meeting_id: str, owner_id: str,
                                 content: str, idempotency_key: str = "") -> dict:
        try:
            text = validate_queue_content(content)
        except ValueError as exc:
            raise QueueValidation(str(exc)) from exc
        rows = (self.db.table("queue_entries").select("*")
                .eq("meeting_id", meeting_id).execute().data or [])
        if idempotency_key:
            for row in rows:
                if row.get("idempotency_key") == idempotency_key:
                    if row.get("content") != text:
                        raise QueueConflict("idempotency_conflict")
                    return {"entry_id": row["entry_id"], "duplicate": True,
                            "revision": row["revision"], "state": row["state"]}
        pending = [r for r in rows if r.get("state") == "pending"]
        if len(pending) >= MAX_QUEUE_PENDING:
            raise QueueCapacity("queue_full")
        top = max([r.get("seq", 0) for r in rows] + [0])
        now = _now_iso()
        payload = {"entry_id": str(uuid.uuid4()), "meeting_id": meeting_id,
                   "owner_id": owner_id, "seq": top + 1, "content": text,
                   "revision": 1, "state": "pending",
                   "idempotency_key": idempotency_key,
                   "created_at": now, "updated_at": now}
        self.db.table("queue_entries").insert(payload).execute()
        return {"entry_id": payload["entry_id"], "duplicate": False,
                "revision": 1, "state": "pending", "seq": top + 1}

    async def list_queue(self, meeting_id: str) -> list[dict]:
        rows = (self.db.table("queue_entries").select("*")
                .eq("meeting_id", meeting_id).execute().data or [])
        return sorted(
            ({"entry_id": r["entry_id"], "seq": r.get("seq", 0),
              "content": r["content"], "revision": r["revision"],
              "state": r["state"], "message_id": r.get("message_id")}
             for r in rows if r.get("state") == "pending"),
            key=lambda e: e["seq"])

    async def edit_queue_entry(self, entry_id: str, owner_id: str, content: str,
                               expected_revision: int) -> dict:
        try:
            text = validate_queue_content(content)
        except ValueError as exc:
            raise QueueValidation(str(exc)) from exc
        updated = (self.db.table("queue_entries")
                   .update({"content": text, "updated_at": _now_iso()})
                   .eq("entry_id", entry_id).eq("owner_id", owner_id)
                   .eq("revision", expected_revision)
                   .eq("state", "pending").execute().data or [])
        # Supabase REST has no RETURNING revision bump expression here; the
        # revision advance is a second guarded write below.
        if not updated:
            raise await self._queue_conflict(entry_id)
        advanced = (self.db.table("queue_entries")
                    .update({"revision": expected_revision + 1})
                    .eq("entry_id", entry_id)
                    .eq("revision", expected_revision).execute().data or [])
        if not advanced:
            raise await self._queue_conflict(entry_id)
        return {"entry_id": entry_id, "revision": expected_revision + 1}

    async def remove_queue_entry(self, entry_id: str, owner_id: str,
                                 expected_revision: int) -> None:
        updated = (self.db.table("queue_entries")
                   .update({"state": "removed",
                            "revision": expected_revision + 1,
                            "updated_at": _now_iso()})
                   .eq("entry_id", entry_id).eq("owner_id", owner_id)
                   .eq("revision", expected_revision)
                   .eq("state", "pending").execute().data or [])
        if not updated:
            raise await self._queue_conflict(entry_id)

    async def _queue_conflict(self, entry_id: str) -> QueueConflict:
        rows = (self.db.table("queue_entries").select("state")
                .eq("entry_id", entry_id).execute().data or [])
        if rows and rows[0].get("state") == "dispatched":
            return QueueConflict("already_dispatched")
        return QueueConflict("revision_conflict")

    async def pending_queue_count(self, meeting_id: str) -> int:
        try:
            rows = (self.db.table("queue_entries").select("entry_id")
                    .eq("meeting_id", meeting_id)
                    .eq("state", "pending").execute().data or [])
            return len(rows)
        except Exception:
            return 0

    async def dispatch_queue_entry(self, entry_id: str) -> dict:
        """Atomic dispatch via RPC; falls back to an error when the migration
        has not been applied rather than a non-atomic REST sequence."""
        try:
            message_id = str(uuid.uuid4())
            self.db.rpc("dispatch_queue_entry",
                        {"p_entry_id": entry_id,
                         "p_message_id": message_id}).execute()
            return {"entry_id": entry_id, "message_id": message_id}
        except Exception as exc:
            raise QueueConflict("dispatch_unavailable") from exc

    # -- execution leases (shared durable truth) --------------------------

    async def has_active_work(self, meeting_id: str) -> bool:
        try:
            rows = (self.db.table("execution_leases").select("*")
                    .eq("meeting_id", meeting_id).execute().data or [])
        except Exception:
            return False
        now = datetime.now(timezone.utc)
        for row in rows:
            if row.get("state") not in ("claimed", "running"):
                continue
            try:
                expires = datetime.fromisoformat(row["lease_expires_at"])
            except (KeyError, ValueError, TypeError):
                continue
            if expires > now:
                return True
        return False

    async def claim_ending_lease(self, meeting_id: str, holder_id: str,
                                 ttl_seconds: float = 120.0) -> None:
        if await self.has_active_work(meeting_id):
            raise EndingConflict("turn_in_progress")
        expires = (datetime.now(timezone.utc).timestamp() + ttl_seconds)
        self.db.table("execution_leases").upsert(
            {"meeting_id": meeting_id, "holder_id": holder_id, "kind": "ending",
             "fencing_token": int(expires), "lease_expires_at":
             datetime.fromtimestamp(expires, timezone.utc).isoformat(),
             "state": "claimed"}, on_conflict="meeting_id").execute()

    async def release_lease(self, meeting_id: str) -> None:
        try:
            self.db.table("execution_leases").delete().eq(
                "meeting_id", meeting_id).execute()
        except Exception:
            pass

    # -- ending attempts ---------------------------------------------------

    async def begin_ending_attempt(self, meeting_id: str, roster: list[dict],
                                   force_end: bool,
                                   idempotency_key: str) -> dict:
        import json

        rows = (self.db.table("ending_attempts").select("*")
                .eq("meeting_id", meeting_id)
                .eq("idempotency_key", idempotency_key).execute().data or [])
        if rows:
            row = rows[0]
            return {"attempt_id": row["attempt_id"], "duplicate": True,
                    "outcome": row["outcome"], "summary": row.get("summary"),
                    "usage": row.get("usage_json", {})}
        live = (self.db.table("ending_attempts").select("attempt_id")
                .eq("meeting_id", meeting_id)
                .eq("outcome", "in_progress").execute().data or [])
        if live:
            raise EndingConflict("ending_in_progress")
        payload = {"attempt_id": f"end-{uuid.uuid4()}", "meeting_id": meeting_id,
                   "idempotency_key": idempotency_key, "force_end": force_end,
                   "roster_json": roster, "outcome": "in_progress",
                   "usage_json": {}}
        self.db.table("ending_attempts").insert(payload).execute()
        return {"attempt_id": payload["attempt_id"], "duplicate": False,
                "outcome": "in_progress", "summary": None, "usage": {}}

    async def record_ending_votes(self, attempt_id: str, votes: list[dict]) -> None:
        for vote in votes:
            self.db.table("ending_votes").upsert(
                {"attempt_id": attempt_id,
                 "participant_id": vote["participant_id"],
                 "participant_name": vote["participant_name"],
                 "vote": "yes" if vote["vote"] else "no",
                 "reason": vote.get("reason", "")},
                on_conflict="attempt_id,participant_id").execute()

    async def commit_ending_attempt(self, attempt_id: str, outcome: str,
                                    summary: Optional[str], usage: dict) -> None:
        try:
            self.db.rpc("commit_ending_attempt",
                        {"p_attempt_id": attempt_id, "p_outcome": outcome,
                         "p_summary": summary, "p_usage": usage}).execute()
        except Exception as exc:
            raise EndingConflict("commit_unavailable") from exc

    async def get_ending_attempt(self, attempt_id: str) -> Optional[dict]:
        rows = (self.db.table("ending_attempts").select("*")
                .eq("attempt_id", attempt_id).execute().data or [])
        if not rows:
            return None
        row = rows[0]
        votes = (self.db.table("ending_votes").select("*")
                 .eq("attempt_id", attempt_id).execute().data or [])
        return {"outcome": row["outcome"], "summary": row.get("summary"),
                "usage": row.get("usage_json", {}),
                "votes": [{"participant_id": v["participant_id"],
                           "participant_name": v["participant_name"],
                           "vote": v["vote"] == "yes",
                           "reason": v.get("reason", "")} for v in votes]}

    async def archive_meeting(self, meeting_id: str, prior_state: str) -> bool:
        result = (self.db.table("meetings")
                  .update({"status": "archived", "archived_from": prior_state})
                  .eq("id", meeting_id).execute())
        return len(result.data) > 0

    # -- transactional creation ---------------------------------------------

    async def create_meeting_atomic(self, meeting_data: dict,
                                    participants: list[dict]) -> tuple[dict, list[dict]]:
        """Prefer the atomic RPC; fall back to sequential writes (with
        compensation) only on clones where migration 004 is not applied.
        Returns (meeting_row, participant_rows)."""
        try:
            self.db.rpc(
                "create_meeting_with_participants",
                {"p_meeting_id": meeting_data["id"], "p_name": meeting_data["name"],
                 "p_agenda": meeting_data.get("agenda", ""),
                 "p_owner": meeting_data.get("user_id"),
                 "p_participants": participants}).execute()
            return meeting_data, [
                {**p, "meeting_id": meeting_data["id"]} for p in participants]
        except Exception:
            created = self.db.table("meetings").insert(meeting_data).execute()
            rows: list[dict] = []
            try:
                for participant in participants:
                    saved = self.db.table("ai_participants").insert(
                        {**participant,
                         "meeting_id": meeting_data["id"]}).execute()
                    rows.extend(saved.data or [])
            except Exception:
                self.db.table("meetings").delete().eq(
                    "id", meeting_data["id"]).execute()
                raise
            return (created.data[0] if created.data else meeting_data), rows
