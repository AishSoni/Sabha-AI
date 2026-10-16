"""Scenario progression: ordered stages, fencing, idempotent retries."""

import pytest

pytestmark = pytest.mark.anyio


def _store():
    from app.infrastructure.demo.bond_progress import JourneyProgressStore

    created = []

    def _meeting_factory(session_id, generation):
        mid = f"meeting-{session_id}-{generation}"
        created.append(mid)
        return mid

    return JourneyProgressStore(meeting_factory=_meeting_factory), created


def test_bootstrap_creates_one_meeting_with_three_specialists():
    from app.infrastructure.demo.bond_progress import JourneyProgressStore

    store, created = _store()
    view = store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    assert view.meeting_id == "meeting-s1-1"
    assert view.stage == "started"
    assert view.specialists == [
        "credit-business",
        "structure-downside",
        "treasury-market",
    ]
    assert created == ["meeting-s1-1"]


def test_bootstrap_is_idempotent_on_same_key():
    store, created = _store()
    first = store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    second = store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    assert first.meeting_id == second.meeting_id
    assert created == ["meeting-s1-1"]


def test_actions_advance_in_order_and_reject_repeats():
    store, _ = _store()
    store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    first = store.apply_action(
        session_id="s1",
        generation=1,
        action_id="start_walkthrough",
        scenario_revision=1,
        idempotency_key="act-key-0001",
    )
    assert first.stage == "start_walkthrough"
    with pytest.raises(ValueError, match="out of order"):
        store.apply_action(
            session_id="s1",
            generation=1,
            action_id="ask_credit_analysis",
            scenario_revision=1,
            idempotency_key="act-key-0002",
        )


def test_stale_revision_rejected_and_failed_turn_retryable():
    store, _ = _store()
    store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    with pytest.raises(ValueError, match="stale revision"):
        store.apply_action(
            session_id="s1",
            generation=1,
            action_id="start_walkthrough",
            scenario_revision=0,
            idempotency_key="act-key-0003",
        )
    ok = store.apply_action(
        session_id="s1",
        generation=1,
        action_id="start_walkthrough",
        scenario_revision=1,
        idempotency_key="act-key-0004",
    )
    assert ok.failed is False
    store.mark_failed(session_id="s1", generation=1, action_id="start_walkthrough")
    retry = store.apply_action(
        session_id="s1",
        generation=1,
        action_id="start_walkthrough",
        scenario_revision=1,
        idempotency_key="act-key-0005",
    )
    assert retry.stage == "start_walkthrough"
    nxt = store.apply_action(
        session_id="s1",
        generation=1,
        action_id="inspect_board",
        scenario_revision=1,
        idempotency_key="act-key-0006",
    )
    assert nxt.stage == "inspect_board"


def test_second_instrument_rejected():
    store, _ = _store()
    store.bootstrap(
        session_id="s1", generation=1, scenario_revision=1, idempotency_key="boot-key-1"
    )
    with pytest.raises(ValueError, match="single-instrument"):
        store.apply_action(
            session_id="s1",
            generation=1,
            action_id="start_walkthrough",
            scenario_revision=1,
            idempotency_key="act-key-0006",
            instrument_ref="INE999999999",
        )
