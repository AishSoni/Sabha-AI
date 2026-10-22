"""Coordinated closing admission and drain acceptance tests (spec 08).

Every assertion goes through the real closing RPCs against the disposable
Postgres database. The database is the only place the admission/drain
guarantees exist, so these tests deliberately avoid an in-memory oracle.

A close request must close admission in the same transaction that records
the closing operation, cancel waiting turns, and leave the sole executing
turn alone to reach its own committed terminal outcome.
"""

from __future__ import annotations

import pytest

from tests.doubles.closing import ENDING_MARKER, ClosingWorld


@pytest.fixture()
def world(disposable_db) -> ClosingWorld:
    return ClosingWorld(disposable_db, lease_seconds=30)


def test_end_cancels_waiting_but_drains_running(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    running_submission = world.submit(meeting_id, participant_id, key="first")
    waiting_submission = world.submit(meeting_id, participant_id, key="second")
    running = world.claim_running(meeting_id)

    assert running["id"] == running_submission["operation"]["id"]

    close = world.request(meeting_id, mode="vote")["closing"]

    assert world.turn_status(waiting_submission["operation"]["id"]) == "cancelled"
    assert world.turn_status(running_submission["operation"]["id"]) == "executing"
    assert world.close_stage(close) == "draining"
    assert world.final_summary_count(meeting_id) == 0
    assert world.pending_turn_count(meeting_id) == 0
    assert world.meeting_status(meeting_id) == "voting"

    # Admission is already closed; no stale precheck can slip a turn in.
    late = world.submit(meeting_id, participant_id, key="third")
    assert late["outcome"] == "meeting_closed"

    # Draining is a hard barrier: voting cannot start while the turn runs.
    assert world.mark_stage(close, "draining", "voting") is False

    world.complete_running(running)

    assert world.mark_stage(close, "draining", "voting") is True
    assert world.close_stage(close) == "voting"


def test_force_end_drains_without_voting(world: ClosingWorld):
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="first")
    running = world.claim_running(meeting_id)

    close = world.request(meeting_id, mode="force")["closing"]

    assert world.close_stage(close) == "draining"
    assert world.final_summary_count(meeting_id) == 0

    world.complete_running(running)

    assert world.mark_stage(close, "draining", "summarizing") is True
    assert world.close_stage(close) == "summarizing"
    assert world.meeting_status(meeting_id) == "voting"


