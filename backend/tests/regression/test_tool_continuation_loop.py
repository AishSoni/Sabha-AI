"""Regression: an AI turn that requests tools must continue reasoning after
the tool results are known (spec finding: no follow-up inference), within a
bounded number of model round-trips, with aggregated token usage, controlled
tool failures, and exactly ONE application-level terminal event emitted after
persistence.

Evidence: orchestrator.execute_turn / execute_turn_streaming performed a
single provider call; tool results never re-entered the conversation.
"""

import json
from datetime import datetime, timezone

import pytest

import app.services.orchestrator as orchestrator_module
import app.services.meeting_manager as meeting_manager_module
import app.services.vector_store as vector_store_module
import app.platform.providers as llm_module
from app.bootstrap import Container
from app.capabilities.inference.contracts import LLMResponse, StreamEvent, StreamEventType, ToolCall
from app.services.meeting_manager import MeetingManager
from app.services.orchestrator import Orchestrator
from app.services.turn_queue import TurnQueueService
from app.services.vector_store import SearchResult
from main import app  # noqa: F401  (ensures app import works before stubs)
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PARTICIPANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
SHARED_COLLECTION = f"meeting_{MEETING_ID}_shared"


class RecordingVectorStore:
    def __init__(self):
        self.searched = []

    async def collection_exists(self, name):
        return name == SHARED_COLLECTION

    async def search_multiple_collections(self, *, collection_names, query, limit):
        self.searched.append((tuple(collection_names), query, limit))
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
def turn_env(disposable_db, monkeypatch):
    db = disposable_db
    stub = stub_for(db)
    now = datetime.now(timezone.utc).isoformat()

    with db.connect() as conn:
        conn_ = conn
        import psycopg

        conn_.execute(
            """
            INSERT INTO meetings (id, name, agenda, status, created_at)
            VALUES (%s, 'Policy Council', 'Discuss the roadmap', 'active', now())
            """,
            (MEETING_ID,),
        )
        conn_.execute(
            """
            INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt,
                                         provider_config, color, stack_ids, created_at)
            VALUES (%s, %s, 'The Analyst', 'Data-focused board member',
                    'You ground every claim in the documents.',
                    %s::jsonb, '#3b82f6', '[]'::jsonb, now())
            """,
            (
                PARTICIPANT_ID,
                MEETING_ID,
                json.dumps({"provider": "", "model": "", "temperature": 0.2, "max_tokens": 1234}),
            ),
        )

    vector_store = RecordingVectorStore()
    monkeypatch.setattr(meeting_manager_module, "get_supabase", lambda: stub)
    # Spec 06: the orchestrator no longer reaches the database directly —
    # template joins moved behind MeetingManager (assembly-time).
    monkeypatch.setattr(vector_store_module, "get_vector_store", lambda: vector_store)

    provider_box = {}

    def _install_provider(responses=(), scripts=()):
        provider = ScriptedProvider(responses=responses)
        provider.scripts = list(scripts)
        provider_box["provider"] = provider
        monkeypatch.setattr(
            orchestrator_module, "get_provider", lambda *a, **kw: provider
        )
        # execute_turn_streaming re-imports get_provider inside the method
        # body, so patch the source module too.
        monkeypatch.setattr(
            llm_module, "get_provider", lambda *a, **kw: provider
        )
        return provider

    queue_service = TurnQueueService(
        MeetingManager(),
        provider_factory=lambda **kwargs: orchestrator_module.get_provider(**kwargs),
        vector_store_factory=lambda: vector_store,
    )
    previous_container = app.state.container
    app.state.container = Container(
        prompt_catalog=previous_container.prompt_catalog,
        turn_queue=queue_service,
        turn_runner=None,
    )
    fixtures = {
        "db": db,
        "stub": stub,
        "vector_store": vector_store,
        "install_provider": _install_provider,
        "orchestrator": Orchestrator(MeetingManager()),
        "queue": queue_service,
    }

    try:
        yield fixtures
    finally:
        app.state.container = previous_container


def _tool_call_round(tool_id="call-1", name="search_knowledge_base", query="market pricing"):
    return LLMResponse(
        content=None,
        tool_calls=[ToolCall(id=tool_id, name=name, arguments={"query": query})],
        usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    )


def _messages_of(provider, call_index):
    return provider.calls[call_index]["messages"]


def _find_tool_message(messages, tool_call_id):
    for message in messages:
        if message.role == "tool" and message.tool_call_id == tool_call_id:
            return message
    raise AssertionError(f"no role='tool' message with tool_call_id={tool_call_id}")


def _find_assistant_with_tool_calls(messages, tool_call_id):
    for message in messages:
        if message.role == "assistant" and message.tool_calls:
            for call in message.tool_calls:
                if call.id == tool_call_id:
                    return message
    raise AssertionError(f"no assistant message carries tool call {tool_call_id}")


