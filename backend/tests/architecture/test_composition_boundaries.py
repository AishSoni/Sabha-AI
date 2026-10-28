"""Spec-14 composition boundary: presentation resolves, never constructs.

The live routes and the replay surface must both reach adapters through the
composition root. These tests guard the migrated callers that replay can
reach; importing an infrastructure constructor or the process-wide knowledge
singleton in a handler would make an injected composition a lie.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app

pytestmark = pytest.mark.architecture

BACKEND_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = BACKEND_ROOT / "app"

FORBIDDEN_BY_MODULE = {
    "modules/meetings/presentation/compat_http.py": {
        "app.modules.meetings.infrastructure.supabase_meetings.build_default_meeting_service",
    },
    "modules/meetings/presentation/meetings_http.py": {
        "app.modules.meetings.infrastructure.supabase_meetings.build_default_meeting_service",
        "app.modules.knowledge.public.get_knowledge_lifecycle",
    },
    "modules/meetings/presentation/turns_http.py": {
        "app.platform.database.get_supabase",
    },
    "modules/knowledge/presentation/http.py": {
        "app.platform.database.get_supabase",
        "app.modules.knowledge.public.get_knowledge_lifecycle",
    },
    "modules/knowledge/presentation/stacks_http.py": {
        "app.platform.database.get_supabase",
    },
    "modules/settings/presentation/http.py": {
        "app.modules.settings.infrastructure.system_ai.load_system_ai_config",
    },
    "presentation/dependencies.py": {
        "app.modules.meetings.infrastructure.supabase_meetings.build_default_meeting_service",
    },
}


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
            found.update(f"{node.module}.{alias.name}" for alias in node.names)
    return found


@pytest.mark.parametrize("relative, forbidden", FORBIDDEN_BY_MODULE.items())
def test_replay_reachable_presentation_does_not_construct_defaults(
    relative: str, forbidden: set[str]
):
    imported = _imported_modules(APP_ROOT / relative)
    assert imported.isdisjoint(forbidden), imported & forbidden


class _Reads:
    def __init__(self):
        self.calls = []

    async def get_meeting(self, meeting_id):
        self.calls.append(("get_meeting", meeting_id))
        return None

    async def list_meetings(self):
        self.calls.append(("list_meetings",))
        return []

    async def get_disagreements(self, meeting_id):
        self.calls.append(("get_disagreements", meeting_id))
        return []

    async def get_consensus_list(self, meeting_id):
        self.calls.append(("get_consensus_list", meeting_id))
        return []


class _Observation:
    def __init__(self):
        self.calls = []

    async def status(self, meeting_id, operation_id):
        self.calls.append(("status", meeting_id, operation_id))
        raise AssertionError("status should not be called by list")

    async def list_operations(self, meeting_id, limit=100):
        self.calls.append(("list_operations", meeting_id, limit))
        return []

    async def events(self, meeting_id, operation_id, after_sequence=0, limit=500):
        self.calls.append(("events", meeting_id, operation_id))
        return []


def test_http_reads_resolve_the_container_ports_not_defaults():
    reads = _Reads()
    observation = _Observation()
    app = create_app(
        Container(
            prompt_catalog=object(),
            meeting_reads=reads,
            turn_observation=observation,
        )
    )

    with TestClient(app) as client:
        listed = client.get("/api/meetings")
        missing = client.get("/api/meetings/abc")
        turns = client.get("/api/meetings/abc/turns")

    assert listed.status_code == 200
    assert listed.json() == []
    assert missing.status_code == 404
    assert turns.status_code == 200
    assert turns.json() == []
    assert reads.calls == [("list_meetings",), ("get_meeting", "abc")]
    assert observation.calls == [("list_operations", "abc", 100)]
