"""Batched turn-event persistence (spec 20).

Streaming providers yield one event per delta. The durable log still stores
one row per delta — observation sequence and replay cursors do not change —
but the writer buffers deltas and inserts them as one ordered batch so the
provider stream is no longer gated by a WAN round trip per token.

Ordering is the whole contract. Non-delta events (tool calls, citations, tool
results) flush the buffer first and then persist themselves, so a text delta
can never land after the tool call that followed it. A failed append requeues
the batch at the head; retries reuse the same event ids, which the database
deduplicates.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

DELTA_TYPES = frozenset({"text", "thinking"})


class TurnEventWriter:
    """Order-preserving batch buffer for one turn claim."""

    def __init__(
        self,
        append: Callable[[Any, list[dict]], Awaitable[Any]],
        claim,
        *,
        flush_interval_seconds: float,
        max_buffered: int = 200,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._append = append
        self._claim = claim
        self._interval = max(float(flush_interval_seconds), 0.0)
        self._max_buffered = max(int(max_buffered), 1)
        self._clock = clock
        self._buffer: list[dict] = []
        self._last_flush = clock()
        self._lock = asyncio.Lock()

    @property
    def buffered(self) -> int:
        return len(self._buffer)

    async def emit(
        self,
        event_type: str,
        payload: dict,
        event_id: str | None = None,
    ) -> None:
        event = {
            "id": event_id or str(uuid.uuid4()),
            "type": event_type,
            "payload": payload,
        }
        async with self._lock:
            self._buffer.append(event)
            if len(self._buffer) > self._max_buffered:
                # A failing database must not grow the buffer without bound.
                # Drop the oldest undelivered events; they are already lost.
                del self._buffer[: len(self._buffer) - self._max_buffered]
            buffered = len(self._buffer)
        due = (
            event_type not in DELTA_TYPES
            or buffered >= self._max_buffered
            or (self._clock() - self._last_flush) >= self._interval
        )
        if due:
            await self.flush()

    async def flush(self) -> None:
        """Persist the current batch in order, before any later event."""
        async with self._lock:
            if not self._buffer:
                self._last_flush = self._clock()
                return
            batch = self._buffer
            self._buffer = []
            self._last_flush = self._clock()
            try:
                await self._append(self._claim, batch)
            except Exception:  # noqa: BLE001 - event durability is best effort
                logger.warning(
                    "Could not persist %d turn events for %s; retrying later",
                    len(batch),
                    getattr(self._claim, "operation_id", "?"),
                    exc_info=True,
                )
                # Keep the oldest events: they precede anything emitted while
                # the database was failing. Retries are idempotent by id.
                self._buffer = (batch + self._buffer)[: self._max_buffered]

    async def aclose(self) -> None:
        await self.flush()
