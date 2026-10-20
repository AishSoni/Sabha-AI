"""GenerationPolicy explicit-vs-inherit mapping (spec 06).

The carrier rules agreed for spec 06: ``""`` provider/model and JSON
``null``/missing keys mean inherit; recorded numbers mean explicit —
including a zero temperature, which must never be reinterpreted as
inheritance. Participant storage receives explicit-only payloads.
"""

import pytest

from app.modules.persona_catalog.domain.models import GenerationPolicy


def test_an_empty_template_carrier_carries_no_overrides():
    policy = GenerationPolicy.from_template_config(None)
    assert policy.provider_override is None
    assert policy.model_override is None
    assert policy.temperature_override is None
    assert policy.max_tokens_override is None


def test_the_legacy_default_seeded_carrier_only_pins_explicit_numbers():
    # Legacy rows were seeded with concrete numbers and empty provider/
    # model markers: those maps stay exactly as they read.
    policy = GenerationPolicy.from_template_config(
        {"provider": "", "model": "", "temperature": 0.7, "max_tokens": 2000}
    )
    assert policy.provider_override is None
    assert policy.model_override is None
    assert policy.temperature_override == 0.7
    assert policy.max_tokens_override == 2000


def test_recorded_numbers_are_explicit_even_when_they_equal_defaults():
    policy = GenerationPolicy.from_template_config({"temperature": 0.7})
    assert policy.temperature_override == 0.7


def test_an_explicit_zero_temperature_stays_explicit():
    policy = GenerationPolicy.from_template_config(
        {"temperature": 0.0, "max_tokens": 1}
    )
    zero = policy.temperature_override
    assert zero == 0.0
    assert zero is not None and policy.max_tokens_override == 1


def test_null_fields_map_to_inherit():
    policy = GenerationPolicy.from_template_config(
        {
            "provider": "openrouter",
            "model": "openai/gpt-4o-mini",
            "temperature": None,
            "max_tokens": None,
        }
    )
    assert policy.provider_override == "openrouter"
    assert policy.model_override == "openai/gpt-4o-mini"
    assert policy.temperature_override is None
    assert policy.max_tokens_override is None


def test_storage_writes_explicit_fields_only():
    policy = GenerationPolicy(
        provider_override="gemini",
        temperature_override=0.2,
    )
    stored = policy.to_storage()
    assert stored == {"provider": "gemini", "temperature": 0.2}
    # Inherit fields are absent keys, not nulls — absence IS the marker.
    assert "model" not in stored
    assert "max_tokens" not in stored
    assert stored.get("temperature") is not None


def test_an_all_inherit_policy_stores_an_empty_object():
    assert GenerationPolicy().to_storage() == {}


def test_storage_round_trips_through_the_template_carrier_mapping():
    policy = GenerationPolicy(
        provider_override="openrouter",
        model_override="fixture/model",
        temperature_override=0.3,
        max_tokens_override=512,
    )
    reread = GenerationPolicy.from_template_config(policy.to_storage())
    assert reread == policy


@pytest.mark.parametrize(
    "carrier",
    [
        {},
        {"provider": ""},  # empty marker only
        {"max_tokens": 0},  # explicit zero tokens stays explicit
    ],
)
def test_edge_carriers_survive(carrier):
    policy = GenerationPolicy.from_template_config(carrier)
    assert GenerationPolicy.from_template_config(policy.to_storage()) == policy
