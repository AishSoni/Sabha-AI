"""Turn-runner polling policy: jitter, drain fast path, error backoff (spec 20)."""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest

from app.capabilities import runtime
from app.capabilities.runtime.runner import TurnRunner


def _runner(service, **kwargs) -> TurnRunner:
    return TurnRunner(service, worker_id="worker-1", **kwargs)


class _Service:
    def __init__(self, *, claims: int = 0, error: bool = False) -> None:
        self.remaining = claims
        self.error = error
        self.claim_times: list[float] = []
        self.executed: list[str] = []

    async def recover(self):
        return {}

    async def claim(self, claimant, *, meeting_id=None, global_limit=None):
        self.claim_times.append(time.monotonic())
        if self.error:
            raise RuntimeError("database unavailable")
        if self.remaining <= 0:
            return None
        self.remaining -= 1
        return SimpleNamespace(operation_id=f"turn-{self.remaining}", meeting_id="m")

    async def execute_claim(self, claim):
        self.executed.append(claim.operation_id)

    async def interrupt_claim(self, claim, code, message):
        return None


def test_idle_delay_is_jittered_around_the_interval(monkeypatch):
    monkeypatch.setattr(runtime.runner.random, "random", lambda: 0.0)
    runner = _runner(_Service(), poll_seconds=2.0, jitter_ratio=0.2)
    assert runner._next_delay() == 1.6

    monkeypatch.setattr(runtime.runner.random, "random", lambda: 1.0)
    assert runner._next_delay() == pytest.approx(2.4)


def test_failures_back_off_and_stop_at_the_cap(monkeypatch):
    monkeypatch.setattr(runtime.runner.random, "random", lambda: 0.5)
    runner = _runner(
        _Service(), poll_seconds=2.0, max_backoff_seconds=10.0
    )

    runner._failures = 1
    assert runner._next_delay() == 4.0
    runner._failures = 2
    assert runner._next_delay() == 8.0
    runner._failures = 3
    assert runner._next_delay() == 10.0


async def test_a_claim_drains_immediately_instead_of_waiting():
    service = _Service(claims=1)
    runner = _runner(service, poll_seconds=5.0, jitter_ratio=0.0)

    await runner.start()
    await asyncio.sleep(0.1)
    await runner.stop(grace_seconds=1.0)

    assert service.executed == ["turn-0"]
    assert len(service.claim_times) >= 2
    assert service.claim_times[1] - service.claim_times[0] < 0.2


async def test_claim_errors_do_not_kill_the_loop():
    service = _Service(error=True)
    runner = _runner(service, poll_seconds=0.01, max_backoff_seconds=0.05)

    await runner.start()
    await asyncio.sleep(0.1)
    assert runner.is_running
    await runner.stop(grace_seconds=1.0)

    assert len(service.claim_times) >= 2
