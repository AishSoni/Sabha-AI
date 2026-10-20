"""Generation-settings resolution (first extraction out of the orchestrator
monolith, per spec-03; spec-06 adds the effective-settings resolver on top).

A SDK-free use case: merges per-request browser overrides over the
participant's persisted provider_config snapshot, applies server defaults,
and fails loudly for cloud turns that carry no key of any kind. The
architecture checker (tests/architecture) enforces that this capability
imports nothing beyond its own subtree, the platform config, and its
sibling contracts.
"""

from app.capabilities.configuration.contracts import (
    EffectiveGenerationSettings,
    GenerationDefaults,
    IncompatibleGenerationPlan,
    MissingProviderKeyError,
    ProviderSnapshotDefaults,
    RequestDefaults,
)
from app.capabilities.configuration.ports import (
    GenerationDefaultsSource,
    ProviderCatalogPort,
)
from app.core.config import settings

# Providers the runtime transports actually implement (app.llm factory).
SUPPORTED_PROVIDERS = ("ollama", "openrouter", "gemini")

CLOUD_PROVIDERS = ("openrouter", "gemini")

SETTING_NAMES = {
    "openrouter": {"api_key": "openrouter_api_key", "model": "openrouter_default_model"},
    "gemini": {"api_key": "gemini_api_key", "model": "gemini_default_model"},
    "ollama": {"model": "ollama_default_model"},
}


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


# ---------------------------------------------------------------------------
# Spec-06 effective-settings resolver
# ---------------------------------------------------------------------------
# The legacy dict resolver above stays for the orchestrator until the
# inference path cuts over (spec 06, slice G); new code resolves through
# resolve_effective_settings below.

# Static catalog mirroring the app.llm factory: any other provider name
# raises "Unknown provider" at construction time — refusing it during
# resolution turns that late failure into a typed, pre-transport one.
_DEFAULT_CATALOG = None


class _StaticProviderCatalog:
    """Immutable default adapter set for the runtime's transports."""

    def supported(self, provider: str) -> bool:
        return provider in SUPPORTED_PROVIDERS

    def model_supported(self, provider: str, model: str | None) -> bool:
        return True  # the transports pick the provider's own fallback model


class _SettingsGenerationDefaultsSource:
    """Server fallbacks from the platform configuration."""

    def current(self) -> GenerationDefaults:
        provider = settings.default_llm_provider
        model_setting = SETTING_NAMES.get(provider, {}).get("model")
        return GenerationDefaults(
            provider=provider,
            model=getattr(settings, model_setting, "") if model_setting else "",
            temperature=ProviderSnapshotDefaults.temperature,
            max_tokens=ProviderSnapshotDefaults.max_tokens,
        )


def _settings_server_keys() -> dict[str, str]:
    keys = {}
    for provider in CLOUD_PROVIDERS:
        value = getattr(settings, SETTING_NAMES[provider]["api_key"], "")
        if value:
            keys[provider] = value
    return keys


def _carrier_value(carrier, key: str):
    """Duck-typed legacy carrier access (dict rows or snapshot defaults)."""
    if carrier is None:
        return None
    if isinstance(carrier, dict):
        return carrier.get(key)
    return getattr(carrier, key, None)


def _select(label_value_pairs, *, skip_empty: bool):
    """First non-absent (value, provenance-label) pair in priority order.

    The last pair is the fallthrough: returned even when absent, tagged
    with its layer label.
    """
    for label, value in label_value_pairs:
        if skip_empty:
            if value:
                return str(value), label
        elif value is not None:
            return value, label
    label, value = label_value_pairs[-1]
    return ("" if skip_empty else value), label


def resolve_effective_settings(
    participant,
    provider_settings=None,
    provider_api_key=None,
    *,
    defaults: GenerationDefaultsSource | None = None,
    catalog: ProviderCatalogPort | None = None,
    server_keys: dict[str, str] | None = None,
) -> EffectiveGenerationSettings:
    """Resolve ONE frozen effective configuration for this turn.

    Field priority: request override > explicit generation policy (spec-06
    participants) > the legacy recorded provider snapshot (spec-pre-06
    participant rows) > the server defaults requested from the injected
    source at execution start. Provenance records which of the four layers
    supplied every field.

    Provider resolves before compatible model/parameters: an unsupported
    provider or a model outside the provider's catalog raises
    IncompatibleGenerationPlan before any transport could be constructed.
    Cloud providers still demand some key (MissingProviderKeyError); only
    the non-secret credential reference is recorded — credential bytes stay
    transient caller-side.
    """
    overrides = provider_settings or RequestDefaults()
    policy = getattr(participant, "generation_policy", None) or {}
    carrier = getattr(participant, "provider_config", None)
    defaults_source = defaults or _SettingsGenerationDefaultsSource()
    defaults_now = defaults_source.current()
    catalog_port = catalog or _DEFAULT_CATALOG or _StaticProviderCatalog()

    provenance: dict[str, str] = {}

    provider, layer = _select(
        (
            ("request", getattr(overrides, "provider", None)),
            ("policy", policy.get("provider")),
            ("legacy_snapshot", _carrier_value(carrier, "provider")),
            ("defaults", defaults_now.provider),
        ),
        skip_empty=True,  # "" is the legacy inherit marker, never explicit
    )
    provenance["provider"] = layer

    model, layer = _select(
        (
            ("request", getattr(overrides, "model", None)),
            ("policy", policy.get("model")),
            ("legacy_snapshot", _carrier_value(carrier, "model")),
            ("defaults", defaults_now.model),
        ),
        skip_empty=True,
    )
    provenance["model"] = layer

    temperature, layer = _select(
        (
            ("request", getattr(overrides, "temperature", None)),
            ("policy", policy.get("temperature")),
            ("legacy_snapshot", _carrier_value(carrier, "temperature")),
            ("defaults", defaults_now.temperature),
        ),
        skip_empty=False,
    )
    provenance["temperature"] = layer

    max_tokens, layer = _select(
        (
            ("request", getattr(overrides, "max_tokens", None)),
            ("policy", policy.get("max_tokens")),
            ("legacy_snapshot", _carrier_value(carrier, "max_tokens")),
            ("defaults", defaults_now.max_tokens),
        ),
        skip_empty=False,
    )
    provenance["max_tokens"] = layer

    # Provider first (spec 06): refuse the plan before models/parameters
    # split hairs and before any transport exists.
    if not catalog_port.supported(provider):
        raise IncompatibleGenerationPlan(
            f"Provider '{provider}' is not runnable in this deployment"
        )
    if model and not catalog_port.model_supported(provider, model):
        raise IncompatibleGenerationPlan(
            f"Model '{model}' is unavailable for provider '{provider}'"
        )

    credential_reference = "none"
    if provider in CLOUD_PROVIDERS:
        keys = server_keys if server_keys is not None else _settings_server_keys()
        if provider_api_key:
            credential_reference = "browser"
        elif keys.get(provider):
            credential_reference = "server"
        else:
            raise MissingProviderKeyError(
                f"No API key available for {provider}. "
                "Provide a browser key (BYOK) or configure the server key."
            )

    return EffectiveGenerationSettings(
        provider=provider,
        model=model,
        temperature=float(temperature),
        max_tokens=int(max_tokens),
        base_url=getattr(overrides, "base_url", None) or None,
        credential_reference=credential_reference,
        provenance=provenance,
    )
