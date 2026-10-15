"""Server-owned non-secret preferences + effective settings (P05-T05, B-08).

Secrets stay server-managed and never appear in responses or logs.
This store holds only non-secret preferences; readiness is reported
without revealing keys. System AI is resolved separately from meeting
participants so summaries never borrow the first participant's provider.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.modules.personas.config import (
    EffectiveConfig,
    normalize_provider_config,
    resolve_effective_config,
)


@dataclass
class ServerPreferences:
    default_provider: str = ""
    default_model: str = ""
    default_temperature: float = 0.7
    default_max_tokens: int = 2048
    system_ai: dict = field(default_factory=lambda: {
        "provider": "", "model": "", "temperature": 0.5, "max_tokens": 2048,
    })

    def to_public_dict(self) -> dict:
        return {
            "default_provider": self.default_provider,
            "default_model": self.default_model,
            "default_temperature": self.default_temperature,
            "default_max_tokens": self.default_max_tokens,
            "system_ai": dict(self.system_ai),
        }


_PREFS = ServerPreferences()


def get_preferences() -> ServerPreferences:
    return _PREFS


def update_preferences(patch: dict) -> ServerPreferences:
    global _PREFS
    data = _PREFS.to_public_dict()
    for key in ("default_provider", "default_model"):
        if key in patch and patch[key] is not None:
            data[key] = str(patch[key]).strip()
    for key in ("default_temperature", "default_max_tokens"):
        if key in patch and patch[key] is not None:
            data[key] = patch[key]
    if "system_ai" in patch and isinstance(patch["system_ai"], dict):
        merged = dict(data["system_ai"])
        merged.update(patch["system_ai"])
        data["system_ai"] = normalize_provider_config(merged)
    # Validate server defaults through the canonical model.
    normalize_provider_config({
        "provider": data["default_provider"],
        "model": data["default_model"],
        "temperature": data["default_temperature"],
        "max_tokens": data["default_max_tokens"],
    })
    _PREFS = ServerPreferences(
        default_provider=data["default_provider"],
        default_model=data["default_model"],
        default_temperature=float(data["default_temperature"]),
        default_max_tokens=int(data["default_max_tokens"]),
        system_ai=data["system_ai"],
    )
    return _PREFS


def server_defaults() -> dict:
    prefs = get_preferences()
    return {
        "provider": prefs.default_provider,
        "model": prefs.default_model,
        "temperature": prefs.default_temperature,
        "max_tokens": prefs.default_max_tokens,
    }


def system_ai_config() -> dict:
    return dict(get_preferences().system_ai)


def effective_for_participant(
    participant_cfg: dict | None,
    persona_cfg: dict | None,
) -> EffectiveConfig:
    return resolve_effective_config(
        participant=participant_cfg, persona=persona_cfg, server=server_defaults(),
    )


def effective_for_system_ai() -> EffectiveConfig:
    return resolve_effective_config(
        participant=system_ai_config(), persona=None, server=server_defaults(),
    )
