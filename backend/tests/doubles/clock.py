"""`fake_clock` contract: deterministic, resettable replacement for
wall-clock reads.

Production code reads `datetime.utcnow()` directly today; the seam this
double defines lets migrated code accept a clock without tests paying
for real sleeps or flaky wall-clock windows. Reads are pinned to one
fixed instant so every recorded timestamp is reproducible offline.
"""

from datetime import datetime, timedelta
from typing import List, Union

DEFAULT_START = datetime(2026, 1, 1, 12, 0, 0)


class FakeClock:
    """Time never moves on its own: the test moves it via advance/set and
    every read is appended to `reads` in order."""

    def __init__(self, start: Union[datetime, None] = None):
        self._initial = start if start is not None else DEFAULT_START
        self.reads: List[datetime] = []
        self.reset()

    def now(self) -> datetime:
        current = self._current
        self.reads.append(current)
        return current

    def iso_now(self) -> str:
        """The string form production writes into the database today
        (`datetime.utcnow().isoformat()` -> naive UTC text)."""
        return self.now().isoformat()

    def settle(self) -> str:
        """The string form WITHOUT recording another read, for assertions
        about 'the moment the test froze time at'."""
        return self._current.isoformat()

    def advance(self, delta: Union[timedelta, float]) -> None:
        """Move the clock forward by a timedelta or a number of seconds."""
        if not isinstance(delta, timedelta):
            delta = timedelta(seconds=delta)
        self._current = self._current + delta

    def rewind(self, delta: Union[timedelta, float]) -> None:
        """Move the clock backward (clock skew, late-arriving events)."""
        if not isinstance(delta, timedelta):
            delta = timedelta(seconds=delta)
        self._current = self._current - delta

    def set(self, now: datetime) -> None:
        self._current = now

    def reset(self, start: Union[datetime, None] = None) -> None:
        """Restore the pinned start (or a new one) and clear read history."""
        if start is not None:
            self._initial = start
        self._current = self._initial
        self.reads = []
