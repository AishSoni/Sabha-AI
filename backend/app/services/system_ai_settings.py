"""Server-owned System AI configuration (spec-10).

The System AI is shared server policy, not a browser preference. The settings
API reads and mutates this one record; summary generation resolves it through
the configuration capability's defaults port so the saved provider/model and
generation bounds actually reach the provider call.

Persistence is deliberately outside the configuration capability: the
capability stays SDK-free and accepts an injected defaults source, while this
module owns the Supabase adapter and the environment fallback.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.capabilities.configuration.contracts import GenerationDefaults
from app.core.config import settings
from app.core.database import get_supabase_admin
from app.modules.settings.presentation.schemas import SystemAIConfig

logger = logging.getLogger(__name__)

SETTINGS_TABLE = "system_ai_settings"
SETTINGS_ID = "default"


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


def load_system_ai_config() -> SystemAIConfig:
    """Read the persisted policy, falling back to the environment.

    A missing row is the normal first-run state. A storage failure is logged
    and downgraded to the environment default so a settings read never takes
    the workspace offline; the mutation path stays loud about write failures.
    """

    try:
        response = (
            get_supabase_admin()
            .table(SETTINGS_TABLE)
            .select("provider, model, temperature, max_tokens")
            .eq("id", SETTINGS_ID)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return environment_system_ai()
        return SystemAIConfig(**rows[0])
    except Exception:  # noqa: BLE001 - configuration read must not break the app
        logger.warning("Falling back to environment System AI settings", exc_info=True)
        return environment_system_ai()


def save_system_ai_config(config: SystemAIConfig) -> SystemAIConfig:
    """Persist the validated policy as the singleton server record."""

    payload: dict[str, Any] = {
        **config.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    client = get_supabase_admin()
    existing = (
        client.table(SETTINGS_TABLE)
        .select("id")
        .eq("id", SETTINGS_ID)
        .limit(1)
        .execute()
    )
    if existing.data:
        (
            client.table(SETTINGS_TABLE)
            .update(payload)
            .eq("id", SETTINGS_ID)
            .execute()
        )
    else:
        client.table(SETTINGS_TABLE).insert(
            {"id": SETTINGS_ID, **payload}
        ).execute()
    return config


class SystemAIDefaultsSource:
    """Configuration capability port backed by the persisted System AI."""

    def current(self) -> GenerationDefaults:
        config = load_system_ai_config()
        return GenerationDefaults(
            provider=config.provider,
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )


SYSTEM_AI_DEFAULTS = SystemAIDefaultsSource()
