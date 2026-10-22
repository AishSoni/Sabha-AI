"""Closing domain rules (spec 08).

The vote helper only decides whether a recorded round is a strict
majority; it does not authorize ending. Stage mapping keeps mode and
pre-close lifecycle separate from persisted operation progress.
"""

import pytest

from app.modules.meetings.domain.services import (
    ClosingMode,
    ClosingStage,
    OPEN_STAGES,
    RECOVERABLE_STAGES,
    TERMINAL_STAGES,
    VoteTally,
    has_strict_majority,
    requires_vote,
    stage_after_drain,
    tally_votes,
)


def test_tie_is_not_a_majority():
    assert not has_strict_majority(1, 2)
    assert not has_strict_majority(0, 0)
    assert not has_strict_majority(2, 4)


def test_strict_majority():
    assert has_strict_majority(2, 3)
    assert has_strict_majority(1, 1)
    assert has_strict_majority(1, 2) is False


@pytest.mark.parametrize(
    ("yes_count", "eligible_count"),
    [(-1, 0), (0, -1), (2, 1), (3, 2)],
)
def test_invalid_vote_counts_are_programming_errors(yes_count, eligible_count):
    with pytest.raises(ValueError):
        has_strict_majority(yes_count, eligible_count)


def test_error_ballots_count_as_not_yes_but_stay_eligible():
    tally = tally_votes([True, False, None])
    assert tally == VoteTally(yes_count=1, eligible_count=3, error_count=1)
    assert not tally.passed


def test_an_error_ballot_can_still_leave_a_passing_majority():
    tally = tally_votes([True, True, None])
    assert tally.yes_count == 2
    assert tally.eligible_count == 3
    assert tally.error_count == 1
    assert tally.passed


def test_empty_round_does_not_pass():
    tally = tally_votes([])
    assert tally.eligible_count == 0
    assert not tally.passed


def test_only_boolean_and_error_ballots_are_accepted():
    with pytest.raises(ValueError):
        tally_votes([1])


def test_force_end_skips_voting_but_a_voting_meeting_never_revotes():
    assert stage_after_drain(ClosingMode.FORCE, "active") is ClosingStage.SUMMARIZING
    assert stage_after_drain(ClosingMode.VOTE, "active") is ClosingStage.VOTING
    # A retry/resume of an already-authorized close resumes at the summary.
    assert stage_after_drain(ClosingMode.VOTE, "voting") is ClosingStage.SUMMARIZING
    assert stage_after_drain(ClosingMode.FORCE, "voting") is ClosingStage.SUMMARIZING


def test_vote_requirement_matches_stage_mapping():
    assert requires_vote("vote", "active")
    assert not requires_vote("force", "active")
    assert not requires_vote("vote", "voting")


def test_uncoordinated_lifecycle_states_cannot_start_a_close():
    with pytest.raises(ValueError):
        stage_after_drain(ClosingMode.VOTE, "ended")
    with pytest.raises(ValueError):
        stage_after_drain(ClosingMode.FORCE, "archived")
    with pytest.raises(ValueError):
        requires_vote("shutdown", "active")


def test_stage_partitions():
    assert TERMINAL_STAGES == {
        ClosingStage.REJECTED,
        ClosingStage.ABORTED,
        ClosingStage.COMPLETED,
    }
    assert OPEN_STAGES == {
        ClosingStage.DRAINING,
        ClosingStage.VOTING,
        ClosingStage.SUMMARIZING,
        ClosingStage.FAILED,
    }
    assert RECOVERABLE_STAGES == {ClosingStage.FAILED}
    assert all(stage.is_terminal for stage in TERMINAL_STAGES)
    assert all(stage.is_open and not stage.is_terminal for stage in OPEN_STAGES)
