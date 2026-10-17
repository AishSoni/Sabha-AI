"""Part C vertical slice: recorded journey turn via shared TurnEngine.

Offline-safe: injected manager double, frozen DB seed pack, RecordedProvider.
Proves: real-meeting turn streams >=2 text_delta before turn_completed on the
normal turn journal, persists a normal message, enforces seed assertions.
"""

import asyncio
import time

import pytest

pytestmark = pytest.mark.anyio


def _make_fake_manager():
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    participant = {
        "id": "p-analyst",
        "meeting_id": "m-demo",
        "name": "The Analyst",
        "role": "analyst",
        "system_prompt": "s",
        "created_at": now,
    }
    meeting_row = {
        "id": "m-demo",
        "user_id": "demo-visitor",
        "name": "M",
        "agenda": "a",
        "status": "active",
        "archived_from": None,
        "total_cost": 0.0,
        "created_at": now,
        "participants": [participant],
        "messages": [],
    }

    class _FakeManager:
        def __init__(self):
            from app.models import MeetingWithParticipants

            self._meeting = MeetingWithParticipants(**meeting_row)
            self.saved_messages = []

        async def get_meeting(self, meeting_id):
            assert meeting_id == "m-demo"
            return self._meeting

        async def save_message(self, data):
            from datetime import datetime, timezone
            import uuid

            from app.models import Message

            msg = Message(
                id=str(uuid.uuid4()),
                meeting_id=data.meeting_id,
                content=data.content,
                sender_type=data.sender_type,
                sender_id=data.sender_id,
                sender_name=data.sender_name,
                created_at=datetime.now(timezone.utc),
            )
            self.saved_messages.append(msg)
            # Mirror into meeting transcript so normal reads see it.
            self._meeting.messages.append(msg)
            return msg

    return _FakeManager()


async def _wait_terminal(turn_id, timeout=15.0):
    from app.modules.meetings.store import get_shared_turn_store

    store = get_shared_turn_store()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        record = await store.get(turn_id)
        if record.state in ("completed", "failed", "cancelled"):
            return record
        await asyncio.sleep(0.02)
    raise AssertionError(f"turn {turn_id} did not terminate")


async def test_recorded_submit_bond_question_streams_chunked_deltas():
    from app.infrastructure.demo import bond_service
    from app.modules.meetings.store import get_shared_turn_store

    fake = _make_fake_manager()
    result = await bond_service.start_demo_recorded_turn(
        meeting_id="m-demo",
        action_id="submit_bond_question",
        idempotency_key="test-demo-c0-1",
        manager=fake,
    )
    assert result["turn_id"]
    assert result["events_url"] == f"/api/meetings/turns/{result['turn_id']}/events"
    assert result["recorded_analysis"] is True
    assert result["action_id"] == "submit_bond_question"

    record = await _wait_terminal(result["turn_id"])
    assert record.state == "completed", f"turn failed: {record}"

    store = get_shared_turn_store()
    events = await store.list_events(result["turn_id"], after=0)
    kinds = [e.get("type") for e in events]
    assert "turn_completed" in kinds
    deltas = [e for e in events if e.get("type") == "text_delta"]
    assert len(deltas) >= 2, f"expected chunked deltas, got {len(deltas)}"
    first_delta = kinds.index("text_delta")
    completed_at = kinds.index("turn_completed")
    assert first_delta < completed_at
    # Deltas precede completion; joined content is non-empty.
    joined = "".join(
        str((e.get("data") or {}).get("content", "")) for e in deltas
    )
    assert "INE001A07RW5" in joined or len(joined) > 100

    # Normal persistence: one AI message on the real meeting transcript.
    assert len(fake.saved_messages) == 1
    assert fake.saved_messages[0].sender_id == "p-analyst"


async def test_recorded_unknown_action_fails_closed():
    from app.infrastructure.demo import bond_service
    from app.infrastructure.demo.bond_service import UnknownAction

    with pytest.raises(UnknownAction):
        await bond_service.start_demo_recorded_turn(
            meeting_id="m-demo",
            action_id="nope-not-real",
            manager=_make_fake_manager(),
        )
