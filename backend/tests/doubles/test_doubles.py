"""Executable proof that the reusable test doubles actually run: the fake
clock, the controlled event/barrier primitives, and the split-event SSE
transport are exercised here so later suites can trust the harness.

These checks run on plain Python — no SDK imports, no database, no
provider HTTP — mirroring the spec-03 rule that harness parts must
execute, not exist as prose.
"""

import asyncio
import json
from datetime import datetime, timedelta

import pytest

from app.capabilities.inference.contracts import StreamEvent, StreamEventType
from tests.doubles.barriers import AsyncBarrier, WaitEvent
from tests.doubles.clock import DEFAULT_START, FakeClock
from tests.doubles.transports import (
    ScriptedSseStream,
    ScriptedTransportFailure,
    sse_frame,
)


# ---------------------------------------------------------------------------
# fake clock


def test_fake_clock_pins_reads_and_records_them_in_order():
    clock = FakeClock()
    first = clock.now()
    second = clock.now()

    assert first == second == DEFAULT_START
    assert clock.reads == [DEFAULT_START, DEFAULT_START]
    assert clock.settle() == DEFAULT_START.isoformat()
    # settle() must not have recorded a read
    assert len(clock.reads) == 2


def test_fake_clock_advances_and_rewinds_deterministically():
    clock = FakeClock()
    clock.advance(timedelta(seconds=90))
    assert clock.now() == datetime(2026, 1, 1, 12, 1, 30)
    clock.advance(timedelta(minutes=1))
    assert clock.iso_now() == "2026-01-01T12:02:30"
    clock.rewind(timedelta(seconds=150))
    assert clock.now() == DEFAULT_START


def test_fake_clock_reset_restores_start_and_clears_history():
    start = datetime(2025, 6, 15, 8, 0, 0)
    clock = FakeClock()
    clock.advance(timedelta(hours=5))
    assert clock.now() != DEFAULT_START

    clock.reset()
    assert clock.now() == DEFAULT_START
    assert clock.reads == [DEFAULT_START]

    clock.reset(start=start)
    assert clock.now() == start


# ---------------------------------------------------------------------------
# controlled event


async def test_wait_event_blocks_until_released():
    event = WaitEvent()
    outcomes = []

    async def waiter():
        await event.wait()
        outcomes.append("released")

    task = asyncio.create_task(waiter())
    await asyncio.sleep(0)  # let the waiter block
    assert not event.released
    assert not outcomes

    event.release()
    await asyncio.wait_for(task, timeout=1.0)
    assert outcomes == ["released"]


async def test_wait_event_timeout_proves_it_blocked():
    event = WaitEvent()
    with pytest.raises(asyncio.TimeoutError):
        await event.wait(timeout=0.02)


async def test_wait_event_delivers_one_failure_to_all_waiters():
    event = WaitEvent()
    failure = RuntimeError("closing barrier broke")
    event.release(failure=failure)

    with pytest.raises(RuntimeError, match="closing barrier broke"):
        await event.wait()
    with pytest.raises(RuntimeError):
        await event.wait()
    assert event.releases == 1


async def test_wait_event_reset_restores_blank_state():
    event = WaitEvent()
    event.release()
    await event.wait()

    event.reset()
    assert not event.released
    with pytest.raises(asyncio.TimeoutError):
        await event.wait(timeout=0.02)


# ---------------------------------------------------------------------------
# async barrier


async def test_async_barrier_releases_all_parties_together():
    barrier = AsyncBarrier(parties=3)
    results = []

    async def arrive(name):
        await barrier.arrive(name)
        results.append(name)

    tasks = [asyncio.create_task(arrive(name)) for name in ("alpha", "beta", "gamma")]
    await asyncio.sleep(0)
    assert barrier.arrivals == 3
    assert barrier.arrival_order == ["alpha", "beta", "gamma"]
    assert results == []  # nobody passed the barrier yet

    barrier.release()
    await asyncio.gather(*tasks)
    assert results == ["alpha", "beta", "gamma"]


