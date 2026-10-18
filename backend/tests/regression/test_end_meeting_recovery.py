"""Regression (spec-02): recoverable meeting ending.

Today the end route rejects anything not already in `active` (400), cannot
recover from a half-finished ending, and commits the ending message + status
change as two independent writes — a crash between them leaves a voting
meeting with no final summary, and two concurrent enders can both "win".

Behavior captured here (locked decisions: stay-voting allows retry, atomic
close commit):
- force end from active closes the meeting and persists exactly one
  "MEETING ENDED" system message holding the summary;
- a failed summary generation leaves the meeting IN `voting` and reports an
  explicitly retryable outcome without persisting anything; a later retry
  commits the ending without re-collecting votes;
- a majority-NO vote reverts the meeting to `active` (success=False) and a
  later end attempt on the reverted meeting collects votes again;
- entering with the meeting already in `voting` skips the vote phase;
- a pre-existing ending marker (legacy crash state) is reused instead of
  paying for another summary generation;
- two concurrent end attempts produce at most one committed ending and one
  persisted ending message (atomic commit RPC, CAS-protected).
"""

import asyncio
import json

import pytest

from app.llm.base import LLMResponse
from app.services.meeting_manager import MeetingManager
from app.services.meeting_closer import (
    MEETING_ENDED_MARKER,
    EndAttemptIncomplete,
    MeetingClosedConflict,
    MeetingCloser,
)
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for

MEETING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
P_BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbb00000001"
P_CAROL = "cccccccc-cccc-4ccc-8ccc-cccc00000001"


def seed_meeting(disposable_db, *, status: str = "active") -> None:
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name, agenda, status, total_cost) VALUES (%s, %s, %s, %s, 0)",
            (MEETING, "Recovery probe", "Ship the thing", status),
        )
        for pid, name, provider_config in (
            (P_BOB, "Bob", {"provider": "openrouter", "model": "m-bob", "temperature": 0.7, "max_tokens": 2048}),
            (P_CAROL, "Carol", {"provider": "openrouter", "model": "m-carol", "temperature": 0.7, "max_tokens": 2048}),
        ):
            conn.execute(
                "INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt, provider_config, stack_ids) "
                "VALUES (%s, %s, %s, %s, %s, %s, '[]'::jsonb)",
                (pid, MEETING, name, "Analyst", "You are a fixture analyst.", json.dumps(provider_config)),
            )


def persisted_status(disposable_db) -> str:
    return disposable_db.query("SELECT status FROM meetings WHERE id = %s", (MEETING,))[0][0]


def ending_messages(disposable_db) -> list[str]:
    return [
        row[0]
        for row in disposable_db.query(
            "SELECT content FROM messages WHERE meeting_id = %s AND content LIKE %s ORDER BY created_at DESC",
            (MEETING, MEETING_ENDED_MARKER + "%"),
        )
    ]


def vote_response(vote: bool, reason: str) -> LLMResponse:
    return LLMResponse(content=json.dumps({"vote": vote, "reason": reason}))


class ProviderRegistry:
    """`get_provider` double: scripted responses per (provider, model) key.

    Registered providers replay their scripts in order and remember every
    completed call, so tests can assert exactly what the closer triggered.
    """

    def __init__(self):
        self._providers: dict[tuple[str, str], ScriptedProvider] = {}

    def register(self, provider: str, model: str, script: list) -> ScriptedProvider:
        instance = ScriptedProvider(script)
        self._providers[(provider, model)] = instance
        return instance

    def __call__(self, provider_name=None, model=None, api_key=None, base_url=None):
        key = (provider_name or "", model or "")
        assert key in self._providers, f"unexpected get_provider key {key}"
        return self._providers[key]

    @property
    def call_count(self) -> int:
        return sum(p.call_count for p in self._providers.values())


def patch_closer(monkeypatch, disposable_db, registry: ProviderRegistry) -> MeetingCloser:
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)
    monkeypatch.setattr("app.services.meeting_closer.get_provider", registry)
    return MeetingCloser()


