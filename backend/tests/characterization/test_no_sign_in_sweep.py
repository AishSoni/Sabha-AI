"""Access characterization for the operator-only live workspace (spec-22).

Replaces the historical "no sign-in anywhere" doctrine with the two-path
contract:

1. ``/api/replay/*`` stays account-free and mounted outside the live gate.
2. Every other ``/api/*`` operation is protected by the single operator
   bearer scheme, and Sabha exposes no login/token proxy of its own.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from main import app

pytestmark = pytest.mark.real_access

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPLAY_PREFIX = "/api/replay"
AUTH_PATH_FRAGMENTS = (
    "login",
    "signin",
    "signup",
    "register",
    "logout",
    "callback",
    "token",
    "password",
)


def live_operations(document: dict):
    for path, operations in document.get("paths", {}).items():
        if not path.startswith("/api") or path.startswith(REPLAY_PREFIX):
            continue
        for method, operation in operations.items():
            if isinstance(operation, dict) and "responses" in operation:
                yield path, method, operation


def unprotected_live_operations(composed_app: FastAPI):
    return [
        (path, method)
        for path, method, operation in live_operations(composed_app.openapi())
        if operation.get("security") != [{"OperatorBearer": []}]
    ]


def test_every_live_operation_requires_the_operator_scheme():
    assert unprotected_live_operations(app) == []


def test_the_scan_is_not_vacuous():
    planted = FastAPI()

    @planted.get("/api/planted")
    def planted_route():
        return {"leaked": True}

    assert unprotected_live_operations(planted) == [("/api/planted", "get")]


def test_replay_operations_are_public_by_contract():
    document = app.openapi()
    replay = 0
    for path, operations in document["paths"].items():
        if not path.startswith(REPLAY_PREFIX):
            continue
        for operation in operations.values():
            if isinstance(operation, dict) and "responses" in operation:
                assert "security" not in operation
                replay += 1
    assert replay > 5


def test_bare_visitor_reaches_replay_without_a_challenge():
    response = TestClient(app).get(f"{REPLAY_PREFIX}/session")
    assert response.status_code in (200, 503)
    assert "www-authenticate" not in {key.lower() for key in response.headers}


def test_bare_visitor_cannot_read_live_data():
    response = TestClient(app).get("/api/meetings")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_route_table_has_no_sabha_login_or_token_proxy():
    paths = {getattr(route, "path", "") for route in app.routes}
    offending = sorted(
        path
        for path in paths
        if any(fragment in path.lower() for fragment in AUTH_PATH_FRAGMENTS)
    )
    assert offending == []
    assert "/api/access/session" in paths


def test_live_routes_are_mounted_through_one_protected_parent():
    source = (BACKEND_ROOT / "app" / "presentation" / "router.py").read_text(
        encoding="utf-8"
    )
    assert "Depends(require_operator_access)" in source
    assert source.count("app.include_router(protected)") == 1
    # Child routers may only be attached to the protected parent, never
    # directly to the application.
    assert "app.include_router(meeting_compat_router" not in source
    assert "app.include_router(knowledge_router" not in source
    assert "app.include_router(persona_catalog_router" not in source
