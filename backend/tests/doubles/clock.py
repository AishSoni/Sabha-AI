"""Phase 01 (P01-T03) fake clock with explicit advance/restore."""

import time


class FakeClock:
    """Deterministic clock; tests advance it instead of sleeping."""

    def __init__(self, start: float = 1_700_000_000.0):
        self._now = start
        self.advances = 0

    def now(self) -> float:
        return self._now

    def advance(self, seconds: float) -> float:
        assert seconds >= 0, "clock cannot go backwards"
        self._now += seconds
        self.advances += 1
        return self._now


class PatchedTime:
    """Context manager patching time.monotonic/time.time with FakeClock."""

    def __init__(self, clock: FakeClock):
        self.clock = clock
        self._real_monotonic = time.monotonic
        self._real_time = time.time

    def __enter__(self) -> FakeClock:
        time.monotonic = self.clock.now
        time.time = self.clock.now
        return self.clock

    def __exit__(self, *exc) -> bool:
        time.monotonic = self._real_monotonic
        time.time = self._real_time
        return False
