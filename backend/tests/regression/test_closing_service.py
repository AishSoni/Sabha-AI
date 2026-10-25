"""Closing application service against the real database (spec 08).

The service decides stages from canonical committed rows; the database
guards every transition. These tests drive the real closing RPCs through a
scripted invocation factory, covering drain, ballots, checkpoints, retry,
reconciliation and the once-only ended commit.
"""

from __future__ import annotations

import json
from datetime import timezone
from uuid import uuid4

import pytest

from app.modules.meetings.application.closing import (
    ClosingService,
    MEETING_ENDED_MARKER,
)
from app.modules.meetings.application.contracts import ProviderOutput
from app.modules.meetings.domain.errors import MeetingNotFoundError
from app.modules.meetings.domain.services import ClosingStage
from app.modules.meetings.infrastructure.supabase_closing import (
    SupabaseClosingRepository,
)
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.supabase_meetings import build_default_meeting_service
from tests.doubles.closing import ClosingWorld
from tests.doubles.supabase_stub import stub_for

VOTE_USAGE = {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}
SUMMARY_USAGE = {"prompt_tokens": 90, "completion_tokens": 40, "total_tokens": 130}


class FakeInvoker:
    def __init__(self, provider="ollama", model="scripted", *, output=None, error=None):
        self.provider = provider
        self.model = model
        self.settings = {
            "provider": provider,
            "model": model,
            "temperature": 0.7,
            "max_tokens": 2048,
            "credential_reference": "none",
            "provenance": {},
        }
        self.output = output or ProviderOutput(text="")
        self.error = error
        self.calls = 0
        self.prompts: list[str] = []

    async def complete(self, prompt: str) -> ProviderOutput:
        self.calls += 1
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return self.output


def yes_output() -> ProviderOutput:
    return ProviderOutput(
        text=json.dumps({"vote": True, "reason": "Ready to close."}),
        usage=dict(VOTE_USAGE),
        estimated_cost=0.01,
    )


def no_output() -> ProviderOutput:
    return ProviderOutput(
        text=json.dumps({"vote": False, "reason": "More to discuss."}),
        usage=dict(VOTE_USAGE),
        estimated_cost=0.01,
    )


def summary_output() -> ProviderOutput:
    return ProviderOutput(
        text="# Executive Summary\n\n## Overview\nAligned.",
        usage=dict(SUMMARY_USAGE),
        estimated_cost=0.02,
    )


class FakeInvocations:
    def __init__(self) -> None:
        self.invokers: dict[str, FakeInvoker] = {}
        self.participant_calls: list[str] = []
        self.system_invoker = FakeInvoker(output=summary_output())

    def configure_vote(self, participant_id: str, *, vote: bool, error=None):
        output = yes_output() if vote else no_output()
        self.invokers[participant_id] = FakeInvoker(output=output, error=error)
        return self.invokers[participant_id]

    async def participant(self, policy):
        self.participant_calls.append(policy.participant_id)
        invoker = self.invokers.get(policy.participant_id)
        if invoker is None:
            invoker = FakeInvoker(output=yes_output())
            self.invokers[policy.participant_id] = invoker
        return invoker

    async def system(self, settings):
        return self.system_invoker


def build(disposable_db, monkeypatch):
    world = ClosingWorld(disposable_db, lease_seconds=30)
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.modules.meetings.infrastructure.supabase_meetings.get_supabase", lambda: stub)
    manager = build_default_meeting_service()
    repository = SupabaseClosingRepository(manager, now=world.clock.now)
    factory = FakeInvocations()
    service = ClosingService(
        repository,
        factory,
        lease_seconds=30,
        drain_timeout_seconds=300,
        now=lambda: world.clock.now().replace(tzinfo=timezone.utc),
    )
    return world, service, factory


def _close_row(world: ClosingWorld, meeting_id: str) -> dict:
    return world.closing(meeting_id)


