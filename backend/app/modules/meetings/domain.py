"""Meeting lifecycle domain rules (CONTRACTS sections 2-3,5).

Pure business rules: no FastAPI, Supabase, Qdrant, provider, or settings
imports. Application code owns transactions; infrastructure enforces the
same invariants at the SQL boundary for concurrent consistency.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class MeetingState(str, Enum):
    ACTIVE = "active"
    VOTING = "voting"
    ENDED = "ended"
    ARCHIVED = "archived"


def to_domain_state(status: MeetingState | str) -> MeetingState:
    """Convert a wire/status value to the canonical domain state.

    The API wire enum (MeetingStatus) and this domain enum share values;
    this helper is the single conversion point so the two cannot drift.
    """
    return MeetingState(str(status) if not isinstance(status, str) else status)


def to_wire_value(state: MeetingState | str) -> str:
    """Convert a domain state to its wire string value."""
    return MeetingState(state).value


class ArchiveRestoreError(ValueError):
    """Legacy archived records without provable prior state stay blocked."""


MAX_QUEUE_PENDING = 10
MAX_QUEUE_CHARS = 4000


def _conflict(message: str) -> ValueError:
    return ValueError(message)


def require_start_turn_eligible(
    *, status: MeetingState | str, has_active_work: bool, pending_queue: int
) -> None:
    """One active execution reservation per meeting (turn or ending attempt)."""
    state = MeetingState(status)
    if state is not MeetingState.ACTIVE:
        raise _conflict(f"cannot start turn while meeting is {state.value}")
    if has_active_work:
        raise _conflict("turn_in_progress: meeting already has active work")
    if pending_queue > 0:
        raise _conflict("queue_not_drained: pending user messages must drain first")


def require_end_eligible(
    *, status: MeetingState | str, has_active_work: bool, pending_queue: int
) -> None:
    state = MeetingState(status)
    if state is not MeetingState.ACTIVE:
        raise _conflict(f"cannot begin ending while meeting is {state.value}")
    if has_active_work:
        raise _conflict("turn_in_progress: finish active work before ending")
    if pending_queue > 0:
        raise _conflict("queue_not_drained: ending cannot bypass undrained entries")


def require_archive_eligible(
    *, status: MeetingState | str, has_active_work: bool, pending_queue: int
) -> MeetingState:
    state = MeetingState(status)
    if state not in (MeetingState.ACTIVE, MeetingState.ENDED):
        raise _conflict(f"cannot archive meeting in {state.value} state")
    if has_active_work:
        raise _conflict("turn_in_progress: archive requires idle meeting")
    if pending_queue > 0:
        raise _conflict("queue_not_drained: archive requires empty queue")
    return state


def require_unarchive_target(prior_state: Optional[MeetingState | str]) -> MeetingState:
    """Restore to the preserved prior state; never silently reopen ended."""
    if prior_state is None:
        raise ArchiveRestoreError("unknown prior state: explicit owner mapping required")
    try:
        state = MeetingState(prior_state)
    except ValueError as exc:
        raise ArchiveRestoreError(
            f"unmappable legacy archive state {prior_state!r}: explicit owner choice required"
        ) from exc
    if state is MeetingState.ARCHIVED:
        raise ArchiveRestoreError("archived prior state is not a restorable target")
    # Do not automatically reopen a previously ended meeting: return ENDED as-is.
    return state


@dataclass(frozen=True)
class VoteEvaluation:
    should_end: bool
    yes_count: int
    no_count: int
    invalid_count: int
    roster_count: int


def evaluate_votes(
    *, roster_count: int, yes_count: int, invalid_count: int, force: bool
) -> VoteEvaluation:
    """Strict majority of the frozen roster; ties fail; invalid = non-yes."""
    if roster_count < 0 or yes_count < 0 or invalid_count < 0:
        raise _conflict("vote counts cannot be negative")
    if yes_count + invalid_count > roster_count and not force:
        raise _conflict("vote counts exceed frozen roster")
    if roster_count == 0 and not force:
        raise _conflict("zero-participant vote fails eligibility; use force end")
    should_end = force or (roster_count > 0 and yes_count > roster_count / 2)
    no_count = max(roster_count - yes_count - invalid_count, 0)
    return VoteEvaluation(
        should_end=should_end,
        yes_count=yes_count,
        no_count=no_count,
        invalid_count=invalid_count,
        roster_count=roster_count,
    )


@dataclass(frozen=True)
class EndDecision:
    next_status: MeetingState
    attempt_outcome: str
    summary: Optional[str]


def decide_end(
    *,
    roster_count: int,
    yes_count: int,
    invalid_count: int,
    force: bool,
    summary_failed: bool,
    summary_text: Optional[str] = None,
) -> EndDecision:
    """Ending attempts freeze roster/transcript; failure restores active."""
    votes = evaluate_votes(
        roster_count=roster_count,
        yes_count=yes_count,
        invalid_count=invalid_count,
        force=force,
    )
    if not votes.should_end:
        return EndDecision(
            next_status=MeetingState.ACTIVE,
            attempt_outcome="rejected",
            summary=None,
        )
    if summary_failed or not summary_text:
        return EndDecision(
            next_status=MeetingState.ACTIVE,
            attempt_outcome="failed",
            summary=None,
        )
    return EndDecision(
        next_status=MeetingState.ENDED,
        attempt_outcome="completed",
        summary=summary_text,
    )


def validate_queue_content(content: str) -> str:
    text = (content or "").strip()
    if not text:
        raise _conflict("empty message: content must not be empty")
    if len(content) > MAX_QUEUE_CHARS:
        raise _conflict(f"oversized message: max {MAX_QUEUE_CHARS} characters")
    return text


_TRANSITIONS: dict[tuple[MeetingState, str], MeetingState] = {
    (MeetingState.ACTIVE, "start_turn"): MeetingState.ACTIVE,
    (MeetingState.ACTIVE, "begin_ending"): MeetingState.VOTING,
    (MeetingState.VOTING, "ending_accepted"): MeetingState.ENDED,
    (MeetingState.VOTING, "ending_rejected"): MeetingState.ACTIVE,
    (MeetingState.VOTING, "ending_failed"): MeetingState.ACTIVE,
    (MeetingState.ACTIVE, "force_end"): MeetingState.VOTING,
    (MeetingState.ACTIVE, "archive"): MeetingState.ARCHIVED,
    (MeetingState.ENDED, "archive"): MeetingState.ARCHIVED,
    (MeetingState.ARCHIVED, "unarchive_active"): MeetingState.ACTIVE,
    (MeetingState.ARCHIVED, "unarchive_ended"): MeetingState.ENDED,
}


def describe_transition(from_state: MeetingState | str, command: str) -> MeetingState:
    key = (MeetingState(from_state), command)
    if key not in _TRANSITIONS:
        raise _conflict(f"invalid transition: {from_state} + {command}")
    return _TRANSITIONS[key]
