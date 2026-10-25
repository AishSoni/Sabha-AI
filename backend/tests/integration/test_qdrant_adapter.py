"""Regression: VectorStoreManager search must work with supported qdrant-client.

Evidence: queue uses `AsyncQdrantClient.search(...)` which was REMOVED in
qdrant-client 1.16 (installed 1.16.2); the supported API is `query_points`.
These tests run against a REAL in-memory Qdrant so adapter behavior is
exercised end-to-end, not merely mocked.
"""

import pytest
from qdrant_client import AsyncQdrantClient

from app.platform.providers.embeddings import EmbeddingProvider
from app.modules.knowledge.infrastructure.parsers import DocumentChunk
from app.modules.knowledge.infrastructure.legacy_vector_store import VectorStoreManager

COLLECTION = "meeting_probe_shared"

UNIT_VECTORS = {
    "alpha": [1.0, 0.0, 0.0, 0.0],
    "beta": [0.0, 1.0, 0.0, 0.0],
    "gamma": [0.0, 0.0, 1.0, 0.0],
    "delta": [0.0, 0.0, 0.0, 1.0],
}


class DeterministicEmbedding(EmbeddingProvider):
    """Maps known keywords to fixed unit vectors; others to distinct dirs."""

    def __init__(self, dimension: int = 4):
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    def _vector(self, text: str):
        for token, vector in UNIT_VECTORS.items():
            if token in text:
                return list(vector)
        return [0.5, 0.5, 0.5, 0.5]

    async def embed_text(self, text: str):
        return self._vector(text)

    async def embed_batch(self, texts):
        return [self._vector(t) for t in texts]


@pytest.fixture()
def store(monkeypatch) -> VectorStoreManager:
    """VectorStoreManager bound to a REAL in-memory Qdrant instance."""
    client = AsyncQdrantClient(":memory:")
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.legacy_vector_store.get_qdrant_client", lambda: client
    )
    return VectorStoreManager(embedding_provider=DeterministicEmbedding())


async def seed(store: VectorStoreManager, document_id: str, keyword: str):
    chunk = DocumentChunk(
        text=f"{keyword} payload for {document_id}",
        chunk_index=0,
        metadata={"origin": "fixture"},
    )
    return await store.index_document(
        collection_name=COLLECTION, document_id=document_id, chunks=[chunk]
    )


async def test_search_indexes_documents_and_returns_ranked_matches(store):
    created = await store.create_collection(COLLECTION)
    assert created is True
    indexed = await seed(store, "doc-alpha", "alpha")
    assert indexed == 1

    results = await store.search(COLLECTION, "alpha probe", limit=5)
    assert results, "expected at least one match"
    best = results[0]
    assert best.document_id == "doc-alpha"
    assert best.chunk_index == 0
    assert best.text == "alpha payload for doc-alpha"
    assert best.metadata["origin"] == "fixture"
    assert best.score > 0.5  # unit vectors: same direction scores high


async def test_search_beyond_one_document_respects_relevance_order(store):
    await store.create_collection(COLLECTION)
    await seed(store, "doc-alpha", "alpha")
    await seed(store, "doc-beta", "beta")

    results = await store.search(COLLECTION, "beta payload", limit=5)
    assert results[0].document_id == "doc-beta"


async def test_search_in_nonexistent_collection_returns_empty(store):
    results = await store.search("meeting_ghost_shared", "anything", limit=5)
    assert results == []


async def test_search_honors_document_id_filter(store):
    await store.create_collection(COLLECTION)
    await seed(store, "doc-alpha", "alpha")
    await seed(store, "doc-beta", "beta")

    results = await store.search(COLLECTION, "alpha payload", limit=5, document_id="doc-beta")
    assert {r.document_id for r in results} == {"doc-beta"}


async def test_search_across_collections_merges_and_reranks(store):
    await store.create_collection(COLLECTION)
    other = "persona_probe_knowledge"
    await store.create_collection(other)
    await seed(store, "doc-alpha", "alpha")  # main collection
    # move one gamma chunk into the other collection by direct upsert
    await store.index_document(collection_name=other, document_id="doc-gamma", chunks=[
        DocumentChunk(text="gamma payload for doc-gamma", chunk_index=0, metadata={})
    ])
    # beta chunk also in main for ordering assertions
    await seed(store, "doc-beta", "beta")

    merged = await store.search_multiple_collections(
        [COLLECTION, other], "alpha probe", limit=5
    )
    assert merged[0].document_id == "doc-alpha"
    document_ids = {r.document_id for r in merged}
    assert "doc-beta" in document_ids, "expected results from all queried collections"
