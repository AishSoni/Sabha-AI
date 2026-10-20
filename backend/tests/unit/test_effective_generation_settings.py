"""Effective generation settings (spec 06, configuration capability).

The orchestrator's inference path resolves generation settings through
``app.capabilities.configuration``. These tests pin the resolution
contract that slice E adds alongside the legacy dict resolver:

- participant policies (explicit overrides) beat the legacy provider
  snapshot carrier, request overrides beat both, server defaults fill
  anything inherited — resolved at execution start (per turn)
- provider is resolved before model/parameters; an unsupported provider
  or a model outside the provider's catalog is refused as a typed
  failure, never a silent paid call
- the frozen effective record carries provenance and a non-secret
  credential reference — never credential bytes
"""

import pytest

from app.capabilities.configuration.contracts import (
    EffectiveGenerationSettings,
    GenerationDefaults,
    IncompatibleGenerationPlan,
    MissingProviderKeyError,
)
from app.capabilities.configuration.service import (
    resolve_effective_settings,
)


class _Catalog:
    """Provider catalog double: only x-local and the two cloud platforms."""

    def __init__(self, models: dict[str, tuple[str, ...]] | None = None) -> None:
        self._models = models or {}
        self.lookups: list[tuple[str, str | None]] = []

    def supported(self, provider: str) -> bool:
        return provider in ("local", "openrouter", "gemini")

    def model_supported(self, provider: str, model: str | None) -> bool:
        self.lookups.append((provider, model))
        models = self._models.get(provider)
        if not models:
            return True
        return model in models


class _Participant:
    def __init__(self, *, policy=None, carrier=None) -> None:
        self.generation_policy = policy
        self.provider_config = carrier


class _Request:
    def __init__(self, *, provider=None, model=None, temperature=None, max_tokens=None, base_url=None) -> None:
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.base_url = base_url


class _Defaults:
    """Injectable defaults source: `current()` is asked per resolution."""

    def __init__(self, **values) -> None:
        self._values = GenerationDefaults(**values)
        self.reads = 0

    def current(self) -> GenerationDefaults:
        self.reads += 1
        return self._values


DEFAULTS = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)


# ---------------------------------------------------------------------------
# Resolution priority: request > policy > legacy snapshot > defaults
# ---------------------------------------------------------------------------


def test_an_explicit_policy_beats_the_legacy_snapshot_and_the_defaults():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(
        policy={"temperature": 0.2},
        carrier={"provider": "local", "model": "m", "temperature": 0.7, "max_tokens": 999},
    )
    settings_ = resolve_effective_settings(
        participant, defaults=defaults, catalog=_Catalog()
    )
    assert settings_.temperature == 0.2
    assert settings_.max_tokens == 999
    assert settings_.provider == "local"
    assert settings_.model == "m"
    assert settings_.provenance["temperature"] == "policy"
    assert settings_.provenance["max_tokens"] == "legacy_snapshot"


def test_a_recorded_zero_temperature_is_explicit_and_not_inheritance():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(policy={"temperature": 0.0})
    settings_ = resolve_effective_settings(
        participant, defaults=defaults, catalog=_Catalog()
    )
    assert settings_.temperature == 0.0
    assert settings_.provenance["temperature"] == "policy"


def test_legacy_rows_without_a_policy_resolve_via_their_recorded_snapshot():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(
        policy=None,
        carrier={"provider": "local", "model": "m", "temperature": 0.7, "max_tokens": 2000},
    )
    settings_ = resolve_effective_settings(
        participant, defaults=defaults, catalog=_Catalog()
    )
    assert settings_.provider == "local"
    assert settings_.model == "m"
    assert settings_.temperature == 0.7
    assert settings_.max_tokens == 2000
    assert settings_.provenance["temperature"] == "legacy_snapshot"


def test_inherited_fields_resolve_from_the_current_defaults_source():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(policy={}, carrier=None)
    resolved = resolve_effective_settings(
        participant, defaults=defaults, catalog=_Catalog()
    )
    assert resolved.temperature == 0.7
    assert resolved.max_tokens == 2048
    assert resolved.provider == "local"
    assert resolved.model == "fixture-model"
    assert resolved.provenance["temperature"] == "defaults"

    defaults.reads = 0
    resolved_again = resolve_effective_settings(
        participant, defaults=defaults, catalog=_Catalog()
    )
    assert resolved_again.temperature == 0.7
    assert defaults.reads == 1  # one resolution = one defaults request


