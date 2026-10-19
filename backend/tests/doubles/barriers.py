"""`controlled_event` / `async_barrier` contracts: deterministic
coordination primitives for exercising concurrent writers and close-time
barriers. Nothing here reaches a real event loop's wall-clock timing on
its own — the test scripts every release.
"""

import asyncio
from typing import List, Optional

DEFAULT_WAIT_TIMEOUT = 5.0


class WaitEvent:
    """An asyncio.Event the test owns: `wait()` blocks until the test calls
    `release()`, so production racing-ahead behavior is fully scripted.

    - `release(failure=...)` either sets the event or stores one failure
      delivered to every current and future waiter.
    - Timeouts raise `asyncio.TimeoutError` (deterministic proof the
      waiter really was blocked).
    """

    def __init__(self):
        self._event = asyncio.Event()
        self._failure: Optional[BaseException] = None
        self.total_waiters = 0
        self.completions = 0
        self.releases = 0

    async def wait(self, timeout: Optional[float] = None) -> None:
        self.total_waiters += 1
        if self._failure is not None and self._event.is_set():
            raise self._failure
        if timeout is not None:
            await asyncio.wait_for(self._event.wait(), timeout=timeout)
        else:
            await self._event.wait()
        if self._failure is not None:
            raise self._failure
        self.completions += 1

    def release(self, failure: Optional[BaseException] = None) -> None:
        self.releases += 1
        self._failure = failure
        self._event.set()

    @property
    def released(self) -> bool:
        return self._event.is_set()

    def reset(self) -> None:
        self._event = asyncio.Event()
        self._failure = None
        self.total_waiters = 0
        self.completions = 0
        self.releases = 0


class AsyncBarrier:
    """Waits for `parties` arrivals; the OWNER then releases every
    participant together — or aborts all of them with one injected
    failure. `wait_until_full` lets the test block until every party has
    registered, and arrival order is recorded so tests can assert who
    got there first. Arrivals stay blocked until release/abort, so the
    release moment never depends on scheduling luck."""

    def __init__(self, parties: int):
        self.parties = parties
        self._full_event = asyncio.Event()
        self._released_event = asyncio.Event()
        self.arrival_order: List[str] = []
        self._failure: Optional[BaseException] = None
        self.releases = 0
        self.aborts = 0

    async def arrive(self, name: Optional[str] = None) -> None:
        if self._failure is not None:
            raise self._failure
        self.arrival_order.append(name or f"participant-{len(self.arrival_order) + 1}")
        if len(self.arrival_order) >= self.parties:
            self._full_event.set()
        await self._released_event.wait()
        if self._failure is not None:
            raise self._failure

    async def wait_until_full(self, timeout: float = DEFAULT_WAIT_TIMEOUT) -> None:
        """Owner-side helper: block until every party has arrived (or fail
        the test deterministically)."""
        await asyncio.wait_for(self._full_event.wait(), timeout=timeout)

    def release(self) -> None:
        self.releases += 1
        self._released_event.set()

    def abort(self, failure: Optional[BaseException] = None) -> None:
        self.aborts += 1
        self._failure = failure if failure is not None else RuntimeError("barrier aborted")
        self._released_event.set()

    @property
    def arrivals(self) -> int:
        return len(self.arrival_order)

    def reset(self) -> None:
        self._full_event = asyncio.Event()
        self._released_event = asyncio.Event()
        self.arrival_order = []
        self._failure = None
        self.releases = 0
        self.aborts = 0
