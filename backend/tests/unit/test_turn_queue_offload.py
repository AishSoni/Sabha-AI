"""The durable queue must never run blocking PostgREST work on the event loop.

The Supabase client is synchronous and one round trip to the edge takes
hundreds of milliseconds. Inline calls froze the whole server, including the
runner's own poll loop, so every queue RPC goes through ``asyncio.to_thread``.
These tests pin that guarantee without needing a database.
"""

from __future__ import annotations

import asyncio
import threading
import time
from types import SimpleNamespace

from app.modules.meetings.infrastructure.turns import TurnClaim, TurnQueueService


class _Result:
    def __init__(self, data):
        self.data = data


class _BlockingDb:
    """A synchronous client that burns wall-clock time, like the real one."""

    def __init__(self, delay: float = 0.2) -> None:
        self.delay = delay
        self.calls: list[tuple[str, dict, int]] = []

    def rpc(self, name: str, params: dict) -> "_BlockingRpc":
        return _BlockingRpc(self, name, params)


class _BlockingRpc:
    def __init__(self, db: _BlockingDb, name: str, params: dict) -> None:
        self._db = db
        self._name = name
        self._params = params

    def execute(self) -> _Result:
        self._db.calls.append((self._name, self._params, threading.get_ident()))
        time.sleep(self._db.delay)
        return _Result(None)


def _service(db: _BlockingDb) -> TurnQueueService:
    return TurnQueueService(SimpleNamespace(db=db), max_queued=10)


def _claim() -> TurnClaim:
    return TurnClaim(
        operation={"payload": {}},
        operation_id="op-1",
        meeting_id="meeting-1",
        participant_id="participant-1",
        fence=1,
        context_boundary=0,
    )


async def test_claim_does_not_block_the_event_loop():
    db = _BlockingDb(delay=0.2)
    service = _service(db)

    task = asyncio.create_task(service.claim("worker-1"))
    await asyncio.sleep(0.05)

    assert db.calls, "the RPC never started"
    assert not task.done(), "a blocking RPC ran on the event loop"

    assert await task is None
    assert db.calls[0][0] == "claim_next_turn_operation"
    assert db.calls[0][2] != threading.get_ident(), "the RPC ran on the loop thread"


async def test_interrupt_claim_offloads_its_terminal_write():
    db = _BlockingDb(delay=0.1)
    service = _service(db)

    task = asyncio.create_task(
        service.interrupt_claim(_claim(), "execution_timeout", "deadline")
    )
    await asyncio.sleep(0.02)

    assert not task.done(), "a blocking RPC ran on the event loop"

    result = await task
    assert result.status == "interrupted"
    assert result.error_code == "execution_timeout"
    assert [call[0] for call in db.calls] == ["fail_turn_operation"]
    assert db.calls[0][2] != threading.get_ident()


async def test_operation_effects_reads_off_the_event_loop():
    class _Table:
        def __init__(self, db):
            self._db = db

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            self._db.calls.append(("table", {}, threading.get_ident()))
            time.sleep(self._db.delay)
            return _Result([])

    db = _BlockingDb(delay=0.1)
    db.table = lambda _name: _Table(db)  # type: ignore[attr-defined]
    service = _service(db)

    task = asyncio.create_task(service.operation_effects("op-1"))
    await asyncio.sleep(0.02)

    assert not task.done(), "a blocking table read ran on the event loop"
    assert await task == ([], [])
    assert db.calls[0][2] != threading.get_ident()
