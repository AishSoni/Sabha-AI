"""Regression: participant knowledge-stack assignments must be SNAPSHOTTED at
participant creation, never resolved live from the template at turn time.

Evidence: orchestrator search_knowledge_base joined persona_knowledge_stacks
rows for participant.persona_id on every call — template edits/deletions
retroactively changed which documents meeting participants could see, and
deleting the template persona destroyed the bindings entirely. Fix:
participant.stack_ids snapshot (schema additive), created at participant
creation, with a fallback to the template join only for legacy rows that have
no snapshot. Stack CONTENTS stay live (collections resolved at turn time).
"""

import json
from datetime import datetime, timezone

import psycopg.errors
import pytest
from fastapi.testclient import TestClient

import app.services.orchestrator as orchestrator_module
import app.services.meeting_manager as meeting_manager_module
from main import app
from app.models.schemas import AIParticipant, AIParticipantCreate, MeetingCreate
from app.services.orchestrator import (
    Disagreement,
    Consensus,
    Orchestrator,
)
from app.services.meeting_manager import MeetingManager
from tests.doubles.supabase_stub import stub_for
from app.services.vector_store import SearchResult

PERSONA_ID = "66666666-6666-4666-8666-666666666666"
TEMPLATE_STACK_A = "77777777-7777-4777-8777-777777777771"
TEMPLATE_STACK_B = "77777777-7777-4777-8777-777777777772"
MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

SHARED_COLLECTION = f"meeting_{MEETING_ID}_shared"
STACK_A_COLLECTION = f"stack_{TEMPLATE_STACK_A}_knowledge"
STACK_B_COLLECTION = f"stack_{TEMPLATE_STACK_B}_knowledge"


class RecordingVectorStore:
    """Records which collections the orchestrator asks to search."""

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
def template_env(disposable_db, monkeypatch):
    """Persona template with a live stack assignment, stubbed at both
    orchestrator and meeting_manager seams."""
    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO meetings (id, name) VALUES (%s, 'Route Probe')
            """,
            (MEETING_ID,),
        )
        conn.execute(
            """
            INSERT INTO personas (id, name, subtitle, is_default, user_id)
            VALUES (%s, 'Advisor', 'Guids the meeting', TRUE, 'owner-1')
            """,
            (PERSONA_ID,),
        )
        conn.execute(
            """
            INSERT INTO knowledge_stacks (id, name)
            VALUES (%s, 'Market data'), (%s, 'Customer research')
            """,
            (TEMPLATE_STACK_A, TEMPLATE_STACK_B),
        )
        conn.execute(
            """
            INSERT INTO persona_knowledge_stacks (persona_id, stack_id)
            VALUES (%s, %s)
            """,
            (PERSONA_ID, TEMPLATE_STACK_A),
        )
    meeting_stub = stub_for(disposable_db)
    monkeypatch.setattr(
        meeting_manager_module, "get_supabase", lambda: meeting_stub, raising=True
    )
    # Spec 06: the orchestrator no longer reaches the database directly —
    # the legacy template join moved behind MeetingManager (assembly-time).
    return {"db": disposable_db, "manager": MeetingManager()}


def _search_knowledge_base_recorded(monkeypatch, template_env, meeting_id, participant):
    """Drive the knowledge-base branch through _handle_tool_call with the
    orchestrator's vector store seam replaced by a recording store."""
    from app.capabilities.inference.contracts import ToolCall

    vector_store = RecordingVectorStore(
        {SHARED_COLLECTION, STACK_A_COLLECTION, STACK_B_COLLECTION}
    )
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store",
        lambda: vector_store,
        raising=True,
    )
    orchestrator = Orchestrator(template_env["manager"])
    call = ToolCall(
        id="call-snapshot-1",
        name="search_knowledge_base",
        arguments={"query": "position on market pricing"},
    )

    async def invoke():
        return await orchestrator._handle_tool_call(call, meeting_id, participant)

    return invoke, vector_store


