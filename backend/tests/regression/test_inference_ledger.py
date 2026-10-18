"""Regression (spec-02): every completed inference attempt must be recorded
exactly once in a universal inference ledger — turns (per provider round),
votes, summaries, forced summaries. Previously the meeting total was only
mutated as a side effect of saving a message, so:
- a turn whose save failed lost its accounting,
- votes/summaries could never be accounted,
- repeated submissions had no idempotency protection.

Rules captured here:
- client-generated stable inference ids make repeated submissions idempotent
  (a repeated submission is NOT double counted);
- failed inference attempts are never charged;
- zero-cost attempts still appear as zero-cost ledger rows — traceable, never
  fabricated;
- unknown usage records a zero-cost event instead of inventing a price;
- message estimated_cost stays informational: messages no longer mutate
  meeting.total_cost, only the ledger does.
"""

import json

import pytest
import app.llm as llm_module
import app.services.orchestrator as orchestrator_module
import app.services.meeting_manager as meeting_manager_module
from app.llm.base import LLMResponse, StreamEvent, StreamEventType
from app.services.meeting_manager import MeetingManager
from app.services.orchestrator import Orchestrator
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PARTICIPANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
LEDGER_MEETING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
P_BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000001"


def _seed(db, meeting_id=MEETING_ID, participants=None):
    participants = participants or [(
        PARTICIPANT_ID,
        "The Analyst",
        json.dumps({"provider": "", "model": "", "temperature": 0.2, "max_tokens": 1234}),
    )]
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name, agenda, status) VALUES (%s, %s, '', 'active')",
            (meeting_id, meeting_id),
        )
        for pid, name, config in participants:
            conn.execute(
                "INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt, provider_config, stack_ids) "
                "VALUES (%s, %s, %s, 'Analyst', 'fixture', %s::jsonb, '[]'::jsonb)",
                (pid, meeting_id, name, config),
            )


def priced_usage(total_tokens: int):
    """Deterministic usage; CostedProvider prices tokens at 0.02 / 1000."""
    return {
        "prompt_tokens": max(total_tokens - 10, 0),
        "completion_tokens": 10,
        "total_tokens": total_tokens,
    }


def ledger_rows(db, meeting_id=MEETING_ID):
    rows = db.query(
        "SELECT purpose, provider, model, estimated_cost FROM inference_events "
        "WHERE meeting_id = %s ORDER BY created_at",
        (meeting_id,),
    )
    return [
        {"purpose": r[0], "provider": r[1], "model": r[2], "estimated_cost": r[3]}
        for r in rows
    ]


def meeting_cost(db, meeting_id=MEETING_ID):
    return float(
        db.query("SELECT total_cost FROM meetings WHERE id = %s", (meeting_id,))[0][0]
    )


class CostedProvider(ScriptedProvider):
    """usage-aware pricing double: 0.02 per 1000 total tokens, 0.0 unknown."""

    def estimate_cost(self, usage):
        return ((usage or {}).get("total_tokens") or 0) * 0.00002


@pytest.fixture()
def ledger_env(disposable_db, monkeypatch):
    """Orchestrator environment identical to the turn-loop fixture, plus a
    usage-aware pricing provider."""
    _seed(disposable_db)
    stub = stub_for(disposable_db)
    monkeypatch.setattr(meeting_manager_module, "get_supabase", lambda: stub)
    monkeypatch.setattr(orchestrator_module, "get_supabase", lambda: stub)

    def install(responses=(), scripts=()):
        provider = CostedProvider(responses=responses)
        provider.scripts = list(scripts)
        monkeypatch.setattr(orchestrator_module, "get_provider", lambda *a, **kw: provider)
        # execute_turn_streaming re-imports get_provider inside the method body.
        monkeypatch.setattr(llm_module, "get_provider", lambda *a, **kw: provider)
        return provider

    yield {
        "db": disposable_db,
        "stub": stub,
        "install_provider": install,
        "orchestrator": Orchestrator(MeetingManager()),
    }


