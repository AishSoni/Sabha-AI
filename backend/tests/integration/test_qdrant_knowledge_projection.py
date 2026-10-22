"""Real in-memory Qdrant tests for the deterministic knowledge projection."""

from __future__ import annotations

import uuid

import pytest
from qdrant_client import AsyncQdrantClient

from app.modules.knowledge.domain.errors import ProjectionUnavailable
from app.modules.knowledge.domain.models import ChunkIdentity
from app.modules.knowledge.infrastructure.qdrant import (
    QdrantKnowledgeProjection,
)
from app.platform.providers.embeddings import EmbeddingProvider

pytestmark = pytest.mark.integration


class DeterministicEmbedding(EmbeddingProvider):
    """Maps a few keywords to fixed axes; records call purposes."""

    def __init__(self, dimension: int = 4) -> None:
        self._dimension = dimension
        self.query_calls = 0
        self.document_calls = 0

    @property
    def dimension(self) -> int:
        return self._dimension

    async def embed_text(self, text: str):
        self.query_calls += 1
        return self._vector(text)

    async def embed_batch(self, texts):
        self.document_calls += 1
        return [self._vector(text) for text in texts]

    @staticmethod
    def _vector(text: str) -> list[float]:
        lowered = text.lower()
        if "alpha" in lowered or "revenue" in lowered:
            return [1.0, 0.0, 0.0, 0.0]
        if "beta" in lowered or "margin" in lowered:
            return [0.0, 1.0, 0.0, 0.0]
        return [0.0, 0.0, 1.0, 0.0]


def _chunk(index: int, text: str) -> tuple[ChunkIdentity, str]:
    identity = ChunkIdentity(
        id=uuid.uuid4(),
        chunk_index=index,
        content_sha256=f"{index:064d}",
        char_count=len(text),
    )
    return identity, text


def _projection(client, embedding=None):
    return QdrantKnowledgeProjection(
        lambda: client, embedding_provider=embedding or DeterministicEmbedding()
    )


async def test_upsert_search_and_revision_filter():
    client = AsyncQdrantClient(":memory:")
    embedding = DeterministicEmbedding()
    projection = _projection(client, embedding)
    collection = "meeting_test_shared"
    document_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    other_revision = uuid.uuid4()
    await projection.ensure_collection(collection)

    alpha, alpha_text = _chunk(0, "alpha revenue")
    beta, beta_text = _chunk(1, "beta margin")
    await projection.upsert_revision(
        collection,
        document_id=document_id,
        revision_id=revision_id,
        file_name="report.txt",
        chunks=[(alpha, alpha_text), (beta, beta_text)],
    )
    await projection.upsert_revision(
        collection,
        document_id=document_id,
        revision_id=other_revision,
        file_name="other.txt",
        chunks=[_chunk(0, "alpha secret")],
    )

    hits = await projection.search(
        collection,
        revision_ids=[revision_id],
        query="revenue",
        limit=1,
    )

    assert [hit.text for hit in hits] == ["alpha revenue"]
    assert hits[0].document_id == document_id
    assert hits[0].revision_id == revision_id
    assert hits[0].chunk_id == alpha.id
    assert hits[0].content_sha256 == alpha.content_sha256
    assert embedding.query_calls == 1
    assert embedding.document_calls == 2
    await client.close()


async def test_reindex_is_idempotent_and_delete_removes_revision_only():
    client = AsyncQdrantClient(":memory:")
    projection = _projection(client)
    collection = "stack_test_knowledge"
    revision_id = uuid.uuid4()
    other_revision = uuid.uuid4()
    await projection.ensure_collection(collection)
    chunk, text = _chunk(0, "alpha one")

    for _ in range(2):
        await projection.upsert_revision(
            collection,
            document_id=uuid.uuid4(),
            revision_id=revision_id,
            file_name="notes.txt",
            chunks=[(chunk, text)],
        )
    await projection.upsert_revision(
        collection,
        document_id=uuid.uuid4(),
        revision_id=other_revision,
        file_name="other.txt",
        chunks=[_chunk(0, "beta two")],
    )

    count = await client.count(collection, exact=True)
    assert count.count == 2

    removed = await projection.delete_revision(collection, revision_id)

    assert removed == 1
    assert await projection.search(
        collection, revision_ids=[revision_id], query="alpha", limit=5
    ) == []
    remaining = await projection.search(
        collection, revision_ids=[other_revision], query="margin", limit=5
    )
    assert len(remaining) == 1
    await client.close()


async def test_missing_collection_searches_empty_and_deletes_zero():
    client = AsyncQdrantClient(":memory:")
    projection = _projection(client)

    assert await projection.search(
        "absent", revision_ids=[uuid.uuid4()], query="alpha", limit=3
    ) == []
    assert await projection.delete_revision("absent", uuid.uuid4()) == 0
    await client.close()


async def test_dimension_mismatch_is_a_typed_failure():
    client = AsyncQdrantClient(":memory:")
    collection = "meeting_dim_shared"
    await _projection(client).ensure_collection(collection)
    incompatible = _projection(client, DeterministicEmbedding(dimension=8))

    with pytest.raises(ProjectionUnavailable):
        await incompatible.ensure_collection(collection)
    await client.close()
