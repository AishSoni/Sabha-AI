"""Spec 20 guard: slow data access must not serialize the whole server.

The baseline measured five concurrent ``GET /api/meetings/{id}`` at the sum
of their individual latencies (1345, 5036, 5036, 5035, 5034 ms) and
``/health`` at 2331 ms behind one closing read. A blocking client awaited
inline on the event loop is the cause; these tests fail if any handler starts
touching it that way again.
"""

from __future__ import annotations

import asyncio
import threading
import time

import httpx

from app.bootstrap import Container, create_app
from app.modules.meetings.application.meeting_service import MeetingService
from app.platform.blocking import run_blocking


class _Result:
    def __init__(self, data):
        self.data = data


class _SlowQuery:
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
    """One call costs 300 ms, matching an uncached PostgREST round trip."""

    def __init__(self, delay: float = 0.3) -> None:
        self.delay = delay
        self.calls: list[tuple[str, int]] = []

    def table(self, name: str) -> _SlowQuery:
        return _SlowQuery(self, name)

    def rpc(self, name: str, params: dict) -> _SlowQuery:
        return _SlowQuery(self, f"rpc:{name}")


def _app(db: _SlowDb):
    service = MeetingService(
        db,
        snapshot_template=None,
        construct_participants=None,
        run_blocking=run_blocking,
    )
    return create_app(
        Container(
            prompt_catalog=object(),
            meeting_service=service,
            meeting_reads=service,
        )
    )


async def test_health_answers_while_slow_meeting_reads_are_in_flight():
    db = _SlowDb()
    app = _app(db)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        started = time.perf_counter()
        reads = [
            asyncio.create_task(client.get("/api/meetings/meeting-1"))
            for _ in range(8)
        ]
        await asyncio.sleep(0.05)

        latencies: list[float] = []
        for _ in range(3):
            began = time.perf_counter()
            response = await client.get("/health")
            latencies.append(time.perf_counter() - began)
            assert response.status_code == 200

        responses = await asyncio.gather(*reads)
        elapsed = time.perf_counter() - started

    assert [response.status_code for response in responses] == [404] * 8
    assert max(latencies) < 0.1
    # Serialized work would take 8 x 300 ms; overlapping work is one wave.
    assert elapsed < 1.5
    assert len(db.calls) == 8
    loop_thread = threading.get_ident()
    assert all(thread_id != loop_thread for _, thread_id in db.calls)
