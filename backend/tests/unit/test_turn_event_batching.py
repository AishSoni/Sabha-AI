"""Batched turn-event persistence semantics (spec 20)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.modules.meetings.infrastructure.turn_events import TurnEventWriter


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class RecordingAppender:
    def __init__(self, *, failures: int = 0) -> None:
        self.batches: list[list[dict]] = []
        self.failures = failures

    async def __call__(self, claim, events: list[dict]):
        if self.failures:
            self.failures -= 1
            raise RuntimeError("database unavailable")
        self.batches.append([dict(event) for event in events])
        return events


def _writer(appender, clock, *, interval=0.2, max_buffered=200):
    return TurnEventWriter(
        appender,
        SimpleNamespace(operation_id="operation-1"),
        flush_interval_seconds=interval,
        max_buffered=max_buffered,
        clock=clock,
    )


async def test_streamed_deltas_are_written_in_bounded_batches():
    clock = FakeClock()
    appender = RecordingAppender()
    writer = _writer(appender, clock)

    for index in range(100):
        await writer.emit("text", {"content": str(index)})
        clock.advance(0.02)
    await writer.flush()

    assert 8 <= len(appender.batches) <= 12
    delivered = [event["payload"]["content"] for batch in appender.batches for event in batch]
    assert delivered == [str(index) for index in range(100)]
    ids = [event["id"] for batch in appender.batches for event in batch]
    assert len(set(ids)) == 100


async def test_a_tool_call_flushes_the_preceding_deltas_before_itself():
    clock = FakeClock()
    appender = RecordingAppender()
    writer = _writer(appender, clock)

    await writer.emit("text", {"content": "a"})
    await writer.emit("text", {"content": "b"})
    await writer.emit("text", {"content": "c"})
    await writer.emit("tool_call", {"tool_name": "web_search"})

    assert len(appender.batches) == 1
    assert [event["type"] for event in appender.batches[0]] == [
        "text",
        "text",
        "text",
        "tool_call",
    ]
    assert writer.buffered == 0


async def test_terminal_flush_is_explicit_and_idempotent():
    clock = FakeClock()
    appender = RecordingAppender()
    writer = _writer(appender, clock, interval=60.0)

    await writer.emit("text", {"content": "hello"})
    await writer.emit("text", {"content": " world"})
    assert writer.buffered == 2

    await writer.flush()
    await writer.flush()

    assert len(appender.batches) == 1
    assert [event["payload"]["content"] for event in appender.batches[0]] == [
        "hello",
        " world",
    ]


async def test_a_failed_append_keeps_order_for_the_retry():
    clock = FakeClock()
    appender = RecordingAppender(failures=1)
    writer = _writer(appender, clock, interval=60.0)

    await writer.emit("text", {"content": "one"})
    await writer.emit("text", {"content": "two"})
    await writer.flush()  # fails and requeues

    assert appender.batches == []
    assert writer.buffered == 2

    await writer.flush()  # retries the same ids in the same order

    assert len(appender.batches) == 1
    assert [event["payload"]["content"] for event in appender.batches[0]] == [
        "one",
        "two",
    ]


async def test_a_failing_database_cannot_grow_the_buffer_without_bound():
    clock = FakeClock()
    appender = RecordingAppender(failures=99)
    writer = _writer(appender, clock, interval=60.0, max_buffered=5)

    for index in range(12):
        await writer.emit("text", {"content": str(index)})

    assert writer.buffered <= 5


async def test_close_flushes_the_remaining_buffer():
    clock = FakeClock()
    appender = RecordingAppender()
    writer = _writer(appender, clock, interval=60.0)

    await writer.emit("text", {"content": "last"})
    await writer.aclose()

    assert len(appender.batches) == 1
    assert writer.buffered == 0


async def test_citations_are_never_deferred():
    clock = FakeClock()
    appender = RecordingAppender()
    writer = _writer(appender, clock, interval=60.0)

    await writer.emit("citation", {"title": "source"})

    assert len(appender.batches) == 1
    assert appender.batches[0][0]["type"] == "citation"