async def test_async_barrier_aborts_every_waiter_with_one_failure():
    barrier = AsyncBarrier(parties=2)
    failures: list[BaseException] = []

    async def arrive():
        try:
            await barrier.arrive()
        except BaseException as exc:  # injected failure is the point here
            failures.append(exc)
        else:
            failures.append(None)

    tasks = [asyncio.create_task(arrive()) for _ in range(2)]
    await asyncio.sleep(0)
    assert barrier.arrivals == 2

    injected = RuntimeError("database stopped at close")
    barrier.abort(failure=injected)
    await asyncio.gather(*tasks)
    assert all(exc is injected for exc in failures), failures


async def test_async_barrier_wait_until_full_times_out_when_not_everyone_arrives():
    barrier = AsyncBarrier(parties=3)
    pending = asyncio.create_task(barrier.arrive("only-one"))
    with pytest.raises(asyncio.TimeoutError):
        await barrier.wait_until_full(timeout=0.05)
    assert barrier.arrivals == 1
    pending.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pending


# ---------------------------------------------------------------------------
# split-event scripted transport


SAMPLE_EVENTS = [
    {"type": "text", "content": "hello"},
    {"type": "thinking", "content": "collapsed"},
    {"type": "tool_call", "name": "search_knowledge_base", "argument": "q"},
    {"type": "done"},
]

FULL_FRAMES = [sse_frame(event) for event in SAMPLE_EVENTS]


async def _drain(stream):
    return b"".join([chunk async for chunk in stream.stream()])


async def test_scripted_stream_emits_wire_frames_one_chunk_per_event():
    stream = ScriptedSseStream(SAMPLE_EVENTS)

    joined = await _drain(stream)

    assert joined == b"".join(FULL_FRAMES)
    assert joined.startswith(b"data: ")
    assert stream.frames_sent == 4
    assert stream.chunks_sent == 4


async def test_scripted_stream_survives_one_byte_chunking():
    stream = ScriptedSseStream(SAMPLE_EVENTS, chunk_size=1)

    joined = await _drain(stream)

    assert joined == b"".join(FULL_FRAMES)
    assert stream.chunks_sent == sum(len(frame) for frame in FULL_FRAMES)


def test_sse_frame_encode_matches_production_wire_shape():
    event = StreamEvent(type=StreamEventType.TEXT, content="hello")
    frame = sse_frame(event)

    assert frame == b'data: {"type": "text", "content": "hello"}\n\n'
    payload = json.loads(frame.removeprefix(b"data: ").removesuffix(b"\n\n"))
    assert payload["type"] == "text"
    assert payload["content"] == "hello"


async def test_scripted_stream_injects_failure_after_scripted_frame():
    stream = ScriptedSseStream(SAMPLE_EVENTS, fail_after_frames=2, chunk_size=1)

    delivered = []
    with pytest.raises(ScriptedTransportFailure, match="scripted transport failure"):
        async for chunk in stream.stream():
            delivered.append(chunk)

    assert b"".join(delivered) == FULL_FRAMES[0] + FULL_FRAMES[1]  # chunked but reassembled    assert stream.frames_sent == 2
    assert stream.failures_raised == [stream.failure]


async def test_scripted_stream_reset_replays_the_whole_script():
    stream = ScriptedSseStream(SAMPLE_EVENTS, fail_after_frames=2, chunk_size=1)
    with pytest.raises(ScriptedTransportFailure):
        await _drain(stream)

    stream.reset()
    assert (stream.frames_sent, stream.chunks_sent) == (0, 0)
    assert stream.failures_raised == []
    with pytest.raises(ScriptedTransportFailure):
        await _drain(stream)
    assert stream.frames_sent == 2  # same scripted point, reproducibly


async def test_scripted_stream_truncate_ends_mid_frame_without_terminal():
    stream = ScriptedSseStream(SAMPLE_EVENTS, truncate_last_frame=True)
    done_event = {"type": "done"}
    stream.script = [done_event]

    joined = await _drain(stream)
    frame = FULL_FRAMES[3]

    assert joined == frame[: len(frame) // 2]
    text = joined.decode("utf-8")
    assert "done" not in text  # terminal never became parseable
    assert not text.endswith("\n\n")
