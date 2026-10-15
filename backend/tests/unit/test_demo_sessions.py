"""Scaffold session/generation seams stay isolated to test state."""

import pytest

from app.infrastructure.demo.sessions import (
    create_session,
    reset_generation,
)


def test_reset_increments_generation_and_fences_old_turn():
    state = create_session()
    state.active_turn_id = "turn-old"
    reset_generation(state, expected_generation=1, idempotency_key="reset-1")
    assert state.generation == 2
    assert state.active_turn_id is None


def test_reset_is_idempotent_for_same_key():
    state = create_session()
    reset_generation(state, expected_generation=1, idempotency_key="same-key")
    reset_generation(state, expected_generation=2, idempotency_key="same-key-new-gen")
    assert state.generation == 3


def test_stale_generation_is_rejected():
    state = create_session()
    reset_generation(state, expected_generation=1, idempotency_key="k1")
    with pytest.raises(ValueError, match="stale generation"):
        reset_generation(state, expected_generation=1, idempotency_key="k2")


def test_sessions_are_isolated():
    first = create_session()
    second = create_session()
    assert first.session_id != second.session_id
    reset_generation(first, expected_generation=1, idempotency_key="only-first")
    assert first.generation == 2
    assert second.generation == 1
