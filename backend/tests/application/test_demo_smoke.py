"""Synthetic smoke run through the shared turn engine (developer-only)."""

import pytest

from app.llm.base import LLMResponse, ToolCall
from app.modules.meetings.engine import TurnEngine
from app.modules.meetings.policies import TurnPolicies
from app.modules.meetings.store import COMPLETED, InMemoryTurnStore
from app.infrastructure.demo.composition import (
    build_fixture_composition,
    synthetic_manifest,
)
from tests.doubles.providers import (
    ScriptedProvider,
    final_text_response,
    tool_call_response,
)

pytestmark = pytest.mark.anyio


def _meeting():
    from datetime import datetime, timezone

    from app.models import AIParticipant, MeetingWithParticipants, ProviderConfig

    now = datetime.now(timezone.utc)
    participant = AIParticipant(
        id="synthetic-p1",
        meeting_id="synthetic-m1",
        name="Synthetic Analyst",
        role="analyst",
        persona_id=None,
        system_prompt="You are a synthetic test analyst.",
        provider_config=ProviderConfig(provider="fixture", model="synthetic"),
        created_at=now,
    )
    return MeetingWithParticipants(
        id="synthetic-m1",
        name="Synthetic smoke",
        agenda="Exercise fixture retrieval plumbing",
        participants=[participant],
        messages=[],
        total_cost=0.0,
        created_at=now,
    )


class _MeetingLoader:
    def __init__(self, meeting):
        self._meeting = meeting
        self.saved = []

    async def get_meeting(self, meeting_id):
        return self._meeting if self._meeting.id == meeting_id else None

    async def save_message(self, data):
        from datetime import datetime, timezone
        import uuid as _uuid

        from app.models import Message

        msg = Message(
            id=str(_uuid.uuid4()),
            meeting_id=data.meeting_id,
            content=data.content,
            sender_type=data.sender_type,
            sender_id=data.sender_id,
            sender_name=data.sender_name,
            tool_artifacts=data.tool_artifacts,
            estimated_cost=data.estimated_cost,
            created_at=datetime.now(timezone.utc),
        )
        self.saved.append(msg)
        self._meeting.messages.append(msg)
        return msg

    async def save_disagreement(self, data):
        raise AssertionError("smoke path must not log disagreements")

    async def save_consensus(self, data):
        raise AssertionError("smoke path must not log consensus")


async def test_synthetic_search_returns_through_shared_engine():
    composition = build_fixture_composition(
        manifest=synthetic_manifest(),
        provider=ScriptedProvider(
            [
                tool_call_response(
                    "synthetic-call-1",
                    "search_knowledge_base",
                    {"query": "synthetic fixture retrieval"},
                ),
                final_text_response("synthetic final summary"),
            ]
        ),
    )
    meeting = _meeting()
    loader = _MeetingLoader(meeting)
    store = InMemoryTurnStore()
    engine = TurnEngine(
        meeting_loader=loader,
        provider_resolver=composition.provider_resolver,
        knowledge_search=composition.knowledge_search,
        turn_store=store,
        policies=TurnPolicies(),
    )

    result = await engine.run("synthetic-m1", "synthetic-p1", idempotency_key="smoke-1")

    assert result.state == COMPLETED
    assert result.message.content == "synthetic final summary"
    # Exactly one persisted test result through the single shared engine.
    assert len(loader.saved) == 1
    artifacts = result.message.tool_artifacts["tool_calls"]
    assert len(artifacts) == 1
    assert artifacts[0]["provider_call_id"] == "synthetic-call-1"
    assert artifacts[0]["tool"] == "search_knowledge_base"
    # Two provider invocations: tool call then continuation with the result.
    provider = composition.provider_resolver("fixture", None)
    assert len(provider.calls) == 2
    followup = provider.calls[1]["messages"]
    tool_msgs = [m for m in followup if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    assert tool_msgs[0]["tool_call_id"] == "synthetic-call-1"
    assert "synthetic fixture passage" in tool_msgs[0]["content"]
    # No journey progression: no second meeting, no new scenario state.
    assert meeting.id == "synthetic-m1"
    events = await store.list_events(result.turn_id, 0)
    assert any(e["type"] == "turn_completed" for e in events)
    assert "SYNTHETIC" in composition.manifest.instrument_ref


async def test_tool_only_synthetic_response_never_completes():
    composition = build_fixture_composition(
        manifest=synthetic_manifest(),
        provider=ScriptedProvider(
            [
                LLMResponse(
                    content=None,
                    tool_calls=[
                        ToolCall(
                            id="t1",
                            name="search_knowledge_base",
                            arguments={"query": "x"},
                        )
                    ],
                    finish_reason="tool_calls",
                    usage={},
                ),
                LLMResponse(
                    content="",
                    tool_calls=[],
                    finish_reason="stop",
                    usage={},
                ),
            ]
        ),
    )
    meeting = _meeting()
    engine = TurnEngine(
        meeting_loader=_MeetingLoader(meeting),
        provider_resolver=composition.provider_resolver,
        knowledge_search=composition.knowledge_search,
        turn_store=InMemoryTurnStore(),
        policies=TurnPolicies(),
    )
    from app.modules.meetings.engine import TurnFailure

    with pytest.raises(TurnFailure, match="no usable final answer"):
        await engine.run("synthetic-m1", "synthetic-p1", idempotency_key="smoke-empty")
