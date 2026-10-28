"""Paced recorded SSE sources (spec-17).

The tape is loaded once per observation. Pacing is finite and deterministic:
each recorded event carries its intended delay, capped by server policy, and
resume yields only the suffix after the last accepted sequence. There is no
per-token database poll, no event journal, and no background inference.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncGenerator, Callable

from app.modules.meetings.presentation.turn_stream import event_dto
from app.replay.package.model import TERMINAL_EVENT_TYPES
from app.replay.source import PublishedPackage, ReplaySource


class ReplayStreamLimit(RuntimeError):
    """A client already holds the maximum number of replay streams."""


class StreamLimiter:
    def __init__(self, *, max_global: int = 8, max_per_client: int = 2) -> None:
        self._max_global = max_global
        self._max_per_client = max_per_client
        self._global = asyncio.Semaphore(max_global)
        self._counts: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, client: str) -> None:
        # Reserve the global slot first so a refused client does not leak one.
        await self._global.acquire()
        async with self._lock:
            current = self._counts.get(client, 0)
            if current >= self._max_per_client:
                self._global.release()
                raise ReplayStreamLimit("too many concurrent replay streams")
            self._counts[client] = current + 1

    def release(self, client: str) -> None:
        current = self._counts.get(client, 0)
        if current <= 1:
            self._counts.pop(client, None)
        else:
            self._counts[client] = current - 1
        self._global.release()


class ReplayTurnStream:
    def __init__(
        self,
        source: ReplaySource,
        published: PublishedPackage,
        *,
        clock: Callable[[float], Any] = asyncio.sleep,
        max_delay_ms: int = 2000,
        max_bytes: int = 256 * 1024,
        max_seconds: float = 120.0,
    ) -> None:
        self._source = source
        self._published = published
        self._clock = clock
        self._max_delay_ms = max_delay_ms
        self._max_bytes = max_bytes
        self._max_seconds = max_seconds

    async def events(
        self, meeting_id: str, operation_id: str, *, after: int = 0
    ) -> AsyncGenerator[dict[str, str], None]:
        tape = await self._source.read_tape(
            self._published.package_id,
            self._published.version,
            operation_id,
        )
        if tape.meeting_id != meeting_id:
            return

        cursor = max(0, after)
        sent = 0
        started = time.monotonic()
        first = True
        for event in tape.events:
            sequence = int(event["sequence"])
            if sequence <= cursor:
                continue
            if sent and time.monotonic() - started > self._max_seconds:
                return
            delay_ms = 0 if first else int(event.get("delay_ms") or 0)
            first = False
            if delay_ms > 0:
                await self._clock(min(delay_ms, self._max_delay_ms) / 1000.0)
            frame = json.dumps(event_dto(event))
            if sent + len(frame.encode("utf-8")) > self._max_bytes:
                return
            sent += len(frame.encode("utf-8"))
            yield {"data": frame}
            if event["type"] in TERMINAL_EVENT_TYPES:
                return


class ReplayClosingStream:
    def __init__(
        self,
        source: ReplaySource,
        published: PublishedPackage,
        *,
        clock: Callable[[float], Any] = asyncio.sleep,
        max_delay_ms: int = 2000,
        max_bytes: int = 256 * 1024,
        max_seconds: float = 120.0,
    ) -> None:
        self._source = source
        self._published = published
        self._clock = clock
        self._max_delay_ms = max_delay_ms
        self._max_bytes = max_bytes
        self._max_seconds = max_seconds

    async def events(
        self, meeting_id: str, closing_id: str, *, after: int = 0
    ) -> AsyncGenerator[dict[str, str], None]:
        tape = await self._source.read_closing_tape(
            self._published.package_id,
            self._published.version,
            closing_id,
        )
        if tape.meeting_id != meeting_id:
            return

        cursor = max(0, after)
        sent = 0
        started = time.monotonic()
        first = True
        for event in tape.events:
            sequence = int(event["sequence"])
            if sequence <= cursor:
                continue
            if sent and time.monotonic() - started > self._max_seconds:
                return
            delay_ms = 0 if first else int(event.get("delay_ms") or 0)
            first = False
            if delay_ms > 0:
                await self._clock(min(delay_ms, self._max_delay_ms) / 1000.0)
            payload: dict[str, Any] = event.get("payload") or {}
            envelope = {
                "event_id": event["id"],
                "closing_id": tape.closing_id,
                "meeting_id": tape.meeting_id,
                "item_id": event["item_id"],
                "kind": event["kind"],
                "sequence": sequence,
                "text": payload.get("text", ""),
                "provisional": bool(payload.get("provisional")),
                "terminal": bool(payload.get("terminal")),
                "result": payload.get("result"),
                "subject_id": payload.get("subject_id"),
                "provenance": "recorded-stream",
            }
            frame = json.dumps(envelope)
            if sent + len(frame.encode("utf-8")) > self._max_bytes:
                return
            sent += len(frame.encode("utf-8"))
            yield {"data": frame}
