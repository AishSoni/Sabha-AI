"""`persona_instances` fixture contract (spec-06 prerequisite): independent
participant lifecycles created from one template.

One template, two participants joined at different template revisions:
creating a participant snapshots identity, prompt text, generation settings
and stack assignments AT CREATION. Template edits afterwards change only
participants that join later, and deleting the template erases neither the
surviving participants' copied values nor their bindings to surviving stacks.

Phase-1 characterization baseline: the copy-on-create behaviors already hold
through the legacy managers; this contract stays green unchanged while the
persona catalog module and the meetings participant construction migrate,
so the extraction cannot silently change snapshot semantics.
"""

import json
from datetime import datetime, timezone

import pytest

import app.services.orchestrator as orchestrator_module
import app.services.meeting_manager as meeting_manager_module
import app.services.persona_manager as persona_manager_module
from app.llm import ToolCall
from app.models import MeetingCreate, PersonaUpdate, PromptVersionCreate
from app.services.meeting_manager import MeetingManager
from app.services.orchestrator import Orchestrator
from app.services.persona_manager import PersonaManager
from app.services.vector_store import SearchResult
from tests.doubles.supabase_stub import stub_for

TEMPLATE_ID = "00000000-0000-4000-8000-00000000a001"
STACK_A = "00000000-0000-4000-8000-00000000a0a1"
STACK_B = "00000000-0000-4000-8000-00000000a0b1"

ALPHA_PROMPT = "You are the Alpha advisor. Ground every claim in stack A."
BETA_PROMPT = "You are the Beta advisor. Ground every claim in stack B."
ALPHA_CONFIG = {
    "provider": "gemini",
    "model": "alpha-fixture-model",
    "temperature": 0.2,
    "max_tokens": 1234,
}
BETA_CONFIG = {
    "provider": "openrouter",
    "model": "beta-fixture-model",
    "temperature": 0.8,
    "max_tokens": 4321,
}


class RecordingVectorStore:
    """`knowledge_boundaries` selection spy: records which collections the
    turn actually asked to search."""

    def __init__(self, existing_collections):
        self.existing = set(existing_collections)
        self.searched = []

    async def collection_exists(self, name):
        return name in self.existing

    async def search_multiple_collections(self, *, collection_names, query, limit):
        self.searched.append(list(collection_names))
        return [
            SearchResult(
                text="stack payload",
                score=0.9,
                document_id="doc-1",
                chunk_index=0,
                metadata={"file_name": "brief.md"},
            )
        ]


