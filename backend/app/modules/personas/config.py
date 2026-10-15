"""Canonical provider configuration (P05-T01).

Single validated shape for inference settings. Precedence:
participant override > persona default > server default > global default.
Empty/unset never silently switches vendor: unknown provider or
model/provider mismatch fails visibly.
"""

from __future__ import annotations

from dataclasses import dataclass, field


ALLOWED_PROVIDERS = ("openrouter", "gemini", "ollama", "")
GLOBAL_DEFAULTS = {
    "provider": "",
    "model": "",
    "temperature": 0.7,
    "max_tokens": 2048,
}

MIN_TEMPERATURE = 0.0
MAX_TEMPERATURE = 2.0
MIN_MAX_TOKENS = 1
MAX_MAX_TOKENS = 128000


class ConfigValidationError(ValueError):
    pass


def _clean_str(value, *, field_name: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ConfigValidationError(f"{field_name} must be a string")
    return value.strip()


def normalize_provider_config(raw: dict | None) -> dict:
    """Validate one layer and return canonical {provider, model, temperature, max_tokens}.

    Missing keys fall back to GLOBAL_DEFAULTS here; precedence across
    layers is handled by resolve_effective_config. Ranges are enforced so
    misconfiguration fails before any provider call.
    """
    raw = dict(raw or {})
    provider = _clean_str(raw.get("provider", ""), field_name="provider")
    model = _clean_str(raw.get("model", ""), field_name="model")
    if provider not in ALLOWED_PROVIDERS:
        raise ConfigValidationError(f"unknown provider {provider!r}")
    if model and not provider:
        raise ConfigValidationError("model requires a provider")
    temperature = raw.get("temperature", GLOBAL_DEFAULTS["temperature"])
    if temperature is None or (isinstance(temperature, str) and not temperature.strip()):
        temperature = GLOBAL_DEFAULTS["temperature"]
    try:
        temperature = float(temperature)
    except (TypeError, ValueError) as exc:
        raise ConfigValidationError("temperature must be a number") from exc
    if not (MIN_TEMPERATURE <= temperature <= MAX_TEMPERATURE):
        raise ConfigValidationError("temperature out of range 0..2")
    max_tokens = raw.get("max_tokens", GLOBAL_DEFAULTS["max_tokens"])
    if max_tokens is None or (isinstance(max_tokens, str) and not max_tokens.strip()):
        max_tokens = GLOBAL_DEFAULTS["max_tokens"]
    try:
        max_tokens = int(max_tokens)
    except (TypeError, ValueError) as exc:
        raise ConfigValidationError("max_tokens must be an integer") from exc
    if not (MIN_MAX_TOKENS <= max_tokens <= MAX_MAX_TOKENS):
        raise ConfigValidationError("max_tokens out of range")
    return {
        "provider": provider,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }


def _layer_value(layer: dict | None, key: str) -> object:
    if not layer:
        return None
    value = layer.get(key)
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


@dataclass(frozen=True)
class EffectiveConfig:
    provider: str = ""
    model: str = ""
    temperature: float = GLOBAL_DEFAULTS["temperature"]
    max_tokens: int = GLOBAL_DEFAULTS["max_tokens"]
    provenance: dict = field(default_factory=dict)

    def readiness(self) -> dict:
        """Readiness without secrets: can we route, and what is missing."""
        if not self.provider:
            return {"ready": False, "reason": "no_provider_configured"}
        if not self.model:
            return {"ready": False, "reason": "no_model_configured"}
        return {"ready": True, "reason": "ok"}


def resolve_effective_config(
    participant: dict | None = None,
    persona: dict | None = None,
    server: dict | None = None,
    global_defaults: dict | None = None,
) -> EffectiveConfig:
    """Resolve exact inference settings with per-field provenance.

    Each field is taken from the highest-precedence layer that sets it.
    Validation runs on the merged result so bad combinations fail here,
    never as a silent vendor fallback at call time.
    """
    base = dict(GLOBAL_DEFAULTS)
    if global_defaults:
        base.update({k: v for k, v in global_defaults.items() if v is not None})
    layers = [
        ("global", base),
        ("server", server or {}),
        ("persona", persona or {}),
        ("participant", participant or {}),
    ]
    merged: dict = {}
    provenance: dict = {}
    for key in ("provider", "model", "temperature", "max_tokens"):
        chosen = None
        chosen_layer = "global"
        for layer_name, layer in layers:
            candidate = _layer_value(layer, key)
            if candidate is not None:
                chosen = candidate
                chosen_layer = layer_name
        if chosen is None:
            chosen = base[key]
        merged[key] = chosen
        provenance[key] = chosen_layer
    normalized = normalize_provider_config(merged)
    return EffectiveConfig(
        provider=normalized["provider"],
        model=normalized["model"],
        temperature=normalized["temperature"],
        max_tokens=normalized["max_tokens"],
        provenance=provenance,
    )


def to_adapter_args(effective: EffectiveConfig) -> dict:
    """Exact adapter arguments captured for audit (no silent defaults)."""
    return {
        "model": effective.model,
        "temperature": effective.temperature,
        "max_tokens": effective.max_tokens,
    }
