"""Server-owned System AI configuration (spec-10).

The System AI is shared server policy, not a browser preference. The settings
API reads and mutates this one record; summary generation resolves it through
the configuration capability's defaults port so the saved provider/model and
generation bounds actually reach the provider call.

Persistence is deliberately outside the configuration capability: the
capability stays SDK-free and accepts an injected defaults source, while this
module owns the Supabase adapter and the environment fallback.

Spec 20: every blocking call runs on the shared data-access pool, and the
generation-defaults port is backed by a short-lived cache so the synchronous
``current()`` used by provider resolution never touches the database.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.capabilities.configuration.contracts import GenerationDefaults
from app.modules.settings.domain import SystemAIConfig
from app.platform.blocking import run_blocking
from app.platform.config import settings
from app.platform.database import get_supabase_admin

logger = logging.getLogger(__name__)

SETTINGS_TABLE = "system_ai_settings"
SETTINGS_ID = "default"
DEFAULT_TTL_SECONDS = 60.0


def environment_system_ai() -> SystemAIConfig:
    """Return the deployment's environment default.

    This matches the historical settings response, so a workspace that never
    saved a System AI policy keeps exactly the previous behavior.
    """

    return SystemAIConfig(
        provider=settings.default_llm_provider,
        model="",
        temperature=0.5,
        max_tokens=2048,
    )


async def load_system_ai_config() -> SystemAIConfig:
    """Read the persisted policy, falling back to the environment.

    A missing row is the normal first-run state. A storage failure is logged
    and downgraded to the environment default so a settings read never takes
    the workspace offline; the mutation path stays loud about write failures.
    """

    try:
        response = await run_blocking(
            lambda: (
                get_supabase_admin()
                .table(SETTINGS_TABLE)
                .select("provider, model, temperature, max_tokens")
                .eq("id", SETTINGS_ID)
                .limit(1)
                .execute()
            )
        )
        rows = response.data or []
        if not rows:
            return environment_system_ai()
        return SystemAIConfig(**rows[0])
    except Exception:  # noqa: BLE001 - configuration read must not break the app
        logger.warning("Falling back to environment System AI settings", exc_info=True)
        return environment_system_ai()


async def save_system_ai_config(config: SystemAIConfig) -> SystemAIConfig:
    """Persist the validated policy as the singleton server record."""

    payload: dict[str, Any] = {
        **config.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    client = get_supabase_admin()
    existing = await run_blocking(
        lambda: (
            client.table(SETTINGS_TABLE)
            .select("id")
            .eq("id", SETTINGS_ID)
            .limit(1)
            .execute()
        )
    )
    if existing.data:
        await run_blocking(
            lambda: (
                client.table(SETTINGS_TABLE)
                .update(payload)
                .eq("id", SETTINGS_ID)
                .execute()
            )
        )
    else:
        await run_blocking(
            lambda: client.table(SETTINGS_TABLE)
            .insert({"id": SETTINGS_ID, **payload})
            .execute()
        )
    SYSTEM_AI_DEFAULTS.update(config)
    return config


def _generation_defaults(config: SystemAIConfig) -> GenerationDefaults:
    return GenerationDefaults(
        provider=config.provider,
        model=config.model,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )


class SystemAIDefaultsSource:
    """Configuration capability port backed by the persisted System AI.

    ``current()`` is synchronous because provider resolution is synchronous,
    so it must never issue a database read. A short TTL cache keeps the value
    fresh for request paths; ``acurrent()`` refreshes it off the event loop
    with a single flight per expiry window.
    """

    def __init__(self, *, ttl_seconds: float = DEFAULT_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._cached = environment_system_ai()
        self._expires_at = 0.0
        self._lock: asyncio.Lock | None = None
        self._lock_loop: asyncio.AbstractEventLoop | None = None

    def _refresh_lock(self) -> asyncio.Lock:
        """Return a lock bound to the running loop (caches outlive one loop)."""
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    def current(self) -> GenerationDefaults:
        return _generation_defaults(self._cached)

    async def acurrent(self) -> GenerationDefaults:
        if self._fresh():
            return _generation_defaults(self._cached)
        async with self._refresh_lock():
            if not self._fresh():
                await self.refresh()
            return _generation_defaults(self._cached)

    async def acurrent_config(self) -> SystemAIConfig:
        """Return the full policy, refreshing off the loop when stale."""
        if self._fresh():
            return self._cached
        async with self._refresh_lock():
            if not self._fresh():
                await self.refresh()
            return self._cached

    async def refresh(self) -> SystemAIConfig:
        """Reload the persisted policy and publish it to the cache."""
        config = await load_system_ai_config()
        self.update(config)
        return config

    def update(self, config: SystemAIConfig) -> None:
        self._cached = config
        self._expires_at = time.monotonic() + self._ttl

    def invalidate(self) -> None:
        """Drop the cache so the next refresh observes the current database."""
        self._cached = environment_system_ai()
        self._expires_at = 0.0

    def _fresh(self) -> bool:
        return time.monotonic() < self._expires_at


SYSTEM_AI_DEFAULTS = SystemAIDefaultsSource()
