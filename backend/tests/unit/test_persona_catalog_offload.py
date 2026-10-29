"""Spec 20: persona catalog access leaves the event loop.

The catalog uses the synchronous Supabase client. Every execute therefore has
to cross the shared data-access boundary; these tests pin the boundary by
running against a fake client that records the thread of each ``execute``.
"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.modules.persona_catalog.application.contracts import UnknownStacks
from app.modules.persona_catalog.infrastructure.supabase import (
    SupabasePersonaCatalog,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """A chainable stand-in for a PostgREST builder."""

    def __init__(self, client: "_Client", table: str) -> None:
        self._client = client
        self._table = table

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        def chain(*args, **kwargs):
            return self

        return chain

    def execute(self):
        self._client.threads.append(threading.get_ident())
        time.sleep(0.01)
        return _Result(self._client.data.get(self._table, []))


class _Client:
    def __init__(self, data: dict[str, object] | None = None) -> None:
        self.data = data or {}
        self.threads: list[int] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: dict) -> _Query:
        return _Query(self, "rpc")


async def _ticker(stop: asyncio.Event) -> int:
    ticks = 0
    while not stop.is_set():
        ticks += 1
        await asyncio.sleep(0.005)
    return ticks


@pytest.mark.asyncio
async def test_list_templates_runs_every_execute_off_the_loop():
    client = _Client(
        {
            "personas": [{"id": "p1", "name": "One"}, {"id": "p2", "name": "Two"}],
            "prompt_versions": [{"content": "prompt", "version": 1}],
            "persona_knowledge_stacks": [{"stack_id": "stack-1"}],
        }
    )
    catalog = SupabasePersonaCatalog(lambda: client)
    loop_thread = threading.get_ident()
    stop = asyncio.Event()
    ticker = asyncio.create_task(_ticker(stop))

    rows = await catalog.list_templates(user_id="user-1")

    stop.set()
    ticks = await ticker

    assert len(rows) == 2
    assert rows[0]["active_prompt"] == "prompt"
    assert rows[0]["stack_ids"] == ["stack-1"]
    # 1 row query + 2 per persona (prompt, stacks).
    assert len(client.threads) == 5
    assert all(thread != loop_thread for thread in client.threads)
    # A blocking loop would starve the ticker during the 50 ms of fake work.
    assert ticks >= 3


@pytest.mark.asyncio
async def test_read_creation_snapshot_runs_off_the_loop():
    client = _Client({"rpc": {"id": "p1", "name": "One"}})
    catalog = SupabasePersonaCatalog(lambda: client)
    loop_thread = threading.get_ident()

    row = await catalog.read_creation_snapshot("p1")

    assert row == {"id": "p1", "name": "One"}
    assert client.threads and client.threads[0] != loop_thread


@pytest.mark.asyncio
async def test_stack_validation_runs_off_the_loop_and_names_unknown_ids():
    client = _Client({"knowledge_stacks": [{"id": "known"}]})
    catalog = SupabasePersonaCatalog(lambda: client)
    loop_thread = threading.get_ident()

    with pytest.raises(UnknownStacks) as excinfo:
        await catalog._reject_unknown_stacks(["known", "missing"])

    assert excinfo.value.unknown == ["missing"]
    assert client.threads and all(thread != loop_thread for thread in client.threads)
