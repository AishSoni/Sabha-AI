"""The bounded data-access runner is the event-loop boundary (spec-20).

These tests pin the two properties the rest of the backend relies on: work
runs on a worker thread, and concurrency is bounded by the configured pool
size rather than by request volume.
"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.platform import blocking
from app.platform.config import settings


@pytest.fixture()
def pool(monkeypatch):
    def _configure(size: int) -> None:
        blocking.shutdown_blocking()
        monkeypatch.setattr(settings, "db_thread_pool_size", size)

    yield _configure
    blocking.shutdown_blocking()


async def test_run_blocking_uses_a_worker_thread_and_counts_the_call(pool):
    pool(2)
    threads: list[int] = []

    def _operation() -> str:
        threads.append(threading.get_ident())
        return "ok"

    blocking.reset_request_counters()
    assert await blocking.run_blocking(_operation) == "ok"

    assert threads and threads[0] != threading.get_ident()
    assert blocking.request_db_ops() == 1
    assert blocking.request_db_total_ms() > 0


async def test_pool_size_bounds_concurrent_operations(pool):
    pool(2)
    active = 0
    peak = 0
    lock = threading.Lock()

    def _operation() -> None:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.05)
        with lock:
            active -= 1

    await asyncio.gather(*(blocking.run_blocking(_operation) for _ in range(6)))
    assert peak <= 2, f"pool exceeded its bound: peak={peak}"


async def test_run_blocking_does_not_block_the_event_loop(pool):
    pool(2)
    ticks = 0

    async def _ticker() -> None:
        nonlocal ticks
        while True:
            ticks += 1
            await asyncio.sleep(0.01)

    ticker = asyncio.create_task(_ticker())
    try:
        await blocking.run_blocking(lambda: time.sleep(0.15))
    finally:
        ticker.cancel()
    assert ticks >= 5, "the event loop was stalled by the blocking call"