def test_request_overrides_beat_policy_and_the_recorded_snapshot():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(
        policy={"temperature": 0.2, "max_tokens": 999},
        carrier={"provider": "local", "model": "m", "temperature": 0.7, "max_tokens": 999},
    )
    resolved = resolve_effective_settings(
        participant,
        provider_settings=_Request(temperature=1.0, max_tokens=3000, base_url="http://127.0.0.1:11434"),
        defaults=defaults,
        catalog=_Catalog(),
    )
    assert resolved.temperature == 1.0
    assert resolved.max_tokens == 3000
    assert resolved.base_url == "http://127.0.0.1:11434"
    assert resolved.provenance["temperature"] == "request"
    assert resolved.provenance["provider"] == "legacy_snapshot"


# ---------------------------------------------------------------------------
# Provider resolves before model/parameters; bad plans fail visibly
# ---------------------------------------------------------------------------


def test_an_unsupported_provider_plan_is_refused_during_resolution():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(policy={"provider": "yandex", "model": "claim"})
    catalog = _Catalog()
    with pytest.raises(IncompatibleGenerationPlan) as refused:
        resolve_effective_settings(participant, defaults=defaults, catalog=catalog)
    assert "yandex" in str(refused.value)
    assert catalog.lookups == []  # model/parameter checks never ran


def test_a_model_outside_the_provider_catalog_is_refused():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(
        policy={"provider": "openrouter", "model": "gpt-nope"},
        carrier={"provider": "openrouter", "model": "fixture/model", "temperature": 0.7, "max_tokens": 900},
    )
    catalog = _Catalog(models={"openrouter": ("fixture/model",)})
    with pytest.raises(IncompatibleGenerationPlan) as refused:
        resolve_effective_settings(participant, defaults=defaults, catalog=catalog)
    assert "gpt-nope" in str(refused.value)
    assert catalog.lookups == [("openrouter", "gpt-nope")]


def test_a_model_from_the_provider_catalog_plans_without_refusal():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(policy={"provider": "openrouter", "model": "fixture/model"})
    resolved = resolve_effective_settings(
        participant,
        defaults=defaults,
        catalog=_Catalog(models={"openrouter": ("fixture/model",)}),
        server_keys={"openrouter": "sk-server"},
    )
    assert resolved.model == "fixture/model"


# ---------------------------------------------------------------------------
# Credentials: parity with the legacy resolver, references without bytes
# ---------------------------------------------------------------------------


def test_cloud_plans_without_any_key_still_fail_loudly():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    participant = _Participant(policy={"provider": "gemini", "model": "gemini-pro"})
    with pytest.raises(MissingProviderKeyError) as refused:
        resolve_effective_settings(
            participant, defaults=defaults, catalog=_Catalog(), server_keys={}
        )
    assert "gemini" in str(refused.value)


def test_the_effective_reference_points_at_the_credential_source_without_bytes():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    local_turn = resolve_effective_settings(
        _Participant(policy={}), defaults=defaults, catalog=_Catalog(), server_keys={}
    )
    assert local_turn.credential_reference == "none"

    server_turn = resolve_effective_settings(
        _Participant(policy={"provider": "openrouter", "model": "x"}),
        defaults=defaults,
        catalog=_Catalog(),
        server_keys={"openrouter": "sk-server-secret"},
    )
    assert server_turn.credential_reference == "server"

    browser_turn = resolve_effective_settings(
        _Participant(policy={"provider": "openrouter", "model": "x"}),
        provider_api_key="sk-browser-secret",
        defaults=defaults,
        catalog=_Catalog(),
        server_keys={},
    )
    assert browser_turn.credential_reference == "browser"


def test_the_effective_record_never_carries_credential_bytes():
    defaults = _Defaults(provider="local", model="fixture-model", temperature=0.7, max_tokens=2048)
    resolved = resolve_effective_settings(
        _Participant(policy={"provider": "openrouter", "model": "x"}),
        provider_api_key="sk-browser-secret",
        defaults=defaults,
        catalog=_Catalog(),
        server_keys={"openrouter": "sk-server-secret"},
    )
    record = resolved.as_record()
    assert record["provider"] == "openrouter"
    assert record["credential_reference"] == "browser"
    assert "sk-browser-secret" not in str(record)
    assert "sk-server-secret" not in str(record)
    assert "api_key" not in record
    assert set(resolved.as_gen_dict()) == {
        "provider", "model", "temperature", "max_tokens", "base_url"
    }


def test_running_settings_remain_frozen_once_captured():
    resolved = resolve_effective_settings(
        _Participant(policy={}), defaults=DEFAULTS, catalog=_Catalog()
    )
    assert isinstance(resolved, EffectiveGenerationSettings)
    with pytest.raises(Exception):
        resolved.temperature = 9.9
