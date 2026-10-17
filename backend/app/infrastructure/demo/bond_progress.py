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
    scenario_revision: int = 1


class JourneyProgressStore:
    """Progression with optional durable gateway; in-memory by default.

    When a Supabase-compatible client is supplied (table
    `demo_scenario_progress` from migration 008), each bootstrap/apply is
    persisted so restarts and second processes see the same authoritative
    (session, generation) -> meeting mapping. Without a client the store
    stays process-local (tests + local fixture runtime).
    """

    TABLE = "demo_scenario_progress"

    def __init__(
        self, meeting_factory: Optional[Callable[[str, int], str]] = None,
        client: Any = None,
    ) -> None:
        self._meeting_factory = meeting_factory or (
            lambda sid, gen: f"meeting-{sid}-{gen}"
        )
        self._states: dict[tuple[str, int], dict[str, Any]] = {}
        self._client = client

    # -- durable helpers -------------------------------------------------

    def _row(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "session_id": state["session_id"],
            "generation": state["generation"],
            "scenario_id": "indian-corporate-bond-review",
            "scenario_revision": state["scenario_revision"],
            "meeting_id": state["meeting_id"],
            "current_step": state["stage"],
            "completed_steps": list(state["completed"]),
            "idempotency_keys": dict(state["action_keys"]),
        }

    def _persist(self, state: dict[str, Any]) -> None:
        if self._client is None:
            return
        try:
            self._client.table(self.TABLE).upsert(
                self._row(state), on_conflict="session_id,generation"
            ).execute()
        except Exception:
            pass

    def _load(self, session_id: str, generation: int) -> Optional[dict[str, Any]]:
        if self._client is None:
            return None
        try:
            resp = (
                self._client.table(self.TABLE)
                .select("*")
                .eq("session_id", session_id)
                .eq("generation", generation)
                .limit(1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                return None
            row = rows[0]
            completed = list(row.get("completed_steps") or [])
            keys = dict(row.get("idempotency_keys") or {})
            return {
                "session_id": row["session_id"],
                "generation": int(row["generation"]),
                "scenario_revision": int(row.get("scenario_revision", 1)),
                "meeting_id": row.get("meeting_id"),
                "stage": row.get("current_step", "started"),
                "specialists": [
                    "credit-business",
                    "structure-downside",
                    "treasury-market",
                ],
                "completed": completed,
                "failed": False,
                "bootstrap_key": "",
                "action_keys": keys,
            }
        except Exception:
            return None

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
        self._persist(state)
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
        completed = state["completed"]
        if len(completed) >= len(JOURNEY_ACTION_IDS):
            # All ten steps committed: same action stays idempotent, anything
            # else is honestly rejected instead of IndexError.
            if action_id in completed:
                return self._view(state)
            raise ValueError("out of order: walkthrough complete")
        if idempotency_key in state["action_keys"]:
            return self._view(state)
        expected = JOURNEY_ACTION_IDS[len(completed)]
        if action_id != expected:
            raise ValueError(
                f"out of order: expected {expected}, got {action_id}"
            )
        state["completed"].append(action_id)
        state["action_keys"][idempotency_key] = action_id
        state["stage"] = action_id
        state["failed"] = False
        state["turn_reference"] = f"{state['meeting_id']}:{action_id}"
        self._persist(state)
        return self._view(state)

    def get(self, session_id: str, generation: int) -> ProgressView:
        state = self._states.get((session_id, generation))
        if state is None:
            loaded = self._load(session_id, generation)
            if loaded is not None:
                self._states[(session_id, generation)] = loaded
                return self._view(loaded)
            raise ValueError("walkthrough has not been bootstrapped")
        return self._view(state)

    def pin_meeting(self, session_id: str, generation: int,
                    meeting_id: str) -> ProgressView:
        """Bind the walkthrough to a REAL meeting id (idempotent).

        Used when the demo creates the actual board through the shared
        MeetingManager. Re-pinning a different second meeting is rejected so
        one (session, generation) stays pinned to one meeting.
        """
        state = self._states.get((session_id, generation))
        if state is None:
            loaded = self._load(session_id, generation)
            if loaded is None:
                raise ValueError("walkthrough has not been bootstrapped")
            state = loaded
            self._states[(session_id, generation)] = state
        current = state.get("meeting_id")
        if current and current != meeting_id and not str(current).startswith("meeting-"):
            raise ValueError("walkthrough already pinned to another meeting")
        state["meeting_id"] = meeting_id
        self._persist(state)
        return self._view(state)

    def find_by_meeting(self, meeting_id: str) -> Optional[ProgressView]:
        """Reverse lookup: which (session, generation) owns this meeting.

        Durable adapter queries by meeting_id; the in-memory store scans its
        states. Synthetic factory ids start with 'meeting-' so real demo
        meetings remain unambiguous.
        """
        if self._client is not None:
            try:
                resp = (
                    self._client.table(self.TABLE)
                    .select("*")
                    .eq("meeting_id", meeting_id)
                    .limit(1)
                    .execute()
                )
                rows = resp.data or []
                if rows:
                    row = rows[0]
                    sid = row["session_id"]
                    gen = int(row.get("generation", 1))
                    return self.get(sid, gen)
            except Exception:
                pass
        for (sid, gen), state in list(self._states.items()):
            if state.get("meeting_id") == meeting_id:
                return self._view(state)
        return None

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
            scenario_revision=int(state.get("scenario_revision", 1)),
        )
