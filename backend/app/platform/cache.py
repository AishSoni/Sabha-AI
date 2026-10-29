"""Bounded TTL cache with single-flight loads (spec 20).

Slow-moving configuration (the persona list, the system AI policy) is read on
almost every page load but changes rarely. Caching it removes a WAN round
trip per request. Two rules keep the cache honest:

* Entries expire. Process-local caches are never the authority; a write
  invalidates its own process immediately and every other process within the
  TTL.
* Concurrent misses for the same key share one load. A page that fires six
  requests at once still performs one database read.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable

_ALL = object()
_MISSING = object()


class TTLCache:
    def __init__(
        self,
        *,
        max_entries: int = 128,
        ttl_seconds: float = 45.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_entries = max(int(max_entries), 1)
        self._ttl = max(float(ttl_seconds), 0.0)
        self._clock = clock
        self._entries: OrderedDict[Any, tuple[Any, float]] = OrderedDict()
        self._inflight: dict[Any, asyncio.Task] = {}
        self._stats = {"hits": 0, "misses": 0, "loads": 0, "coalesced": 0, "evictions": 0}

    async def get_or_load(
        self,
        key: Any,
        loader: Callable[[], Awaitable[Any]],
        *,
        ttl: float | None = None,
    ) -> Any:
        found, value = self._lookup(key)
        if found:
            self._stats["hits"] += 1
            return value

        self._stats["misses"] += 1
        task = self._inflight.get(key)
        if task is not None:
            self._stats["coalesced"] += 1
            return await asyncio.shield(task)

        task = asyncio.ensure_future(self._load(key, loader, ttl))
        self._inflight[key] = task
        task.add_done_callback(lambda done, key=key: self._forget(key, done))
        return await asyncio.shield(task)

    async def _load(self, key, loader, ttl: float | None) -> Any:
        self._stats["loads"] += 1
        value = await loader()
        self._store(key, value, ttl)
        return value

    def _forget(self, key, task: asyncio.Task) -> None:
        if self._inflight.get(key) is task:
            self._inflight.pop(key, None)

    def _lookup(self, key) -> tuple[bool, Any]:
        entry = self._entries.get(key, _MISSING)
        if entry is _MISSING:
            return False, None
        value, expires_at = entry
        if expires_at and expires_at <= self._clock():
            self._entries.pop(key, None)
            return False, None
        self._entries.move_to_end(key)
        return True, value

    def _store(self, key, value, ttl: float | None) -> None:
        effective = self._ttl if ttl is None else max(float(ttl), 0.0)
        if effective <= 0:
            return
        self._entries[key] = (value, self._clock() + effective)
        self._entries.move_to_end(key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)
            self._stats["evictions"] += 1

    def invalidate(self, key: Any = _ALL) -> None:
        if key is _ALL:
            self._entries.clear()
        else:
            self._entries.pop(key, None)

    def stats(self) -> dict[str, int]:
        return dict(self._stats)

    def __len__(self) -> int:
        return len(self._entries)