def test_force_end_without_running_work_starts_summarizing(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()

    close = world.request(meeting_id, mode="force")["closing"]

    assert world.close_stage(close) == "summarizing"
    assert world.meeting_status(meeting_id) == "voting"


def test_request_on_a_meeting_already_voting_skips_voting(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()
    with world.db.connect() as conn:
        conn.execute(
            "UPDATE meetings SET status = 'voting' WHERE id = %s", (meeting_id,)
        )

    close = world.request(meeting_id, key="first")["closing"]

    assert close["from_status"] == "voting"
    assert world.close_stage(close) == "summarizing"


def test_request_is_idempotent_for_same_key_and_resumes_the_open_operation(
    world: ClosingWorld,
):
    meeting_id, _participant_id = world.seed_active_meeting()

    first = world.request(meeting_id, key="close-1")
    repeated = world.request(meeting_id, key="close-1")
    other_key = world.request(meeting_id, key="close-2")

    assert first["outcome"] == "created"
    assert first["closing"]["from_status"] == "active"
    assert repeated["outcome"] == "resumed"
    assert repeated["closing"]["id"] == first["closing"]["id"]
    assert other_key["outcome"] == "resumed"
    assert other_key["closing"]["id"] == first["closing"]["id"]

    count = world.db.query(
        "SELECT COUNT(*) FROM meeting_closings WHERE meeting_id = %s",
        (meeting_id,),
    )[0][0]
    assert count == 1


def test_request_versus_claim_race_never_leaves_a_pending_turn_or_an_open_door(
    world: ClosingWorld,
):
    meeting_id, participant_id = world.seed_active_meeting()
    submission = world.submit(meeting_id, participant_id, key="first")

    close_result, claim = world.run_pair(
        lambda: world.request(meeting_id, mode="vote"),
        lambda: world.worker("racer").claim(meeting_id),
    )

    close = close_result["closing"]
    assert world.meeting_status(meeting_id) == "voting"
    assert world.pending_turn_count(meeting_id) == 0
    assert world.submit(meeting_id, participant_id, key="late")["outcome"] == (
        "meeting_closed"
    )

    if claim is None:
        # The request won the meeting lock before any claim existed.
        assert world.close_stage(close) == "voting"
        assert world.turn_status(submission["operation"]["id"]) == "cancelled"
    else:
        # The claim won and must drain; it is never cancellation-requested.
        assert claim["id"] == submission["operation"]["id"]
        assert world.close_stage(close) == "draining"
        assert world.turn_status(submission["operation"]["id"]) == "executing"
        world.complete_running(claim)
        assert world.mark_stage(close, "draining", "voting") is True


def test_rejected_vote_reopens_active_admission_but_not_cancelled_turns(
    world: ClosingWorld,
):
    meeting_id, participant_id = world.seed_active_meeting()
    waiting = world.submit(meeting_id, participant_id, key="waiting")
    close = world.request(meeting_id, mode="vote")["closing"]

    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"
    assert world.reject(close) is True

    assert world.close_stage(close) == "rejected"
    assert world.meeting_status(meeting_id) == "active"
    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"

    accepted = world.submit(meeting_id, participant_id, key="after-reject")
    assert accepted["outcome"] == "created"

    # A rejected closing is terminal; it cannot be aborted or retried.
    assert world.abort(close) is False
    assert world.retry(close) is False
    assert world.meeting_status(meeting_id) == "active"


def test_abort_restores_active_admission_and_keeps_cancelled_turns_cancelled(
    world: ClosingWorld,
):
    meeting_id, participant_id = world.seed_active_meeting()
    waiting = world.submit(meeting_id, participant_id, key="waiting")
    close = world.request(meeting_id, mode="vote")["closing"]

    assert world.abort(close) is True

    assert world.close_stage(close) == "aborted"
    assert world.meeting_status(meeting_id) == "active"
    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"
    assert world.request(meeting_id, key="again")["outcome"] == "created"


def test_failed_closing_retries_into_its_checkpointed_stage(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="force")["closing"]

    assert world.fail(close, "summarizing", code="provider_error") is True
    assert world.retry(close) is True
    assert world.close_stage(close) == "summarizing"

    failed = world.read(meeting_id)["closing"]
    assert failed["failed_from_stage"] is None
    assert failed["error_code"] is None


def test_completion_is_at_most_once_and_never_reopens(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="force")["closing"]
    assert world.close_stage(close) == "summarizing"

    assert world.complete(close)["outcome"] == "summary_missing"

    summary = f"{ENDING_MARKER}\n\nCommitted once."
    assert world.checkpoint_summary(close, summary)

    completed = world.complete(close)
    assert completed["outcome"] == "completed"
    message_id = completed["message_id"]
    assert world.meeting_status(meeting_id) == "ended"
    assert world.final_summary_count(meeting_id) == 1
    assert world.close_stage(close) == "completed"

    repeated = world.complete(close)
    assert repeated["outcome"] == "completed"
    assert repeated["message_id"] == message_id
    assert world.final_summary_count(meeting_id) == 1

    assert world.abort(close) is False
    assert world.retry(close) is False
    assert world.request(meeting_id, key="new")["outcome"] == "meeting_closed"
    assert world.meeting_status(meeting_id) == "ended"

    row = world.db.query(
        "SELECT content FROM messages WHERE id = %s", (message_id,)
    )[0]
    assert row[0] == summary
