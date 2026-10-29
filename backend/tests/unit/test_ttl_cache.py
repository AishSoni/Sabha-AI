"""Generic TTL cache mechanics (spec 20)."""

from __future__ import annotations

import asyncio

from app.platform.cache import TTLCache


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class Loader:
    def __init__(self, value="value", *, delay=0.0) -> None:
        self.value = value
        self.delay = delay
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.value


async def test_a_hit_does_not_run_the_loader():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=10, clock=clock)
    loader = Loader()

    assert await cache.get_or_load("key", loader) == "value"
    assert await cache.get_or_load("key", loader) == "value"

    assert loader.calls == 1
    assert cache.stats()["hits"] == 1


async def test_an_expired_entry_reloads():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=10, clock=clock)
    loader = Loader()

    await cache.get_or_load("key", loader)
    clock.now = 11.0
    await cache.get_or_load("key", loader)

    assert loader.calls == 2


async def test_zero_ttl_disables_storage():
    cache = TTLCache(ttl_seconds=0)
    loader = Loader()

    await cache.get_or_load("key", loader)
    await cache.get_or_load("key", loader)

    assert loader.calls == 2
    assert len(cache) == 0


async def test_invalidate_drops_one_key_or_everything():
    cache = TTLCache(ttl_seconds=60)
    loader = Loader()

    await cache.get_or_load("a", loader)
    await cache.get_or_load("b", loader)
    cache.invalidate("a")
    await cache.get_or_load("a", loader)
    await cache.get_or_load("b", loader)
    cache.invalidate()
    await cache.get_or_load("a", loader)

    assert loader.calls == 4


async def test_concurrent_misses_share_one_load():
    cache = TTLCache(ttl_seconds=60)
    loader = Loader("shared", delay=0.05)

    results = await asyncio.gather(
        *[cache.get_or_load("key", loader) for _ in range(6)]
    )

    assert results == ["shared"] * 6
    assert loader.calls == 1
    assert cache.stats()["coalesced"] == 5


async def test_the_cache_is_bounded():
    cache = TTLCache(max_entries=2, ttl_seconds=60)
    loader = Loader()

    await cache.get_or_load("a", loader)
    await cache.get_or_load("b", loader)
    await cache.get_or_load("c", loader)

    assert len(cache) == 2
    assert cache.stats()["evictions"] == 1
