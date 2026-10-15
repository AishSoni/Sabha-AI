"""Offline fixture composition boots without credentials or vector infra."""

import pytest

from app.infrastructure.demo import capabilities
from app.infrastructure.demo.capabilities import DemoUnavailable
from app.infrastructure.demo.composition import (
    FixtureKnowledgeSearch,
    FixtureProviderResolver,
    build_fixture_composition,
    guard_live_transport,
    synthetic_manifest,
)
from tests.doubles.providers import ScriptedProvider, final_text_response

pytestmark = pytest.mark.anyio


def test_offline_composition_boots_without_keys(monkeypatch):
    for var in (
        "OPENROUTER_API_KEY",
        "GEMINI_API_KEY",
        "QDRANT_URL",
        "QDRANT_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)
    composition = build_fixture_composition(manifest=synthetic_manifest())
    assert composition.scenario_id == "synthetic-smoke-scaffold"
    assert composition.manifest.instrument_ref == "SYNTHETIC-TEST-INSTRUMENT"


def test_fixture_resolver_rejects_live_provider_before_transport():
    provider = ScriptedProvider([final_text_response("ok")])
    resolver = FixtureProviderResolver(provider)
    assert resolver("fixture", "synthetic-model") is provider
    assert resolver(None, None) is provider
    with pytest.raises(DemoUnavailable, match="not served by the offline scaffold"):
        resolver("openrouter", "some-model")


def test_live_transport_guard_fails_closed():
    with pytest.raises(DemoUnavailable, match="live destination blocked"):
        guard_live_transport("https://openrouter.ai/api/v1")


async def test_fixture_search_returns_synthetic_hits():
    search = FixtureKnowledgeSearch()
    result = await search.search("retrieval plumbing", "m-test", None)
    assert len(result.items) == 1
    assert "synthetic" in result.items[0]["text"]
    assert result.citations[0].source == "synthetic-fixture-v1"


async def test_empty_query_returns_no_items_without_fabrication():
    search = FixtureKnowledgeSearch()
    result = await search.search("   ", "m-test", None)
    assert result.items == []


def test_missing_capability_reports_unavailable():
    for capability in (
        "votes",
        "summaries",
        "metadata",
        "live_search",
        "real_scenario_bootstrap",
        "guided_actions",
    ):
        assert not capabilities.is_available(capability)
        with pytest.raises(DemoUnavailable):
            capabilities.require(capability)
    assert capabilities.is_available("fixture_retrieval")
    capabilities.require("fixture_retrieval")