async def test_template_deletion_preserves_participant_bindings(template_env, monkeypatch):
    """After participant creation, editing or deleting the template's stack
    assignments must not change what the participant can search."""
    env = template_env
    meeting = await env["manager"].create_meeting(
        MeetingCreate(name="Snapshot Probe", persona_ids=[PERSONA_ID])
    )
    participant = meeting.participants[0]

    # Simulate a template being dismantled AFTER the meeting was created.
    with env["db"].connect() as conn:
        conn.execute(
            "DELETE FROM persona_knowledge_stacks WHERE persona_id = %s",
            (PERSONA_ID,),
        )
        conn.execute("DELETE FROM personas WHERE id = %s", (PERSONA_ID,))

    invoke, vector_store = _search_knowledge_base_recorded(
        monkeypatch, env, MEETING_ID, participant
    )
    await invoke()

    searched_once = vector_store.searched[0]
    assert searched_once == [SHARED_COLLECTION, STACK_A_COLLECTION], (
        "participant must keep the bindings captured at creation, "
        f"searched {searched_once}"
    )


async def test_participant_snapshot_persisted_at_creation(template_env):
    env = template_env
    meeting = await env["manager"].create_meeting(
        MeetingCreate(name="Persistence Probe", persona_ids=[PERSONA_ID])
    )
    participant = meeting.participants[0]
    assert participant.stack_ids == [TEMPLATE_STACK_A]

    rows = env["db"].query(
        "SELECT stack_ids FROM ai_participants WHERE id = %s",
        (str(participant.id),),
    )
    assert list(rows[0][0]) == [TEMPLATE_STACK_A]


async def test_legacy_row_without_snapshot_falls_back_to_template(template_env, monkeypatch):
    """Rows created before the snapshot existed must keep working via the
    template join — fallback only, clearly bounded."""
    env = template_env
    legacy_participant = AIParticipant(
        id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        meeting_id=MEETING_ID,
        name="Advisor",
        role="Guids the meeting",
        system_prompt="Fully supports the current agenda.",
        persona_id=PERSONA_ID,
        stack_ids=None,
        created_at=datetime.now(timezone.utc),
    )

    vector_store = RecordingVectorStore({STACK_B_COLLECTION})
    with env["db"].connect() as conn:
        conn.execute(
            """
            INSERT INTO persona_knowledge_stacks (persona_id, stack_id)
            VALUES (%s, %s)
            """,
            (PERSONA_ID, TEMPLATE_STACK_B),
        )
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store",
        lambda: vector_store,
        raising=True,
    )
    orchestrator = Orchestrator(template_env["manager"])
    # Spec 06: legacy rows (stack_ids NULL) resolve through ONE assembly-time
    # template join before inference starts; the tool execution path itself
    # never reads template tables.
    await template_env["manager"].ensure_participant_knowledge_scope(legacy_participant)
    from app.capabilities.inference.contracts import ToolCall

    call = ToolCall(
        id="call-fallback-1",
        name="search_knowledge_base",
        arguments={"query": "position on market pricing"},
    )
    await orchestrator._handle_tool_call(call, MEETING_ID, legacy_participant)
    assert vector_store.searched[0] == [STACK_B_COLLECTION], (
        "legacy rows (stack_ids NULL) fall back to the template join"
    )


async def test_default_roster_participant_searches_only_shared(template_env, monkeypatch):
    """Participants created without personas must not leak any stack scope."""
    meeting = await template_env["manager"].create_meeting(
        MeetingCreate(name="Default Roster Probe")
    )
    participant = meeting.participants[0]
    assert participant.stack_ids == []

    vector_store = RecordingVectorStore({SHARED_COLLECTION})
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store",
        lambda: vector_store,
        raising=True,
    )
    orchestrator = Orchestrator(template_env["manager"])
    from app.capabilities.inference.contracts import ToolCall

    call = ToolCall(
        id="call-shared-1",
        name="search_knowledge_base",
        arguments={"query": "position on market pricing"},
    )
    await orchestrator._handle_tool_call(call, MEETING_ID, participant)
    assert vector_store.searched[0] == [SHARED_COLLECTION]


def test_add_participant_snapshots_template_assignments(template_env):
    """Single-participant creation path (participants API) also snapshots."""
    client = TestClient(app)
    response = client.post(
        "/api/participants",
        json={
            "meeting_id": MEETING_ID,
            "name": "Advisor",
            "role": "Guids the meeting",
            "system_prompt": "Guides the meeting with today's agenda.",
            "persona_id": PERSONA_ID,
        },
    )
    assert response.status_code == 200, response.text
    participant = response.json()
    assert participant["stack_ids"] == [TEMPLATE_STACK_A]
