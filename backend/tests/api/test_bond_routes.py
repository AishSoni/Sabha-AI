"""Bond demo routes: bootstrap, ordered actions, queue, reset over HTTP."""

import pytest

pytestmark = pytest.mark.anyio

REAL = "indian-corporate-bond-review"


async def _bootstrap(api_client):
    response = await api_client.post(
        "/api/v2/demo/sessions",
        json={"scenario_id": REAL, "scenario_revision": 1},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert "no-store" in body.get("headers_note", "no-store")
    return body


def _auth(body):
    return {"Authorization": f"Bearer {body['credential']}"}


async def _act(api_client, body, action_id, key, revision=1, generation=1):
    return await api_client.post(
        "/api/v2/demo/actions",
        json={
            "action_id": action_id,
            "expected_scenario_revision": revision,
            "expected_generation": generation,
            "idempotency_key": key,
        },
        headers=_auth(body),
    )


async def test_real_session_bootstraps_with_instrument(api_client):
    body = await _bootstrap(api_client)
    assert body["session"]["scenario_id"] == REAL
    assert body["session"]["generation"] == 1
    assert body["instrument"]["isin"] == "INE001A07RW5"
    assert body["instrument"]["snapshot_date"] == "2020-07-31"
    assert "start_walkthrough" in body["allowed_actions"]
    assert body["credential"]


async def test_unknown_scenario_rejected(api_client):
    response = await api_client.post(
        "/api/v2/demo/sessions", json={"scenario_id": "another-bond"}
    )
    assert response.status_code in (404, 409, 422)


async def test_walkthrough_advances_in_order_with_retry(api_client):
    body = await _bootstrap(api_client)
    steps = ["start_walkthrough", "inspect_board", "submit_bond_question"]
    for i, action_id in enumerate(steps):
        response = await _act(api_client, body, action_id, f"key-{i}")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert "INE001A07RW5" in payload["final_text"] or action_id == "inspect_board"
    # Out-of-order is rejected.
    response = await _act(api_client, body, "ask_treasury_analysis", "key-early")
    assert response.status_code == 409
    # Stale content revision is rejected.
    response = await _act(api_client, body, "ask_credit_analysis", "key-stale", revision=99)
    assert response.status_code == 409
    # Same key + same action replays the recorded result.
    first = await _act(api_client, body, "ask_credit_analysis", "key-credit")
    second = await _act(api_client, body, "ask_credit_analysis", "key-credit")
    assert first.json()["execution_id"] == second.json()["execution_id"]


async def test_queue_step_uses_editable_queue(api_client):
    body = await _bootstrap(api_client)
    for i, action_id in enumerate(
        ["start_walkthrough", "inspect_board", "submit_bond_question",
         "ask_credit_analysis", "ask_structure_downside"]):
        await _act(api_client, body, action_id, f"qkey-{i}")
    response = await _act(api_client, body, "queue_verification_question", "qkey-5")
    assert response.status_code == 200
    entry_id = response.json()["queue_entry"]["entry_id"]
    revision = response.json()["queue_entry"]["revision"]
    shown = await api_client.get("/api/v2/demo/queue", headers=_auth(body))
    assert entry_id in [e["entry_id"] for e in shown.json()["entries"]]
    edit = await api_client.patch(
        f"/api/v2/demo/queue/{entry_id}",
        json={"content": "revised verification question", "expected_revision": revision},
        headers=_auth(body),
    )
    assert edit.status_code == 200
    stale = await api_client.patch(
        f"/api/v2/demo/queue/{entry_id}",
        json={"content": "stale write", "expected_revision": revision},
        headers=_auth(body),
    )
    assert stale.status_code == 409
    removal = await api_client.delete(
        f"/api/v2/demo/queue/{entry_id}",
        headers=_auth(body),
    )
    assert removal.status_code in (200, 204)


async def test_reset_fences_old_generation(api_client):
    body = await _bootstrap(api_client)
    await _act(api_client, body, "start_walkthrough", "rkey-0")
    reset = await api_client.post(
        "/api/v2/demo/reset",
        json={"expected_generation": 1, "idempotency_key": "reset-1"},
        headers=_auth(body),
    )
    assert reset.status_code == 200
    assert reset.json()["session"]["generation"] == 2
    fenced = await _act(api_client, body, "inspect_board", "rkey-1", generation=1)
    assert fenced.status_code == 409


async def test_mode_override_headers_cannot_escape_fixture(api_client):
    response = await api_client.post(
        "/api/v2/demo/sessions",
        json={"scenario_id": REAL, "scenario_revision": 1},
        headers={"X-Demo-Mode": "live", "X-Provider": "openrouter"},
    )
    assert response.status_code == 201
    assert response.json()["instrument"]["isin"] == "INE001A07RW5"
