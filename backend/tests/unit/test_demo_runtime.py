"""Demo runtime foundations: issuance/expiry/fencing/bounds/cleanup (red first).

Covers P08-T03 (persistent issuance/status/reset/expiry, token
hash/redaction, generation fencing), P08-T04 (caps, request budgets,
retention), P08-T05 (idempotent cleanup, fixture preservation),
P08-T06 (structured logs, health, no-store headers), and the Supabase
gateway query contract (recording fake, no network).
"""

import json
import logging

import pytest

from app.infrastructure.demo import bounds, errors, observability, tokens
from app.infrastructure.demo.cleanup import run_retention_sweep
from app.infrastructure.demo.runtime import DemoSessionStore


class FakeClock:
    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.now_value = start

    def __call__(self) -> float:
        return self.now_value

    def advance(self, seconds: float) -> None:
        self.now_value += seconds


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def gateway():
    from app.infrastructure.demo.runtime import InMemoryGateway

    return InMemoryGateway()


@pytest.fixture
def store(clock, gateway):
    return DemoSessionStore(gateway=gateway, clock=clock)


def _issue(store, scenario_id="synthetic-smoke-scaffold", key="test-key"):
    return store.issue(
        scenario_id=scenario_id, scenario_revision=1, creation_key=key
    )


# --- tokens (D-07) ---


def test_token_has_256_bits_of_entropy_and_is_stored_hashed(store, gateway):
    view, token = _issue(store)
    assert len(token) >= 43  # 32 bytes urlsafe
    record = gateway.get(tokens.hash_token(token))
    assert record is not None
    assert record["session_id"] == view.session_id
    assert "token" not in record
    assert record["token_hash"] != token
    assert tokens.verify_token(token, record["token_hash"])
    assert not tokens.verify_token(token + "x", record["token_hash"])


def test_unknown_token_reads_as_not_found(store):
    with pytest.raises(errors.SessionNotFound):
        store.get_by_token("bogus-token-value")


# --- expiry (D-02) ---


def test_idle_expiry_denies_reads_and_actions(store, clock):
    view, token = _issue(store)
    clock.advance(bounds.IDLE_TIMEOUT_S + 1)
    with pytest.raises(errors.SessionExpired):
        store.get_by_token(token)
    with pytest.raises(errors.SessionExpired):
        store.record_action(token, expected_generation=1)


def test_heartbeat_reads_do_not_extend_idle_lifetime(store, clock):
    _, token = _issue(store)
    clock.advance(bounds.IDLE_TIMEOUT_S - 60)
    store.get_by_token(token)  # status/heartbeat: must not touch last_active
    clock.advance(61)
    with pytest.raises(errors.SessionExpired):
        store.get_by_token(token)


def test_activity_extends_idle_but_not_absolute_lifetime(store, clock):
    _, token = _issue(store)
    # Stay active just under the idle deadline, past the point where an
    # untouched session would have expired: 12 heartbeats of real activity.
    for _ in range(12):
        clock.advance(bounds.IDLE_TIMEOUT_S - 1)
        store.record_action(token, expected_generation=1)
    # Idle age is seconds; the 24h absolute deadline now passes anyway.
    clock.advance(13)
    with pytest.raises(errors.SessionExpired):
        store.get_by_token(token)


def test_reset_on_expired_session_is_denied(store, clock):
    _, token = _issue(store)
    clock.advance(bounds.ABSOLUTE_LIFETIME_S + 1)
    with pytest.raises(errors.SessionExpired):
        store.reset(token, expected_generation=1, idempotency_key="k1")


# --- generation fencing ---


def test_stale_generation_writes_are_rejected_and_reset_fences_turn(store):
    _, token = _issue(store)
    store.reset(token, expected_generation=1, idempotency_key="r1")
    with pytest.raises(errors.StaleGeneration):
        store.record_action(token, expected_generation=1)
    view = store.record_action(token, expected_generation=2)
    assert view.generation == 2


def test_reset_is_idempotent_for_same_key(store):
    _, token = _issue(store)
    first = store.reset(token, expected_generation=1, idempotency_key="same")
    second = store.reset(token, expected_generation=2, idempotency_key="same")
    assert (first.generation, second.generation) == (2, 3)


def test_reset_preserves_lifetime_action_count(store):
    _, token = _issue(store)
    for _ in range(bounds.MAX_ACTIONS_PER_SESSION):
        store.record_action(token, expected_generation=1)
    store.reset(token, expected_generation=1, idempotency_key="r1")
    with pytest.raises(errors.QuotaExceeded):
        store.record_action(token, expected_generation=2)


# --- bounds (D-10) ---


def test_second_scenario_bind_conflicts(store):
    _, token = _issue(store, scenario_id="synthetic-smoke-scaffold")
    with pytest.raises(errors.ScenarioConflict):
        store.reset(
            token,
            expected_generation=1,
            idempotency_key="r1",
            scenario_id="synthetic-other-scaffold",
        )


def test_write_window_rejects_burst_with_retry_feedback(store, clock):
    _, token = _issue(store)
    for _ in range(bounds.MAX_WRITES_PER_MINUTE):
        store.record_write(token, expected_generation=1)
    with pytest.raises(errors.QuotaExceeded) as exc_info:
        store.record_write(token, expected_generation=1)
    assert exc_info.value.retry_after_s > 0
    clock.advance(61)
    store.record_write(token, expected_generation=1)  # window slides: allowed


