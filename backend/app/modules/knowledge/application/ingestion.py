"""Durable upload admission and ingestion use cases.

The application layer owns identity and ordering: validate the request,
persist original bytes behind the source-store port, then commit the
document/revision/ingestion rows before returning a receipt. SQL remains the
authority for publication; a pending receipt is not a success signal.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import BinaryIO, Literal, Union
from uuid import UUID, uuid4

from app.modules.knowledge.application.ports import (
    KnowledgePersistence,
    NewUpload,
    SourceStore,
    SourceStoreError,
)
from app.modules.knowledge.domain.errors import UploadRejected
from app.modules.knowledge.domain.models import (
    IngestionState,
    KnowledgeOwner,
    UploadAdmission,
)
from app.modules.knowledge.domain.services import (
    MAX_SOURCE_BYTES,
    ingestion_id_for,
    revision_id_for,
    source_key_for,
    staging_key_for,
    validate_upload,
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