async def test_request_end_drains_running_turn_then_votes_and_summarizes(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    factory.configure_vote(participant_id, vote=True)
    factory.configure_vote(second, vote=True)

    running = world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    waiting = world.submit(meeting_id, second, key="turn-2")

    snapshot = await service.request(meeting_id, "close-1", "vote")

    assert snapshot.closing is not None
    assert snapshot.closing.stage is ClosingStage.DRAINING
    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"
    assert world.turn_status(running["operation"]["id"]) == "executing"
    assert factory.participant_calls == []
    assert factory.system_invoker.calls == 0

    world.complete_running(running)
    snapshot = await service.advance(meeting_id)

    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert world.meeting_status(meeting_id) == "ended"
    assert world.final_summary_count(meeting_id) == 1
    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"
    assert world.turn_status(running["operation"]["id"]) == "completed"
    assert factory.system_invoker.calls == 1
    # Two ballots plus the summary are ledgered exactly once.
    assert world.inference_count(meeting_id) == 3


async def test_force_end_skips_voting_but_drains(disposable_db, monkeypatch):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)

    snapshot = await service.request(meeting_id, "close-1", "force")
    assert snapshot.closing.stage is ClosingStage.DRAINING

    world.complete_running(world.queue.list_operations(meeting_id)[0])
    snapshot = await service.advance(meeting_id)

    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert factory.participant_calls == []
    assert world.final_summary_count(meeting_id) == 1


async def test_rejected_vote_reopens_active_admission(disposable_db, monkeypatch):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    factory.configure_vote(participant_id, vote=False)
    factory.configure_vote(second, vote=False)

    snapshot = await service.request(meeting_id, "close-1", "vote")

    assert snapshot.closing.stage is ClosingStage.REJECTED
    assert world.meeting_status(meeting_id) == "active"
    assert world.final_summary_count(meeting_id) == 0
    assert factory.system_invoker.calls == 0
    # Admission is open again.
    accepted = world.submit(meeting_id, participant_id, key="turn-again")
    assert accepted["operation"]["status"] == "pending"