def _tool_round(query="pricing"):
    from app.llm.base import ToolCall

    return LLMResponse(
        content="",
        tool_calls=[
            ToolCall(id="call-1", name="search_knowledge_base", arguments={"query": query})
        ],
        usage=priced_usage(1000),
    )


async def test_repeated_submission_of_same_inference_id_counts_once(disposable_db, monkeypatch):
    _seed(disposable_db, LEDGER_MEETING)
    stub = stub_for(disposable_db)
    monkeypatch.setattr(meeting_manager_module, "get_supabase", lambda: stub)
    manager = MeetingManager()

    first = await manager.record_inference_cost(
        inference_id="55555555-5555-4555-8555-555555550001",
        meeting_id=LEDGER_MEETING,
        purpose="turn",
        provider="openrouter",
        model="m",
        cost=0.5,
    )
    repeated = await manager.record_inference_cost(
        inference_id="55555555-5555-4555-8555-555555550001",
        meeting_id=LEDGER_MEETING,
        purpose="turn",
        provider="openrouter",
        model="m",
        cost=0.5,
    )
    distinct = await manager.record_inference_cost(
        inference_id="55555555-5555-4555-8555-555555550002",
        meeting_id=LEDGER_MEETING,
        purpose="vote",
        provider="openrouter",
        model="m",
        cost=0.25,
    )

    assert first is True
    assert repeated is False, "a repeated submission must not double count"
    assert distinct is True
    rows = ledger_rows(disposable_db, LEDGER_MEETING)
    assert len(rows) == 2
    assert meeting_cost(disposable_db, LEDGER_MEETING) == pytest.approx(0.75)


async def test_turn_records_one_event_per_provider_round(ledger_env):
    env = ledger_env
    env["install_provider"](
        responses=[
            _tool_round(),
            LLMResponse(content="Final answer", usage=priced_usage(1000)),
        ]
    )

    await env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    rows = ledger_rows(env["db"])
    assert len(rows) == 2, "tool round + answer round are two completed paid attempts"
    assert [r["purpose"] for r in rows] == ["turn", "turn"]
    assert meeting_cost(env["db"]) == pytest.approx(0.04)
    saved = env["db"].query(
        "SELECT estimated_cost FROM messages WHERE meeting_id = %s", (MEETING_ID,)
    )
    assert float(saved[0][0]) == pytest.approx(0.04)


async def test_streaming_turn_records_per_round_events(ledger_env):
    env = ledger_env
    env["install_provider"](
        scripts=[
            [
                StreamEvent(type=StreamEventType.TEXT, content="partial"),
                StreamEvent(type=StreamEventType.DONE, usage=priced_usage(1000)),
            ]
        ]
    )

    events = [
        event
        async for event in env["orchestrator"].execute_turn_streaming(MEETING_ID, PARTICIPANT_ID)
    ]

    assert events[-1].type == StreamEventType.DONE
    rows = ledger_rows(env["db"])
    assert len(rows) == 1
    assert rows[0]["purpose"] == "turn"
    assert meeting_cost(env["db"]) == pytest.approx(0.02)


