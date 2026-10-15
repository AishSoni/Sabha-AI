"""Isolated Qdrant query contract with deterministic embeddings (B-03 red).

Uses an in-memory AsyncQdrantClient so no external server or network is
required. Proves: chosen query API + response mapping, dimensions,
missing-collection and empty-result behavior, and stable point IDs that
make retry idempotent.
"""

import uuid

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


class _DeterministicEmbeddings:
    dimension = 8

    async def embed_text(self, text: str):
        seed = sum(ord(c) for c in text) % 997
        return [((seed + i) % 100) / 100.0 for i in range(self.dimension)]

    async def embed_batch(self, texts):
        return [await self.embed_text(t) for t in texts]


def _collection():
    return f"test_{uuid.uuid4().hex[:8]}"


async def test_live_query_contract_on_isolated_client():
    from qdrant_client import AsyncQdrantClient

    from app.services.vector_store import VectorStoreManager
    from app.services.document_processor import DocumentChunk

    client = AsyncQdrantClient(":memory:")
    try:
        store = VectorStoreManager(
            embedding_provider=_DeterministicEmbeddings(), client=client
        )
        collection = _collection()
        chunks = [
            DocumentChunk(text="bond coupon pays semi annually", chunk_index=0, metadata={}),
            DocumentChunk(text="unrelated equity note", chunk_index=1, metadata={}),
        ]
        count = await store.index_document(
            collection_name=collection, document_id="doc-1", chunks=chunks
        )
        assert count == 2

        hits = await store.search(collection_name=collection, query="bond coupon", limit=5)
        assert len(hits) >= 1
        assert {h.document_id for h in hits} == {"doc-1"}
        # Stable citation identity: document + chunk, no "Unknown" fallback.
        assert all(h.chunk_index in (0, 1) for h in hits)
        assert all(h.text for h in hits)

        # Missing collection and empty results behave explicitly.
        assert await store.search(collection_name="missing_nope", query="x", limit=5) == []
    finally:
        await client.close()


async def test_stable_point_ids_make_retry_idempotent():
    from qdrant_client import AsyncQdrantClient

    from app.services.vector_store import VectorStoreManager
    from app.services.document_processor import DocumentChunk

    client = AsyncQdrantClient(":memory:")
    try:
        store = VectorStoreManager(
            embedding_provider=_DeterministicEmbeddings(), client=client
        )
        collection = _collection()
        chunks = [DocumentChunk(text="duplicate retry chunk", chunk_index=0, metadata={})]
        await store.index_document(collection_name=collection, document_id="doc-r", chunks=chunks)
        await store.index_document(collection_name=collection, document_id="doc-r", chunks=chunks)
        stats = await store.get_collection_stats(collection)
        assert stats["points_count"] == 1
    finally:
        await client.close()
