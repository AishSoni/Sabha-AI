"""Meeting reads must never run the blocking Supabase client on the loop.

``MeetingService`` receives its data-access boundary as ``run_blocking`` so
application code stays independent of the platform adapter. These tests pin
the boundary without a database: a synchronous fake burns wall-clock time the
same way one PostgREST round trip does.
"""

from __future__ import annotations

import asyncio
import threading
import time

from app.modules.meetings.application.meeting_service import MeetingService


class _Result:
    def __init__(self, data):
        self.data = data


class _SlowQuery:
    """Chainable stand-in for a supabase-py query builder."""

    def __init__(self, db: "_SlowDb", table: str) -> None:
        self._db = db
        self._table = table

    def select(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def insert(self, payload) -> "_SlowQuery":
        return self

    def update(self, payload) -> "_SlowQuery":
        return self

    def delete(self) -> "_SlowQuery":
        return self

    def eq(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def in_(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def like(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def order(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def limit(self, *args, **kwargs) -> "_SlowQuery":
        return self

    def single(self) -> "_SlowQuery":
        return self

    def execute(self) -> _Result:
        self._db.calls.append((self._table, threading.get_ident()))
        time.sleep(self._db.delay)
        return _Result([])


class _SlowDb:
    def __init__(self, delay: float = 0.15) -> None:
        self.delay = delay
        self.calls: list[tuple[str, int]] = []

    def table(self, name: str) -> _SlowQuery:
        return _SlowQuery(self, name)

    def rpc(self, name: str, params) -> _SlowQuery:
        return _SlowQuery(self, f"rpc:{name}")


def _service(db: _SlowDb, run_blocking=None) -> MeetingService:
    return MeetingService(
        db,
        snapshot_template=None,
        construct_participants=None,
        run_blocking=run_blocking,
    )


async def test_get_meeting_runs_queries_off_the_event_loop():
    db = _SlowDb()
    service = _service(db)
    loop_thread = threading.get_ident()

    await service.get_meeting("meeting-1")

    assert db.calls
    assert all(thread_id != loop_thread for _, thread_id in db.calls)


async def test_injected_runner_owns_every_data_access_call():
    db = _SlowDb(delay=0)
    seen: list[str] = []

    async def runner(operation):
        seen.append("dispatch")
        return await asyncio.to_thread(operation)

    service = _service(db, run_blocking=runner)

    await service.get_meeting("meeting-1")

    assert len(seen) == len(db.calls)


async def test_the_loop_keeps_ticking_during_a_blocking_read():
    db = _SlowDb(delay=0.2)
    service = _service(db)
    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.02)
            ticks += 1

    task = asyncio.create_task(ticker())
    try:
        await service.get_meeting("meeting-1")
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert ticks >= 5