async def test_completed_votes_and_summary_recorded_failed_vote_not(disposable_db, monkeypatch):
    """Three participants: Bob votes OK (paid), Carol's vote fails (provider
    outage — must NOT be charged), Dave votes OK, then the summary is
    generated and paid (2/3 majority ends the meeting)."""
    stub = stub_for(disposable_db)
    monkeypatch.setattr(meeting_manager_module, "get_supabase", lambda: stub)

    P_CAROL = "cccccccc-cccc-4ccc-8ccc-cccc00000001"
    P_DAVE = "dddddddd-dddd-4ddd-8ddd-dddd00000001"
    _seed(
        disposable_db,
        LEDGER_MEETING,
        [
            (P_BOB, "Bob", json.dumps({"provider": "openrouter", "model": "m-bob", "temperature": 0.7, "max_tokens": 2048})),
            (P_CAROL, "Carol", json.dumps({"provider": "openrouter", "model": "m-carol", "temperature": 0.7, "max_tokens": 2048})),
            (P_DAVE, "Dave", json.dumps({"provider": "openrouter", "model": "m-dave", "temperature": 0.7, "max_tokens": 2048})),
        ],
    )

    class ScriptedVoteRoundProvider:
        """One provider instance for every get_provider call: vote OK → vote
        outage → vote OK → summary."""

        def __init__(self):
            self.calls = []
            self.responses = [
                LLMResponse(
                    content=json.dumps({"vote": True, "reason": "agenda covered"}),
                    usage=priced_usage(1000),
                ),
                RuntimeError("provider outage"),
                LLMResponse(
                    content=json.dumps({"vote": True, "reason": "agreed"}),
                    usage=priced_usage(1000),
                ),
                LLMResponse(content="# Executive Summary", usage=priced_usage(1000)),
            ]

        async def complete(self, **kwargs):
            self.calls.append(kwargs)
            item = self.responses.pop(0)
            if isinstance(item, BaseException):
                raise item
            return item

        def estimate_cost(self, usage):
            return ((usage or {}).get("total_tokens") or 0) * 0.00002

    provider = ScriptedVoteRoundProvider()
    monkeypatch.setattr("app.services.meeting_closer.get_provider", lambda *a, **kw: provider)

    from app.services.meeting_closer import MeetingCloser

    response = await MeetingCloser(MeetingManager()).end_meeting(LEDGER_MEETING)

    assert response.success is True
    rows = ledger_rows(disposable_db, LEDGER_MEETING)
    assert [r["purpose"] for r in rows] == ["vote", "vote", "summary"], (
        "the failed vote attempt (provider outage) must not be charged"
    )
    assert rows[0]["provider"] == "openrouter"
    assert meeting_cost(disposable_db, LEDGER_MEETING) == pytest.approx(0.06)


async def test_zero_cost_attempt_is_traceable_not_fabricated(ledger_env):
    env = ledger_env
    env["install_provider"](
        responses=[LLMResponse(content="zero cost answer", usage=priced_usage(0))]
    )

    await env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    rows = ledger_rows(env["db"])
    assert len(rows) == 1, "zero-cost attempts stay visible in the ledger"
    assert float(rows[0]["estimated_cost"]) == pytest.approx(0.0)
    assert meeting_cost(env["db"]) == pytest.approx(0.0)


async def test_unknown_usage_records_zero_cost_event(ledger_env):
    env = ledger_env
    env["install_provider"](
        responses=[LLMResponse(content="no usage reported", usage={})]
    )

    await env["orchestrator"].execute_turn(MEETING_ID, PARTICIPANT_ID)

    rows = ledger_rows(env["db"])
    assert len(rows) == 1, "unknown usage is still recorded, at zero cost"
    assert float(rows[0]["estimated_cost"]) == pytest.approx(0.0)
    assert meeting_cost(env["db"]) == pytest.approx(0.0)


async def test_messages_no_longer_mutate_meeting_total(disposable_db, monkeypatch):
    """The legacy path: saving a message bumped meetings.total_cost via the
    increment RPC, so vote/summary costs were lost and double counting was
    possible. Saving must now be accounting-neutral; total_cost only moves
    through the ledger."""
    _seed(disposable_db, LEDGER_MEETING)
    stub = stub_for(disposable_db)
    monkeypatch.setattr(meeting_manager_module, "get_supabase", lambda: stub)

    from app.models import MessageCreate
    from app.models.schemas import SenderType

    manager = MeetingManager()
    await manager.save_message(
        MessageCreate(
            meeting_id=LEDGER_MEETING,
            content="display only",
            sender_type=SenderType.AI,
            sender_name="The Analyst",
            estimated_cost=0.25,
        )
    )

    assert meeting_cost(disposable_db, LEDGER_MEETING) == pytest.approx(0.0)
    saved = disposable_db.query(
        "SELECT estimated_cost FROM messages WHERE meeting_id = %s", (LEDGER_MEETING,)
    )
    assert float(saved[0][0]) == pytest.approx(0.25), (
        "message estimated_cost remains informational"
    )
    assert ledger_rows(disposable_db, LEDGER_MEETING) == []
