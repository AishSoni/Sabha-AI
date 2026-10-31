"""Bounded replay pacing multipliers (spec-26)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.replay.streaming import ReplayClosingStream, ReplayTurnStream

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
CLOSING_ID = "77777777-7777-4777-8777-777777777777"


class FakeSource:
    def __init__(self, *, tape=None, closing_tape=None) -> None:
        self._tape = tape
        self._closing_tape = closing_tape

    async def read_tape(self, package_id, version, operation_id):
        return self._tape

    async def read_closing_tape(self, package_id, version, closing_id):
        return self._closing_tape


PUBLISHED = SimpleNamespace(package_id="pkg", version="1")


def _turn_tape(*delays: int):
    events = []
    for index, delay in enumerate(delays, start=1):
        events.append(
            {
                "id": f"event-{index}",
                "sequence": index,
                "type": "text" if index < len(delays) else "done",
                "delay_ms": delay,
                "operation_id": OPERATION_ID,
                "meeting_id": MEETING_ID,
                "payload": {"text": f"chunk-{index}"},
            }
        )
    return SimpleNamespace(meeting_id=MEETING_ID, operation_id=OPERATION_ID, events=events)


def _closing_tape(*delays: int):
    events = []
    for index, delay in enumerate(delays, start=1):
        events.append(
            {
                "id": f"closing-event-{index}",
                "sequence": index,
                "item_id": f"item-{index}",
                "kind": "summary" if index == len(delays) else "ballot",
                "delay_ms": delay,
                "payload": {
                    "text": f"closing-{index}",
                    "terminal": index == len(delays),
                },
            }
        )
    return SimpleNamespace(
        meeting_id=MEETING_ID, closing_id=CLOSING_ID, events=events
    )


async def _collect(stream):
    return [frame async for frame in stream]


def _stream(tape, delays: list[float], **kwargs) -> ReplayTurnStream:
    async def clock(seconds: float) -> None:
        delays.append(seconds)

    return ReplayTurnStream(FakeSource(tape=tape), PUBLISHED, clock=clock, **kwargs)


def _closing_stream(tape, delays: list[float], **kwargs) -> ReplayClosingStream:
    async def clock(seconds: float) -> None:
        delays.append(seconds)

    return ReplayClosingStream(
        FakeSource(closing_tape=tape), PUBLISHED, clock=clock, **kwargs
    )


def test_turn_delays_are_divided_by_speed_and_first_is_immediate() -> None:
    async def run() -> list[float]:
        delays: list[float] = []
        frames = await _collect(
            _stream(_turn_tape(0, 200, 400), delays).events(
                MEETING_ID, OPERATION_ID, speed=2
            )
        )
        assert len(frames) == 3
        return delays

    assert asyncio.run(run()) == [0.1, 0.2]


def test_turn_suffix_resume_keeps_delays_and_skips_accepted_sequences() -> None:
    async def run() -> list[float]:
        delays: list[float] = []
        frames = await _collect(
            _stream(_turn_tape(100, 200, 400), delays).events(
                MEETING_ID, OPERATION_ID, after=2, speed=2
            )
        )
        assert len(frames) == 1
        return delays

    # The first emitted suffix frame is immediate; only the prefix is skipped.
    assert asyncio.run(run()) == []


def test_delay_cap_is_applied_before_the_multiplier() -> None:
    async def run() -> list[float]:
        delays: list[float] = []
        await _collect(
            _stream(_turn_tape(0, 900), delays, max_delay_ms=100).events(
                MEETING_ID, OPERATION_ID, speed=2
            )
        )
        return delays

    assert asyncio.run(run()) == [0.05]


def test_closing_delays_are_divided_by_speed() -> None:
    async def run() -> list[float]:
        delays: list[float] = []
        await _collect(
            _closing_stream(_closing_tape(0, 300), delays).events(
                MEETING_ID, CLOSING_ID, speed=2
            )
        )
        return delays

    assert asyncio.run(run()) == [0.15]


def test_unsupported_speed_is_rejected_before_reading_the_tape() -> None:
    async def run() -> None:
        with pytest.raises(ValueError):
            await _collect(
                _stream(_turn_tape(0), []).events(
                    MEETING_ID, OPERATION_ID, speed=3
                )
            )
        with pytest.raises(ValueError):
            await _collect(
                _closing_stream(_closing_tape(0), []).events(
                    MEETING_ID, CLOSING_ID, speed=0
                )
            )

    asyncio.run(run())
