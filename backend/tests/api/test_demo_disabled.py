"""Demo entry stays fail-closed for everything that is not the approved run.

The substitute /actions + /queue contracts are retired: the walkthrough rides
the shared meeting infrastructure (real-session dispatch, recorded turns on
the normal turn journal, the shared ending workflow). What remains verified
here: unknown scenarios, missing auth, and honest mode dispatch.
"""

import pytest

pytestmark = pytest.mark.anyio

REAL = "indian-corporate-bond-review"


async def test_unknown_scenario_fails_closed(api_client):
    response = await api_client.post(
        "/api/v2/demo/real-session", json={"scenario_id": "another-bond"}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_scenario"


async def test_client_mode_override_cannot_escape_fixture(api_client):
    # A caller-supplied mode/provider must not switch the demo into a live
    # path; the session-only handler ignores them and serves recorded content.
    response = await api_client.post(
        "/api/v2/demo/real-session",
        json={"scenario_id": REAL, "scenario_revision": 1, "mode": "live"},
        headers={"X-Demo-Mode": "live", "X-Provider": "openrouter"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["instrument"]["isin"] == "INE001A07RW5"


async def test_journey_progress_requires_bearer_token(api_client):
    response = await api_client.post(
        "/api/v2/demo/journey-progress",
        json={"action_id": "start_walkthrough", "idempotency_key": "key-1"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_meeting_and_fork_modes_require_bearer_token(api_client):
    meeting = await api_client.post(
        "/api/v2/demo/real-session", json={"mode": "meeting"}
    )
    assert meeting.status_code == 401
    fork = await api_client.post(
        "/api/v2/demo/real-session", json={"mode": "fork"}
    )
    assert fork.status_code == 401


async def test_unknown_recorded_action_fails_closed(api_client):
    response = await api_client.post(
        "/api/v2/demo/recorded-turn",
        json={"meeting_id": "m-demo", "action_id": "walk_on_the_moon"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_action"
