"""Regression: demo mode is a no-write workspace — mutating API calls are
denied before dispatch while reads stay open (Spec 01 guard; full demo replay
delivery lands in Spec 10). The plain (local/hosted) runtime keeps its no-auth
API, including writes.
"""

import pytest
from fastapi.testclient import TestClient

from app.platform import config as config_module
from main import app

MEETING_PAYLOAD = {"name": "Guarded Council", "persona_ids": []}


def test_denies_post_in_demo_mode(monkeypatch):
    monkeypatch.setattr(config_module.settings, "runtime_mode", "demo")
    client = TestClient(app)
    response = client.post("/api/meetings", json=MEETING_PAYLOAD)
    assert response.status_code == 403
    assert "read-only" in response.json()["detail"].lower()


def test_denies_mutations_before_validation(monkeypatch):
    # An empty body would normally be a 422; in demo mode the guard must
    # reject even sooner ("before dispatch"), so a 403 must win.
    monkeypatch.setattr(config_module.settings, "runtime_mode", "demo")
    client = TestClient(app)
    response = client.post("/api/meetings", json={})
    assert response.status_code == 403


def test_keeps_reads_and_health_open_in_demo_mode(monkeypatch):
    monkeypatch.setattr(config_module.settings, "runtime_mode", "demo")
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    response = client.get("/api/settings/providers")
    assert response.status_code == 200


def _install_stub_container(monkeypatch, db):
    from app.bootstrap import Container
    from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
    from tests.doubles.supabase_stub import stub_for

    service = build_meeting_service(stub_for(db))
    monkeypatch.setattr(
        app.state,
        "container",
        Container(
            prompt_catalog=object(),
            meeting_service=service,
            meeting_reads=service,
        ),
    )


def test_local_mode_keeps_writes_enabled(disposable_db, monkeypatch):
    # Characterization anchor: outside demo mode nothing changes. POSTs still
    # reach the route (stub-backed meeting creation succeeds).
    _install_stub_container(monkeypatch, disposable_db)
    client = TestClient(app)
    response = client.post("/api/meetings", json={"name": "Open Council", "persona_ids": []})
    assert response.status_code == 200, response.json()


def test_hosted_mode_is_also_a_write_enabled_runtime(disposable_db, monkeypatch):
    # Exit-gate evidence (runtime_modes): hosted BYOK operation uses the same
    # write API as local; only the demo workspace is read-only.
    monkeypatch.setattr(config_module.settings, "runtime_mode", "hosted")
    _install_stub_container(monkeypatch, disposable_db)
    client = TestClient(app)
    response = client.post("/api/meetings", json={"name": "Hosted Council", "persona_ids": []})
    assert response.status_code == 200, response.json()


@pytest.mark.real_access
def test_demo_auth_denial_wins_over_read_only_denial(monkeypatch):
    """Spec-22 ordering: admission is checked before the demo write guard."""

    monkeypatch.setattr(config_module.settings, "runtime_mode", "demo")
    response = TestClient(app).post("/api/meetings", json={})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_demo_denial_still_applies_to_an_admitted_operator(monkeypatch):
    from app.modules.access.presentation.http import require_operator_access
    from tests.support.access import authorise

    monkeypatch.setattr(config_module.settings, "runtime_mode", "demo")
    authorise(app)
    try:
        response = TestClient(app).post("/api/meetings", json={})
    finally:
        app.dependency_overrides.pop(require_operator_access, None)
    assert response.status_code == 403
    assert "read-only" in response.json()["detail"].lower()
