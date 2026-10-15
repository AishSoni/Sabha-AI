"""Meeting lifecycle transition matrix (CONTRACTS sections 2-3,5).

Pure domain: no FastAPI, Supabase, provider, or network imports.
Covers valid/invalid transitions, busy state, queue barrier,
archive restoration, and legacy unknown-state cases.
"""

import pytest

from app.modules.meetings.domain import (
    ArchiveRestoreError,
    MeetingState,
    decide_end,
    describe_transition,
    evaluate_votes,
    require_archive_eligible,
    require_end_eligible,
    require_start_turn_eligible,
    require_unarchive_target,
    validate_queue_content,
)


@pytest.mark.anyio
async def test_start_turn_allowed_only_when_idle_and_queue_empty():
    require_start_turn_eligible(
        status=MeetingState.ACTIVE, has_active_work=False, pending_queue=0
    )
    with pytest.raises(ValueError):
        require_start_turn_eligible(
            status=MeetingState.ACTIVE, has_active_work=True, pending_queue=0
        )
    with pytest.raises(ValueError):
        require_start_turn_eligible(
            status=MeetingState.ACTIVE, has_active_work=False, pending_queue=2
        )
    with pytest.raises(ValueError):
        require_start_turn_eligible(
            status=MeetingState.VOTING, has_active_work=False, pending_queue=0
        )


@pytest.mark.anyio
async def test_end_requires_idle_and_drained_queue():
    require_end_eligible(status=MeetingState.ACTIVE, has_active_work=False, pending_queue=0)
    with pytest.raises(ValueError):
        require_end_eligible(status=MeetingState.ACTIVE, has_active_work=True, pending_queue=0)
    with pytest.raises(ValueError):
        require_end_eligible(status=MeetingState.ACTIVE, has_active_work=False, pending_queue=1)
    with pytest.raises(ValueError):
        require_end_eligible(status=MeetingState.ENDED, has_active_work=False, pending_queue=0)


@pytest.mark.anyio
async def test_vote_majority_tie_zero_roster_invalid_votes():
    # Strict majority wins.
    assert evaluate_votes(roster_count=3, yes_count=2, invalid_count=0, force=False).should_end is True
    # Ties fail.
    assert evaluate_votes(roster_count=4, yes_count=2, invalid_count=0, force=False).should_end is False
    # Invalid votes count as non-yes.
    result = evaluate_votes(roster_count=3, yes_count=1, invalid_count=2, force=False)
    assert result.should_end is False
    assert result.invalid_count == 2
    # Zero-participant normal vote fails eligibility.
    with pytest.raises(ValueError):
        evaluate_votes(roster_count=0, yes_count=0, invalid_count=0, force=False)
    # Force-ending with zero roster may still summarize the transcript.
    forced = evaluate_votes(roster_count=0, yes_count=0, invalid_count=0, force=True)
    assert forced.should_end is True


@pytest.mark.anyio
async def test_archive_requires_idle_and_records_prior_state():
    prior = require_archive_eligible(
        status=MeetingState.ACTIVE, has_active_work=False, pending_queue=0
    )
    assert prior == MeetingState.ACTIVE
    prior_ended = require_archive_eligible(
        status=MeetingState.ENDED, has_active_work=False, pending_queue=0
    )
    assert prior_ended == MeetingState.ENDED
    with pytest.raises(ValueError):
        require_archive_eligible(
            status=MeetingState.ACTIVE, has_active_work=True, pending_queue=0
        )
    with pytest.raises(ValueError):
        require_archive_eligible(
            status=MeetingState.ACTIVE, has_active_work=False, pending_queue=1
        )


@pytest.mark.anyio
async def test_unarchive_never_silently_reopens_ended_and_blocks_unknown():
    assert require_unarchive_target(prior_state=MeetingState.ACTIVE) == MeetingState.ACTIVE
    # Previously ended meetings stay ended, they are not reopened.
    assert require_unarchive_target(prior_state=MeetingState.ENDED) == MeetingState.ENDED
    with pytest.raises(ArchiveRestoreError):
        require_unarchive_target(prior_state=None)
    with pytest.raises(ArchiveRestoreError):
        require_unarchive_target(prior_state="mystery-legacy-state")


@pytest.mark.anyio
async def test_queue_content_bounds_reject_empty_and_oversized():
    validate_queue_content("hello")
    with pytest.raises(ValueError):
        validate_queue_content("   ")
    with pytest.raises(ValueError):
        validate_queue_content("x" * 4001)


@pytest.mark.anyio
async def test_transition_table_covers_all_states_and_negative_cases():
    cases = [
        (MeetingState.ACTIVE, "start_turn", MeetingState.ACTIVE),
        (MeetingState.ACTIVE, "begin_ending", MeetingState.VOTING),
        (MeetingState.VOTING, "ending_accepted", MeetingState.ENDED),
        (MeetingState.VOTING, "ending_rejected", MeetingState.ACTIVE),
        (MeetingState.ACTIVE, "force_end", MeetingState.VOTING),
        (MeetingState.ACTIVE, "archive", MeetingState.ARCHIVED),
        (MeetingState.ENDED, "archive", MeetingState.ARCHIVED),
        (MeetingState.ARCHIVED, "unarchive_active", MeetingState.ACTIVE),
        (MeetingState.ARCHIVED, "unarchive_ended", MeetingState.ENDED),
    ]
    for from_state, command, to_state in cases:
        assert describe_transition(from_state, command) == to_state
    with pytest.raises(ValueError):
        describe_transition(MeetingState.ENDED, "start_turn")
    with pytest.raises(ValueError):
        describe_transition(MeetingState.VOTING, "start_turn")
    with pytest.raises(ValueError):
        describe_transition(MeetingState.ARCHIVED, "start_turn")


@pytest.mark.anyio
async def test_failed_ending_restores_active_without_misleading_summary():
    outcome = decide_end(
        roster_count=3, yes_count=1, invalid_count=0, force=False, summary_failed=False
    )
    assert outcome.next_status == MeetingState.ACTIVE
    assert outcome.summary is None
    failed_summary = decide_end(
        roster_count=3, yes_count=3, invalid_count=0, force=False, summary_failed=True
    )
    assert failed_summary.next_status == MeetingState.ACTIVE
    assert failed_summary.summary is None
    assert failed_summary.attempt_outcome == "failed"
