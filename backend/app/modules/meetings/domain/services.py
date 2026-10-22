"""Closing rules: lifecycle, stages, and strict-majority voting (spec 08).

These helpers decide *what* a closing round means; they never authorize
ending a meeting by themselves. Drain coordination, force-end, guarded
persistence, and the once-only ended commit belong to the application
workflow and its transactional adapters.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Sequence


class ClosingMode(str, Enum):
    """How a requested close should settle the decision."""

    VOTE = "vote"
    FORCE = "force"


class ClosingStage(str, Enum):
    """Persisted progress of a closing operation.

    Meeting ``status`` is a separate lifecycle axis
    (``active -> voting -> ended`` plus the ``archived`` presentation
    overlay); a closing stage describes one operation's progress.
    """

    DRAINING = "draining"
    VOTING = "voting"
    SUMMARIZING = "summarizing"
    FAILED = "failed"
    REJECTED = "rejected"
    ABORTED = "aborted"
    COMPLETED = "completed"

    @property
    def is_terminal(self) -> bool:
        return self in TERMINAL_STAGES

    @property
    def is_open(self) -> bool:
        return self in OPEN_STAGES

    @property
    def is_recoverable(self) -> bool:
        return self is ClosingStage.FAILED

    @property
    def is_abortable(self) -> bool:
        return self in ABORTABLE_STAGES


TERMINAL_STAGES = frozenset(
    {
        ClosingStage.REJECTED,
        ClosingStage.ABORTED,
        ClosingStage.COMPLETED,
    }
)

OPEN_STAGES = frozenset(
    {
        ClosingStage.DRAINING,
        ClosingStage.VOTING,
        ClosingStage.SUMMARIZING,
        ClosingStage.FAILED,
    }
)

#: Stages a rejected/aborted operation may still be retried from.
RECOVERABLE_STAGES = frozenset({ClosingStage.FAILED})

#: Stages an operator may explicitly abandon back to active admission.
ABORTABLE_STAGES = frozenset(
    {ClosingStage.DRAINING, ClosingStage.VOTING, ClosingStage.FAILED}
)

#: Meeting lifecycle values that can start a closing operation.
COORDINATED_STATUSES = frozenset({"active", "voting"})


def has_strict_majority(yes_count: int, eligible_count: int) -> bool:
    """Return True only for a strict majority of eligible ballots.

    A tie is never a majority, and an empty electorate cannot pass.
    Invalid count pairs are programming errors, not a silent "no".
    """
    if eligible_count < 0 or not 0 <= yes_count <= eligible_count:
        raise ValueError("Invalid vote counts")
    return eligible_count > 0 and yes_count * 2 > eligible_count


def requires_vote(mode: ClosingMode | str, from_status: str) -> bool:
    """Whether this close must run a ballot before summarizing.

    Force-end skips voting. A meeting already in ``voting`` (a previous
    round was interrupted, or a retry resumed it) has already authorized
    the close, so a new close resumes at summarizing.
    """
    mode = ClosingMode(mode)
    if from_status not in COORDINATED_STATUSES:
        raise ValueError(f"Meeting status {from_status!r} cannot be closed")
    return mode is ClosingMode.VOTE and from_status == "active"


def stage_after_drain(mode: ClosingMode | str, from_status: str) -> ClosingStage:
    """First post-drain stage for a newly admitted closing operation."""
    return ClosingStage.VOTING if requires_vote(mode, from_status) else ClosingStage.SUMMARIZING


@dataclass(frozen=True)
class VoteTally:
    """Aggregate of one round's ballots, including error ballots."""

    yes_count: int
    eligible_count: int
    error_count: int = 0

    @property
    def passed(self) -> bool:
        return has_strict_majority(self.yes_count, self.eligible_count)


def tally_votes(votes: Sequence[bool | None]) -> VoteTally:
    """Tally ballots where ``None`` is a failed/error ballot.

    Error ballots remain part of the eligible electorate and never count
    as yes, preserving the product rule that a provider failure is a no
    vote rather than an abstention or a missing participant.
    """
    yes_count = 0
    error_count = 0
    for vote in votes:
        if vote is None:
            error_count += 1
        elif vote is True:
            yes_count += 1
        elif vote is False:
            pass
        else:
            raise ValueError("A ballot must be True, False, or None")
    return VoteTally(
        yes_count=yes_count,
        eligible_count=len(votes),
        error_count=error_count,
    )
