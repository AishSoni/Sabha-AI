"""Bounded, single-flight cache for immutable replay package content (spec-20).

A published package version never changes: the registry pins a content hash and
every checkpoint, asset, and tape is validated when it is stored. Once loaded,
that content can be served from process memory for the life of the version.

Only *content* is cached indefinitely. Registry lookups ("which version is
active?") and retirement status are deployment state, not package content, so
they carry a short TTL. Values are raw rows and JSON payloads; callers rebuild
their own DTOs so no request can mutate another request's view.

Concurrent misses for the same key share one loader. Without this, the replay
UI's six parallel checkpoint reads would each open a connection and re-resolve
the package, which is exactly the amplification spec-20 removes.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable, Hashable

Key = tuple[str, Hashable]

# A miss sentinel distinct from a cached ``None`` (an absent package row).
_MISSING = object()


class ReplayCache:
    """Process-wide LRU with single-flight loads and TTL for mutable state."""

    def __init__(
        self,
        *,
        max_entries: int = 256,
        registry_ttl_seconds: float = 30.0,
        status_ttl_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_entries = max(0, int(max_entries))
        self.registry_ttl_seconds = max(0.0, float(registry_ttl_seconds))
        self.status_ttl_seconds = max(0.0, float(status_ttl_seconds))
        self._clock = clock
        self._entries: OrderedDict[Key, tuple[Any, float | None]] = OrderedDict()
        self._inflight: dict[Key, asyncio.Task[Any]] = {}
        self._stats = {
            "hits": 0,
            "misses": 0,
            "loads": 0,
            "coalesced": 0,
            "evictions": 0,
        }

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------
    @property
    def enabled(self) -> bool:
        return self._max_entries > 0

    def stats(self) -> dict[str, int]:
        return dict(self._stats)

    def __len__(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        self._entries.clear()
        self._stats = {name: 0 for name in self._stats}

    # ------------------------------------------------------------------
    # Reads and writes
    # ------------------------------------------------------------------
    async def get_or_load(
        self,
        kind: str,
        key: Hashable,
        loader: Callable[[], Awaitable[Any]],
        *,
        ttl: float | None = None,
    ) -> Any:
        """Return the cached value, or run ``loader`` once for all waiters."""
        if not self.enabled:
            return await loader()

        full_key: Key = (kind, key)
        cached = self._lookup(full_key)
        if cached is not _MISSING:
            self._stats["hits"] += 1
            return cached

        task = self._inflight.get(full_key)
        if task is not None:
            self._stats["coalesced"] += 1
            return await asyncio.shield(task)

        task = asyncio.ensure_future(self._load(full_key, loader, ttl))
        self._inflight[full_key] = task
        task.add_done_callback(
            lambda finished, slot=full_key: self._forget(slot, finished)
        )
        return await asyncio.shield(task)

    def prime(
        self,
        kind: str,
        key: Hashable,
        value: Any,
        *,
        ttl: float | None = None,
    ) -> None:
        """Seed a value already fetched as part of another query."""
        if not self.enabled or value is None:
            return
        self._store((kind, key), value, ttl)

    def invalidate(self, kind: str | None = None) -> None:
        """Drop cached state; content entries are only dropped on request."""
        if kind is None:
            self._entries.clear()
            return
        for full_key in [slot for slot in self._entries if slot[0] == kind]:
            self._entries.pop(full_key, None)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _load(
        self,
        full_key: Key,
        loader: Callable[[], Awaitable[Any]],
        ttl: float | None,
    ) -> Any:
        self._stats["loads"] += 1
        value = await loader()
        self._store(full_key, value, ttl)
        return value

    def _store(self, full_key: Key, value: Any, ttl: float | None) -> None:
        expires_at: float | None
        if ttl is None:
            expires_at = None
        elif ttl <= 0:
            # A zero TTL means "never cache this observation".
            return
        else:
            expires_at = self._clock() + ttl
        self._entries[full_key] = (value, expires_at)
        self._entries.move_to_end(full_key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)
            self._stats["evictions"] += 1

    def _lookup(self, full_key: Key) -> Any:
        entry = self._entries.get(full_key)
        if entry is None:
            self._stats["misses"] += 1
            return _MISSING
        value, expires_at = entry
        if expires_at is not None and self._clock() >= expires_at:
            self._entries.pop(full_key, None)
            self._stats["misses"] += 1
            return _MISSING
        self._entries.move_to_end(full_key)
        return value

    def _forget(self, full_key: Key, task: asyncio.Task[Any]) -> None:
        if self._inflight.get(full_key) is task:
            self._inflight.pop(full_key, None)


__all__ = ["ReplayCache"]
