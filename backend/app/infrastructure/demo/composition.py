"""Fixture-only demo composition (offline, fail-closed).

Boots without provider credentials, Qdrant, or embeddings. Any attempt to
construct or use a live adapter fails before transport.
"""

from dataclasses import dataclass
from typing import Any, Optional

from app.infrastructure.demo import capabilities
from app.infrastructure.demo.capabilities import DemoUnavailable
from app.infrastructure.demo.manifest import ScenarioManifest
from app.modules.meetings.ports import CitationItem, KnowledgeResult


def synthetic_manifest(
    scenario_revision: int = 1,
    allowed_actions: Optional[list[str]] = None,
) -> ScenarioManifest:
    """Build the single synthetic scaffold manifest (test-only)."""
    return ScenarioManifest(
        schema_version="1",
        scenario_id="synthetic-smoke-scaffold",
        content_version=1,
        scenario_revision=scenario_revision,
        synthetic_only=True,
        instrument_ref="SYNTHETIC-TEST-INSTRUMENT",
        source_snapshot_date="2026-01-01",
        allowed_actions=list(allowed_actions or ["synthetic_smoke"]),
    )


def synthetic_search_hits() -> list[dict[str, Any]]:
    """Visibly test-only fixture hits; never bond evidence."""
    return [
        {
            "text": "synthetic fixture passage about test-only retrieval plumbing",
            "score": 0.99,
            "metadata": {
                "file_name": "synthetic-fixture.txt",
                "source_id": "synthetic-fixture-v1",
            },
        }
    ]


class FixtureKnowledgeSearch:
    """KnowledgeSearch port backed only by synthetic fixtures."""

    def __init__(self, hits: Optional[list[dict[str, Any]]] = None) -> None:
        self._hits = list(hits if hits is not None else synthetic_search_hits())
        self.queries: list[dict[str, Any]] = []

    async def search(
        self, query: str, meeting_id: str, persona_id: Optional[str]
    ) -> KnowledgeResult:
        self.queries.append(
            {"query": query, "meeting_id": meeting_id, "persona_id": persona_id}
        )
        q = (query or "").strip()
        if not q:
            return KnowledgeResult(items=[], citations=[])
        items = list(self._hits)
        citations = [
            CitationItem(
                source=str(h.get("metadata", {}).get("source_id", "synthetic-fixture-v1")),
                title=str(h.get("metadata", {}).get("file_name", "synthetic-fixture.txt")),
                snippet=str(h.get("text", ""))[:500],
            )
            for h in items
        ]
        return KnowledgeResult(items=items, citations=citations)


class FixtureProviderResolver:
    """Provider resolver that serves only the injected fixture provider."""

    def __init__(self, provider: Any) -> None:
        self._provider = provider
        self.requests: list[dict[str, Any]] = []

    def __call__(self, provider_name: Optional[str], model: Optional[str]) -> Any:
        self.requests.append({"provider": provider_name, "model": model})
        if provider_name not in (None, "", "fixture", "synthetic"):
            raise DemoUnavailable(
                "live_inference",
                f"provider '{provider_name}' is not served by the offline scaffold",
            )
        return self._provider


def guard_live_transport(destination: str) -> None:
    """Fail closed before any live transport is attempted."""
    raise DemoUnavailable("live_inference", f"live destination blocked: {destination}")


@dataclass(frozen=True)
class DemoComposition:
    """Server-selected fixture-only composition."""

    manifest: ScenarioManifest
    knowledge_search: FixtureKnowledgeSearch
    provider_resolver: FixtureProviderResolver

    @property
    def scenario_id(self) -> str:
        return self.manifest.scenario_id


def build_fixture_composition(
    manifest: Optional[ScenarioManifest] = None,
    provider: Any = None,
    hits: Optional[list[dict[str, Any]]] = None,
) -> DemoComposition:
    """Compose the offline scaffold without credentials, Qdrant, or embeddings.

    Raises DemoUnavailable for the real scenario or any live capability.
    """
    active = manifest or synthetic_manifest()
    if active.scenario_id in capabilities.UNAVAILABLE_CAPABILITIES:
        raise DemoUnavailable(active.scenario_id, "unknown scaffold scenario")
    # The manifest model itself rejects the real journey scenario; this is a
    # second, explicit composition-level guard so misuse fails closed.
    if active.scenario_id == "indian-corporate-bond-review":
        raise DemoUnavailable("real_scenario_bootstrap", "owned by Phase 10")
    if provider is None:
        from app.infrastructure.demo.recorded_provider import RecordedProvider
        from app.infrastructure.demo.recorded_provider import final_text_response

        provider = RecordedProvider([final_text_response("synthetic")])
    return DemoComposition(
        manifest=active,
        knowledge_search=FixtureKnowledgeSearch(hits=hits),
        provider_resolver=FixtureProviderResolver(provider),
    )
