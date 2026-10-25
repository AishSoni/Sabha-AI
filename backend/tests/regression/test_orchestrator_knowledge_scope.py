"""Regression: orchestrator knowledge-base tool must resolve collections
safely and scope them to SHARED meeting documents + the participant's OWN
assigned knowledge stacks — never other personas' or unassigned stacks.

Spec 06 update: the participant's stack scope is assembled BEFORE
inference (MeetingManager.ensure_participant_knowledge_scope — the one
permitted legacy template join); the execution path itself owns no
database client. The historical spec-01 finding (get_supabase used
without import inside the tool branch) is now pinned in its inverted
form: the orchestrator module exposes no get_supabase at all.
"""

from datetime import datetime

import pytest

from app.capabilities.inference.contracts import ToolCall
from app.modules.meetings.domain.models import AIParticipant, ProviderConfig
from app.services.meeting_manager import MeetingManager
from app.services.orchestrator import Orchestrator
from app.services.vector_store import SearchResult
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PERSONA_A = "44444444-4444-4444-8444-444444444444"
PERSONA_B = "55555555-5555-4555-8555-555555555555"
STACK_A = "77777777-7777-4777-8777-777777777771"
STACK_B = "77777777-7777-4777-8777-777777777772"
STACK_ORPHAN = "77777777-7777-4777-8777-777777777773"

SHARED_COLLECTION = f"meeting_{MEETING_ID}_shared"
STACK_A_COLLECTION = f"stack_{STACK_A}_knowledge"
STACK_B_COLLECTION = f"stack_{STACK_B}_knowledge"
STACK_ORPHAN_COLLECTION = f"stack_{STACK_ORPHAN}_knowledge"

SEARCH_CALL = ToolCall(
    id="call-kb-1", name="search_knowledge_base", arguments={"query": "stack facts"}
)


def _participant(persona_id: str | None) -> AIParticipant:
    return AIParticipant(
        id="pppppppp-pppp-4ppp-8ppp-pppppppppppp",
        meeting_id=MEETING_ID,
        name="Analyst",
        role="Analyst",
        system_prompt="You analyze.",
        provider_config=ProviderConfig(),
        persona_id=persona_id,
        created_at=datetime.now(),
    )


class RecordingVectorStore:
    """Stands in for the vector store; records which collections are queried."""

    def __init__(self, existing_collections):
        self.existing = set(existing_collections)
        self.searched = []

    async def collection_exists(self, name: str) -> bool:
        return name in self.existing

    async def search_multiple_collections(self, *, collection_names, query, limit):
        self.searched.append(list(collection_names))
        return [
            SearchResult(
                text="brief content",
                score=0.9,
                document_id="doc-1",
                chunk_index=0,
                metadata={"file_name": "brief.md"},
            )
        ]


@pytest.fixture()
def knowledge_env(disposable_db, monkeypatch):
    db = disposable_db
    with db.connect() as conn:
        for persona_id, name in (
            (PERSONA_A, "Brief Analyst"),
            (PERSONA_B, "Market Analyst"),
        ):
            conn.execute(
                "INSERT INTO personas (id, name) VALUES (%s, %s)",
                (persona_id, name),
            )
        for stack_id, stack_name in (
            (STACK_A, "Alpha stack"),
            (STACK_B, "Beta stack"),
            (STACK_ORPHAN, "Orphan stack"),
        ):
            conn.execute(
                "INSERT INTO knowledge_stacks (id, name) VALUES (%s, %s)",
                (stack_id, stack_name),
            )
        # Only persona A's stack and persona B's stack are ASSIGNED; orphan is not.
        conn.execute(
            "INSERT INTO persona_knowledge_stacks (persona_id, stack_id) VALUES (%s, %s)",
            (PERSONA_A, STACK_A),
        )
        conn.execute(
            "INSERT INTO persona_knowledge_stacks (persona_id, stack_id) VALUES (%s, %s)",
            (PERSONA_B, STACK_B),
        )

    stub = stub_for(db)
    # Spec 06: the template join lives in MeetingManager (assembly time);
    # the orchestrator module itself exposes no database accessor.
    monkeypatch.setattr(
        "app.services.meeting_manager.get_supabase", lambda: stub, raising=True
    )

    existing = {
        SHARED_COLLECTION,
        STACK_A_COLLECTION,
        STACK_B_COLLECTION,
        STACK_ORPHAN_COLLECTION,
    }
    recorder = RecordingVectorStore(existing)
    monkeypatch.setattr(
        "app.services.vector_store.get_vector_store", lambda: recorder
    )

    orchestrator = Orchestrator(MeetingManager())
    return orchestrator, recorder, db


async def test_orchestrator_keeps_no_database_client():
    """Inverted spec-01 finding, per spec 06: the execution path owns no
    database accessor — its scope is handed over at assembly time."""
    import app.services.orchestrator as orchestrator_module

    assert getattr(orchestrator_module, "get_supabase", None) is None, (
        "orchestrator must not reach the database directly (spec 06)"
    )


async def test_persona_participant_searches_shared_and_own_stacks_only(knowledge_env):
    orchestrator, recorder, db = knowledge_env

    participant = _participant(str(PERSONA_A))
    await orchestrator.meeting_manager.ensure_participant_knowledge_scope(participant)
    result = await orchestrator._handle_tool_call(
        SEARCH_CALL, MEETING_ID, participant
    )
    text, disagreement, consensus = result
    assert recorder.searched == [[SHARED_COLLECTION, STACK_A_COLLECTION]], (
        "must search the meeting's shared collection plus ONLY persona A's assigned stack"
    )
    assert "brief content" in text
    assert disagreement is None and consensus is None


async def test_participant_without_persona_searches_shared_only(knowledge_env):
    orchestrator, recorder, db = knowledge_env

    participant = _participant(None)
    await orchestrator.meeting_manager.ensure_participant_knowledge_scope(participant)
    await orchestrator._handle_tool_call(SEARCH_CALL, MEETING_ID, participant)
    assert recorder.searched == [[SHARED_COLLECTION]]


async def test_other_persona_and_unassigned_stacks_are_never_searched(knowledge_env):
    orchestrator, recorder, db = knowledge_env

    participant = _participant(str(PERSONA_A))
    await orchestrator.meeting_manager.ensure_participant_knowledge_scope(participant)
    await orchestrator._handle_tool_call(
        SEARCH_CALL, MEETING_ID, participant
    )
    flat = {c for names in recorder.searched for c in names}
    assert STACK_B_COLLECTION not in flat, "another persona's stack must not leak"
    assert STACK_ORPHAN_COLLECTION not in flat, "unassigned stack must not leak"


async def test_empty_query_short_circuits_without_searching(knowledge_env):
    orchestrator, recorder, db = knowledge_env
    empty_call = ToolCall(
        id="call-kb-2", name="search_knowledge_base", arguments={"query": ""}
    )

    participant = _participant(str(PERSONA_A))
    await orchestrator.meeting_manager.ensure_participant_knowledge_scope(participant)
    text, _, _ = await orchestrator._handle_tool_call(
        empty_call, MEETING_ID, participant
    )
    assert recorder.searched == []
    assert "query" in text.lower()
