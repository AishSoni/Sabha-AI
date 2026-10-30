"""Pins the final public HTTP surface.

The spec-11 cutover moved implementation files without moving a URL, method,
request/response model, or error envelope. The frontend fixture is the frozen
cross-stack contract; comparing ``app.openapi()`` to it makes an accidental
public change fail before the frontend notices.

The legacy roots are gone and must never return. The architecture suite also
enforces that boundary; this module keeps the contract pin next to the HTTP
characterization tests.
"""

import ast
import json
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent

LEGACY_ROOTS = (
    "app.api",
    "app.services",
    "app.models",
    "app.llm",
    "app.core",
)




def _legacy_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names if alias.name.startswith(LEGACY_ROOTS))
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module.startswith(LEGACY_ROOTS):
                found.add(node.module)
    return found


def _legacy_callers() -> set[str]:
    callers: set[str] = set()
    for base in (BACKEND_ROOT / "app", BACKEND_ROOT / "tests"):
        for path in sorted(base.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            if _legacy_imports(path):
                callers.add(path.relative_to(BACKEND_ROOT).as_posix())
    return callers


def test_openapi_matches_the_frontend_contract_fixture():
    fixture = REPO_ROOT / "frontend" / "tests" / "fixtures" / "openapi.json"
    expected = json.loads(fixture.read_text(encoding="utf-8"))
    assert app.openapi() == expected


def test_route_table_contains_the_pinned_public_paths():
    paths = {getattr(route, "path", "") for route in app.routes}
    assert "/" in paths
    assert "/health" in paths
    live_paths = {
        p for p in paths if p.startswith("/api/") and not p.startswith("/api/replay")
    }
    assert len(live_paths) == 40
    assert {
        p for p in paths if p.startswith("/api/replay")
    } == {
        "/api/replay/session",
        "/api/replay/meetings",
        "/api/replay/meetings/{meeting_id}",
        "/api/replay/meetings/{meeting_id}/disagreements",
        "/api/replay/meetings/{meeting_id}/consensus",
        "/api/replay/meetings/{meeting_id}/context-stats",
        "/api/replay/meetings/{meeting_id}/documents",
        "/api/replay/meetings/{meeting_id}/safe-config",
        "/api/replay/meetings/{meeting_id}/closing",
        "/api/replay/meetings/{meeting_id}/closing/events",
        "/api/replay/meetings/{meeting_id}/turns",
        "/api/replay/meetings/{meeting_id}/turns/{operation_id}",
        "/api/replay/meetings/{meeting_id}/turns/{operation_id}/events",
        "/api/replay/assets/{asset_id}",
        "/api/replay/{path:path}",
    }


def test_legacy_roots_have_no_callers():
    assert _legacy_callers() == set()


def test_error_envelopes_stay_safe_json_detail():
    with TestClient(app) as client:
        missing = client.get("/api/not-a-real-route")
        assert missing.status_code == 404
        assert "detail" in missing.json()

        invalid = client.post("/api/meetings", json={})
        assert invalid.status_code == 422
        assert isinstance(invalid.json()["detail"], list)
