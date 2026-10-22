"""Eligible knowledge retrieval with source-linked evidence.

SQL decides which revisions may be read in the meeting/shared and saved
participant stack scope. Qdrant is only a candidate projection: every hit is
filtered again against SQL immediately before it is returned and recorded as
raw passage evidence for later redaction.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from app.modules.knowledge.application.ports import (
    KnowledgePersistence,
    VectorProjection,
)
from app.modules.knowledge.domain.models import PassageEvidence


@dataclass(frozen=True)
class KnowledgeScope:
    meeting_id: UUID | None
    stack_ids: list[UUID]


@dataclass(frozen=True)
class RetrievalIdentity:
    operation_id: UUID | None = None
    participant_id: UUID | None = None
    tool_call_id: str | None = None
    message_id: UUID | None = None


@dataclass(frozen=True)
class RetrievalRequest:
    query: str
    scope: KnowledgeScope
    identity: RetrievalIdentity = RetrievalIdentity()
    limit: int = 5


@dataclass(frozen=True)
class RetrievedPassage:
    text: str
    score: float
    document_id: UUID
    revision_id: UUID
    chunk_id: UUID
    chunk_index: int
    content_sha256: str
    file_name: str


class SearchKnowledge:
    """Search only currently eligible revisions and retain evidence."""

    def __init__(
        self,
        *,
        persistence: KnowledgePersistence,
        vectors: VectorProjection,
    ) -> None:
        self._persistence = persistence
        self._vectors = vectors

    async def execute(self, request: RetrievalRequest) -> list[RetrievedPassage]:
        limit = max(1, min(request.limit, 20))
        eligible = await asyncio.to_thread(
            self._persistence.eligible_revisions,
            meeting_id=request.scope.meeting_id,
            stack_ids=request.scope.stack_ids,
        )
        if not eligible:
            return []

        by_collection: dict[str, list[UUID]] = {}
        for revision in eligible:
            by_collection.setdefault(revision.collection_name, []).append(
                revision.revision_id
            )

        candidates = []
        for collection, revision_ids in by_collection.items():
            candidates.extend(
                await self._vectors.search(
                    collection,
                    revision_ids=revision_ids,
                    query=request.query,
                    limit=limit,
                )
            )
        candidates.sort(key=lambda hit: hit.score, reverse=True)
        selected = candidates[:limit]
        if not selected:
            return []

        revision_ids = list({hit.revision_id for hit in selected})
        allowed = await asyncio.to_thread(
            self._persistence.revalidate_revisions,
            revision_ids,
            meeting_id=request.scope.meeting_id,
            stack_ids=request.scope.stack_ids,
        )
        selected = [hit for hit in selected if hit.revision_id in allowed]
        if not selected:
            return []

        identity = request.identity
        await asyncio.to_thread(
            self._persistence.record_evidence,
            [
                PassageEvidence(
                    meeting_id=request.scope.meeting_id,
                    document_id=hit.document_id,
                    revision_id=hit.revision_id,
                    chunk_id=hit.chunk_id,
                    chunk_sha256=hit.content_sha256,
                    raw_passage=hit.text,
                    source_name=hit.file_name,
                    participant_id=identity.participant_id,
                    operation_id=identity.operation_id,
                    tool_call_id=identity.tool_call_id,
                    message_id=identity.message_id,
                    score=hit.score,
                )
                for hit in selected
            ],
        )
        return [
            RetrievedPassage(
                text=hit.text,
                score=hit.score,
                document_id=hit.document_id,
                revision_id=hit.revision_id,
                chunk_id=hit.chunk_id,
                chunk_index=hit.chunk_index,
                content_sha256=hit.content_sha256,
                file_name=hit.file_name,
            )
            for hit in selected
        ]
