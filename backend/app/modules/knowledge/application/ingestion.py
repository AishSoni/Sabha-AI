"""Durable upload admission and ingestion use cases.

The application layer owns identity and ordering: validate the request,
persist original bytes behind the source-store port, then commit the
document/revision/ingestion rows before returning a receipt. SQL remains the
authority for publication; a pending receipt is not a success signal.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import BinaryIO, Literal, Union
from uuid import UUID, uuid4

from app.modules.knowledge.application.ports import (
    DocumentParser,
    KnowledgePersistence,
    NewUpload,
    SourceNotFound,
    SourceStore,
    SourceStoreError,
    VectorProjection,
)
from app.modules.knowledge.domain.errors import UploadRejected
from app.modules.knowledge.domain.models import (
    IngestionState,
    KnowledgeOwner,
    UploadAdmission,
)
from app.modules.knowledge.domain.services import (
    MAX_SOURCE_BYTES,
    chunk_identities,
    ingestion_id_for,
    revision_id_for,
    source_key_for,
    staging_key_for,
    validate_upload,
)

logger = logging.getLogger(__name__)

MISSING_SOURCE_MESSAGE = (
    "original source bytes are unavailable; re-upload the file"
)


@dataclass(frozen=True)
class EmbeddingProfile:
    """The embedding configuration recorded with every revision."""

    provider: str
    model: str
    dimension: int


@dataclass(frozen=True)
class UploadRequest:
    file_name: str
    size_bytes: int
    stream: BinaryIO
    owner: KnowledgeOwner
    content_type: str = "application/octet-stream"


@dataclass(frozen=True)
class PendingReceipt:
    document_id: UUID
    operation_id: UUID
    state: Literal["pending"] = "pending"


@dataclass(frozen=True)
class ReadyReceipt:
    document_id: UUID
    revision_id: UUID
    state: Literal["ready"] = "ready"


UploadReceipt = Union[PendingReceipt, ReadyReceipt]


class UploadDocument:
    """Admit one upload durably and return a pending or ready receipt."""

    def __init__(
        self,
        *,
        source_store: SourceStore,
        persistence: KnowledgePersistence,
        embedding: EmbeddingProfile,
    ) -> None:
        self._source_store = source_store
        self._persistence = persistence
        self._embedding = embedding

    async def execute(self, request: UploadRequest) -> UploadReceipt:
        # Storage and PostgREST clients are synchronous; keep the event loop
        # free while bytes spool, upload, move, and SQL commits.
        return await asyncio.to_thread(self._execute, request)

    def _execute(self, request: UploadRequest) -> UploadReceipt:
        validate_upload(request.file_name, request.size_bytes)

        document_id = uuid4()
        revision_id = revision_id_for(document_id)
        ingestion_id = ingestion_id_for(revision_id)
        staging_key = staging_key_for(document_id, revision_id)
        source_key = source_key_for(
            request.owner,
            document_id,
            revision_id,
            request.file_name,
        )
        file_type = (
            PurePosixPath(request.file_name.replace("\\", "/")).suffix.lower().lstrip(".")
        )

        self._source_store.ensure_ready()
        stored = self._source_store.put(
            staging_key,
            request.stream,
            content_type=request.content_type,
            max_bytes=MAX_SOURCE_BYTES,
        )
        if not stored.sha256:
            raise SourceStoreError("source adapter did not report a content hash")
        self._source_store.move(staging_key, source_key)

        upload = NewUpload(
            document_id=document_id,
            revision_id=revision_id,
            ingestion_id=ingestion_id,
            owner=request.owner,
            file_name=request.file_name,
            file_type=file_type,
            file_size_bytes=stored.size or request.size_bytes,
            collection_name=request.owner.collection_name,
            source_key=source_key,
            source_sha256=stored.sha256,
            embedding_provider=self._embedding.provider,
            embedding_model=self._embedding.model,
            embedding_dimension=self._embedding.dimension,
        )
        try:
            admission = self._persistence.admit_upload(upload)
        except Exception:
            # The object has no SQL reference, so a best-effort delete avoids
            # leaking bytes. A failure here is swept later as an orphan.
            try:
                self._source_store.delete(source_key)
            except Exception:
                pass
            raise

        return self._receipt(admission)

    @staticmethod
    def _receipt(admission: UploadAdmission) -> UploadReceipt:
        if admission.state is IngestionState.READY:
            return ReadyReceipt(
                document_id=admission.document_id,
                revision_id=admission.revision_id,
            )
        if admission.state in (IngestionState.REVOKED,):
            raise UploadRejected(
                "upload was revoked before it could be acknowledged",
                code="upload_revoked",
            )
        return PendingReceipt(
            document_id=admission.document_id,
            operation_id=admission.ingestion_id,
        )


class IngestionWorker:
    """Restartable, idempotent ingestion over a leased durable job.

    Publication is a conditional SQL commit. A vector write that loses the
    race with a revocation is removed again; a late worker can never make a
    revoked revision eligible.
    """

    def __init__(
        self,
        *,
        source_store: SourceStore,
        persistence: KnowledgePersistence,
        parser: DocumentParser,
        vectors: VectorProjection,
        worker_id: str | None = None,
        lease_seconds: int = 120,
        parse_slots: int = 2,
    ) -> None:
        self._source_store = source_store
        self._persistence = persistence
        self._parser = parser
        self._vectors = vectors
        self._worker_id = worker_id or uuid4().hex
        self._lease_seconds = lease_seconds
        self._parse_slots = asyncio.Semaphore(max(1, parse_slots))

    async def recover(self, *, limit: int = 20) -> int:
        ids = await asyncio.to_thread(
            self._persistence.recoverable_ingestions,
            now=datetime.now(timezone.utc),
            limit=limit,
        )
        processed = 0
        for ingestion_id in ids:
            try:
                await self.process(ingestion_id)
                processed += 1
            except Exception:  # pragma: no cover - defensive sweep
                logger.exception(
                    "knowledge recovery failed for ingestion %s", ingestion_id
                )
        return processed

    async def process(self, ingestion_id: UUID) -> None:
        claim = await asyncio.to_thread(
            self._persistence.claim_ingestion,
            ingestion_id,
            lease_owner=self._worker_id,
            now=datetime.now(timezone.utc),
            lease_seconds=self._lease_seconds,
        )
        if claim.outcome != "claimed":
            return
        assert claim.document_id and claim.revision_id
        assert claim.source_key and claim.file_name and claim.file_type
        assert claim.collection_name

        try:
            data = await asyncio.to_thread(
                self._source_store.download,
                claim.source_key,
                max_bytes=MAX_SOURCE_BYTES,
            )
        except SourceNotFound:
            await self._fail(ingestion_id, claim.revision_id, MISSING_SOURCE_MESSAGE)
            return
        except Exception as exc:
            await self._fail(
                ingestion_id,
                claim.revision_id,
                f"original source could not be read: {type(exc).__name__}",
            )
            return

        try:
            async with self._parse_slots:
                parsed = await asyncio.to_thread(
                    self._parser.parse,
                    data,
                    file_name=claim.file_name,
                    file_type=claim.file_type,
                )
            identities = chunk_identities(
                claim.revision_id, [chunk.text for chunk in parsed]
            )
            started = await asyncio.to_thread(
                self._persistence.start_indexing,
                ingestion_id,
                claim.revision_id,
            )
            if not started:
                return
            await self._vectors.ensure_collection(claim.collection_name)
            await self._vectors.upsert_revision(
                claim.collection_name,
                document_id=claim.document_id,
                revision_id=claim.revision_id,
                file_name=claim.file_name,
                chunks=[
                    (identity, chunk.text)
                    for identity, chunk in zip(identities, parsed)
                ],
            )
            published = await asyncio.to_thread(
                self._persistence.publish_revision,
                ingestion_id,
                claim.revision_id,
                chunk_count=len(identities),
                chunks=identities,
            )
            if published.outcome != "ready":
                await self._discard_vectors(
                    claim.collection_name, claim.revision_id
                )
        except Exception as exc:
            await self._discard_vectors(claim.collection_name, claim.revision_id)
            await self._fail(
                ingestion_id,
                claim.revision_id,
                _bounded_error(exc),
            )

    async def _discard_vectors(self, collection: str, revision_id: UUID) -> None:
        try:
            await self._vectors.delete_revision(collection, revision_id)
        except Exception:  # pragma: no cover - cleanup is retried by intent
            logger.warning(
                "knowledge vector cleanup failed for revision %s", revision_id
            )

    async def _fail(self, ingestion_id: UUID, revision_id: UUID, message: str) -> None:
        try:
            await asyncio.to_thread(
                self._persistence.fail_ingestion,
                ingestion_id,
                revision_id,
                message,
            )
        except Exception:  # pragma: no cover - retried by the lease
            logger.warning(
                "knowledge failure record failed for ingestion %s", ingestion_id
            )


def _bounded_error(exc: Exception) -> str:
    message = str(exc).strip() or type(exc).__name__
    return message[:500]
