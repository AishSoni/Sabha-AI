"""Demo entry is live for the approved bond review and closed otherwise.

The old 503 disabled-entry contract is retired: POST /sessions now bootstraps
the single approved scenario. What stays fail-closed: unknown scenarios,
stale revisions, missing auth, and caller-supplied mode/provider overrides.
"""

import pytest

pytestmark = pytest.mark.anyio

REAL = "indian-corporate-bond-review"


async def test_unknown_scenario_fails_closed(api_client):
    response = await api_client.post(
        "/api/v2/demo/sessions", json={"scenario_id": "another-bond"}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_scenario"


async def test_client_mode_override_cannot_escape_fixture(api_client):
    # A caller-supplied mode/provider must not switch the demo into a live
    # path; the handler ignores it and serves the scripted bond review.
    response = await api_client.post(
        "/api/v2/demo/sessions",
        json={"scenario_id": REAL, "scenario_revision": 1, "mode": "live"},
        headers={"X-Demo-Mode": "live", "X-Provider": "openrouter"},
    )
    assert response.status_code == 201
    assert response.json()["instrument"]["isin"] == "INE001A07RW5"


async def test_actions_require_bearer_token(api_client):
    response = await api_client.post(
        "/api/v2/demo/actions",
        json={
            "action_id": "start_walkthrough",
            "expected_scenario_revision": 1,
            "expected_generation": 1,
            "idempotency_key": "key-12345",
        },
    )
    assert response.status_code == 401


async def test_stale_revision_rejected_after_bootstrap(api_client):
    boot = await api_client.post(
        "/api/v2/demo/sessions", json={"scenario_id": REAL, "scenario_revision": 1}
    )
    token = boot.json()["credential"]
    response = await api_client.post(
        "/api/v2/demo/actions",
        json={
            "action_id": "start_walkthrough",
            "expected_scenario_revision": 99,
            "expected_generation": 1,
            "idempotency_key": "key-12345",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 409