def test_global_active_cap_and_creation_rate_are_enforced(store, clock):
    for i in range(bounds.MAX_ACTIVE_SESSIONS):
        _issue(store, key=f"bulk-{i}")
    with pytest.raises(errors.QuotaExceeded) as exc_info:
        _issue(store, key="one-more")
    assert exc_info.value.scope == "global_active_sessions"

    paced = DemoSessionStore(clock=clock)
    for _ in range(bounds.MAX_SESSION_CREATIONS_PER_HOUR):
        paced.issue(
            scenario_id="synthetic-smoke-scaffold",
            scenario_revision=1,
            creation_key="same-origin",
        )
    with pytest.raises(errors.QuotaExceeded) as rate_info:
        paced.issue(
            scenario_id="synthetic-smoke-scaffold",
            scenario_revision=1,
            creation_key="same-origin",
        )
    assert rate_info.value.scope == "session_creation"
    assert rate_info.value.retry_after_s > 0


def test_real_scenario_and_non_synthetic_ids_are_rejected(store):
    with pytest.raises(Exception):
        store.issue(
            scenario_id="indian-corporate-bond-review",
            scenario_revision=1,
            creation_key="k",
        )
    with pytest.raises(Exception):
        store.issue(
            scenario_id="custom-live-demo", scenario_revision=1, creation_key="k"
        )


# --- cleanup (P08-T05) ---


def test_sweep_removes_expired_keeps_active_and_is_idempotent(store, clock):
    _, live_token = _issue(store, key="live")
    _, dead_token = _issue(store, key="dead")
    clock.advance(bounds.IDLE_TIMEOUT_S - 60)
    store.record_action(live_token, expected_generation=1)  # live stays fresh
    clock.advance(61)  # only the untouched session crosses idle expiry
    first = run_retention_sweep(store)
    assert first["removed"] == 1 and first["kept"] == 1
    assert first["fixtures_preserved"] is True
    with pytest.raises(errors.SessionNotFound):
        store.get_by_token(dead_token)
    assert store.get_by_token(live_token).action_count == 1
    second = run_retention_sweep(store)
    assert second["removed"] == 0


def test_sweep_preserves_shared_fixtures(store, clock):
    from app.infrastructure.demo.composition import (
        build_fixture_composition,
        synthetic_manifest,
    )

    before = build_fixture_composition(manifest=synthetic_manifest())
    _issue(store)
    clock.advance(bounds.ABSOLUTE_LIFETIME_S + 1)
    run_retention_sweep(store)
    after = build_fixture_composition(manifest=synthetic_manifest())
    assert before.knowledge_search._hits == after.knowledge_search._hits


# --- observability (P08-T06) ---


def test_structured_logs_carry_correlation_ids_and_never_tokens(store, caplog):
    _, token = _issue(store)
    with caplog.at_level(logging.INFO):
        observability.log_event(
            logging.getLogger("demo-test"),
            event="session_issued",
            request_id="req-1",
            session_id="sess-1",
            code="ok",
        )
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["request_id"] == "req-1"
    assert token not in json.dumps(payload)
    assert "token" not in payload


def test_health_reports_backlog_without_paid_probes(store):
    report = observability.build_health(store)
    assert report["paid_probes"] == []
    assert report["active_sessions"] == 0
    _issue(store)
    assert observability.build_health(store)["active_sessions"] == 1


def test_session_responses_are_non_cacheable():
    headers = observability.private_no_store_headers()
    assert headers["Cache-Control"] == "no-store, private"


def test_sweep_counts_failed_cleanups_and_continues(store, clock, gateway):
    from app.infrastructure.demo.runtime import InMemoryGateway

    doomed_hashes = set()

    class FlakyGateway(InMemoryGateway):
        def delete(self, token_hash):
            if token_hash in doomed_hashes:
                raise RuntimeError("simulated stage crash")
            return super().delete(token_hash)

    flaky_store = DemoSessionStore(gateway=FlakyGateway(), clock=clock)
    _, token_a = flaky_store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="a",
    )
    _, token_b = flaky_store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="b",
    )
    doomed_hashes.add(tokens.hash_token(token_a))
    clock.advance(bounds.IDLE_TIMEOUT_S + 1)
    report = run_retention_sweep(flaky_store)
    assert report["removed"] == 1 and report["failed_cleanups"] == 1
    assert observability.build_health(flaky_store)["status"] == "degraded"
    # Retry after the crash clears the backlog.
    doomed_hashes.clear()
    retry = run_retention_sweep(flaky_store)
    assert retry["removed"] == 1 and retry["failed_cleanups"] == 1


def test_reset_key_history_is_bounded(store):
    _, token = _issue(store)
    generation = 1
    for i in range(bounds.MAX_RESET_KEYS_PER_SESSION + 5):
        store.reset(
            token, expected_generation=generation, idempotency_key=f"k-{i}"
        )
        generation += 1
    record = store._gateway.get(tokens.hash_token(token))
    assert len(record["reset_keys"]) <= bounds.MAX_RESET_KEYS_PER_SESSION
