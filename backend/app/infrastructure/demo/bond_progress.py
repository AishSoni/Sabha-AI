"""Journey progression: ordered stages, generation fencing, idempotent retries.

One walkthrough per (session, generation): bootstrap creates exactly one
meeting with the three bond specialists and pins the scenario revision.
Actions advance in JOURNEY_ACTION_IDS order; stale revisions, out-of-order
steps, generation mismatches and second instruments are rejected without
mutating progress. Failed turns stay retryable: mark_failed reopens the
current step so the next apply_action can proceed.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.infrastructure.demo.bond_scenario import VERIFIED_ISIN as PINNED_ISIN
from app.infrastructure.demo.bond_scripts import JOURNEY_ACTION_IDS


@dataclass
class ProgressView:
    session_id: str
    generation: int
    meeting_id: str
    stage: str
    specialists: list[str] = field(default_factory=list)
    completed: list[str] = field(default_factory=list)
    failed: bool = False
    turn_reference: Optional[str] = None


class JourneyProgressStore:
    """In-memory progression; persistence wiring owns the table mapping."""

    def __init__(
        self, meeting_factory: Optional[Callable[[str, int], str]] = None
    ) -> None:
        self._meeting_factory = meeting_factory or (
            lambda sid, gen: f"meeting-{sid}-{gen}"
        )
        self._states: dict[tuple[str, int], dict[str, Any]] = {}

    def bootstrap(
        self,
        *,
        session_id: str,
        generation: int,
        scenario_revision: int,
        idempotency_key: str,
    ) -> ProgressView:
        key = (session_id, generation)
        existing = self._states.get(key)
        if existing is not None:
            if existing["bootstrap_key"] == idempotency_key:
                return self._view(existing)
            if existing["meeting_id"] is not None:
                return self._view(existing)
        meeting_id = self._meeting_factory(session_id, generation)
        state = {
            "session_id": session_id,
            "generation": generation,
            "scenario_revision": scenario_revision,
            "meeting_id": meeting_id,
            "stage": "started",
            "specialists": [
                "credit-business",
                "structure-downside",
                "treasury-market",
            ],
            "completed": [],
            "failed": False,
            "bootstrap_key": idempotency_key,
            "action_keys": {},
        }
        self._states[key] = state
        return self._view(state)

    def apply_action(
        self,
        *,
        session_id: str,
        generation: int,
        action_id: str,
        scenario_revision: int,
        idempotency_key: str,
        instrument_ref: Optional[str] = None,
    ) -> ProgressView:
        key = (session_id, generation)
        state = self._states.get(key)
        if state is None:
            raise ValueError("walkthrough has not been bootstrapped")
        if instrument_ref is not None and instrument_ref != PINNED_ISIN:
            raise ValueError(
                "single-instrument walkthrough: second ISIN rejected"
            )
        if scenario_revision != state["scenario_revision"]:
            raise ValueError("stale revision: pinned content changed")
        if action_id not in JOURNEY_ACTION_IDS:
            raise ValueError(f"unsupported journey action: {action_id}")
        if idempotency_key in state["action_keys"]:
            return self._view(state)
        expected = JOURNEY_ACTION_IDS[len(state["completed"])]
        if action_id != expected:
            raise ValueError(
                f"out of order: expected {expected}, got {action_id}"
            )
        state["completed"].append(action_id)
        state["action_keys"][idempotency_key] = action_id
        state["stage"] = action_id
        state["failed"] = False
        state["turn_reference"] = f"{state['meeting_id']}:{action_id}"
        return self._view(state)

    def mark_failed(self, *, session_id: str, generation: int, action_id: str) -> None:
        state = self._states.get((session_id, generation))
        if state is None or action_id not in state["completed"]:
            raise ValueError("unknown completed action to mark failed")
        state["completed"].remove(action_id)
        state["failed"] = True
        state["stage"] = state["completed"][-1] if state["completed"] else "started"

    def _view(self, state: dict[str, Any]) -> ProgressView:
        return ProgressView(
            session_id=state["session_id"],
            generation=state["generation"],
            meeting_id=state["meeting_id"],
            stage=state["stage"],
            specialists=list(state["specialists"]),
            completed=list(state["completed"]),
            failed=state["failed"],
            turn_reference=state.get("turn_reference"),
        )
