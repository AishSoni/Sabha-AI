"""Phase 01 (P01-T03) in-memory meeting/persona repositories.

Implements only the async surface Orchestrator/MeetingManager tests need.
Exposes inserts and call counts so tests assert side effects, not mocks.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FakeMeetingRepo:
    """Minimal in-memory stand-in for MeetingManager persistence."""

    def __init__(self):
        self.meetings: Dict[str, dict] = {}
        self.messages: List[dict] = []
        self.disagreements: List[dict] = []
        self.consensus: List[dict] = []
        self.save_message_calls = 0

    def add_meeting(self, meeting_id: str, participants: Optional[list] = None, **fields) -> dict:
        meeting = {
            "id": meeting_id,
            "name": fields.get("name", "Test meeting"),
            "agenda": fields.get("agenda", ""),
            "user_id": fields.get("user_id"),
            "status": fields.get("status", "active"),
            "total_cost": fields.get("total_cost", 0.0),
            "created_at": _now(),
            "participants": participants or [],
            "messages": [],
        }
        self.meetings[meeting_id] = meeting
        return meeting

    async def get_meeting(self, meeting_id: str):
        from app.models import MeetingWithParticipants

        data = self.meetings.get(meeting_id)
        if data is None:
            return None
        return MeetingWithParticipants(**data)

    async def save_message(self, data) -> object:
        from app.models import Message

        self.save_message_calls += 1
        msg = {
            "id": str(uuid.uuid4()),
            "meeting_id": data.meeting_id,
            "sender_type": data.sender_type,
            "sender_id": data.sender_id,
            "sender_name": data.sender_name,
            "content": data.content,
            "citations": list(getattr(data, "citations", None) or []),
            "tool_artifacts": data.tool_artifacts,
            "thinking_content": getattr(data, "thinking_content", None),
            "estimated_cost": getattr(data, "estimated_cost", 0.0),
            "created_at": _now(),
        }
        self.messages.append(msg)
        meeting = self.meetings.get(data.meeting_id)
        if meeting is not None:
            meeting["messages"].append(msg)
        return Message(**msg)

    async def save_disagreement(self, data) -> object:
        from app.models import Disagreement

        record = {
            "id": str(uuid.uuid4()),
            "meeting_id": data.meeting_id,
            "source_ai_id": data.source_ai_id,
            "target_name": data.target_name,
            "topic": data.topic,
            "reasoning": data.reasoning,
            "severity": data.severity,
            "status": "open",
            "created_at": _now(),
        }
        self.disagreements.append(record)
        return Disagreement(**record)

    async def save_consensus(self, data) -> object:
        from app.models import Consensus

        record = {
            "id": str(uuid.uuid4()),
            "meeting_id": data.meeting_id,
            "participants": data.participants,
            "topic": data.topic,
            "strength": data.strength,
            "created_at": _now(),
        }
        self.consensus.append(record)
        return Consensus(**record)


class FakeEndingManager(FakeMeetingRepo):
    """Ending-workflow double: attempts, leases, votes and commits recorded
    in memory with the same conflict semantics as the Supabase path."""

    def __init__(self):
        super().__init__()
        self.attempts: Dict[str, dict] = {}
        self.begin_calls = 0
        self.duplicate_next = False
        self.record_calls: List[tuple] = []
        self.commit_calls: List[tuple] = []
        self.status_updates: List[tuple] = []
        self.leased: List[str] = []
        self.released: List[str] = []
        self.pending = 0
        self.active_work = False
        self.drain_clears = False
        self.drain_calls = 0
        self.fail_commit = False
        self._attempt_seq = 0
        self.add_meeting(
            "m",
            participants=[
                {"id": "p1", "meeting_id": "m", "name": "Alice", "role": "CTO",
                 "system_prompt": "s", "created_at": _now()},
                {"id": "p2", "meeting_id": "m", "name": "Bob",
                 "role": "Analyst", "system_prompt": "s",
                 "created_at": _now()},
            ],
            user_id="actor-a",
        )
        self.add_meeting("m2", participants=[], user_id="actor-b")
        self.add_meeting("mv", participants=[], user_id="actor-a",
                         status="voting")

    async def has_active_work(self, meeting_id: str) -> bool:
        return self.active_work

    async def pending_queue_count(self, meeting_id: str) -> int:
        return self.pending

    async def drain_queue(self, meeting_id: str) -> int:
        self.drain_calls += 1
        if self.drain_clears:
            self.pending = 0
        return 0

    async def begin_ending_attempt(self, meeting_id: str, roster: list,
                                    force_end: bool,
                                    idempotency_key: str) -> dict:
        from app.modules.meetings.ending import EndingConflict

        self.begin_calls += 1
        if self.duplicate_next:
            self.duplicate_next = False
            return {"attempt_id": "end-dup", "duplicate": True,
                    "outcome": "completed", "summary": "prior summary",
                    "usage": {}}
        for att in self.attempts.values():
            if (att["meeting_id"] == meeting_id
                    and att["key"] == idempotency_key):
                return {"attempt_id": att["attempt_id"], "duplicate": True,
                        "outcome": att["outcome"], "summary": att["summary"],
                        "usage": att["usage"]}
        for att in self.attempts.values():
            if (att["meeting_id"] == meeting_id
                    and att["outcome"] == "in_progress"):
                raise EndingConflict("ending_in_progress")
        self._attempt_seq += 1
        attempt_id = f"end-fake-{self._attempt_seq}"
        self.attempts[attempt_id] = {
            "attempt_id": attempt_id, "meeting_id": meeting_id,
            "key": idempotency_key, "force_end": force_end,
            "roster": roster, "outcome": "in_progress", "summary": None,
            "usage": {}, "votes": [],
        }
        return {"attempt_id": attempt_id, "duplicate": False,
                "outcome": "in_progress", "summary": None, "usage": {}}

    async def claim_ending_lease(self, meeting_id: str, holder_id: str,
                                  ttl_seconds: float = 120.0) -> None:
        from app.modules.meetings.ending import EndingConflict

        if await self.has_active_work(meeting_id):
            raise EndingConflict("turn_in_progress")
        self.leased.append(holder_id)

    async def release_lease(self, meeting_id: str) -> None:
        self.released.append(meeting_id)

    async def update_meeting_status(self, meeting_id: str, status: str) -> bool:
        self.status_updates.append((meeting_id, status))
        meeting = self.meetings.get(meeting_id)
        if meeting is not None:
            meeting["status"] = status
        return True

    async def record_ending_votes(self, attempt_id: str,
                                   votes: list) -> None:
        self.record_calls.append((attempt_id, [dict(v) for v in votes]))
        att = self.attempts.get(attempt_id)
        if att is None:
            return
        existing = {v["participant_id"]: v for v in att["votes"]}
        for vote in votes:
            existing[vote["participant_id"]] = dict(vote)
        att["votes"] = list(existing.values())

    async def commit_ending_attempt(self, attempt_id: str, outcome: str,
                                     summary, usage: dict) -> None:
        from app.modules.meetings.ending import EndingConflict

        if self.fail_commit:
            raise EndingConflict("commit_unavailable")
        att = self.attempts.get(attempt_id)
        if att is None or att["outcome"] != "in_progress":
            raise EndingConflict("attempt already terminalized")
        att.update(outcome=outcome, summary=summary, usage=dict(usage))
        self.commit_calls.append((attempt_id, outcome, summary, dict(usage)))

    async def get_ending_attempt(self, attempt_id: str):
        att = self.attempts.get(attempt_id)
        if att is None:
            return None
        return {"attempt_id": att["attempt_id"],
                "meeting_id": att["meeting_id"], "outcome": att["outcome"],
                "summary": att["summary"], "usage": att["usage"],
                "votes": list(att["votes"])}


class FakePromptVersionStore:
    """Captures persona_manager activate/deactivate ordering (B-11)."""

    def __init__(self, versions: Optional[Dict[int, bool]] = None):
        # version -> is_active
        self.versions: Dict[int, bool] = dict(versions or {1: True})
        self.calls: List[str] = []

    def deactivate_all(self) -> None:
        self.calls.append("deactivate_all")
        for v in self.versions:
            self.versions[v] = False

    def activate(self, version: int) -> bool:
        self.calls.append(f"activate:{version}")
        if version not in self.versions:
            return False
        self.versions[version] = True
        return True

    def active_version(self):
        for v, active in self.versions.items():
            if active:
                return v
        return None
