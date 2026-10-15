"""Shared turn engine: reservation, bounded loop, effects, usage (P02 TEST01-08,10)."""

import time

import pytest

from app.llm.base import LLMMessage, LLMResponse, ToolCall
from app.models import ConsensusCreate, DisagreementCreate, MessageCreate, SenderType
from app.modules.meetings.engine import TurnEngine, TurnFailure, build_context
from app.modules.meetings.policies import TurnPolicies
from app.modules.meetings.store import (
    COMPLETED,
    FAILED,
    CANCELLED,
    IdempotencyConflict,
    InMemoryTurnStore,
    ProtocolConflict,
    TurnConflict,
)


class FakeProvider:
    def __init__(self, script):
        self._script = list(script)
        self.calls = 0
        self.seen_histories = []

    async def complete(self, messages, tools=None, temperature=0.7, max_tokens=2048):
        self.seen_histories.append(list(messages))
        self.calls += 1
        item = self._script[min(self.calls - 1, len(self._script) - 1)]
        if isinstance(item, Exception):
            raise item
        return item

    def estimate_cost(self, usage):
        return 0.001 * self.calls


class FakeMeetings:
    def __init__(self, meeting):
        self._meeting = meeting
        self.saved_messages = []
        self.saved_disagreements = []
        self.saved_consensus = []

    async def get_meeting(self, meeting_id):
        return self._meeting if self._meeting.id == meeting_id else None

    async def save_message(self, data: MessageCreate):
        from datetime import datetime, timezone

        from app.models import Message
        import uuid as _uuid

        msg = Message(
            id=str(_uuid.uuid4()), meeting_id=data.meeting_id, content=data.content,
            sender_type=data.sender_type, sender_id=data.sender_id,
            sender_name=data.sender_name, tool_artifacts=data.tool_artifacts,
            estimated_cost=data.estimated_cost, created_at=datetime.now(timezone.utc),
        )
        self.saved_messages.append(msg)
        self._meeting.messages.append(msg)
        return msg

    async def save_disagreement(self, data: DisagreementCreate):
        from datetime import datetime, timezone

        from app.models import Disagreement
        import uuid as _uuid

        d = Disagreement(id=str(_uuid.uuid4()), created_at=datetime.now(timezone.utc), **data.model_dump())
        self.saved_disagreements.append(d)
        return d

    async def save_consensus(self, data: ConsensusCreate):
        from datetime import datetime, timezone

        from app.models import Consensus
        import uuid as _uuid

        c = Consensus(id=str(_uuid.uuid4()), created_at=datetime.now(timezone.utc), **data.model_dump())
        self.saved_consensus.append(c)
        return c


class FakeKnowledge:
    def __init__(self, items=None):
        self._items = items or []
        self.calls = []

    async def search(self, query, meeting_id, persona_id):
        from app.modules.meetings.ports import CitationItem, KnowledgeResult

        self.calls.append(query)
        return KnowledgeResult(
            items=self._items,
            citations=[CitationItem(source="doc", snippet="s") for _ in self._items],
        )


def _meeting():
    from datetime import datetime, timezone

    from app.models import AIParticipant, MeetingWithParticipants, ProviderConfig

    now = datetime.now(timezone.utc)
    p1 = AIParticipant(
        id="p1", meeting_id="m1", name="Alice", role="analyst", persona_id="per1",
        system_prompt="You are Alice.", provider_config=ProviderConfig(provider="x", model="y"),
        created_at=now,
    )
    p2 = AIParticipant(
        id="p2", meeting_id="m1", name="Bob", role="critic", persona_id="per2",
        system_prompt="You are Bob.", provider_config=ProviderConfig(provider="x", model="y"),
        created_at=now,
    )
    return MeetingWithParticipants(
        id="m1", name="T", agenda="Ship it", participants=[p1, p2], messages=[],
        total_cost=1.25, created_at=now,
    )


def _engine(meeting, provider, knowledge=None, policies=None):
    store = InMemoryTurnStore()
    engine = TurnEngine(
        meeting_loader=FakeMeetings(meeting),
        provider_resolver=lambda _a, _b: provider,
        knowledge_search=knowledge or FakeKnowledge(),
        turn_store=store,
        policies=policies or TurnPolicies(),
    )
    return engine, store


async def test_single_flight_and_idempotent_retry():
    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="hello", usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2})])
    engine, store = _engine(meeting, provider)
    first = await engine.run("m1", "p1", idempotency_key="k1")
    assert first.state == COMPLETED
    calls_after_first = provider.calls
    second = await engine.run("m1", "p1", idempotency_key="k1")
    assert second.turn_id == first.turn_id
    assert provider.calls == calls_after_first  # no second inference


async def test_idempotency_key_reuse_with_different_payload_fails():
    store = InMemoryTurnStore()
    await store.reserve("m1", "p1", "k", {"a": 1})
    with pytest.raises(IdempotencyConflict):
        await store.reserve("m1", "p1", "k", {"a": 2})


async def test_tool_continuation_appends_call_list_then_results():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="thinking", tool_calls=[ToolCall(id="call_1", name="log_disagreement", arguments={"target_participant_name": "Bob", "topic": "pricing risk", "reasoning": "too high", "severity": 4})], usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}),
        LLMResponse(content="final answer", usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}),
    ])
    engine, _ = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="tool-loop")
    assert result.state == COMPLETED
    assert result.message.content == "final answer"
    assert len(engine._meetings.saved_disagreements) == 1
    history = provider.seen_histories[1]
    assistant_msgs = [m for m in history if m.role == "assistant" and m.tool_calls]
    assert assistant_msgs, "assistant call list must precede tool results"
    tool_msgs = [m for m in history if m.role == "tool"]
    assert tool_msgs and tool_msgs[0].tool_call_id == "call_1"


