"""Stage A (A5): ending-attempt HTTP surface (CONTRACTS section 9-10).

POST /{meeting_id}/ending-attempts (202 + events_url), GET
/ending-attempts/{id} (authoritative state), GET
/ending-attempts/{id}/events (SSE replay + live until terminal), plus the
preserved synchronous POST /{meeting_id}/end shape (B-05) journaled through
the same execution path.
"""

import httpx
import pytest

from app.llm.base import LLMResponse
from tests.doubles.providers import ScriptedProvider
from tests.doubles.repositories import FakeEndingManager

pytestmark = pytest.mark.anyio

HEADERS = {"X-Test-Actor": "actor-a"}


def _summary(text: str) -> LLMResponse:
    return LLMResponse(content=text, tool_calls=[], finish_reason="stop",
                       usage={})


@pytest.fixture
def ending_app(api_app, monkeypatch):
    import app.api.meetings as meetings_api

    manager = FakeEndingManager()
    monkeypatch.setattr(meetings_api, "get_meeting_manager", lambda: manager)
    provider = ScriptedProvider([_summary("EXECUTIVE SUMMARY BODY")])
    monkeypatch.setattr(meetings_api, "get_provider",
                        lambda *a, **k: provider)
    return api_app, manager


def _client_for(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_post_ending_attempts_accepts_and_streams_terminal(ending_app):
    app, manager = ending_app
    async with _client_for(app) as client:
        accepted = await client.post(
            "/api/meetings/m/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert accepted.status_code == 202
        body = accepted.json()
        attempt_id = body["attempt_id"]
        assert attempt_id.startswith("end-")
        assert body["duplicate"] is False
        assert body["state"] in ("in_progress", "completed")
        assert body["events_url"] == (
            f"/api/meetings/ending-attempts/{attempt_id}/events")

        stream = await client.get(body["events_url"], headers=HEADERS,
                                  params={"after": 0})
        assert stream.status_code == 200
        assert "text/event-stream" in stream.headers["content-type"]
        text = stream.text
        assert "event: ending_started" in text
        assert "event: summary_started" in text
        assert "event: summary_delta" in text
        assert "event: ending_completed" in text
        assert "ending_attempt_id" in text
        assert "event: turn_completed" not in text

        state = await client.get(f"/api/meetings/ending-attempts/{attempt_id}",
                                 headers=HEADERS)
        assert state.status_code == 200
        assert state.json()["outcome"] == "completed"
        assert state.json()["meeting_id"] == "m"


async def test_post_ending_attempts_barriers(ending_app):
    app, manager = ending_app
    async with _client_for(app) as client:
        unknown = await client.post(
            "/api/meetings/nope/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert unknown.status_code == 404

        foreign = await client.post(
            "/api/meetings/m2/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert foreign.status_code == 404

        not_active = await client.post(
            "/api/meetings/mv/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert not_active.status_code == 409
        assert not_active.json()["detail"] == "meeting_not_active"

        manager.pending = 3
        queued = await client.post(
            "/api/meetings/m/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert queued.status_code == 409
        assert queued.json()["detail"] == "queue_not_drained"
        assert manager.begin_calls == 0
        manager.pending = 0

        manager.active_work = True
        busy = await client.post(
            "/api/meetings/m/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert busy.status_code == 409
        assert busy.json()["detail"] == "turn_in_progress"
        # Fresh attempt rolled back so the racing turn cannot be blocked.
        assert manager.begin_calls == 1
        assert manager.commit_calls[-1][1] == "failed"


async def test_duplicate_attempt_returns_original_outcome(ending_app):
    app, manager = ending_app
    manager.duplicate_next = True
    async with _client_for(app) as client:
        accepted = await client.post(
            "/api/meetings/m/ending-attempts", headers=HEADERS,
            json={"force_end": True})
        assert accepted.status_code == 202
        body = accepted.json()
        assert body["duplicate"] is True
        assert body["state"] == "completed"
        # No detached execution was spawned for a duplicate.
        assert manager.attempts == {}
        assert manager.released == []


async def test_sync_end_keeps_legacy_shape_and_journals(ending_app):
    app, manager = ending_app
    from app.modules.meetings.ending import get_shared_ending_journal

    async with _client_for(app) as client:
        ended = await client.post("/api/meetings/m/end", headers=HEADERS,
                                  json={"force_end": True})
        assert ended.status_code == 200
        body = ended.json()
        assert body["success"] is True
        assert body["summary"] == "EXECUTIVE SUMMARY BODY"
        assert "message" in body
        assert isinstance(body["votes"], list)

        attempt_id = next(iter(manager.attempts))
        events = await get_shared_ending_journal().list_events(attempt_id)
        assert events[-1]["type"] == "ending_completed"
        assert events[-1]["data"]["outcome"] == "completed"
        assert manager.commit_calls[-1][1] == "completed"


async def test_ending_attempt_state_and_events_ownership(ending_app):
    app, manager = ending_app
    manager.attempts["end-seed"] = {
        "attempt_id": "end-seed", "meeting_id": "m", "key": "seed",
        "force_end": True, "roster": [], "outcome": "completed",
        "summary": "seeded summary", "usage": {}, "votes": [],
    }
    manager.attempts["end-foreign"] = {
        "attempt_id": "end-foreign", "meeting_id": "m2", "key": "foreign",
        "force_end": True, "roster": [], "outcome": "completed",
        "summary": None, "usage": {}, "votes": [],
    }
    async with _client_for(app) as client:
        ok = await client.get("/api/meetings/ending-attempts/end-seed",
                              headers=HEADERS)
        assert ok.status_code == 200
        assert ok.json()["outcome"] == "completed"
        assert ok.json()["summary"] == "seeded summary"

        foreign = await client.get(
            "/api/meetings/ending-attempts/end-foreign", headers=HEADERS)
        assert foreign.status_code == 404

        missing = await client.get(
            "/api/meetings/ending-attempts/end-unknown", headers=HEADERS)
        assert missing.status_code == 404

        # Journal-missing attempt (predates this process): the DB fallback
        # still emits a terminal event from authoritative state.
        fallback = await client.get(
            "/api/meetings/ending-attempts/end-seed/events", headers=HEADERS,
            params={"after": 0})
        assert fallback.status_code == 200
        assert "event: ending_completed" in fallback.text
        assert "ending_attempt_id" in fallback.text
        assert "seeded summary" in fallback.text

        no_events = await client.get(
            "/api/meetings/ending-attempts/end-unknown/events",
            headers=HEADERS)
        assert no_events.status_code == 404

        foreign_events = await client.get(
            "/api/meetings/ending-attempts/end-foreign/events",
            headers=HEADERS)
        assert foreign_events.status_code == 404
