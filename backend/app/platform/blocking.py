"""Bounded off-loop execution for the synchronous Supabase client (spec-20).

The Supabase Python client is synchronous. A PostgREST round trip from the
API host to a cross-region database costs hundreds of milliseconds, so calling
``execute()`` inline from a coroutine stalls every other request on the single
event loop. Spec-19 measured exactly that: ``/health`` answered in 2 ms idle
and 2331 ms while one ``GET /closing`` was in flight.

Every blocking database operation therefore goes through :func:`run_blocking`.
It uses one process-wide, bounded thread pool rather than ``asyncio.to_thread``
so a burst of requests cannot create an unbounded number of threads and move
the stall into the queue.

The module also keeps per-request counters used by the request-timing
middleware: how many blocking operations a request issued, the longest single
wait, and the time spent queued behind other work. Those numbers are what the
Spec-20 round-trip budgets are checked against.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from typing import Callable, TypeVar

logger = logging.getLogger("sabha.perf")

T = TypeVar("T")

_request_db_ops: ContextVar[int] = ContextVar("sabha_request_db_ops", default=0)
_request_db_total_ms: ContextVar[float] = ContextVar(
    "sabha_request_db_total_ms", default=0.0
)
_request_db_max_ms: ContextVar[float] = ContextVar(
    "sabha_request_db_max_ms", default=0.0
)

_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()


def _pool_size() -> int:
    from app.platform.config import settings

    return max(1, int(settings.db_thread_pool_size))


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(
                    max_workers=_pool_size(),
                    thread_name_prefix="sabha-db",
                )
    return _executor


def reset_request_counters() -> None:
    """Start a fresh counter window (called by the timing middleware)."""

    _request_db_ops.set(0)
    _request_db_total_ms.set(0.0)
    _request_db_max_ms.set(0.0)


def request_db_ops() -> int:
    return _request_db_ops.get()


def request_db_total_ms() -> float:
    return _request_db_total_ms.get()


def request_db_max_ms() -> float:
    return _request_db_max_ms.get()


async def run_blocking(operation: Callable[[], T]) -> T:
    """Await ``operation`` on the bounded database executor.

    The callable must contain exactly one blocking round trip. Batching that
    rule is enforced by the round-trip budget tests; the counter here is the
    production view of the same number.
    """

    loop = asyncio.get_running_loop()
    queued_at = time.perf_counter()
    started: dict[str, float] = {}

    def _timed() -> T:
        started["at"] = time.perf_counter()
        return operation()

    try:
        return await loop.run_in_executor(_get_executor(), functools.partial(_timed))
    finally:
        finished = time.perf_counter()
        total_ms = (finished - queued_at) * 1000.0
        _request_db_ops.set(_request_db_ops.get() + 1)
        _request_db_total_ms.set(_request_db_total_ms.get() + total_ms)
        if total_ms > _request_db_max_ms.get():
            _request_db_max_ms.set(total_ms)
        if logger.isEnabledFor(logging.DEBUG):
            queue_ms = (started.get("at", finished) - queued_at) * 1000.0
            logger.debug(
                "db.call duration_ms=%.1f queue_ms=%.1f", total_ms, queue_ms
            )


def shutdown_blocking() -> None:
    """Release the pool (idempotent; a later call rebuilds it)."""

    global _executor
    with _executor_lock:
        executor = _executor
        _executor = None
    if executor is not None:
        executor.shutdown(wait=False, cancel_futures=True)
