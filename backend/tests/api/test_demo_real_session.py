"""Real-session bootstrap: DB journey package -> normal meeting record.

Offline-safe: the payload helper is pure; create_real_demo_meeting accepts
an injected manager double so no Supabase/network is touched.
"""

import pytest

pytestmark = pytest.mark.anyio

REAL = "indian-corporate-bond-review"


def test_payload_pins_historical_instrument_and_disclosure():
    from app.infrastructure.demo import bond_service

    payload = bond_service.build_real_demo_meeting_payload()
    assert "INE001A07RW5" in payload["name"]
    assert "INE001A07RW5" in payload["agenda"]
    assert "2020-07-31" in payload["agenda"]
    assert "recorded analysis" in payload["agenda"].lower()
    assert bond_service.DISCLOSURE in payload["agenda"]


async def test_unknown_scenario_fails_closed():
    from app.infrastructure.demo import bond_service
    from app.infrastructure.demo import errors

    class _Nope:
        async def create_meeting(self, data):
            raise AssertionError("must not reach storage")

    with pytest.raises(errors.ScenarioConflict):
        await bond_service.create_real_demo_meeting(
            scenario_id="another-bond",
            scenario_revision=1,
            manager=_Nope(),
        )


async def test_create_real_demo_meeting_uses_shared_manager_shape():
    """Injected double stands in for MeetingManager: name/agenda flow through,
    meeting id comes back, instrument view is attached."""
    from app.infrastructure.demo import bond_service

    seen = {}

    class _FakeMeeting:
        id = "meeting-real-1"

    class _FakeManager:
        async def create_meeting(self, data):
            seen["name"] = data.name
            seen["agenda"] = data.agenda
            seen["user_id"] = data.user_id
            return _FakeMeeting()

    result = await bond_service.create_real_demo_meeting(
        scenario_id=REAL, scenario_revision=1, manager=_FakeManager()
    )
    assert result["meeting"]["meeting_id"] == "meeting-real-1"
    assert "INE001A07RW5" in seen["name"]
    assert "recorded analysis" in seen["agenda"].lower()
    assert result["instrument"]["isin"] == "INE001A07RW5"
    assert result["recorded_analysis"] is True
    assert result["approval_status"] == bond_service.APPROVAL_STATUS


# ---------------- D2 routes: session modes + guide + journey progress ----------------


def _fake_persona_manager(monkeypatch):
    """PersonaManager double: empty roster, records created personas."""
    from types import SimpleNamespace

    created: list = []

    class _FakePM:
        async def list_personas(self, user_id, include_defaults=True):
            return []

        async def create_persona(self, data):
            p = SimpleNamespace(id=f"p-seed-{len(created) + 1}", name=data.name)
            created.append(p)
            return p

    monkeypatch.setattr("app.services.persona_manager.PersonaManager", _FakePM)
    return created


def _fake_meeting_manager(monkeypatch, meeting_ids, prefix="mr-real"):
    """MeetingManager double minting ids that don't collide with the
    synthetic 'meeting-' bootstrap placeholder prefix."""
    from types import SimpleNamespace

    seen: list = []

    class _FakeMM:
        async def create_meeting(self, data):
            seen.append(data)
            mid = f"{prefix}-{len(meeting_ids) + 1}"
            meeting_ids.append(mid)
            return SimpleNamespace(id=mid)

    monkeypatch.setattr(
        "app.services.meeting_manager.MeetingManager",
        lambda *a, **k: _FakeMM(),
    )
    return seen


