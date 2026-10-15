"""Public demo entry stays disabled; overrides cannot enable live fallback."""

import pytest

pytestmark = pytest.mark.anyio


async def test_demo_session_creation_is_unavailable(api_client):
    response = await api_client.post(
        "/api/v2/demo/sessions",
        json={"scenario_id": "synthetic-smoke-scaffold"},
    )
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "demo_unavailable"
    assert body["retryable"] is False


async def test_demo_actions_stay_disabled(api_client):
    response = await api_client.post(
        "/api/v2/demo/actions",
        json={
            "action_id": "synthetic_smoke",
            "scenario_revision": 1,
            "idempotency_key": "key-12345",
        },
    )
    assert response.status_code == 503
    assert response.json()["code"] == "demo_unavailable"


async def test_client_mode_override_cannot_enable_demo(api_client):
    # A caller-supplied mode/provider must not switch the scaffold into a
    # live or journey path; the handler ignores it and stays unavailable.
    response = await api_client.post(
        "/api/v2/demo/sessions",
        json={"scenario_id": "synthetic-smoke-scaffold", "mode": "live"},
        headers={"X-Demo-Mode": "live", "X-Provider": "openrouter"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "demo_unavailable"


async def test_demo_reset_stays_disabled(api_client):
    response = await api_client.post(
        "/api/v2/demo/reset",
        json={"expected_generation": 1, "idempotency_key": "reset-12345"},
    )
    assert response.status_code == 503
