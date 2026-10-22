"""Closing vote checkpoints and attempt accounting (spec 08).

A ballot attempt id is reserved before the provider call, so usage survives a
failed save, a lost response, or a later closing failure. Confirmed ballots
are reused; uncertain ballots require an explicit retry.
"""

from __future__ import annotations

import uuid

import pytest

from tests.doubles.closing import ClosingWorld


@pytest.fixture()
def world(disposable_db) -> ClosingWorld:
    return ClosingWorld(disposable_db, lease_seconds=30)


def _attempt_id() -> str:
    return str(uuid.uuid4())


def _voting_close(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="vote")["closing"]
    started = world.start_voting(close)
    assert started["outcome"] == "started"
    return meeting_id, participant_id, close


def test_start_voting_freezes_the_roster(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    third = world.add_participant(meeting_id, "The Investor", "Investor")

    close = world.request(meeting_id, mode="vote")["closing"]
    assert world.start_voting(close)["participant_count"] == 3

    world.add_participant(meeting_id, "Latecomer", "Observer")

    assert world.start_voting(close)["participant_count"] == 3
    votes = world.votes(meeting_id)
    assert {vote["participant_id"] for vote in votes} == {
        participant_id,
        second,
        third,
    }
    assert {vote["status"] for vote in votes} == {"pending"}


def test_confirmed_ballot_is_never_paid_for_twice(world: ClosingWorld):
    meeting_id, participant_id, close = _voting_close(world)
    attempt = _attempt_id()

    first = world.begin_vote(close, participant_id, attempt_id=attempt)
    assert first["outcome"] == "started"
    assert first["attempt_number"] == 1

    duplicate = world.begin_vote(close, participant_id, attempt_id=_attempt_id())
    assert duplicate["outcome"] == "in_flight"
    assert duplicate["attempt_id"] == attempt

    saved = world.finish_vote(
        close,
        participant_id,
        attempt_id=attempt,
        vote=True,
        usage={"prompt_tokens": 10, "completion_tokens": 2},
    )
    assert saved["outcome"] == "recorded"
    assert saved["vote_updated"] is True
    assert saved["ledger_recorded"] is True

    row = world.vote_row(close, participant_id)
    assert row[0] == "completed"
    assert row[4] is True
    assert row[7] == "reported"

    assert world.inference_count(meeting_id) == 1
    assert world.total_cost(meeting_id) == pytest.approx(0.01)

    again = world.begin_vote(close, participant_id, attempt_id=_attempt_id())
    assert again["outcome"] == "completed"
    assert again["attempt_id"] == attempt
    assert again["vote"]["vote"] is True

    repeated = world.finish_vote(close, participant_id, attempt_id=attempt)
    assert repeated["outcome"] == "duplicate"
    assert world.inference_count(meeting_id) == 1
    assert world.total_cost(meeting_id) == pytest.approx(0.01)


def test_rejected_ballot_and_unknown_usage_still_have_honest_ledger_rows(
    world: ClosingWorld,
):
    meeting_id, first = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    close = world.request(meeting_id, mode="vote")["closing"]
    world.start_voting(close)

    no_attempt = _attempt_id()
    world.begin_vote(close, first, attempt_id=no_attempt)
    rejected = world.finish_vote(
        close,
        first,
        attempt_id=no_attempt,
        vote=False,
        reason="Not viable.",
        usage={"prompt_tokens": 5, "completion_tokens": 1},
        estimated_cost=0.004,
        reported_cost=0.0045,
    )
    assert rejected["outcome"] == "recorded"

    unknown_attempt = _attempt_id()
    world.begin_vote(close, second, attempt_id=unknown_attempt)
    unknown = world.finish_vote(
        close,
        second,
        attempt_id=unknown_attempt,
        vote=None,
        status="completed",
        usage=None,
        usage_kind="unknown",
        price_kind=None,
        estimated_cost=0.0,
        reported_cost=None,
    )
    assert unknown["outcome"] == "recorded"

    rows = world.ledger_rows(meeting_id)
    assert len(rows) == 2
    assert {row[3] for row in rows} == {"unknown", "reported"}
    assert world.total_cost(meeting_id) == pytest.approx(0.004)


def test_stale_completion_records_usage_without_overwriting_the_ballot(
    world: ClosingWorld,
):
    meeting_id, participant_id, close = _voting_close(world)

    first = _attempt_id()
    world.begin_vote(close, participant_id, attempt_id=first)
    failed = world.finish_vote(
        close,
        participant_id,
        attempt_id=first,
        status="failed",
        vote=None,
        usage=None,
        usage_kind="unknown",
        price_kind=None,
        error_code="provider_error",
    )
    assert failed["outcome"] == "recorded"
    assert world.inference_count(meeting_id) == 0

    second = _attempt_id()
    started = world.begin_vote(close, participant_id, attempt_id=second)
    assert started["outcome"] == "started"
    assert started["attempt_number"] == 2

    late = world.finish_vote(
        close,
        participant_id,
        attempt_id=first,
        usage={"prompt_tokens": 3, "completion_tokens": 1},
    )
    assert late["outcome"] == "stale_usage_recorded"
    assert world.vote_row(close, participant_id)[0] == "pending"
    assert world.inference_count(meeting_id) == 1

    world.finish_vote(close, participant_id, attempt_id=second)
    assert world.vote_row(close, participant_id)[0] == "completed"
    assert world.inference_count(meeting_id) == 2


def test_expired_ballot_is_uncertain_until_an_explicit_retry(world: ClosingWorld):
    meeting_id, participant_id, close = _voting_close(world)
    attempt = _attempt_id()
    world.begin_vote(close, participant_id, attempt_id=attempt, lease_seconds=30)

    world.clock.advance(31)

    uncertain = world.begin_vote(close, participant_id, attempt_id=_attempt_id())
    assert uncertain["outcome"] == "uncertain"
    assert uncertain["attempt_id"] == attempt

    assert world.fail(close, "voting", code="vote_stalled") is True
    assert world.retry(close) is True
    assert world.close_stage(close) == "voting"
    assert world.vote_row(close, participant_id)[0] == "failed"

    recovered = world.begin_vote(close, participant_id, attempt_id=_attempt_id())
    assert recovered["outcome"] == "started"
    assert recovered["attempt_number"] == 2


def test_completed_ballots_survive_a_closing_retry(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    second = world.add_participant(meeting_id, "The CTO", "CTO")
    close = world.request(meeting_id, mode="vote")["closing"]
    assert world.start_voting(close)["participant_count"] == 2

    for name, participant in (("first", participant_id), ("second", second)):
        attempt = _attempt_id()
        world.begin_vote(close, participant, attempt_id=attempt)
        world.finish_vote(close, participant, attempt_id=attempt)

    assert world.fail(close, "voting", code="vote_stalled") is True
    assert world.retry(close) is True

    reused = world.begin_vote(close, participant_id, attempt_id=_attempt_id())
    assert reused["outcome"] == "completed"
    assert world.vote_row(close, participant_id)[0] == "completed"
    assert world.inference_count(meeting_id) == 2


def test_voting_cannot_advance_with_an_in_flight_ballot(world: ClosingWorld):
    _meeting_id, participant_id, close = _voting_close(world)
    attempt = _attempt_id()
    world.begin_vote(close, participant_id, attempt_id=attempt)

    assert world.mark_stage(close, "voting", "summarizing") is False

    world.finish_vote(close, participant_id, attempt_id=attempt)

    assert world.mark_stage(close, "voting", "summarizing") is True
