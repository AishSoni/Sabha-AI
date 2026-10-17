"""Part E: the demo walkthrough ends through the SHARED ending workflow.

POST /{meeting_id}/ending-attempts with the demo-visitor identity replays
recorded ballots and the recorded executive brief through the regular
journaled path (vote_delta/vote_recorded -> summary_started/summary_delta ->
ending_completed). The live provider factory must never be called.
"""

import httpx
import pytest

import app.api.meetings as meetings_api
from app.infrastructure.demo.bond_scripts import (
    ending_summary_text,
    _ENDING_BALLOT_REASONS,
)
from app.modules.meetings.ending import (
    get_shared_ending_journal,
    reset_shared_ending_journal,
    parse_vote_response,
)
from tests.doubles.repositories import FakeEndingManager

pytestmark = pytest.mark.anyio

HEADERS = {"Authorization": "Bearer demo-visitor"}

SPECIALIST_TITLES = (
    "Credit & Business specialist",
    "Bond Structure & Downside specialist",
    "Treasury & Market specialist",
)


class DemoEndingManager(FakeEndingManager):
    """Adds the demo-visitor meeting with the exact specialist roster."""

    def __init__(self):
        super().__init__()
        from tests.doubles.repositories import _now

        self.add_meeting(
            "m-demo",
            participants=[
                {
                    "id": "p-credit",
                    "meeting_id": "m-demo",
                    "name": SPECIALIST_TITLES[0],
                    "role": "Credit specialist",
                    "system_prompt": "recorded",
                    "created_at": _now(),
                },
                {
                    "id": "p-structure",
                    "meeting_id": "m-demo",
                    "name": SPECIALIST_TITLES[1],
                    "role": "Structure specialist",
                    "system_prompt": "recorded",
                    "created_at": _now(),
                },
                {
                    "id": "p-treasury",
                    "meeting_id": "m-demo",
                    "name": SPECIALIST_TITLES[2],
                    "role": "Treasury specialist",
                    "system_prompt": "recorded",
                    "created_at": _now(),
                },
            ],
            user_id="demo-visitor",
        )


@pytest.fixture
def demo_ending_app(api_app, monkeypatch):
    manager = DemoEndingManager()
    monkeypatch.setattr(meetings_api, "get_meeting_manager", lambda: manager)

    def _forbidden(*_args, **_kwargs):
        raise AssertionError("live provider factory must not be used for demo endings")

    monkeypatch.setattr(meetings_api, "get_provider", _forbidden)
    reset_shared_ending_journal()
    yield api_app, manager
    reset_shared_ending_journal()


def _client_for(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test")


def test_recorded_ballots_parse_as_yes_votes():
    for title in SPECIALIST_TITLES:
        assert title in _ENDING_BALLOT_REASONS
        from app.infrastructure.demo.bond_scripts import ending_ballot_text

        ballot = parse_vote_response(ending_ballot_text(title))
        assert ballot["vote"] is True
        assert ballot["reason"].startswith("Recorded ballot:")


async def test_demo_ending_streams_recorded_votes_then_brief(demo_ending_app):
    app, manager = demo_ending_app
    async with _client_for(app) as client:
        accepted = await client.post(
            "/api/meetings/m-demo/ending-attempts", headers=HEADERS,
            json={"force_end": False},
        )
        assert accepted.status_code == 202
        body = accepted.json()
        assert body["duplicate"] is False
        assert body["events_url"] == (
            f"/api/meetings/ending-attempts/{body['attempt_id']}/events")

        types: list[str] = []
        terminal = None
        async for envelope in get_shared_ending_journal().subscribe(body["attempt_id"]):
            types.append(envelope["type"])
            if envelope["type"] in ("ending_completed", "ending_failed"):
                terminal = envelope
                break

        assert terminal is not None
        assert terminal["data"]["outcome"] == "completed"
        assert terminal["data"]["summary"] == ending_summary_text()
        votes = terminal["data"]["votes"]
        assert [v["participant_name"] for v in votes] == list(SPECIALIST_TITLES)
        assert all(v["vote"] is True for v in votes)
        assert terminal["data"]["usage"]["vote_calls"] == 3

        vote_recorded = [
            i for i, kind in enumerate(types) if kind == "vote_recorded"]
        summary_started = types.index("summary_started")
        summary_delta = [i for i, kind in enumerate(types) if kind == "summary_delta"]
        ending_completed = types.index("ending_completed")
        assert len(vote_recorded) == 3
        assert vote_recorded[2] < summary_started
        assert len(summary_delta) >= 1
        assert summary_delta[0] < ending_completed
        assert types[0] == "ending_started"

        state = await client.get(
            f"/api/meetings/ending-attempts/{body['attempt_id']}",
            headers=HEADERS,
        )
        assert state.status_code == 200
        state_body = state.json()
        assert state_body["outcome"] == "completed"
        assert state_body["meeting_id"] == "m-demo"
        assert state_body["summary"] == ending_summary_text()
        assert len(state_body["votes"]) == 3
        assert manager.commit_calls[-1][1] == "completed"

        # Replaying journal after the terminal still returns the recorded flow.
        replay = await client.get(body["events_url"], headers=HEADERS, params={"after": 0})
        assert replay.status_code == 200
        assert "event: ending_completed" in replay.text
        assert "event: ending_failed" not in replay.text


async def test_demo_ending_duplicate_attempt_returns_prior_outcome(demo_ending_app):
    app, _manager = demo_ending_app
    async with _client_for(app) as client:
        first = await client.post(
            "/api/meetings/m-demo/ending-attempts",
            headers={**HEADERS, "X-Idempotency-Key": "demo-ending-1"},
            json={"force_end": False},
        )
        assert first.status_code == 202

        duplicate = await client.post(
            "/api/meetings/m-demo/ending-attempts",
            headers={**HEADERS, "X-Idempotency-Key": "demo-ending-1"},
            json={"force_end": False},
        )
        assert duplicate.status_code == 202
        dup_body = duplicate.json()
        assert dup_body["duplicate"] is True
        assert dup_body["attempt_id"] == first.json()["attempt_id"]


async def test_demo_ending_ownership_is_enforced(demo_ending_app):
    app, _manager = demo_ending_app
    async with _client_for(app) as client:
        foreign = await client.post(
            "/api/meetings/m-demo/ending-attempts",
            headers={"Authorization": "Bearer someone-else"},
            json={"force_end": False},
        )
        assert foreign.status_code == 404
