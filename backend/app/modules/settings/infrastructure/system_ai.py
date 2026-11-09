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
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

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


SystemAISource = Literal["stored", "environment", "fallback"]


@dataclass(frozen=True)
class SystemAIPolicy:
    """The effective policy together with where it came from.

    The settings surface must not present an environment fallback as a saved
    policy, nor hide a storage read failure behind a successful response.
    """

    config: SystemAIConfig
    source: SystemAISource
    degraded: bool = False
    message: str = ""


def environment_system_ai_policy() -> SystemAIPolicy:
    return SystemAIPolicy(
        config=environment_system_ai(),
        source="environment",
        message="No saved System AI policy is stored; environment defaults are in effect.",
    )


def fallback_system_ai_policy() -> SystemAIPolicy:
    return SystemAIPolicy(
        config=environment_system_ai(),
        source="fallback",
        degraded=True,
        message=(
            "The saved System AI policy could not be read. "
            "Environment defaults are in effect until storage recovers."
        ),
    )


async def load_system_ai_policy() -> SystemAIPolicy:
    """Read the persisted policy and preserve its provenance.

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
            return environment_system_ai_policy()
        return SystemAIPolicy(
            config=SystemAIConfig(**rows[0]),
            source="stored",
            message="Saved System AI policy loaded.",
        )
    except Exception:  # noqa: BLE001 - configuration read must not break the app
        logger.warning(
            "Falling back to environment System AI settings after a storage read failure"
        )
        return fallback_system_ai_policy()


async def load_system_ai_config() -> SystemAIConfig:
    """Compatibility accessor for callers that only need the effective config."""

    return (await load_system_ai_policy()).config


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
        self._cached = environment_system_ai_policy()
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
        return _generation_defaults(self._cached.config)

    def current_policy(self) -> SystemAIPolicy:
        return self._cached

    async def acurrent(self) -> GenerationDefaults:
        if self._fresh():
            return _generation_defaults(self._cached.config)
        async with self._refresh_lock():
            if not self._fresh():
                await self._refresh_policy()
            return _generation_defaults(self._cached.config)

    async def acurrent_config(self) -> SystemAIConfig:
        """Return the effective config, refreshing off the loop when stale."""
        return (await self.acurrent_policy()).config

    async def acurrent_policy(self) -> SystemAIPolicy:
        """Return the policy and its provenance, refreshing when stale."""
        if self._fresh():
            return self._cached
        async with self._refresh_lock():
            if not self._fresh():
                await self._refresh_policy()
            return self._cached

    async def _refresh_policy(self) -> SystemAIPolicy:
        policy = await load_system_ai_policy()
        self.update_policy(policy)
        return policy

    async def refresh(self) -> SystemAIConfig:
        """Reload the persisted policy and publish it to the cache."""
        return (await self._refresh_policy()).config

    def update(self, config: SystemAIConfig) -> None:
        """Publish a known-persisted configuration (the save path)."""
        self.update_policy(
            SystemAIPolicy(
                config=config,
                source="stored",
                message="Saved System AI policy loaded.",
            )
        )

    def update_policy(self, policy: SystemAIPolicy) -> None:
        self._cached = policy
        self._expires_at = time.monotonic() + self._ttl

    def invalidate(self) -> None:
        """Drop the cache so the next refresh observes the current database."""
        self._cached = environment_system_ai_policy()
        self._expires_at = 0.0

    def _fresh(self) -> bool:
        return time.monotonic() < self._expires_at


SYSTEM_AI_DEFAULTS = SystemAIDefaultsSource()
