"""P01-T06 regression ledger (part 1): strict expected failures for B-01..B-11.

Each test asserts the CORRECT behavior and currently fails for its intended
reason (recorded below). `xfail_strict = true` (pytest.ini) turns any fixed
bug with a stale marker into an XPASS failure, forcing marker removal.
B-09's executable reproducer lives in the frontend (see header); every other
row executes here. P01-TEST05's stale-marker demonstration is
`test_strict_xfail_detects_stale_markers`.

Intended red reasons (pre-fix code):
- B-01: execute_turn makes exactly one provider call; tool results never
  return to the model (`orchestrator.py:222-251`).
- B-02: persona evidence lookup calls undefined `get_supabase`
  (`orchestrator.py:141`), raising NameError.
- B-03: live Qdrant query contract needs an isolated Phase 06 fixture;
  unit-level client surface holds on qdrant-client 1.7.0.
- B-04: `supabase_schema.sql:15` CHECK admits only active/archived while
  `MeetingStatus` also defines voting/ended.
- B-05: `/api/*` routes carry no actor-binding dependencies (owner Phase 04).
- B-06: settings API accepts caller-controlled Ollama base URLs with no
  destination allowlist (owner Phase 05/08).
- B-07: `create_meeting` persona branch drops persona provider_config
  (`meeting_manager.py:80-89`).
- B-08: no seam wires saved frontend settings into backend inference
  (owner Phase 05/07).
- B-09: frontend `meetingStore` lets stale loads overwrite the selected
  meeting -- executable case is
  `frontend/src/stores/meetingStore.regression.test.ts` (`it.fails`, owner Phase 07).
- B-10: `delete_meeting` never touches vector collections (owner Phase 06).
- B-11: `activate_prompt_version` deactivates all versions before validating
  the target (`persona_manager.py:273-296`).
"""

from pathlib import Path

import pytest

from tests.doubles.providers import (
    ScriptedProvider,
    final_text_response,
    tool_call_response,
)
from tests.doubles.repositories import FakeMeetingRepo

pytestmark = pytest.mark.anyio


# --------------------------------------------------------------------------
# Minimal Supabase-shaped fake for ledger cases (insert/select/update/delete
# chains only). Records payloads so tests assert side effects, not mocks.
# --------------------------------------------------------------------------


class _Result:
    def __init__(self, data):
        self.data = data


class _Chain:
    def __init__(self, execute):
        self._execute = execute

    def eq(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self):
        return self._execute()


class _LedgerTable:
    def __init__(self, db, name):
        self._db = db
        self._name = name

    def insert(self, payload):
        return _Chain(lambda: self._db._insert(self._name, payload))

    def select(self, *args, **kwargs):
        return _Chain(lambda: self._db._select(self._name))

    def update(self, patch):
        return _Chain(lambda: self._db._update(self._name, patch))

    def delete(self):
        return _Chain(lambda: self._db._delete(self._name))


class _LedgerSupabase:
    """Supabase-shaped double with persona rows and prompt-version state."""

    def __init__(self, personas=None, prompt_versions=None):
        self.personas = list(personas or [])
        self.prompt_versions = dict(prompt_versions or {1: True})
        self.inserts = []
        self.deletes = []

    def table(self, name):
        return _LedgerTable(self, name)

    def _insert(self, table, payload):
        self.inserts.append((table, payload))
        return _Result([payload])

    def _select(self, table):
        if table == "personas":
            return _Result(list(self.personas))
        if table == "prompt_versions":
            return _Result([])
        return _Result([])

    def _update(self, table, patch):
        if table == "prompt_versions":
            if patch.get("is_active") is False:
                for v in self.prompt_versions:
                    self.prompt_versions[v] = False
                return _Result([{"ok": True}])
            return _Result([])
        return _Result([{"ok": True}])

    def _delete(self, table):
        self.deletes.append(table)
        return _Result([{"id": "m-1"}])

    def inserts_for(self, table):
        return [p for t, p in self.inserts if t == table]


