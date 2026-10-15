"""Session/generation seams for the scaffold (no persistent runtime).

Persistent session lifecycle, expiry, and cleanup are owned by Phase 08.
This module specifies the integration shape with existing actor/runner
contracts using controlled test state only.
"""

import uuid
from dataclasses import dataclass, field


@dataclass
class ScaffoldSessionState:
    """Controlled test-only session state (one generation at a time)."""

    session_id: str
    generation: int = 1
    scenario_revision: int = 1
    active_turn_id: str | None = None
    # Idempotency keys seen for reset, scoped to this test session.
    reset_keys: dict[str, int] = field(default_factory=dict)


def create_session(scenario_revision: int = 1) -> ScaffoldSessionState:
    """Create a fresh controlled test session (no persistence)."""
    return ScaffoldSessionState(
        session_id=f"synthetic-session-{uuid.uuid4().hex[:12]}",
        generation=1,
        scenario_revision=scenario_revision,
    )


def reset_generation(
    state: ScaffoldSessionState,
    expected_generation: int,
    idempotency_key: str,
) -> ScaffoldSessionState:
    """Increment generation; fence old work. Retrying the same key is idempotent.

    Raises ValueError on stale generation so old workers cannot commit into
    the new generation.
    """
    if expected_generation != state.generation:
        raise ValueError(
            f"stale generation: expected {state.generation}, got {expected_generation}"
        )
    if idempotency_key in state.reset_keys:
        return state
    state.reset_keys[idempotency_key] = state.generation + 1
    state.generation += 1
    # Old turn ownership is fenced: a new generation starts with no active turn.
    state.active_turn_id = None
    return state
