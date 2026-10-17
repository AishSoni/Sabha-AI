"""Stage A (A1/A3 + journal segmentation): shared busy detection, fail-closed
lease wiring, citations persisted on final messages, and segment-identified
interim/final text deltas."""

from datetime import datetime, timezone

import pytest

from app.llm.base import LLMResponse, ToolCall
from tests.doubles.providers import ScriptedProvider

pytestmark = pytest.mark.anyio


async def test_has_active_work_consults_shared_turn_store():
    from app.modules.meetings.store import get_shared_turn_store, reset_shared_turn_store
    from app.services.meeting_manager import MeetingManager

    reset_shared_turn_store()
    manager = MeetingManager()  # dummy Supabase client; must not be needed here
    store = get_shared_turn_store()
    record = await store.reserve("m-active-busy", "p1", "k-active-busy")
    try:
        assert await manager.has_active_work("m-active-busy") is True
    finally:
        await store.finalize(record.turn_id, "cancelled", None, {}, 0.0, "test-teardown")


async def test_has_active_work_false_without_turn():
    from app.modules.meetings.store import get_shared_turn_store, reset_shared_turn_store
    from app.services.meeting_manager import MeetingManager

    reset_shared_turn_store()
    get_shared_turn_store()  # ensure singleton exists with no records
    manager = MeetingManager()
    assert await manager.has_active_work("m-no-turn-here") is False


def test_orchestrator_fails_closed_when_lease_coordinator_unavailable(monkeypatch):
    import app.modules.meetings.leases as leases_mod
    from app.services.orchestrator import Orchestrator

    def _boom(*args, **kwargs):
        raise OSError("lease store unavailable")

    monkeypatch.setattr(leases_mod, "DurableCoordinator", _boom)
    with pytest.raises(RuntimeError, match="lease"):
        Orchestrator(meeting_manager=FakeMeetingRepoForLeases())


def FakeMeetingRepoForLeases():
    from tests.doubles.repositories import FakeMeetingRepo

    return FakeMeetingRepo()


async def test_final_message_persists_citations_and_segments_journal():
    from app.models import AIParticipant, MeetingWithParticipants, Message
    from app.modules.meetings.engine import TurnEngine
    from app.modules.meetings.ports import CitationItem, KnowledgeResult
    from app.modules.meetings.store import InMemoryTurnStore

    class _Knowledge:
        async def search(self, query, meeting_id, persona_id):
            return KnowledgeResult(
                items=[{"text": "bond passage", "score": 0.91,
                        "document_id": "doc-1",
                        "metadata": {"file_name": "bond.pdf"}}],
                citations=[CitationItem(source="doc-1", title="Bond", snippet="bond passage")],
            )

    class _Loader:
        def __init__(self, meeting):
            self.meeting = meeting
            self.saved = None

        async def get_meeting(self, meeting_id):
            return self.meeting

        async def save_message(self, data):
            self.saved = data
            return Message(
                id="msg-final", meeting_id=data.meeting_id, content=data.content,
                sender_type=data.sender_type, sender_id=data.sender_id,
                sender_name=data.sender_name, created_at=datetime.now(timezone.utc),
                citations=data.citations, tool_artifacts=data.tool_artifacts,
                estimated_cost=data.estimated_cost,
            )

    now = datetime.now(timezone.utc)
    participant = AIParticipant(
        id="p1", meeting_id="m-cite", name="AI One", role="analyst",
        system_prompt="Cite sources.", created_at=now,
    )
    meeting = MeetingWithParticipants(
        id="m-cite", name="T", agenda="", participants=[participant],
        messages=[], total_cost=0.0, created_at=now,
    )
    loader = _Loader(meeting)
    provider = ScriptedProvider([
        LLMResponse(
            content="checking the covenant",
            tool_calls=[ToolCall(id="c1", name="search_knowledge_base",
                                 arguments={"query": "covenant"})],
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        ),
        LLMResponse(content="final answer",
                    usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}),
    ])
    store = InMemoryTurnStore()
    engine = TurnEngine(
        meeting_loader=loader,
        provider_resolver=lambda *_: provider,
        knowledge_search=_Knowledge(),
        turn_store=store,
    )

    result = await engine.run("m-cite", "p1")
    assert result.state == "completed"

    # A3: citations reach the persisted message, not just the journal.
    assert loader.saved is not None
    assert loader.saved.citations, "final message must persist citations"
    assert loader.saved.citations[0].source == "doc-1"

    # A2: interim and final text carry distinct segment ids; the final answer
    # streams as chunked segments (`:final:<idx>`) joined = full final text.
    events = await store.list_events(result.turn_id, 0)
    deltas = [e for e in events if e["type"] == "text_delta"]
    interim = [d for d in deltas if d["data"].get("segment_id") == f"{result.turn_id}:0"]
    final = [d for d in deltas
             if str(d["data"].get("segment_id", "")).startswith(f"{result.turn_id}:final:")]
    assert interim and interim[0]["data"]["content"] == "checking the covenant"
    assert final and "".join(d["data"]["content"] for d in final) == "final answer"
    terminal = [e for e in events if e["type"] == "turn_completed"]
    assert len(terminal) == 1
    assert events.index(final[0]) < events.index(terminal[0])
