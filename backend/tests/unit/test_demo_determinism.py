"""Demo determinism policy (B-13): fixtures replay byte-identical.

Fixture content (manifest, hits, citations) carries no wall-clock,
randomness, or ambient state: two builds produce identical bytes. Session
credentials are the documented exception — tokens and session IDs must be
unique per issuance (see `test_demo_runtime.py`) — and never mix into
fixture content.
"""

import json

import pytest

from app.infrastructure.demo.composition import (
    build_fixture_composition,
    synthetic_manifest,
)

pytestmark = pytest.mark.anyio


def _frozen(composition) -> str:
    manifest = composition.manifest.model_dump(mode="json")
    hits = composition.knowledge_search._hits
    return json.dumps({"manifest": manifest, "hits": hits}, sort_keys=True)


def test_fixture_composition_is_byte_identical_across_builds():
    first = _frozen(build_fixture_composition(manifest=synthetic_manifest()))
    second = _frozen(build_fixture_composition(manifest=synthetic_manifest()))
    assert first == second


def test_fixture_content_carries_no_clock_or_randomness():
    frozen = _frozen(build_fixture_composition(manifest=synthetic_manifest()))
    assert "2026-01-01" in frozen  # pinned snapshot date, not today
    for key in ("uuid", "random", "now()", "token", "session"):
        assert key not in frozen


async def test_fixture_search_replays_identically():
    first = build_fixture_composition(manifest=synthetic_manifest())
    second = build_fixture_composition(manifest=synthetic_manifest())
    left = await first.knowledge_search.search("q", "m", None)
    right = await second.knowledge_search.search("q", "m", None)
    assert left.items == right.items
    assert [c.source for c in left.citations] == [
        c.source for c in right.citations
    ]
    assert [c.snippet for c in left.citations] == [
        c.snippet for c in right.citations
    ]
