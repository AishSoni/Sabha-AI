"""Every live route is behind the single operator gate (spec-22)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.modules.access.application.contracts import (
    AccessUnavailable,
    InvalidAccessToken,
    VerifiedIdentity,
)
from app.modules.access.application.guard import OperatorGuard
from app.modules.access.domain.policy import AccessConfigurationError
from app.platform import config as config_module
from main import app

pytestmark = pytest.mark.real_access

OPERATOR_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"
PLACEHOLDER_ID = "33333333-3333-4333-8333-333333333333"


class FakeVerifier:
    def __init__(self, *, user_id=None, error=None):
        self.user_id = user_id
        self.error = error
        self.calls = 0

    async def verify(self, access_token: str) -> VerifiedIdentity:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return VerifiedIdentity(user_id=self.user_id or OPERATOR_ID)


class ExplodingAdapters:
    def __getattr__(self, name):
        raise AssertionError(f"business adapter reached: {name}")


def live_routes():
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if not route.path.startswith("/api"):
            continue
        if route.path.startswith("/api/replay"):
            continue
        yield route


def concrete_path(route: APIRoute) -> str:
    path = route.path
    while "{" in path:
        start = path.index("{")
        end = path.index("}", start)
        path = path[:start] + PLACEHOLDER_ID + path[end + 1 :]
    return path


def test_route_table_is_non_vacuous():
    routes = list(live_routes())
    assert len(routes) >= 30
    assert any(route.path == "/api/access/session" for route in routes)


def test_every_live_route_rejects_a_bare_client():
    client = TestClient(app)
    for route in live_routes():
        methods = sorted(
            method
            for method in (route.methods or set())
            if method not in {"HEAD", "OPTIONS"}
        )
        for method in methods:
            response = client.request(method, concrete_path(route))
            assert response.status_code == 401, (
                f"{method} {route.path} bypassed admission "
                f"with {response.status_code}: {response.text}"
            )
            assert response.headers.get("www-authenticate") == "Bearer"
            assert response.json()["detail"] == "Operator authentication required"


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": ""},
        {"Authorization": "Basic abc"},
        {"Authorization": "Bearer"},
        {"X-User-Id": OPERATOR_ID},
        {"X-Operator": OPERATOR_ID},
        {"X-Forwarded-User": OPERATOR_ID},
        {"X-Supabase-User": OPERATOR_ID},
        {"X-Provider-Key": "fixture-provider-key"},
    ],
)
def test_forged_headers_cannot_authorize(headers):
    response = TestClient(app).get("/api/meetings", headers=headers)
    assert response.status_code == 401


def test_invalid_token_is_a_challenge(monkeypatch):
    monkeypatch.setattr(
        app.state,
        "access",
        OperatorGuard(FakeVerifier(error=InvalidAccessToken()), OPERATOR_ID),
    )
    response = TestClient(app).get(
        "/api/meetings", headers={"Authorization": "Bearer expired"}
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_valid_non_operator_is_forbidden(monkeypatch):
    monkeypatch.setattr(
        app.state,
        "access",
        OperatorGuard(FakeVerifier(user_id=OTHER_ID), OPERATOR_ID),
    )
    response = TestClient(app).get(
        "/api/meetings", headers={"Authorization": "Bearer valid"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Operator access denied"


def test_operator_is_admitted_to_the_probe(monkeypatch):
    verifier = FakeVerifier()
    monkeypatch.setattr(
        app.state,
        "access",
        OperatorGuard(verifier, OPERATOR_ID),
    )
    response = TestClient(app).get(
        "/api/access/session", headers={"Authorization": "Bearer valid"}
    )
    assert response.status_code == 200
    assert response.json() == {"authorized": True}
    assert verifier.calls == 1


def test_auth_failure_is_503_without_dispatching_business_adapters(monkeypatch):
    monkeypatch.setattr(
        app.state,
        "access",
        OperatorGuard(FakeVerifier(error=AccessUnavailable()), OPERATOR_ID),
    )
    monkeypatch.setattr(app.state, "container", ExplodingAdapters())
    response = TestClient(app).get(
        "/api/meetings", headers={"Authorization": "Bearer valid"}
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Access verification unavailable"


def test_auth_failure_cannot_be_turned_into_a_business_403(monkeypatch):
    monkeypatch.setattr(
        app.state,
        "access",
        OperatorGuard(FakeVerifier(error=AccessUnavailable()), OPERATOR_ID),
    )
    response = TestClient(app).get(
        "/api/meetings", headers={"Authorization": "Bearer valid"}
    )
    assert response.status_code != 403


def test_live_openapi_operations_require_the_operator_bearer():
    schema = app.openapi()
    checked = 0
    for route in live_routes():
        for method in route.methods or set():
            if method in {"HEAD", "OPTIONS"}:
                continue
            operation = schema["paths"][route.path][method.lower()]
            assert operation.get("security") == [{"OperatorBearer": []}], (
                f"{method} {route.path} has no OpenAPI security"
            )
            assert "401" in operation["responses"]
            assert "403" in operation["responses"]
            assert "503" in operation["responses"]
            checked += 1
    assert checked >= 30


def test_replay_operations_do_not_inherit_operator_security():
    schema = app.openapi()
    replay_operations = 0
    for path, operations in schema["paths"].items():
        if not path.startswith("/api/replay"):
            continue
        for operation in operations.values():
            if isinstance(operation, dict) and "responses" in operation:
                assert "security" not in operation, path
                replay_operations += 1
    assert replay_operations > 5


def test_preflight_stays_public(monkeypatch):
    response = TestClient(app).options(
        "/api/meetings",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-origin")


def test_private_responses_are_not_cacheable():
    response = TestClient(app).get("/api/access/session")
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"


def test_replay_responses_keep_their_own_cache_policy():
    response = TestClient(app).get("/api/replay/session")
    assert response.status_code in (200, 503)
    assert response.headers.get("cache-control") != "private, no-store"


def _forbid_container(monkeypatch):
    from app.bootstrap import Container

    calls = []
    monkeypatch.setattr(
        Container,
        "production",
        classmethod(lambda cls: calls.append("production") or object()),
    )
    return calls


@pytest.mark.parametrize("runtime_mode", ["local", "hosted", "demo"])
def test_missing_operator_config_prevents_live_composition(monkeypatch, runtime_mode):
    calls = _forbid_container(monkeypatch)
    monkeypatch.setattr(config_module.settings, "runtime_mode", runtime_mode)
    monkeypatch.setattr(config_module.settings, "operator_user_id", "")
    with pytest.raises(AccessConfigurationError):
        __import__("app.bootstrap", fromlist=["create_app"]).create_app()
    assert calls == []


def test_missing_publishable_key_prevents_live_composition(monkeypatch):
    calls = _forbid_container(monkeypatch)
    monkeypatch.setattr(
        config_module.settings, "supabase_auth_publishable_key", ""
    )
    with pytest.raises(AccessConfigurationError):
        __import__("app.bootstrap", fromlist=["create_app"]).create_app()
    assert calls == []


def test_replay_only_needs_no_operator_or_auth_config(monkeypatch):
    from app.bootstrap import create_app

    monkeypatch.setattr(config_module.settings, "operator_user_id", "")
    monkeypatch.setattr(config_module.settings, "supabase_auth_publishable_key", "")
    replay_only = create_app(container=None, replay=None, mount_live=False)
    assert replay_only.state.access is None
    client = TestClient(replay_only)
    assert client.get("/api/replay/session").status_code in (200, 503)
    assert client.get("/api/meetings").status_code == 404


async def test_access_sources_never_touch_the_service_role_client():
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2] / "app" / "modules" / "access"
    for path in root.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "app.platform.database" not in source, path
        assert "create_client(" not in source, path
        assert "get_supabase(" not in source, path
        assert "set_session" not in source, path
        assert "sign_in_with_password" not in source, path
