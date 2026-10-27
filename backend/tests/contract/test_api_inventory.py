"""The published API inventory must describe the routes that actually exist.

Spec 11 requires the final delivery to publish an inventory instead of
leaving the old pre-cutover document in place. Parsing the markdown table rows
keeps that document honest: a route cannot be added, moved, or deleted without
the inventory moving in the same commit.
"""

from __future__ import annotations

import re
from pathlib import Path

from main import app
from scripts.export_openapi import DEFAULT_FIXTURE, main as export_main

REPO_ROOT = Path(__file__).resolve().parents[3]
INVENTORY = REPO_ROOT / "specs" / "reference-api-use-case-inventory.md"

ROUTE_ROW = re.compile(
    r"^\|\s*`(GET|POST|PUT|DELETE|PATCH)\s+(/[^`]*)`\s*\|",
    re.MULTILINE,
)
PUBLIC_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH"}


def _documented_routes() -> set[tuple[str, str]]:
    text = INVENTORY.read_text(encoding="utf-8")
    return {(method, path) for method, path in ROUTE_ROW.findall(text)}


def _live_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        if not (path in {"/", "/health"} or path.startswith("/api/")):
            continue
        methods = getattr(route, "methods", set()) or set()
        for method in methods & PUBLIC_METHODS:
            routes.add((method, path))
    return routes


def test_inventory_covers_exactly_the_live_routes():
    assert INVENTORY.exists(), "the API inventory must be committed"
    documented = _documented_routes()
    live = _live_routes()
    assert documented == live, (
        f"missing from inventory: {sorted(live - documented)}; "
        f"stale in inventory: {sorted(documented - live)}"
    )


def test_inventory_names_current_owners_and_states():
    text = INVENTORY.read_text(encoding="utf-8")
    stale = (
        "backend/app/api/",
        "frontend/src/lib/api.ts",
        "`POST /{meeting_id}/end`",
    )
    for marker in stale:
        assert marker not in text, f"stale API inventory reference: {marker}"


def test_openapi_export_check_passes():
    assert DEFAULT_FIXTURE.exists()
    assert export_main(["--check"]) == 0
