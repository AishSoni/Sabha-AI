"""Unit: bounded replay content cache mechanics (spec 20).

The cache exists for two reasons: immutable package content must never be
re-read for the same pinned version, and concurrent misses for one key must
share a single loader so the replay UI's parallel checkpoint reads do not each
open their own connection.
"""

from __future__ import annotations

import asyncio

import pytest

from app.replay.cache import ReplayCache


class _Clock:
    """Deterministic monotonic clock for TTL tests."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


async def _boom() -> object:
    raise AssertionError("loader must not run")


async def test_disabled_cache_runs_the_loader_every_time() -> None:
    cache = ReplayCache(max_entries=0)
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return {"value": calls}

    assert await cache.get_or_load("package", "k", loader) == {"value": 1}
    assert await cache.get_or_load("package", "k", loader) == {"value": 2}
    assert calls == 2
    assert len(cache) == 0
    assert cache.stats()["hits"] == 0


async def test_a_hit_never_runs_the_loader_again() -> None:
    cache = ReplayCache()
    payload = {"messages": ["one", "two"]}

    async def loader():
        return payload

    first = await cache.get_or_load("package", ("pkg", "1"), loader)
    second = await cache.get_or_load("package", ("pkg", "1"), _boom)
    assert first is payload
    assert second is payload
    assert cache.stats() == {
        "hits": 1,
        "misses": 1,
        "loads": 1,
        "coalesced": 0,
        "evictions": 0,
    }


async def test_concurrent_misses_share_one_load() -> None:
    cache = ReplayCache()
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return "checkpoint-bundle"

    tasks = [
        asyncio.create_task(
            cache.get_or_load("checkpoint", ("pkg", "1", "initial"), loader)
        )
        for _ in range(6)
    ]
    await started.wait()
    for _ in range(5):
        await asyncio.sleep(0)
    release.set()

    results = await asyncio.gather(*tasks)
    assert results == ["checkpoint-bundle"] * 6
    assert calls == 1
    assert cache.stats()["loads"] == 1
    assert cache.stats()["coalesced"] == 5


async def test_a_failed_load_leaves_no_inflight_entry() -> None:
    cache = ReplayCache()
    attempts = 0

    async def failing():
        nonlocal attempts
        attempts += 1
        raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError):
        await cache.get_or_load("package", "k", failing)
    with pytest.raises(RuntimeError):
        await cache.get_or_load("package", "k", failing)
    assert attempts == 2
    assert len(cache) == 0


async def test_ttl_expiry_reloads_and_never_extends_early() -> None:
    clock = _Clock()
    cache = ReplayCache(clock=clock)
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return f"status-{calls}"

    assert await cache.get_or_load("status", "k", loader, ttl=30) == "status-1"
    clock.advance(29.9)
    assert await cache.get_or_load("status", "k", loader, ttl=30) == "status-1"
    clock.advance(0.2)
    assert await cache.get_or_load("status", "k", loader, ttl=30) == "status-2"
    assert calls == 2


async def test_zero_ttl_observation_is_not_stored() -> None:
    cache = ReplayCache()
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return calls

    assert await cache.get_or_load("status", "k", loader, ttl=0) == 1
    assert await cache.get_or_load("status", "k", loader, ttl=0) == 2
    assert len(cache) == 0


async def test_a_cached_none_is_a_real_value() -> None:
    cache = ReplayCache()
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return None

    assert await cache.get_or_load("asset", "missing", loader) is None
    assert await cache.get_or_load("asset", "missing", _boom) is None
    assert calls == 1


async def test_lru_bound_evicts_the_least_recently_used_entry() -> None:
    cache = ReplayCache(max_entries=2)
    cache.prime("package", "a", 1)
    cache.prime("package", "b", 2)
    assert await cache.get_or_load("package", "a", _boom) == 1
    cache.prime("package", "c", 3)

    assert cache.stats()["evictions"] == 1
    assert len(cache) == 2
    # ``b`` was older than ``a`` when ``c`` arrived.
    assert await cache.get_or_load("package", "b", _loader_returning(22)) == 22
    assert cache.stats()["loads"] == 1


async def test_prime_skips_none_and_invalidate_is_scoped_to_one_kind() -> None:
    cache = ReplayCache()
    cache.prime("status", "missing", None)
    cache.prime("package", ("fixture", "1"), {"package_id": "fixture"})
    cache.prime("status", ("fixture", "1"), "published")

    assert len(cache) == 2
    cache.invalidate("status")

    assert len(cache) == 1
    assert await cache.get_or_load("package", ("fixture", "1"), _boom) == {
        "package_id": "fixture"
    }
    assert (
        await cache.get_or_load("status", ("fixture", "1"), _loader_returning("retired"))
        == "retired"
    )


def _loader_returning(value):
    async def loader():
        return value

    return loader