@pytest.fixture()
def instance_env(disposable_db, monkeypatch):
    """A template revision A (distinctive identity, prompt, generation
    settings, stack A) with the legacy managers stubbed onto the disposable
    database."""
    db = disposable_db
    now = datetime.now(timezone.utc).isoformat()
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO knowledge_stacks (id, name)
            VALUES (%s, 'Alpha stack'), (%s, 'Beta stack')
            """,
            (STACK_A, STACK_B),
        )
        conn.execute(
            """
            INSERT INTO personas (id, name, subtitle, color, provider_config, is_default)
            VALUES (%s, 'Advisor Alpha', 'Alpha role', '#3b82f6', %s::jsonb, TRUE)
            """,
            (TEMPLATE_ID, json.dumps(ALPHA_CONFIG)),
        )
        conn.execute(
            """
            INSERT INTO prompt_versions (persona_id, version, content, is_active, created_at)
            VALUES (%s, 1, %s, TRUE, %s)
            """,
            (TEMPLATE_ID, ALPHA_PROMPT, now),
        )
        conn.execute(
            """
            INSERT INTO persona_knowledge_stacks (persona_id, stack_id)
            VALUES (%s, %s)
            """,
            (TEMPLATE_ID, STACK_A),
        )

    for module in (meeting_manager_module, orchestrator_module, persona_manager_module):
        monkeypatch.setattr(module, "get_supabase", lambda: stub_for(db), raising=True)

    return {
        "db": db,
        "meetings": MeetingManager(),
        "catalog": PersonaManager(),
    }


def _collections_for(meeting_id: str) -> dict:
    shared = f"meeting_{meeting_id}_shared"
    return {
        "shared": shared,
        "stack_a": f"stack_{STACK_A}_knowledge",
        "stack_b": f"stack_{STACK_B}_knowledge",
    }


async def test_participants_from_template_revisions_are_independent(
    instance_env, monkeypatch
):
    env = instance_env
    meeting_a = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting A", persona_ids=[TEMPLATE_ID])
    )
    alpha = meeting_a.participants[0]
    assert alpha.name == "Advisor Alpha"
    assert alpha.role == "Alpha role"
    assert alpha.stack_ids == [STACK_A]
    assert ALPHA_PROMPT in alpha.system_prompt
    assert alpha.provider_config.model == "alpha-fixture-model"
    assert alpha.provider_config.temperature == 0.2
    assert alpha.provider_config.max_tokens == 1234

    # Revision B: identity, prompt (new active version), explicit generation
    # overrides and stack assignments A -> B.
    template = await env["catalog"].update_persona(
        TEMPLATE_ID,
        PersonaUpdate(
            name="Advisor Beta",
            subtitle="Beta role",
            color="#ef4444",
            provider_config=BETA_CONFIG,
            stack_ids=[STACK_B],
        ),
    )
    await env["catalog"].create_prompt_version(
        TEMPLATE_ID, PromptVersionCreate(content=BETA_PROMPT)
    )
    assert template.stack_ids == [STACK_B]

    meeting_b = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting B", persona_ids=[TEMPLATE_ID])
    )
    beta = meeting_b.participants[0]
    assert beta.name == "Advisor Beta"
    assert beta.stack_ids == [STACK_B]
    assert beta.provider_config.model == "beta-fixture-model"
    assert beta.provider_config.temperature == 0.8
    assert beta.provider_config.max_tokens == 4321
    assert BETA_PROMPT in beta.system_prompt

    # After reload, A still carries its own copied values and bindings.
    reloaded_a = await env["meetings"].get_meeting(str(meeting_a.id))
    survivor = reloaded_a.participants[0]
    assert survivor.stack_ids == [STACK_A]
    assert survivor.provider_config.model == "alpha-fixture-model"
    assert survivor.provider_config.temperature == 0.2
    assert ALPHA_PROMPT in survivor.system_prompt
    assert survivor.name == "Advisor Alpha"


async def test_search_scope_follows_each_participants_own_bindings(
    instance_env, monkeypatch
):
    env = instance_env
    meeting_a = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting A", persona_ids=[TEMPLATE_ID])
    )
    # Revision B: template assignments replaced A -> B before B joins, so B
    # snapshots the new binding while A keeps its captured one.
    await env["catalog"].update_persona(
        TEMPLATE_ID,
        PersonaUpdate(stack_ids=[STACK_B], provider_config=BETA_CONFIG),
    )
    meeting_b = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting B", persona_ids=[TEMPLATE_ID])
    )

    names_a = _collections_for(str(meeting_a.id))
    names_b = _collections_for(str(meeting_b.id))
    vector_store = RecordingVectorStore({*names_a.values(), *names_b.values()})
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store", lambda: vector_store
    )
    orchestrator = Orchestrator(MeetingManager())
    call = ToolCall(
        id="call-instances-2",
        name="search_knowledge_base",
        arguments={"query": "position on market pricing"},
    )

    await orchestrator._handle_tool_call(
        call, str(meeting_a.id), meeting_a.participants[0]
    )
    await orchestrator._handle_tool_call(
        call, str(meeting_b.id), meeting_b.participants[0]
    )

    assert vector_store.searched[0] == [
        names_a["shared"],
        names_a["stack_a"],
    ], "A must search its own shared collection plus stack A only"
    assert vector_store.searched[1] == [
        names_b["shared"],
        names_b["stack_b"],
    ], "B must search its own shared collection plus stack B only"


async def test_template_deletion_spares_both_surviving_instances(
    instance_env, monkeypatch
):
    env = instance_env
    meeting_a = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting A", persona_ids=[TEMPLATE_ID])
    )
    await env["catalog"].update_persona(
        TEMPLATE_ID,
        PersonaUpdate(
            name="Advisor Beta",
            subtitle="Beta role",
            color="#ef4444",
            provider_config=BETA_CONFIG,
            stack_ids=[STACK_B],
        ),
    )
    await env["catalog"].create_prompt_version(
        TEMPLATE_ID, PromptVersionCreate(content=BETA_PROMPT)
    )
    meeting_b = await env["meetings"].create_meeting(
        MeetingCreate(name="Meeting B", persona_ids=[TEMPLATE_ID])
    )

    assert await env["catalog"].delete_persona(TEMPLATE_ID) is True

    reloaded_a = await env["meetings"].get_meeting(str(meeting_a.id))
    reloaded_b = await env["meetings"].get_meeting(str(meeting_b.id))
    assert reloaded_a.participants[0].stack_ids == [STACK_A]
    assert reloaded_b.participants[0].stack_ids == [STACK_B]
    assert reloaded_a.participants[0].provider_config.model == "alpha-fixture-model"
    assert reloaded_b.participants[0].provider_config.model == "beta-fixture-model"
    assert ALPHA_PROMPT in reloaded_a.participants[0].system_prompt
    assert BETA_PROMPT in reloaded_b.participants[0].system_prompt
    assert reloaded_a.participants[0].name == "Advisor Alpha"
    assert reloaded_b.participants[0].name == "Advisor Beta"

    names_a = _collections_for(str(meeting_a.id))
    names_b = _collections_for(str(meeting_b.id))
    vector_store = RecordingVectorStore({*names_a.values(), *names_b.values()})
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store", lambda: vector_store
    )
    orchestrator = Orchestrator(MeetingManager())
    call = ToolCall(
        id="call-instances-3",
        name="search_knowledge_base",
        arguments={"query": "position on market pricing"},
    )
    await orchestrator._handle_tool_call(
        call, str(meeting_a.id), reloaded_a.participants[0]
    )
    await orchestrator._handle_tool_call(
        call, str(meeting_b.id), reloaded_b.participants[0]
    )
    assert vector_store.searched[0] == [names_a["shared"], names_a["stack_a"]]
    assert vector_store.searched[1] == [names_b["shared"], names_b["stack_b"]]
