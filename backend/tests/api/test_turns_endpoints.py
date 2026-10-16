"""Stage A (A2/A4): /turns start + replay endpoints, queue self-heal on submit.

POST /api/meetings/{id}/turns starts a detached shared-engine turn and answers
202 with a stable turn id + stream URL (409 on busy/barrier). GET
/api/meetings/turns/{id} and .../events provide authoritative status and SSE
replay from a sequence cursor with owner-scoped access.
"""

import asyncio
import time

import pytest

from tests.doubles.providers import ScriptedProvider, final_text_response

pytestmark = pytest.mark.anyio

HEADERS = {"X-Test-Actor": "actor-a"}


class _FakeManager:
    def __init__(self):
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        participant = {"id": "p1", "meeting_id": "m", "name": "AI One", "role": "r",
                       "system_prompt": "s", "created_at": now}
        self._meetings = {
            "m": {"id": "m", "user_id": "actor-a", "name": "M", "agenda": "",
                  "status": "active", "archived_from": None, "total_cost": 0.0,
                  "created_at": now, "participants": [participant], "messages": []},
            "m2": {"id": "m2", "user_id": "actor-b", "name": "Other", "agenda": "",
                   "status": "active", "archived_from": None, "total_cost": 0.0,
                   "created_at": now, "participants": [], "messages": []},
        }
        self.pending = 0
        self.active_work = False
        self.drain_clears = True
        self.drain_calls = 0

    async def get_meeting(self, meeting_id):
        from app.models import MeetingWithParticipants

        row = self._meetings.get(meeting_id)
        return MeetingWithParticipants(**row) if row else None

    async def pending_queue_count(self, meeting_id):
        return self.pending

    async def has_active_work(self, meeting_id):
        return self.active_work

    async def drain_queue(self, meeting_id):
        self.drain_calls += 1
        if self.drain_clears:
            self.pending = 0
        return 0

    async def save_message(self, data):
        from datetime import datetime, timezone
        import uuid

        from app.models import Message

        return Message(id=str(uuid.uuid4()), meeting_id=data.meeting_id,
                       content=data.content, sender_type=data.sender_type,
                       sender_id=data.sender_id, sender_name=data.sender_name,
                       created_at=datetime.now(timezone.utc))

    async def submit_queue_entry(self, meeting_id, owner_id, content, idempotency_key=""):
        self.pending += 1
        return {"entry_id": f"q-{self.pending}", "meeting_id": meeting_id,
                "content": content, "revision": 1, "state": "pending"}


@pytest.fixture
def turns_app(monkeypatch, api_app):
    import app.api.meetings as meetings_api
    import app.services.orchestrator as orch_mod

    fake = _FakeManager()
    provider = ScriptedProvider([final_text_response("answer")])
    monkeypatch.setattr(meetings_api, "get_meeting_manager", lambda: fake)
    monkeypatch.setattr(orch_mod, "get_provider", lambda *a, **k: provider)
    return api_app, fake


def _client_for(app):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _wait_for(predicate, timeout=5.0, message="condition not met"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError(message)


async def _wait_terminal(turn_id, timeout=5.0):
    from app.modules.meetings.store import get_shared_turn_store

    store = get_shared_turn_store()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        record = await store.get(turn_id)
        if record.state in ("completed", "failed", "cancelled"):
            return record
        await asyncio.sleep(0.01)
    raise AssertionError(f"turn {turn_id} did not terminate")


async def test_turn_start_returns_202_with_events_url(turns_app):
    app, fake = turns_app
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/m/turns", json={"participant_id": "p1"}, headers=HEADERS)
        assert response.status_code == 202, response.text
        body = response.json()
        assert body["events_url"] == f"/api/meetings/turns/{body['turn_id']}/events"
        assert body["state"] in {"pending", "running", "completed"}
        record = await _wait_terminal(body["turn_id"])
        assert record.state == "completed"
        # Terminalization drains the queue (self-heal, here nothing pending).
        await _wait_for(lambda: fake.drain_calls >= 1,
                        message="drain must run after turn terminalization")


async def test_turn_start_busy_409(turns_app):
    from app.modules.meetings.store import get_shared_turn_store

    app, fake = turns_app
    store = get_shared_turn_store()
    await store.reserve("m", "p1", "preexisting-turn")
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/m/turns", json={"participant_id": "p1"}, headers=HEADERS)
    assert response.status_code == 409
    assert "turn_in_progress" in response.text


async def test_turn_start_meeting_missing_404(turns_app):
    app, _ = turns_app
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/nope/turns", json={"participant_id": "p1"}, headers=HEADERS)
    assert response.status_code == 404


async def test_turn_start_blocked_until_queue_drained(turns_app):
    app, fake = turns_app
    fake.pending = 3
    fake.drain_clears = False  # drain cannot clear (dispatch unavailable)
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/m/turns", json={"participant_id": "p1"}, headers=HEADERS)
    assert response.status_code == 409
    assert "queue_not_drained" in response.text
    assert fake.drain_calls == 1  # barrier self-heal was attempted


async def test_turn_status_and_events_replay_with_ownership(turns_app):
    from app.modules.meetings.store import get_shared_turn_store

    app, _ = turns_app
    store = get_shared_turn_store()
    record = await store.reserve("m", "p1", "k-events")
    await store.append_event(record.turn_id, "turn_started", {})
    await store.append_event(record.turn_id, "text_delta", {"content": "partial"})
    await store.append_event(record.turn_id, "turn_completed",
                             {"message_id": "msg-1", "usage_completeness": "complete"})
    await store.finalize(record.turn_id, "completed", "msg-1", {}, 0.0, "final_answer")

    foreign = await store.reserve("m2", "p1", "k-foreign")

    async with _client_for(app) as client:
        status = await client.get(f"/api/meetings/turns/{record.turn_id}", headers=HEADERS)
        assert status.status_code == 200
        assert status.json()["state"] == "completed"

        missing = await client.get("/api/meetings/turns/unknown-turn", headers=HEADERS)
        assert missing.status_code == 404

        foreign_status = await client.get(
            f"/api/meetings/turns/{foreign.turn_id}", headers=HEADERS)
        assert foreign_status.status_code == 404  # owner is actor-b

        stream = await client.get(
            f"/api/meetings/turns/{record.turn_id}/events?after=1", headers=HEADERS)
        assert stream.status_code == 200
        assert "text/event-stream" in stream.headers["content-type"]
        body = stream.text
        assert "turn_started" not in body and '"sequence": 1' not in body
        assert '"sequence": 2' in body and '"sequence": 3' in body
        assert "event: text_delta" in body and "event: turn_completed" in body

        foreign_stream = await client.get(
            f"/api/meetings/turns/{foreign.turn_id}/events", headers=HEADERS)
        assert foreign_stream.status_code == 404

        unknown_stream = await client.get(
            "/api/meetings/turns/unknown-turn/events", headers=HEADERS)
        assert unknown_stream.status_code == 404


async def test_submit_self_heals_stale_queue_when_idle(turns_app):
    app, fake = turns_app
    fake.pending = 1  # stale pending entry with no active turn
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/m/messages", json={"content": "hello"}, headers=HEADERS)
    assert response.status_code == 201, response.text
    assert fake.drain_calls == 1  # drain ran before the commit decision
    assert fake.pending == 0


async def test_submit_skips_drain_while_work_active(turns_app):
    app, fake = turns_app
    fake.active_work = True
    fake.pending = 1
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings/m/messages", json={"content": "hello"}, headers=HEADERS)
    assert response.status_code == 202, response.text
    assert fake.drain_calls == 0  # never dispatch under an active turn
