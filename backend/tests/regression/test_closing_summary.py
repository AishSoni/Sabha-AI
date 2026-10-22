"""Closing summary checkpoints and once-only commit (spec 08).

The summary attempt id is reserved before the provider call and is the
ledger primary key. A confirmed checkpoint is reused; an expired attempt is
uncertain and can only be replaced after an explicit closing retry.
"""

from __future__ import annotations

import uuid

import pytest

from tests.doubles.closing import ENDING_MARKER, ClosingWorld


@pytest.fixture()
def world(disposable_db) -> ClosingWorld:
    return ClosingWorld(disposable_db, lease_seconds=30)


def _attempt_id() -> str:
    return str(uuid.uuid4())


def _summarizing_close(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="force")["closing"]
    assert world.close_stage(close) == "summarizing"
    return meeting_id, participant_id, close


def test_summary_attempt_reserves_and_refuses_concurrent_replay(world: ClosingWorld):
    _meeting_id, _participant_id, close = _summarizing_close(world)

    first = _attempt_id()
    reserved = world.reserve_summary(close, attempt_id=first)
    assert reserved["outcome"] == "started"
    assert reserved["attempt_number"] == 1

    duplicate = world.reserve_summary(close, attempt_id=_attempt_id())
    assert duplicate["outcome"] == "in_flight"
    assert duplicate["attempt_id"] == first

    world.clock.advance(31)

    uncertain = world.reserve_summary(close, attempt_id=_attempt_id())
    assert uncertain["outcome"] == "uncertain"
    assert uncertain["attempt_id"] == first

    assert world.fail(close, "summarizing", code="summary_stalled") is True
    assert world.retry(close) is True
    assert world.close_stage(close) == "summarizing"

    second = _attempt_id()
    recovered = world.reserve_summary(close, attempt_id=second)
    assert recovered["outcome"] == "started"
    assert recovered["attempt_number"] == 2


def test_confirmed_summary_is_checkpointed_and_reused(world: ClosingWorld):
    meeting_id, _participant_id, close = _summarizing_close(world)
    attempt = _attempt_id()
    world.reserve_summary(close, attempt_id=attempt)

    text = f"{ENDING_MARKER}\n\nThe board agreed."
    saved = world.save_summary(
        close,
        attempt_id=attempt,
        text=text,
        usage={"prompt_tokens": 20, "completion_tokens": 10},
    )
    assert saved["outcome"] == "saved"
    assert saved["ledger_recorded"] is True
    assert world.closing(meeting_id)["summary_text"] == text

    reused = world.reserve_summary(close, attempt_id=_attempt_id())
    assert reused["outcome"] == "checkpointed"
    assert reused["summary_text"] == text
    assert world.inference_count(meeting_id) == 1
    assert world.total_cost(meeting_id) == pytest.approx(0.02)

    completed = world.complete(close)
    assert completed["outcome"] == "completed"
    assert world.meeting_status(meeting_id) == "ended"
    assert world.final_summary_count(meeting_id) == 1
    assert world.message_count(meeting_id) == 1


def test_summary_checkpoint_is_idempotent(world: ClosingWorld):
    meeting_id, _participant_id, close = _summarizing_close(world)
    attempt = _attempt_id()
    world.reserve_summary(close, attempt_id=attempt)

    first = world.save_summary(close, attempt_id=attempt, text="First body.")
    assert first["outcome"] == "saved"

    repeated = world.save_summary(
        close, attempt_id=attempt, text="Second body."
    )
    assert repeated["outcome"] == "already_saved"
    assert repeated["summary_text"] == "First body."
    assert world.closing(meeting_id)["summary_text"] == "First body."
    assert world.inference_count(meeting_id) == 1
    assert world.total_cost(meeting_id) == pytest.approx(0.02)


def test_stale_summary_usage_is_kept_without_overwriting_the_checkpoint(
    world: ClosingWorld,
):
    meeting_id, _participant_id, close = _summarizing_close(world)
    first = _attempt_id()
    world.reserve_summary(close, attempt_id=first)
    world.clock.advance(31)

    assert world.fail(close, "summarizing", code="summary_stalled") is True
    assert world.retry(close) is True
    second = _attempt_id()
    assert world.reserve_summary(close, attempt_id=second)["outcome"] == "started"

    stale = world.save_summary(
        close,
        attempt_id=first,
        text="Stale body.",
        usage={"prompt_tokens": 2, "completion_tokens": 1},
    )
    assert stale["outcome"] == "stale"
    assert stale["ledger_recorded"] is True
    assert world.closing(meeting_id)["summary_text"] is None

    saved = world.save_summary(close, attempt_id=second, text="Winning body.")
    assert saved["outcome"] == "saved"
    assert world.closing(meeting_id)["summary_text"] == "Winning body."
    assert world.inference_count(meeting_id) == 2


def test_unknown_summary_usage_stays_explicit(world: ClosingWorld):
    meeting_id, _participant_id, close = _summarizing_close(world)
    attempt = _attempt_id()
    world.reserve_summary(close, attempt_id=attempt)

    saved = world.save_summary(
        close,
        attempt_id=attempt,
        text="Body without reported usage.",
        usage=None,
        usage_kind="unknown",
        price_kind=None,
        estimated_cost=0.0,
        reported_cost=None,
    )
    assert saved["outcome"] == "saved"

    rows = world.ledger_rows(meeting_id)
    assert len(rows) == 1
    assert rows[0][2] is None
    assert rows[0][3] == "unknown"
    assert rows[0][4] is None
    assert world.total_cost(meeting_id) == 0.0


def test_complete_refuses_a_closing_without_a_checkpoint(world: ClosingWorld):
    _meeting_id, _participant_id, close = _summarizing_close(world)

    assert world.complete(close)["outcome"] == "summary_missing"
    assert world.close_stage(close) == "summarizing"

    attempt = _attempt_id()
    world.reserve_summary(close, attempt_id=attempt)
    world.save_summary(close, attempt_id=attempt, text=f"{ENDING_MARKER}\n\nBody.")

    assert world.complete(close)["outcome"] == "completed"


@pytest.mark.parametrize(
    ("mode", "purpose"),
    (("vote", "summary"), ("force", "forced_summary")),
)
def test_summary_ledger_purpose_follows_the_closing_mode(
    world: ClosingWorld, mode: str, purpose: str
):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode=mode)["closing"]
    if mode == "vote":
        assert world.close_stage(close) == "voting"
        # A single yes ballot is a strict majority of one.
        world.start_voting(close)
        votes = world.votes(meeting_id)
        assert len(votes) == 1
        attempt = _attempt_id()
        world.begin_vote(close, votes[0]["participant_id"], attempt_id=attempt)
        world.finish_vote(close, votes[0]["participant_id"], attempt_id=attempt)
        assert world.mark_stage(close, "voting", "summarizing") is True

    summary_attempt = _attempt_id()
    world.reserve_summary(close, attempt_id=summary_attempt)
    world.save_summary(
        close, attempt_id=summary_attempt, text="Body.", purpose=purpose
    )

    rows = world.ledger_rows(meeting_id)
    summary_rows = [row for row in rows if row[1] in {"summary", "forced_summary"}]
    assert len(summary_rows) == 1
    assert summary_rows[0][1] == purpose