async def _bootstrap_session(api_client, monkeypatch) -> str:
    _fake_persona_manager(monkeypatch)
    resp = await api_client.post("/api/v2/demo/real-session", json={
        "scenario_id": REAL, "scenario_revision": 1,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["credential"]


async def test_guide_route_serves_package_steps(api_app, api_client):
    resp = await api_client.get("/api/v2/demo/guide")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["disclosure"]
    assert set(body["journey"]) >= {f"J{i:02d}" for i in range(10)}
    assert set(body["ui"]) >= {f"UI{i:02d}" for i in range(9)}
    assert len(body["specialists"]) == 3
    titles = {s["title"] for s in body["specialists"]}
    assert titles == {
        "Credit & Business specialist",
        "Bond Structure & Downside specialist",
        "Treasury & Market specialist",
    }


async def test_real_session_default_creates_session_without_meeting(
    api_app, api_client, monkeypatch,
):
    created = _fake_persona_manager(monkeypatch)
    resp = await api_client.post("/api/v2/demo/real-session", json={
        "scenario_id": REAL, "scenario_revision": 1,
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["credential"]
    assert body["meeting"] is None
    assert body["persona_ids"] and len(body["persona_ids"]) == len(created) == 3


async def test_journey_state_requires_bearer(api_app, api_client):
    resp = await api_client.get("/api/v2/demo/journey-state")
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthenticated"


async def test_real_session_meeting_mode_pins_and_reuses(
    api_app, api_client, monkeypatch,
):
    token = await _bootstrap_session(api_client, monkeypatch)
    auth = {"Authorization": f"Bearer {token}"}

    meeting_ids: list = []
    _fake_meeting_manager(monkeypatch, meeting_ids)

    first = await api_client.post(
        "/api/v2/demo/real-session", json={"mode": "meeting"}, headers=auth,
    )
    assert first.status_code == 201, first.text
    first_body = first.json()
    mid = first_body["meeting"]["meeting_id"]
    assert mid and not mid.startswith("meeting-")
    assert len(meeting_ids) == 1
    assert len(first_body["persona_ids"]) == 3

    state = await api_client.get("/api/v2/demo/journey-state", headers=auth)
    assert state.status_code == 200, state.text
    assert state.json()["progress"]["meeting_id"] == mid

    again = await api_client.post(
        "/api/v2/demo/real-session", json={"mode": "meeting"}, headers=auth,
    )
    assert again.status_code == 201, again.text
    assert again.json()["meeting"]["meeting_id"] == mid
    assert len(meeting_ids) == 1, "meeting mode must be idempotent per generation"


async def test_real_session_fork_mode_gated_until_end(
    api_app, api_client, monkeypatch,
):
    token = await _bootstrap_session(api_client, monkeypatch)
    auth = {"Authorization": f"Bearer {token}"}
    resp = await api_client.post(
        "/api/v2/demo/real-session", json={"mode": "fork"}, headers=auth,
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["code"] == "unsupported_at_this_step"


async def test_journey_progress_enforces_order(api_app, api_client, monkeypatch):
    token = await _bootstrap_session(api_client, monkeypatch)
    auth = {"Authorization": f"Bearer {token}"}

    early = await api_client.post(
        "/api/v2/demo/journey-progress",
        json={"action_id": "inspect_board"},
        headers=auth,
    )
    assert early.status_code == 409, early.text

    first = await api_client.post(
        "/api/v2/demo/journey-progress",
        json={"action_id": "start_walkthrough"},
        headers=auth,
    )
    assert first.status_code == 200, first.text
    assert first.json()["progress"]["completed"] == ["start_walkthrough"]

    second = await api_client.post(
        "/api/v2/demo/journey-progress",
        json={"action_id": "inspect_board", "idempotency_key": "obs-1"},
        headers=auth,
    )
    assert second.status_code == 200, second.text
    assert second.json()["progress"]["completed"][-1] == "inspect_board"
    assert second.json()["progress"]["stage"] == "inspect_board"

    unknown = await api_client.post(
        "/api/v2/demo/journey-progress",
        json={"action_id": "nonsense_action"},
        headers=auth,
    )
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "unknown_action"

    noauth = await api_client.post(
        "/api/v2/demo/journey-progress", json={"action_id": "start_walkthrough"},
    )
    assert noauth.status_code == 401
