"""Spec 20: settings access off the loop plus the defaults cache.

``resolve_effective_settings`` is synchronous, so the defaults port must serve
from memory. These tests pin both halves: reads/writes cross the shared
data-access boundary, and the port refreshes at most once per expiry window.
"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.modules.settings.domain import SystemAIConfig
from app.modules.settings.infrastructure import system_ai
from app.modules.settings.infrastructure.system_ai import (
    SystemAIDefaultsSource,
    load_system_ai_config,
    save_system_ai_config,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
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
        self._client.executes += 1
        time.sleep(self._client.sleep)
        return _Result(self._client.data.get(self._table, []))


class _Client:
    def __init__(self, data=None, *, sleep: float = 0.01) -> None:
        self.data = data or {}
        self.sleep = sleep
        self.threads: list[int] = []
        self.executes = 0

    def table(self, name: str) -> _Query:
        return _Query(self, name)


@pytest.fixture(autouse=True)
def _clean_defaults_cache():
    system_ai.SYSTEM_AI_DEFAULTS.invalidate()
    yield
    system_ai.SYSTEM_AI_DEFAULTS.invalidate()


async def _ticker(stop: asyncio.Event) -> int:
    ticks = 0
    while not stop.is_set():
        ticks += 1
        await asyncio.sleep(0.005)
    return ticks


@pytest.mark.asyncio
async def test_load_config_runs_off_the_loop(monkeypatch):
    client = _Client(
        {
            "system_ai_settings": [
                {
                    "provider": "openrouter",
                    "model": "model-a",
                    "temperature": 0.3,
                    "max_tokens": 1024,
                }
            ]
        }
    )
    monkeypatch.setattr(system_ai, "get_supabase_admin", lambda: client)
    loop_thread = threading.get_ident()
    stop = asyncio.Event()
    ticker = asyncio.create_task(_ticker(stop))

    config = await load_system_ai_config()

    stop.set()
    ticks = await ticker

    assert config == SystemAIConfig(
        provider="openrouter", model="model-a", temperature=0.3, max_tokens=1024
    )
    assert client.threads and all(thread != loop_thread for thread in client.threads)
    assert ticks >= 1


@pytest.mark.asyncio
async def test_save_config_runs_off_the_loop_and_updates_the_cache(monkeypatch):
    client = _Client({"system_ai_settings": []})
    monkeypatch.setattr(system_ai, "get_supabase_admin", lambda: client)
    config = SystemAIConfig(
        provider="gemini", model="gemini-2.5", temperature=0.4, max_tokens=512
    )

    saved = await save_system_ai_config(config)

    assert saved == config
    assert client.executes == 2  # select, then insert
    assert all(thread != threading.get_ident() for thread in client.threads)
    assert system_ai.SYSTEM_AI_DEFAULTS.current().provider == "gemini"
    assert system_ai.SYSTEM_AI_DEFAULTS.current().model == "gemini-2.5"


@pytest.mark.asyncio
async def test_current_serves_from_memory_and_refreshes_once(monkeypatch):
    calls = 0

    async def fake_load():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return SystemAIConfig(
            provider="openrouter", model="cached", temperature=0.2, max_tokens=512
        )

    monkeypatch.setattr(system_ai, "load_system_ai_config", fake_load)
    source = SystemAIDefaultsSource(ttl_seconds=60.0)

    # Before any refresh, the synchronous port answers from the environment
    # default without touching storage.
    assert source.current().model == ""
    assert calls == 0

    results = await asyncio.gather(*(source.acurrent() for _ in range(5)))

    assert calls == 1
    assert {result.model for result in results} == {"cached"}
    # Within the TTL there is no further read.
    assert (await source.acurrent()).model == "cached"
    assert calls == 1

    source.invalidate()
    assert source.current().model == ""
    assert (await source.acurrent()).model == "cached"
    assert calls == 2


@pytest.mark.asyncio
async def test_acurrent_config_shares_the_same_single_flight(monkeypatch):
    calls = 0

    async def fake_load():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return SystemAIConfig(
            provider="openrouter", model="cached", temperature=0.2, max_tokens=512
        )

    monkeypatch.setattr(system_ai, "load_system_ai_config", fake_load)
    source = SystemAIDefaultsSource(ttl_seconds=60.0)

    results = await asyncio.gather(*(source.acurrent_config() for _ in range(5)))

    assert calls == 1
    assert {result.model for result in results} == {"cached"}
    assert (await source.acurrent_config()).model == "cached"
    assert calls == 1


@pytest.mark.asyncio
async def test_update_pins_the_value_without_a_read(monkeypatch):
    async def fail_load():
        raise AssertionError("updated cache must not reload")

    monkeypatch.setattr(system_ai, "load_system_ai_config", fail_load)
    source = SystemAIDefaultsSource(ttl_seconds=60.0)
    config = SystemAIConfig(
        provider="ollama", model="llama", temperature=0.1, max_tokens=256
    )

    source.update(config)

    assert source.current().provider == "ollama"
    assert (await source.acurrent()).model == "llama"
