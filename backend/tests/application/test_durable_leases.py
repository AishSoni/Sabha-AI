"""Durable lease guarantees: single-winner claims across turn/ending races,
fencing after expiry, startup recovery without paid-call replay, generation
revocation, and bounded retry classification (P04 TEST02/TEST06/TEST09)."""

import threading

import pytest

from app.modules.meetings.leases import (
    DurableCoordinator,
    LeaseConflict,
    classify_retry,
)

needs_anyio = pytest.mark.anyio


def _controlled_time(start=1000.0):
    now = [start]
    return now, lambda: now[0]


def test_race_two_turns_and_turn_vs_ending_single_winner():
    now, clock = _controlled_time()
    store = DurableCoordinator(now_fn=clock)
    winners = {}

    def claim_turn_b():
        try:
            winners["b"] = store.peer().claim("m", "turn-B", "turn", ttl_seconds=30)
        except LeaseConflict as exc:  # noqa: BLE001
            winners["b"] = exc

    store.claim("m", "turn-A", "turn", ttl_seconds=30)
    thread = threading.Thread(target=claim_turn_b)
    thread.start()
    thread.join()
    assert isinstance(winners["b"], LeaseConflict)

    # A turn and an ending attempt serialize on the same boundary.
    store2 = DurableCoordinator()
    store2.claim("m2", "turn-A", "turn", ttl_seconds=30)
    with pytest.raises(LeaseConflict):
        store2.peer().claim("m2", "ending-A", "ending", ttl_seconds=30)


def test_expired_holder_is_fenced_and_cannot_finalize():
    now, clock = _controlled_time()
    store = DurableCoordinator(now_fn=clock)
    token = store.claim("m", "turn-A", "turn", ttl_seconds=10)
    assert store.heartbeat("m", "turn-A", token, ttl_seconds=10) is True
    now[0] += 60.0  # lease lapses with no heartbeat
    assert store.heartbeat("m", "turn-A", token) is False
    assert store.complete("m", "turn-A", token, "completed") is False
    # A new worker takes over with a higher fencing token.
    token2 = store.claim("m", "turn-B", "turn", ttl_seconds=30)
    assert token2 > token
    assert store.complete("m", "turn-B", token2, "completed") is True


def test_restart_recovery_separates_safe_from_uncertain_work():
    now, clock = _controlled_time()
    store = DurableCoordinator(now_fn=clock)
    store.claim("m-safe", "turn-1", "turn", ttl_seconds=10)
    store.claim("m-risky", "turn-2", "turn", ttl_seconds=10)
    token = store.claim("m-risky2", "turn-3", "turn", ttl_seconds=10)
    store.mark_provider_started("m-risky2", "turn-3", token)
    now[0] += 120.0
    report = {r["meeting_id"]: r["disposition"] for r in store.reconcile()}
    assert report["m-safe"] == "failed_safe"
    assert report["m-risky"] == "failed_safe"
    assert report["m-risky2"] == "interrupted"
    # Uncertain paid work is never replayed: the holder stays fenced.
    assert store.complete("m-risky2", "turn-3", token, "completed") is False
    # Committed effects are retained as visible history.
    kinds = {h["disposition"] for h in store.history("m-risky2")}
    assert "interrupted" in kinds


def test_generation_revocation_fences_old_holder_mid_race():
    _, clock = _controlled_time()
    store = DurableCoordinator(now_fn=clock)
    token = store.claim("m", "turn-old", "turn", ttl_seconds=300)
    store.revoke_generation("m", new_generation=2)
    assert store.heartbeat("m", "turn-old", token) is False
    assert store.complete("m", "turn-old", token, "completed") is False
    fresh = store.claim("m", "turn-new", "turn", ttl_seconds=300)
    assert fresh > token
    assert store.complete("m", "turn-new", fresh, "completed") is True


def test_retry_classification_never_replays_uncertain_calls():
    assert classify_retry("transport_reset", started_provider_work=False) == "retryable"
    assert classify_retry("transport_reset", started_provider_work=True) == "interrupted"
    assert classify_retry("invalid_arguments", started_provider_work=False) == "terminal"
    assert classify_retry("provider_error", started_provider_work=False) == "terminal"


# --------------------------------------------------------------------------
# Engine wiring: leases guard the live turn loop (no second engine here).
# --------------------------------------------------------------------------

def _leased_engine(meeting, provider, coordinator, **kwargs):
    from tests.application.test_turn_engine import FakeKnowledge, FakeMeetings, _engine

    engine, store = _engine(meeting, provider, FakeKnowledge(), **kwargs)
    engine._leases = coordinator
    engine._lease_ttl = 60.0
    engine._lease_tokens = {}
    return engine, store


@needs_anyio
async def test_engine_run_claims_lease_and_completes_it():
    from app.llm.base import LLMResponse
    from tests.application.test_turn_engine import FakeProvider, _meeting

    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="done", usage={})])
    coordinator = DurableCoordinator()
    engine, _ = _leased_engine(meeting, provider, coordinator)
    result = await engine.run("m1", "p1", idempotency_key="leased-ok")
    assert result.state == "completed"
    assert len(engine._meetings.saved_messages) == 1
    assert coordinator.holder_generation("m1") == 1
    assert coordinator.history("m1")[-1]["disposition"] == "completed"


@needs_anyio
async def test_engine_loses_race_when_lease_held_elsewhere():
    import pytest

    from app.llm.base import LLMResponse
    from app.modules.meetings.store import TurnConflict
    from tests.application.test_turn_engine import FakeProvider, _meeting

    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="done", usage={})])
    coordinator = DurableCoordinator()
    coordinator.claim("m1", "turn-elsewhere", "turn", ttl_seconds=300)
    engine, _ = _leased_engine(meeting, provider, coordinator)
    with pytest.raises(TurnConflict):
        await engine.run("m1", "p1", idempotency_key="leased-race")
    assert engine._meetings.saved_messages == []


@needs_anyio
async def test_fenced_worker_finalizes_nothing():
    import pytest

    from app.llm.base import LLMResponse
    from app.modules.meetings.engine import TurnFailure
    from tests.application.test_turn_engine import FakeProvider, _meeting

    meeting = _meeting()
    provider = FakeProvider([LLMResponse(content="done", usage={})])
    coordinator = DurableCoordinator()
    engine, _ = _leased_engine(meeting, provider, coordinator)
    coordinator.complete = lambda *a, **k: False  # lease lost mid-turn
    with pytest.raises(TurnFailure, match="fenced"):
        await engine.run("m1", "p1", idempotency_key="leased-fenced")
    assert engine._meetings.saved_messages == []


@needs_anyio
async def test_shutdown_drains_detached_turns():
    import asyncio

    from app.modules.meetings.engine import TurnResult
    from app.modules.meetings.runner import TurnRunner, drain_turn_tasks

    finished = []

    class _StubEngine:
        async def run(self, *args, **kwargs):
            await asyncio.sleep(0.05)
            finished.append(True)
            return TurnResult(turn_id="t", state="completed")

    runner = TurnRunner(_StubEngine(), store=None)
    runner.start_detached("m", "p", idempotency_key="drain-me")
    await drain_turn_tasks(timeout=5.0)
    assert finished == [True]