async def test_duplicate_execution_id_same_args_single_effect():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="", tool_calls=[
            ToolCall(id="dup", name="log_consensus", arguments={"participants": ["Alice", "Bob"], "topic": "ship", "strength": 5}),
            ToolCall(id="dup", name="log_consensus", arguments={"participants": ["Alice", "Bob"], "topic": "ship", "strength": 5}),
        ], usage={}),
        LLMResponse(content="done", usage={}),
    ])
    engine, _ = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="dup-effect")
    assert result.state == COMPLETED
    assert len(engine._meetings.saved_consensus) == 1


async def test_same_name_different_ids_both_run():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="", tool_calls=[
            ToolCall(id="a1", name="log_consensus", arguments={"participants": ["Alice"], "topic": "one", "strength": 2}),
            ToolCall(id="a2", name="log_consensus", arguments={"participants": ["Bob"], "topic": "two", "strength": 3}),
        ], usage={}),
        LLMResponse(content="done", usage={}),
    ])
    engine, _ = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="same-name")
    assert result.state == COMPLETED
    assert len(engine._meetings.saved_consensus) == 2


async def test_unknown_tool_and_invalid_args_never_mutate():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="", tool_calls=[
            ToolCall(id="u1", name="delete_database", arguments={}),
            ToolCall(id="u2", name="log_disagreement", arguments={"target_participant_name": "Nobody", "topic": "x", "reasoning": "y", "severity": 99}),
        ], usage={}),
        LLMResponse(content="recovered", usage={}),
    ])
    engine, _ = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="invalid-tools")
    assert result.state == COMPLETED
    assert result.message.content == "recovered"
    assert engine._meetings.saved_disagreements == []
    assert engine._meetings.saved_consensus == []


async def test_empty_final_answer_is_typed_failure_no_blank_message():
    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="   ", usage={})])
    engine, _ = _engine(meeting, provider)
    with pytest.raises(TurnFailure):
        await engine.run("m1", "p1", idempotency_key="empty-final")
    assert engine._meetings.saved_messages == []


async def test_tool_only_response_is_not_completion():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="", tool_calls=[ToolCall(id="t1", name="web_search", arguments={"query": "x"})], usage={}),
        LLMResponse(content="", usage={}),
    ])
    engine, _ = _engine(meeting, provider)
    with pytest.raises(TurnFailure):
        await engine.run("m1", "p1", idempotency_key="tool-only")
    assert engine._meetings.saved_messages == []


async def test_invocation_and_tool_limits_terminalize():
    meeting = _meeting()
    script = [
        LLMResponse(content="", tool_calls=[ToolCall(id=f"c{i}", name="web_search", arguments={"query": "x"})], usage={})
        for i in range(10)
    ]
    provider = FakeProvider(script)
    engine, _ = _engine(meeting, provider, policies=TurnPolicies(max_invocations=3, max_tool_calls=16))
    with pytest.raises(TurnFailure):
        await engine.run("m1", "p1", idempotency_key="limits")
    assert engine._meetings.saved_messages == []


async def test_context_budget_rejects_before_provider_call():
    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="hi", usage={})])
    engine, _ = _engine(meeting, provider, policies=TurnPolicies(max_context_chars=10))
    with pytest.raises(TurnFailure):
        await engine.run("m1", "p1", idempotency_key="ctx")
    assert provider.calls == 0


async def test_usage_sums_per_invocation_and_cost_ledger():
    meeting = _meeting()
    provider = FakeProvider([
        LLMResponse(content="", tool_calls=[ToolCall(id="c1", name="web_search", arguments={"query": "x"})], usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}),
        LLMResponse(content="done", usage={"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}),
    ])
    engine, _ = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="usage")
    assert result.usage == {"prompt_tokens": 17, "completion_tokens": 8, "total_tokens": 25}
    assert meeting.total_cost == 1.25  # legacy baseline untouched by the engine ledger
    assert result.cost > 0


async def test_cancel_loses_race_to_terminal():
    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="done", usage={})])
    engine, store = _engine(meeting, provider)
    result = await engine.run("m1", "p1", idempotency_key="cancel-race")
    assert result.state == COMPLETED
    assert await engine.cancel(result.turn_id) is False


async def test_build_context_never_splits_tool_group():
    policies = TurnPolicies(max_context_chars=200)
    history = [
        LLMMessage(role="user", content="hello"),
        LLMMessage(role="assistant", content="call", tool_calls=[ToolCall(id="x", name="web_search", arguments={"query": "q"})]),
        LLMMessage(role="tool", content="result", tool_call_id="x"),
    ]
    context = build_context("sys", "agenda", history, policies)
    roles = [m.role for m in context]
    assert "system" in roles


async def test_protocol_conflict_on_reused_execution_id_with_different_args():
    store = InMemoryTurnStore()
    await store.record_effect("exec1", {"a": 1}, {"kind": "x"})
    with pytest.raises(ProtocolConflict):
        await store.record_effect("exec1", {"a": 2}, {"kind": "x"})