async def test_execute_turn_feeds_tool_results_back_and_returns_final_answer(turn_env):
    provider = turn_env["install_provider"](
        responses=[
            _tool_call_round(),
            LLMResponse(
                content="Grounded answer: market pricing relies on brief content",
                usage={"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
            ),
        ]
    )

    response = await turn_env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    # The provider must be consulted a second time after the tool results.
    assert len(provider.calls) == 2

    follow_up = _messages_of(provider, 1)
    assistant = _find_assistant_with_tool_calls(follow_up, "call-1")
    assert assistant.tool_calls[0].name == "search_knowledge_base"
    tool_message = _find_tool_message(follow_up, "call-1")
    assert "relevant passages" in tool_message.content
    assert "brief content" in tool_message.content

    # The final answer (not a "[used tools]" placeholder) becomes the message.
    assert response.message.content == (
        "Grounded answer: market pricing relies on brief content"
    )


async def test_execute_turn_aggregates_usage_across_rounds(turn_env):
    import json as json_module

    provider = turn_env["install_provider"](
        responses=[
            _tool_call_round(),
            LLMResponse(
                content="Second round answer.",
                usage={"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
            ),
        ]
    )
    provider.estimate_cost = lambda usage: float(usage.get("total_tokens", 0))

    response = await turn_env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    # 15 (round 1) + 30 (round 2) = 45 total tokens reach cost estimation.
    assert response.message.estimated_cost == 45.0

    rows = turn_env["db"].query(
        "SELECT tool_artifacts FROM messages WHERE meeting_id = %s", (MEETING_ID,)
    )
    assert rows, "message must be persisted"
    artifacts = rows[0][0]["tool_calls"]
    assert artifacts[0]["tool"] == "search_knowledge_base"
    assert "brief content" in artifacts[0]["result"]


async def test_execute_turn_bounds_tool_roundtrips(turn_env):
    # Six consecutive tool-call rounds; the loop must stop at the bound
    # instead of looping forever, and still persist a message.
    provider = turn_env["install_provider"](
        responses=[_tool_call_round(tool_id=f"call-{i}") for i in range(1, 7)]
    )

    response = await turn_env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    assert len(provider.calls) == 5  # MAX_TOOL_ROUNDS

    tool_messages = [
        m for m in provider.calls[-1]["messages"] if m.role == "tool"
    ]
    # With a five-round bound the final call has seen the results of the four
    # rounds that executed before it; the fifth round's result arrives after.
    assert len(tool_messages) == 4

    assert response.message.content.startswith("[The Analyst used tools:")


async def test_execute_turn_tool_failure_is_controlled_not_fatal(turn_env):
    # Missing required arguments make the tool raise inside the handler; the
    # loop must convert that into an error result for the model instead of
    # crashing the turn.
    provider = turn_env["install_provider"](
        responses=[
            LLMResponse(
                content=None,
                tool_calls=[ToolCall(id="call-bad", name="log_disagreement", arguments={})],
                usage={"prompt_tokens": 8, "completion_tokens": 4, "total_tokens": 12},
            ),
            LLMResponse(content="Recovered without logging the disagreement."),
        ]
    )

    response = await turn_env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    assert len(provider.calls) == 2
    error_result = _find_tool_message(provider.calls[1]["messages"], "call-bad")
    assert "failed" in error_result.content.lower()
    assert response.message.content == "Recovered without logging the disagreement."


async def test_streaming_round_trips_tool_results_before_final_answer(turn_env):
    first_script = [
        StreamEvent(
            type=StreamEventType.TOOL_CALL,
            tool_name="search_knowledge_base",
            tool_arguments={"query": "market pricing"},
        ),
        StreamEvent(type=StreamEventType.DONE, usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}),
    ]
    second_script = [
        StreamEvent(type=StreamEventType.TEXT, content="Grounded final answer"),
        StreamEvent(type=StreamEventType.DONE, usage={"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}),
    ]
    provider = turn_env["install_provider"]()
    provider.scripts = [first_script, second_script]
    provider.estimate_cost = lambda usage: float(usage.get("total_tokens", 0))

    events = []
    async for event in turn_env["orchestrator"].execute_turn_streaming(
        MEETING_ID, PARTICIPANT_ID
    ):
        events.append(event)

    # The provider streams twice: the second round sees the tool results.
    assert len(provider.calls) == 2
    second_call_messages = provider.calls[1]["messages"]
    assert any(
        m.role == "tool" and "brief content" in (m.content or "")
        for m in second_call_messages
    )

    # Exactly one application-level terminal event, emitted after persistence,
    # carrying the merged usage and the saved message id.
    done_events = [e for e in events if e.type == StreamEventType.DONE]
    assert len(done_events) == 1
    final_done = done_events[0]
    assert final_done.usage == {"prompt_tokens": 30, "completion_tokens": 15, "total_tokens": 45}
    assert final_done.message_id

    message_rows = turn_env["db"].query(
        "SELECT content, id FROM messages WHERE meeting_id = %s ORDER BY created_at",
        (MEETING_ID,),
    )
    assert message_rows[-1][0] == "Grounded final answer"
    assert str(message_rows[-1][1]) == final_done.message_id
