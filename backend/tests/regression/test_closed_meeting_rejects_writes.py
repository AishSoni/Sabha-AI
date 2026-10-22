"""Regression (spec-02): closed meetings must reject writes at the door.

Today `POST /message` happily appends to a voting/ended/archived meeting, and
turns only fail later (or not at all). Race closure decision (locked): turns
rejected BEFORE inference; once inference was paid, its message persists even
if the meeting closed mid-flight (one late write, never a revert).

Behavior captured here:
- user message posts to a non-active meeting -> 409, nothing written;
- turn requests to a non-active meeting -> 409, and the provider is never
  constructed/consulted (no paid inference);
- the streaming route degrades into a client-visible error event instead
  of starting inference;
- a turn in flight when the meeting closes persists its completed message
  (explicit late-write policy), without reopening the meeting.
"""

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.llm.base import LLMResponse
from app.services.meeting_manager import MeetingManager
from app.services.orchestrator import Orchestrator
from main import app
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for

from test_tool_continuation_loop import MEETING_ID, PARTICIPANT_ID, turn_env  # noqa: F401

MEETING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03"


def seed_meeting(disposable_db, *, status: str = "active") -> None:
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name, agenda, status, created_at) "
            "VALUES (%s, 'Guard probe', 'Agenda', %s, now())",
            (MEETING, status),
        )


def persisted_status(disposable_db, meeting_id) -> str:
    return disposable_db.query("SELECT status FROM meetings WHERE id = %s", (meeting_id,))[0][0]


def message_count(disposable_db, meeting_id) -> int:
    return disposable_db.query(
        "SELECT COUNT(*) FROM messages WHERE meeting_id = %s", (meeting_id,)
    )[0][0]


def patch_manager(monkeypatch, disposable_db) -> MeetingManager:
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)
    return MeetingManager()


@pytest.mark.parametrize("status", ["voting", "ended", "archived"])
def test_user_message_rejected_for_non_active_meetings(disposable_db, monkeypatch, status):
    seed_meeting(disposable_db, status=status)
    patch_manager(monkeypatch, disposable_db)

    with TestClient(app) as client:
        response = client.post(
            f"/api/meetings/{MEETING}/message",
            json={"content": "Late message should not be accepted."},
        )

    assert response.status_code == 409, response.text
    assert status in response.json()["detail"], "client-visible rejection names the current status"
    assert message_count(disposable_db, MEETING) == 0


def test_user_message_still_accepted_for_active_meeting(disposable_db, monkeypatch):
    seed_meeting(disposable_db, status="active")
    patch_manager(monkeypatch, disposable_db)

    with TestClient(app) as client:
        response = client.post(
            f"/api/meetings/{MEETING}/message", json={"content": "Hello board."}
        )

    assert response.status_code == 200, response.text
    assert message_count(disposable_db, MEETING) == 1


def test_duplicate_user_message_request_key_returns_the_original(disposable_db, monkeypatch):
    seed_meeting(disposable_db, status="active")
    patch_manager(monkeypatch, disposable_db)
    payload = {"content": "Send this exactly once.", "request_key": "message-key-1"}

    with TestClient(app) as client:
        first = client.post(f"/api/meetings/{MEETING}/message", json=payload)
        second = client.post(f"/api/meetings/{MEETING}/message", json=payload)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]
    assert message_count(disposable_db, MEETING) == 1


@pytest.mark.parametrize("status", ["voting", "ended", "archived"])
def test_turn_rejected_before_inference_for_non_active_meetings(turn_env, monkeypatch, status):
    db = turn_env["db"]
    with db.connect() as conn:
        conn.execute("UPDATE meetings SET status = %s WHERE id = %s", (status, MEETING_ID))

    # Installing with an empty script: any provider call would blow up loudly.
    provider = turn_env["install_provider"](responses=[], scripts=[])

    with TestClient(app) as client:
        response = client.post(
            f"/api/meetings/{MEETING_ID}/turn",
            json={"participant_id": PARTICIPANT_ID},
        )

    assert response.status_code == 409, response.text
    assert status in response.json()["detail"]
    assert provider.call_count == 0, "no inference may start for a closed meeting"


@pytest.mark.parametrize("status", ["voting", "ended"])
def test_stream_turn_reports_error_event_without_inference(turn_env, monkeypatch, status):
    db = turn_env["db"]
    with db.connect() as conn:
        conn.execute("UPDATE meetings SET status = %s WHERE id = %s", (status, MEETING_ID))

    provider = turn_env["install_provider"](responses=[], scripts=[])

    with TestClient(app) as client:
        with client.stream(
            "POST",
            f"/api/meetings/{MEETING_ID}/turn/stream",
            json={"participant_id": PARTICIPANT_ID},
        ) as response:
            assert response.status_code == 200
            payload = "".join(response.iter_text())

    assert "error" in payload
    assert status in payload
    assert provider.call_count == 0, "no inference may start for a closed meeting"


class CloseMidflightProvider(ScriptedProvider):
    """Flips the meeting to `voting` while its completion is being paid, then
    answers — emulating a user hitting 'End meeting' during a turn."""

    def __init__(self, db, responses):
        super().__init__(responses=responses)
        self._db = db

    async def complete(self, messages, tools=None, temperature=0.7, max_tokens=2048):
        with self._db.connect() as conn:
            conn.execute(
                "UPDATE meetings SET status = 'voting' WHERE id = %s", (MEETING_ID,)
            )
        return await super().complete(messages=messages, tools=tools, temperature=temperature, max_tokens=max_tokens)


async def test_completed_turn_persists_after_close_midflight(turn_env, monkeypatch):
    """Late-write policy: the turn was already paid when the meeting closed;
    its response still persists, and the closed status is never reverted."""
    db = turn_env["db"]

    provider = CloseMidflightProvider(
        db, responses=[LLMResponse(
            content="Final answer delayed by a concurrent close.",
            tool_calls=[],
            finish_reason="stop",
            usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        )]
    )
    monkeypatch.setattr("app.services.orchestrator.get_provider", lambda *a, **kw: provider)
    monkeypatch.setattr("app.llm.get_provider", lambda *a, **kw: provider)

    orchestrator = turn_env["orchestrator"]

    response = await orchestrator.execute_turn(MEETING_ID, PARTICIPANT_ID)

    assert response.message.content == "Final answer delayed by a concurrent close."
    assert message_count(db, MEETING_ID) == 1, "paid turn persists despite closure"
    assert persisted_status(db, MEETING_ID) == "voting", "closure is not reverted"