async def test_force_end_from_active_commits_ending_and_summary(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    # Only the summary is generated on a force end (no vote phase).
    registry.register("openrouter", "m-bob", [LLMResponse(content="# Executive Summary\nAll aligned.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    outcome = await closer.end_meeting(MEETING, force_end=True)

    assert outcome.success is True
    assert outcome.summary == "# Executive Summary\nAll aligned."
    assert persisted_status(disposable_db) == "ended"
    persisted = ending_messages(disposable_db)
    assert len(persisted) == 1, "exactly one final summary message"
    assert persisted[0].startswith(MEETING_ENDED_MARKER)
    assert "# Executive Summary" in persisted[0]


async def test_majority_yes_votes_commit_ending(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    registry.register("openrouter", "m-bob", [
        vote_response(True, "Agenda covered."),
        LLMResponse(content="Summary via bob."),
    ])
    registry.register("openrouter", "m-carol", [vote_response(True, "Done, wrap it.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    outcome = await closer.end_meeting(MEETING, force_end=False)

    assert outcome.success is True
    assert [v.vote for v in outcome.votes] == [True, True]
    assert persisted_status(disposable_db) == "ended"
    assert len(ending_messages(disposable_db)) == 1


async def test_majority_no_reverts_to_active(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    registry.register("openrouter", "m-bob", [vote_response(False, "Important topics remain.")])
    registry.register("openrouter", "m-carol", [vote_response(True, "Fine by me.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    outcome = await closer.end_meeting(MEETING, force_end=False)

    assert outcome.success is False
    assert any(v.vote for v in outcome.votes), "votes are recorded even when rejected"
    assert "1/2" in outcome.message
    assert persisted_status(disposable_db) == "active", "rejected vote must not strand the meeting in voting"
    assert ending_messages(disposable_db) == []


async def test_rejected_end_then_next_attempt_votes_again(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    bob = registry.register("openrouter", "m-bob", [vote_response(True, "Yes.")])
    carol = registry.register("openrouter", "m-carol", [vote_response(False, "No.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    first = await closer.end_meeting(MEETING, force_end=False)
    assert first.success is False

    # Both flip to confirm again for attempt #2; bob must still have a
    # summary response left for the closing summary.
    carol.responses.append(vote_response(True, "Alright, let's end."))
    bob.responses.append(vote_response(True, "Still yes."))
    bob.responses.append(LLMResponse(content="Summary by bob."))
    second = await closer.end_meeting(MEETING, force_end=False)

    assert second.success is True
    assert [v.vote for v in second.votes] == [True, True]
    assert bob.call_count == 3 and carol.call_count == 2
    assert persisted_status(disposable_db) == "ended"


async def test_summary_failure_stays_voting_and_is_retryable(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    # Bob: vote-yes, then the summary attempt fails, then the retry succeeds.
    summary_provider = registry.register(
        "openrouter", "m-bob", [
            vote_response(True, "Let's wrap."),
            RuntimeError("provider temporarily down"),
            LLMResponse(content="# Executive Summary\nRecovered."),
        ]
    )
    carol = registry.register("openrouter", "m-carol", [vote_response(True, "Yes.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    with pytest.raises(EndAttemptIncomplete) as exc_info:
        await closer.end_meeting(MEETING, force_end=False)
    assert "retry" in str(exc_info.value).lower()

    assert persisted_status(disposable_db) == "voting", "stay voting, allow retry"
    assert ending_messages(disposable_db) == []
    assert summary_provider.call_count == 2 and carol.call_count == 1

    # Recovery: a later retry regenerates the summary without re-voting.
    outcome = await closer.end_meeting(MEETING, force_end=False)

    assert outcome.success is True
    assert outcome.summary == "# Executive Summary\nRecovered."
    assert outcome.votes == [], "retry skips the vote phase"
    assert carol.call_count == 1, "votes were not re-collected"
    assert summary_provider.call_count == 3
    assert persisted_status(disposable_db) == "ended"
    assert len(ending_messages(disposable_db)) == 1


async def test_forced_summary_failure_stays_voting_and_recovers(disposable_db, monkeypatch):
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    summary_provider = registry.register("openrouter", "m-bob", [RuntimeError("down")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    with pytest.raises(EndAttemptIncomplete):
        await closer.end_meeting(MEETING, force_end=True)
    assert persisted_status(disposable_db) == "voting"
    assert summary_provider.call_count == 1

    summary_provider.responses.append(LLMResponse(content="Recovery summary."))
    outcome = await closer.end_meeting(MEETING, force_end=True)
    assert outcome.success is True
    assert persisted_status(disposable_db) == "ended"


async def test_retry_when_entering_from_voting_skips_votes(disposable_db, monkeypatch):
    seed_meeting(disposable_db, status="voting")
    registry = ProviderRegistry()
    registry.register("openrouter", "m-bob", [LLMResponse(content="Summary without votes.")])
    registry.register("openrouter", "m-carol", [LLMResponse(content="Never asked.")])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    outcome = await closer.end_meeting(MEETING, force_end=False)

    assert outcome.success is True
    assert outcome.votes == []
    assert persisted_status(disposable_db) == "ended"
    assert registry.call_count == 1, "only the summary provider was used"


async def test_preexisting_ending_marker_is_reused_not_regenerated(disposable_db, monkeypatch):
    """Legacy crash state: the old code saved the summary message but failed
    before the status update. Recovery must reuse the stored summary and
    commit, without paying for another generation."""
    seed_meeting(disposable_db, status="voting")
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO messages (meeting_id, sender_type, sender_name, content) "
            "VALUES (%s, 'system', 'System', %s)",
            (MEETING, MEETING_ENDED_MARKER + "\n\nCrashed attempt summary."),
        )
    registry = ProviderRegistry()  # registers nothing: no provider calls allowed
    closer = patch_closer(monkeypatch, disposable_db, registry)

    outcome = await closer.end_meeting(MEETING, force_end=False)

    assert outcome.success is True
    assert "Crashed attempt summary" in (outcome.summary or "")
    assert registry.call_count == 0, "stored summary must not be regenerated"
    assert persisted_status(disposable_db) == "ended"
    assert len(ending_messages(disposable_db)) == 1


async def test_concurrent_end_attempts_produce_one_committed_ending(disposable_db, monkeypatch):
    """Two end attempts race: both pass entry serialization (one wins the CAS,
    the other merges into the already-voting attempt), both may generate a
    summary, but the atomic commit RPC ensures exactly one ending persists."""
    seed_meeting(disposable_db)
    registry = ProviderRegistry()
    bob = registry.register("openrouter", "m-bob", [
        LLMResponse(content="Summary A."),
        LLMResponse(content="Summary B."),
    ])
    closer = patch_closer(monkeypatch, disposable_db, registry)

    # Force serialization point: don't let either attempt commit until both
    # have generated their summary (synchronized paid duplication window).
    barrier = asyncio.Barrier(2)

    class GatedProvider(ScriptedProvider):
        async def complete(self, messages, tools=None, temperature=0.7, max_tokens=2048):
            result = await super().complete(
                messages=messages, tools=tools, temperature=temperature, max_tokens=max_tokens
            )
            await barrier.wait()  # both summaries generated before either commits
            return result

    bob.__class__ = GatedProvider

    outcomes = await asyncio.gather(
        closer.end_meeting(MEETING, force_end=True),
        closer.end_meeting(MEETING, force_end=True),
        return_exceptions=True,
    )

    committed = [o for o in outcomes if not isinstance(o, Exception) and o.success]
    conflicted = [o for o in outcomes if isinstance(o, MeetingClosedConflict)]
    assert len(committed) == 1, f"exactly one committed ending, got {outcomes!r}"
    assert len(conflicted) == 1, f"the loser reports a conflict, got {outcomes!r}"
    assert persisted_status(disposable_db) == "ended"
    assert len(ending_messages(disposable_db)) == 1, "one atomic save+commit wins"
    survivor = ending_messages(disposable_db)[0]
    assert survivor in (
        MEETING_ENDED_MARKER + "\n\nSummary A.",
        MEETING_ENDED_MARKER + "\n\nSummary B.",
    ), "the persisted ending message belongs to whichever attempt won the commit race"
