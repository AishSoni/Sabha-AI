"""Generation-settings resolution (first extraction out of the orchestrator
monolith, per spec-03).

A SDK-free use case: merges per-request browser overrides over the
participant's persisted provider_config snapshot, applies server defaults,
and fails loudly for cloud turns that carry no key of any kind. The
architecture checker (tests/architecture) enforces that this capability
imports nothing beyond its own subtree, the platform config, and its
sibling contracts.
"""

from app.capabilities.configuration.contracts import (
    MissingProviderKeyError,
    ProviderSnapshotDefaults,
    RequestDefaults,
)
from app.core.config import settings


def resolve_generation_settings(
    participant,
    provider_settings=None,
    provider_api_key=None,
) -> dict:
    """Merge per-request browser overrides over the participant's persisted
    provider_config snapshot (created at meeting time), then server defaults.

    Duck-typed inputs on purpose: callers pass the persisted DTOs (tests pass
    fakes), so this capability never imports the request schema models.
    Request values win; absent request values fall back to the participant's
    own settings; the API key never persists — it rides the request header
    only. Cloud providers must have some key available or the turn is
    rejected with MissingProviderKeyError.
    """
    snapshot = (
        getattr(participant, "provider_config", None) or ProviderSnapshotDefaults()
    )
    overrides = provider_settings or RequestDefaults()

    resolved = {
        "provider": overrides.provider or snapshot.provider or "",
        "model": overrides.model or snapshot.model or "",
        "temperature": (
            overrides.temperature
            if overrides.temperature is not None
            else snapshot.temperature
        ),
        "max_tokens": (
            overrides.max_tokens
            if overrides.max_tokens is not None
            else snapshot.max_tokens
        ),
        # base_url is a request-only concept (local Ollama destinations).
        "base_url": overrides.base_url or None,
        # Per-request secret; never stored with the participant.
        "api_key": provider_api_key,
    }

    resolved["provider"] = resolved["provider"] or settings.default_llm_provider

    if resolved["provider"] in ("openrouter", "gemini"):
        server_key = getattr(settings, f"{resolved['provider']}_api_key", "")
        if not resolved["api_key"] and not server_key:
            raise MissingProviderKeyError(
                f"No API key available for {resolved['provider']}. "
                "Provide a browser key (BYOK) or configure the server key."
            )

    return resolved
