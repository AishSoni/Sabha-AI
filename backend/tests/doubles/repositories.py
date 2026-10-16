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