async def test_error_ballot_counts_as_no_without_failing_the_closing(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    factory.configure_vote(
        participant_id, vote=True, error=RuntimeError("provider down")
    )

    snapshot = await service.request(meeting_id, "close-1", "vote")

    assert snapshot.closing.stage is ClosingStage.REJECTED
    assert world.meeting_status(meeting_id) == "active"
    ballot = world.vote_row(snapshot.closing.id, participant_id)
    assert ballot[0] == "failed"
    assert ballot[11] == "provider_error"
    assert "provider down" in (ballot[5] or "")


async def test_error_ballot_does_not_block_a_strict_majority(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    third = world.add_participant(meeting_id, "The Investor", "Investor")
    factory.configure_vote(participant_id, vote=True)
    factory.configure_vote(second, vote=True)
    factory.configure_vote(third, vote=True, error=RuntimeError("offline"))

    snapshot = await service.request(meeting_id, "close-1", "vote")

    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert world.meeting_status(meeting_id) == "ended"


async def test_uncertain_ballot_requires_explicit_retry(disposable_db, monkeypatch):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    factory.configure_vote(participant_id, vote=True)

    running = world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    close = (await service.request(meeting_id, "close-1", "vote")).closing
    world.complete_running(running)
    assert world.mark_stage(close, "draining", "voting") is True
    assert world.start_voting(close)["outcome"] == "started"

    world.begin_vote(close, participant_id, attempt_id=str(uuid4()))
    world.clock.advance(60)

    snapshot = await service.advance(meeting_id)
    assert snapshot.closing.stage is ClosingStage.FAILED
    assert snapshot.closing.error_code == "vote_uncertain"
    assert world.meeting_status(meeting_id) == "voting"

    snapshot = await service.retry(meeting_id)
    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert world.meeting_status(meeting_id) == "ended"


async def test_summary_failure_is_recoverable_and_retry_uses_a_new_attempt(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, _ = world.seed_active_meeting()
    factory.system_invoker.error = RuntimeError("summary provider down")

    snapshot = await service.request(meeting_id, "close-1", "force")
    assert snapshot.closing.stage is ClosingStage.FAILED
    assert snapshot.closing.error_code == "summary_generation_failed"
    assert world.meeting_status(meeting_id) == "voting"
    assert world.final_summary_count(meeting_id) == 0

    factory.system_invoker.error = None
    snapshot = await service.retry(meeting_id)

    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert world.meeting_status(meeting_id) == "ended"
    assert world.final_summary_count(meeting_id) == 1
    assert factory.system_invoker.calls == 2
    attempt_number = world.db.query(
        "SELECT summary_attempt_number FROM meeting_closings WHERE meeting_id = %s",
        (meeting_id,),
    )[0][0]
    assert attempt_number == 2


async def test_stalled_drain_fails_recoverably(disposable_db, monkeypatch):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)

    await service.request(meeting_id, "close-1", "vote")
    world.clock.advance(400)

    snapshot = await service.advance(meeting_id)
    assert snapshot.closing.stage is ClosingStage.FAILED
    assert snapshot.closing.error_code == "turn_stalled"


async def test_reconcile_never_calls_providers_and_surfaces_interruption(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    running = world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    close = (await service.request(meeting_id, "close-1", "vote")).closing
    world.complete_running(running)
    assert world.mark_stage(close, "draining", "voting") is True
    assert world.start_voting(close)["outcome"] == "started"

    await service.reconcile_open_closings()

    snapshot = await service.observe(meeting_id)
    assert snapshot.closing.stage is ClosingStage.FAILED
    assert snapshot.closing.error_code == "voting_interrupted"
    assert factory.participant_calls == []
    assert factory.system_invoker.calls == 0


async def test_reconcile_commits_a_stored_summary_without_a_provider(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    running = world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    close = (await service.request(meeting_id, "close-1", "force")).closing
    world.complete_running(running)
    assert world.mark_stage(close, "draining", "summarizing") is True
    world.checkpoint_summary(close, f"{MEETING_ENDED_MARKER}\n\nStored body.")

    await service.reconcile_open_closings()

    snapshot = await service.observe(meeting_id)
    assert snapshot.closing.stage is ClosingStage.COMPLETED
    assert world.meeting_status(meeting_id) == "ended"
    assert world.final_summary_count(meeting_id) == 1
    assert factory.system_invoker.calls == 0


async def test_reconcile_marks_an_expired_summary_attempt_uncertain(
    disposable_db, monkeypatch
):
    world, service, _ = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    running = world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    close = (await service.request(meeting_id, "close-1", "force")).closing
    world.complete_running(running)
    assert world.mark_stage(close, "draining", "summarizing") is True
    reserved = world.reserve_summary(close, attempt_id=str(uuid4()), lease_seconds=30)
    assert reserved["outcome"] == "started"
    world.clock.advance(60)

    await service.reconcile_open_closings()

    snapshot = await service.observe(meeting_id)
    assert snapshot.closing.stage is ClosingStage.FAILED
    assert snapshot.closing.error_code == "summary_uncertain"


async def test_abort_reopens_admission_and_observe_reads_canonically(
    disposable_db, monkeypatch
):
    world, service, factory = build(disposable_db, monkeypatch)
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)
    await service.request(meeting_id, "close-1", "vote")

    snapshot = await service.abort(meeting_id)

    assert snapshot.closing.stage is ClosingStage.ABORTED
    assert world.meeting_status(meeting_id) == "active"
    accepted = world.submit(meeting_id, participant_id, key="turn-2")
    assert accepted["operation"]["status"] == "pending"


async def test_unknown_meeting_surfaces_not_found(disposable_db, monkeypatch):
    _, service, _ = build(disposable_db, monkeypatch)
    with pytest.raises(MeetingNotFoundError):
        await service.observe("00000000-0000-4000-8000-000000000000")
