"""SQLite reservation/finalization atomicity (real SQL transactions)."""

import pytest

from app.modules.meetings.store import IdempotencyConflict, SqliteTurnLedger, TurnConflict


def test_reserve_enforces_single_active_turn_and_idempotent_retry():
    ledger = SqliteTurnLedger()
    first = ledger.reserve("m1", "p1", "k1", {"a": 1})
    same = ledger.reserve("m1", "p1", "k1", {"a": 1})
    assert same == first
    with pytest.raises((TurnConflict, IdempotencyConflict, Exception)):
        ledger.reserve("m1", "p2", "k2", {"a": 1})


def test_idempotency_key_with_different_payload_fails():
    ledger = SqliteTurnLedger()
    ledger.reserve("m1", "p1", "k", {"a": 1})
    with pytest.raises(IdempotencyConflict):
        ledger.reserve("m1", "p1", "k", {"a": 2})


def test_finalize_is_atomic_and_retry_returns_original_state():
    ledger = SqliteTurnLedger()
    turn_id = ledger.reserve("m1", "p1", "k1", {})
    ledger.finalize(turn_id, "completed", message_id="msg1", usage={"total_tokens": 5}, cost=0.01)
    state = ledger.get(turn_id)
    assert state["state"] == "completed"
    assert state["result_message_id"] == "msg1"
    # Idempotent retry does not overwrite the committed outcome.
    ledger.finalize(turn_id, "completed", message_id="msg1", usage={"total_tokens": 5}, cost=0.01)
    assert ledger.get(turn_id)["result_message_id"] == "msg1"


def test_crash_between_message_and_terminal_rolls_back():
    ledger = SqliteTurnLedger()
    turn_id = ledger.reserve("m1", "p1", "k1", {})
    with pytest.raises(RuntimeError):
        ledger.finalize(turn_id, "completed", message_id="msg1", fail_after_message=True)
    state = ledger.get(turn_id)
    assert state["state"] == "pending"
    assert state["result_message_id"] is None
