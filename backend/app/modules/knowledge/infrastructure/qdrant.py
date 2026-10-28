"""Qdrant implementation of the derived knowledge projection.

Point ids are deterministic chunk ids, so a retried indexing attempt
overwrites the same points instead of duplicating them. Payloads carry the
source identity used later for evidence and filtering; eligibility itself is
always re-read from SQL before a hit is trusted.
"""

from __future__ import annotations

from uuid import UUID

import httpx
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchAny,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.modules.knowledge.application.ports import VectorHit
from app.modules.knowledge.domain.errors import ProjectionUnavailable
from app.modules.knowledge.domain.models import ChunkIdentity
from app.platform.providers.embeddings import (
    EmbeddingProvider,
    get_embedding_provider,
)

_UPSERT_BATCH = 64


def _default_client():
    from app.platform.qdrant import get_qdrant_client

    return get_qdrant_client()


class QdrantKnowledgeProjection:
    """``VectorProjection`` over the configured Qdrant collection scheme."""

    def __init__(
        self,
        client_factory=None,
        embedding_provider: EmbeddingProvider | None = None,
    ) -> None:
        self._client_factory = client_factory or _default_client
        self._embedding_provider = embedding_provider

    @property
    def client(self):
        return self._client_factory()

    @property
    def embedding_provider(self) -> EmbeddingProvider:
        if self._embedding_provider is None:
            self._embedding_provider = get_embedding_provider()
        return self._embedding_provider

    async def ensure_collection(self, collection_name: str) -> None:
        try:
            if await self.client.collection_exists(collection_name):
                config = await self.client.get_collection(collection_name)
                size = _vector_size(config)
                if size != self.embedding_provider.dimension:
                    raise ProjectionUnavailable(
                        "collection dimension does not match the embedding profile"
                    )
                return
            try:
                await self.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=self.embedding_provider.dimension,
                        distance=Distance.COSINE,
                    ),
                )
            except Exception:
                # A concurrent creator may have won the race; accept the
                # collection only when it now exists with a compatible shape.
                if not await self.client.collection_exists(collection_name):
                    raise
                config = await self.client.get_collection(collection_name)
                if _vector_size(config) != self.embedding_provider.dimension:
                    raise ProjectionUnavailable(
                        "collection dimension does not match the embedding profile"
                    )
        except ProjectionUnavailable:
            raise
        except Exception as exc:
            raise ProjectionUnavailable(
                f"failed to ensure collection {collection_name}"
            ) from exc

    async def upsert_revision(
        self,
        collection_name: str,
        *,
        document_id: UUID,
        revision_id: UUID,
        file_name: str,
        chunks: list[tuple[ChunkIdentity, str]],
    ) -> int:
        if not chunks:
            return 0
        try:
            vectors = await self.embedding_provider.embed_batch(
                [text for _, text in chunks]
            )
            if len(vectors) != len(chunks):
                raise ProjectionUnavailable(
                    "embedding provider returned the wrong batch size"
                )
            points = [
                PointStruct(
                    id=str(identity.id),
                    vector=vector,
                    payload={
                        "document_id": str(document_id),
                        "revision_id": str(revision_id),
                        "chunk_id": str(identity.id),
                        "chunk_index": identity.chunk_index,
                        "content_sha256": identity.content_sha256,
                        "file_name": file_name,
                        "page_number": identity.page_number,
                        "text": text,
                    },
                )
                for (identity, text), vector in zip(chunks, vectors)
            ]
            for start in range(0, len(points), _UPSERT_BATCH):
                await self.client.upsert(
                    collection_name=collection_name,
                    points=points[start : start + _UPSERT_BATCH],
                    wait=True,
                )
        except ProjectionUnavailable:
            raise
        except Exception as exc:
            raise ProjectionUnavailable(
                f"failed to project revision {revision_id}"
            ) from exc
        return len(points)

    async def delete_revision(
        self, collection_name: str, revision_id: UUID
    ) -> int:
        try:
            if not await self.client.collection_exists(collection_name):
                return 0
            selector = Filter(
                must=[
                    FieldCondition(
                        key="revision_id",
                        match=MatchValue(value=str(revision_id)),
                    )
                ]
            )
            counted = await self.client.count(
                collection_name=collection_name,
                count_filter=selector,
                exact=True,
            )
            await self.client.delete(
                collection_name=collection_name,
                points_selector=selector,
                wait=True,
            )
        except Exception as exc:
            raise ProjectionUnavailable(
                f"failed to delete revision {revision_id} from {collection_name}"
            ) from exc
        return int(getattr(counted, "count", 0) or 0)

    async def delete_collection(self, collection_name: str) -> bool:
        try:
            if not await self.client.collection_exists(collection_name):
                return False
            await self.client.delete_collection(collection_name)
        except Exception as exc:
            raise ProjectionUnavailable(
                f"failed to delete collection {collection_name}"
            ) from exc
        return True

    async def search(
        self,
        collection_name: str,
        *,
        revision_ids: list[UUID],
        query: str,
        limit: int,
    ) -> list[VectorHit]:
        if not revision_ids:
            return []
        try:
            if not await self.client.collection_exists(collection_name):
                return []
            vector = await self.embedding_provider.embed_text(query)
            response = await self.client.query_points(
                collection_name=collection_name,
                query=vector,
                query_filter=Filter(
                    must=[
                        FieldCondition(
                            key="revision_id",
                            match=MatchAny(
                                any=[str(value) for value in revision_ids]
                            ),
                        )
                    ]
                ),
                limit=limit,
                with_payload=True,
            )
        except (httpx.HTTPError, ProjectionUnavailable):
            raise
        except Exception as exc:
            raise ProjectionUnavailable(
                f"failed to search collection {collection_name}"
            ) from exc
        hits: list[VectorHit] = []
        for point in response.points:
            payload = point.payload or {}
            try:
                hits.append(
                    VectorHit(
                        text=str(payload["text"]),
                        score=float(point.score),
                        document_id=UUID(str(payload["document_id"])),
                        revision_id=UUID(str(payload["revision_id"])),
                        chunk_id=UUID(str(payload.get("chunk_id") or point.id)),
                        chunk_index=int(payload["chunk_index"]),
                        content_sha256=str(payload["content_sha256"]),
                        file_name=str(payload["file_name"]),
                        page_number=(
                            int(payload["page_number"])
                            if payload.get("page_number") is not None
                            else None
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise ProjectionUnavailable(
                    "vector payload is missing source identity"
                ) from exc
        return hits


def _vector_size(config) -> int | None:
    params = getattr(getattr(config, "config", None), "params", None)
    vectors = getattr(params, "vectors", None)
    if vectors is None:
        return None
    return getattr(vectors, "size", None)