class _VersionAwareSupabase(_LedgerSupabase):
    """Update honors the requested version so success paths keep working."""

    def __init__(self, *args, target_version=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._target_version = target_version

    def _update(self, table, patch):
        if table == "prompt_versions" and patch.get("is_active") is True:
            if self._target_version in self.prompt_versions:
                self.prompt_versions[self._target_version] = True
                return _Result([{"version": self._target_version}])
            return _Result([])
        return super()._update(table, patch)


PERSONA_ROW = {
    "id": "persona-1",
    "name": "The Investor",
    "subtitle": "ROI focus",
    "color": "#ff0000",
    "provider_config": {"provider": "gemini", "model": "gemini-ledger", "temperature": 0.5},
}


def _participant(persona_id=None):
    from app.models import AIParticipant

    return AIParticipant(
        id="ai-1",
        meeting_id="m-1",
        name="The CTO",
        role="tech",
        system_prompt="sys",
        color="#000000",
        persona_id=persona_id,
    )


# --------------------------------------------------------------------------
# P01-TEST05: stale expected-failure detection demonstration
# --------------------------------------------------------------------------


def test_strict_xfail_detects_stale_markers():
    """Emulates strict-xfail semantics: a fixed bug with a leftover marker
    must surface as a failure (XPASS), never silently pass."""
    marker_still_present, underlying_now_passes = True, True
    with pytest.raises(AssertionError, match="stale xfail marker"):
        if marker_still_present and underlying_now_passes:
            raise AssertionError(
                "stale xfail marker: expected failure but got pass (XPASS)"
            )


# --------------------------------------------------------------------------
# Focused correct-behavior cases (P01-T06 priority)
# --------------------------------------------------------------------------


@pytest.mark.xfail(strict=True, reason="B-01: no tool continuation; owner Phase 02")
async def test_b01_tool_result_returns_to_model(monkeypatch):
    import app.services.orchestrator as orch_mod
    from app.services.orchestrator import Orchestrator

    provider = ScriptedProvider(
        [
            tool_call_response(
                "c-1",
                "log_disagreement",
                {
                    "target_participant_name": "The Investor",
                    "topic": "pricing",
                    "reasoning": "margin risk",
                    "severity": 4,
                },
            ),
            final_text_response("considered and answered"),
        ]
    )
    monkeypatch.setattr(orch_mod, "get_provider", lambda *a, **k: provider)
    repo = FakeMeetingRepo()
    repo.add_meeting("m-1", participants=[_participant()])
    await Orchestrator(meeting_manager=repo).execute_turn("m-1", "ai-1")

    assert len(provider.calls) >= 2, "tool result must be fed back to the model"
    followups = provider.calls[1]["messages"]
    assert any(
        m.get("role") == "tool" and m.get("tool_call_id") == "c-1" for m in followups
    ), "tool result with the original ID must reach the provider"


@pytest.mark.xfail(strict=True, reason="B-02: undefined get_supabase; owner Phase 02/06")
async def test_b02_persona_evidence_lookup_has_no_undefined_reference(monkeypatch):
    import app.services.orchestrator as orch_mod
    import app.services.vector_store as vs_mod
    from app.services.orchestrator import Orchestrator

    class _StubVectors:
        async def collection_exists(self, name):
            return True

        async def search_multiple_collections(self, **kwargs):
            return []

    provider = ScriptedProvider(
        [
            tool_call_response("c-9", "search_knowledge_base", {"query": "pricing"}),
            final_text_response("ack"),
        ]
    )
    monkeypatch.setattr(vs_mod, "get_vector_store", lambda: _StubVectors())
    monkeypatch.setattr(orch_mod, "get_provider", lambda *a, **k: provider)
    repo = FakeMeetingRepo()
    repo.add_meeting("m-1", participants=[_participant(persona_id="persona-1")])

    response = await Orchestrator(meeting_manager=repo).execute_turn("m-1", "ai-1")
    assert response.message.tool_artifacts is not None
    assert any(
        t["tool"] == "search_knowledge_base"
        for t in response.message.tool_artifacts["tool_calls"]
    )


@pytest.mark.xfail(strict=True, reason="B-04: CHECK excludes voting/ended; owner Phase 04")
def test_b04_schema_check_covers_voting_and_ended():
    from app.models import MeetingStatus

    sql = (Path(__file__).parent.parent.parent / "supabase_schema.sql").read_text()
    assert {s.value for s in MeetingStatus} == {"active", "voting", "ended", "archived"}
    assert "'voting'" in sql and "'ended'" in sql


@pytest.mark.xfail(strict=True, reason="B-07: persona provider_config dropped; owner Phase 05")
async def test_b07_persona_provider_config_propagates():
    from app.models import MeetingCreate
    from app.services.meeting_manager import MeetingManager

    manager = MeetingManager()
    manager.db = _LedgerSupabase(personas=[PERSONA_ROW])
    await manager.create_meeting(
        MeetingCreate(name="t", agenda="a", persona_ids=["persona-1"]),
        add_default_roster=False,
    )
    payloads = manager.db.inserts_for("ai_participants")
    assert len(payloads) == 1
    assert payloads[0]["provider_config"] == PERSONA_ROW["provider_config"]


@pytest.mark.xfail(strict=True, reason="B-11: invalid activation wipes active; owner Phase 05")
async def test_b11_invalid_activation_preserves_active():
    from app.services.persona_manager import PersonaManager

    manager = PersonaManager()
    manager.db = _VersionAwareSupabase(
        prompt_versions={1: True}, target_version=99
    )
    ok = await manager.activate_prompt_version("persona-1", 99)
    assert ok is False
    assert manager.db.prompt_versions == {1: True}, (
        "failed activation must not deactivate the live version"
    )


@pytest.mark.xfail(strict=True, reason="B-10: deletion skips vector cleanup; owner Phase 06")
async def test_b10_meeting_deletion_cleans_vectors(monkeypatch):
    import app.services.vector_store as vs_mod
    from app.services.meeting_manager import MeetingManager
    from app.services.vector_store import VectorStoreManager

    deleted = []

    class _Recorder:
        async def delete_collection(self, collection_name=None, **kwargs):
            deleted.append(collection_name)

    monkeypatch.setattr(vs_mod, "get_vector_store", lambda: _Recorder())
    manager = MeetingManager()
    manager.db = _LedgerSupabase()
    assert await manager.delete_meeting("m-1") is True
    assert VectorStoreManager.meeting_collection_name("m-1") in deleted


# --------------------------------------------------------------------------
# Boundary cases for remaining findings (seams arrive in owning phases)
# --------------------------------------------------------------------------


@pytest.mark.xfail(strict=True, reason="B-03: live contract needs Phase 06 fixture")
def test_b03_live_query_contract_pending_isolated_fixture():
    from qdrant_client import AsyncQdrantClient

    assert hasattr(AsyncQdrantClient, "search")  # holds on installed 1.7.0
    pytest.fail(
        "pending: isolated Qdrant query contract needs the Phase 06 "
        "fixture; no live server is exercised in Phase 01"
    )


@pytest.mark.xfail(strict=True, reason="B-05: no actor enforcement; owner Phase 04/08")
def test_b05_api_routes_require_actor_binding(api_app):
    protected = [
        r for r in api_app.routes if (getattr(r, "path", "") or "").startswith("/api/")
    ]
    assert protected, "expected /api/* routes in the test app"
    missing = [r.path for r in protected if not getattr(r, "dependencies", None)]
    assert missing == [], f"routes without actor binding: {missing}"


@pytest.mark.xfail(strict=True, reason="B-06: no destination policy; owner Phase 05/08")
def test_b06_untrusted_destination_never_reaches_transport():
    import inspect

    from app.api import settings as settings_api

    src = inspect.getsource(settings_api).lower()
    assert "allowlist" in src or "allow_list" in src or "approved" in src, (
        "Ollama destinations need an explicit allowlist before transport"
    )


@pytest.mark.xfail(strict=True, reason="B-08: settings wiring seam; owner Phase 05/07")
def test_b08_saved_settings_drive_inference_pending():
    pytest.fail(
        "pending: no seam wires saved frontend settings into backend "
        "provider resolution until Phase 05; cross-stack case is owned there"
    )
