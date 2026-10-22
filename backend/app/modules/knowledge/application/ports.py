"""Ports owned by the Knowledge application layer.

Ports are narrow, typed seams. They may raise only the typed errors defined
here so callers never depend on an SDK or HTTP exception.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO, Protocol
from uuid import UUID

from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.knowledge.domain.models import (
    IngestionState,
    KnowledgeOwner,
    RevisionState,
    UploadAdmission,
)


class SourceStoreError(Exception):
    """Base error for the original-byte source store."""


class SourceStoreUnavailable(SourceStoreError):
    """The store cannot be reached or is not configured."""


class SourceNotFound(SourceStoreError):
    """The requested source object does not exist."""


class SourceObjectTooLarge(SourceStoreError):
    """The source object exceeds the bounded read budget."""


@dataclass(frozen=True)
class StoredSource:
    """One object discovered under a storage prefix."""

    key: str
    size: int | None = None
    sha256: str | None = None


class SourceStore(Protocol):
    """Persist and retrieve original upload bytes.

    Implementations must generate no keys and make no eligibility
    decisions: the caller owns deterministic keys and SQL is the
    authority for which revisions are eligible.
    """

    def ensure_ready(self) -> None:
        """Create/verify the configured bucket, or raise a typed error."""

    def put(
        self,
        key: str,
        stream: BinaryIO,
        *,
        content_type: str,
        max_bytes: int,
    ) -> StoredSource:
        """Write a staging object within the byte budget; idempotent per key.

        The returned object reports the stored size and SHA-256 digest so
        admission can persist the exact bytes identity in one pass.
        """

    def move(self, source_key: str, destination_key: str) -> None:
        """Finalize a staged object at its durable key."""

    def download(self, key: str, *, max_bytes: int) -> bytes:
        """Read a bounded object or raise a typed error."""

    def exists(self, key: str) -> bool:
        """Whether an object exists, without raising for 'missing'."""

    def delete(self, key: str) -> None:
        """Remove an object; deleting an already-missing key is a no-op."""

    def list_prefix(self, prefix: str, *, limit: int = 100) -> list[StoredSource]:
        """List the immediate children under a prefix."""


@dataclass(frozen=True)
class NewUpload:
    """Everything admission needs to persist one durable upload."""

    document_id: UUID
    revision_id: UUID
    ingestion_id: UUID
    owner: KnowledgeOwner
    file_name: str
    file_type: str
    file_size_bytes: int
    collection_name: str
    source_key: str
    source_sha256: str
    embedding_provider: str
    embedding_model: str
    embedding_dimension: int


@dataclass(frozen=True)
class IngestionRecord:
    """Read model for an upload receipt and its publication state."""

    ingestion_id: UUID
    document_id: UUID
    revision_id: UUID
    state: IngestionState
    revision_state: RevisionState
    document_status: str
    file_name: str
    file_type: str
    collection_name: str
    chunk_count: int = 0
    error_message: str | None = None


class KnowledgePersistence(Protocol):
    """SQL authority for durable knowledge state.

    Every method is synchronous and may raise ``KnowledgeUnavailable`` only;
    callers run it off the event loop. Eligibility and publication decisions
    stay inside the database functions so a derived vector payload can never
    override a tombstone.
    """

    def admit_upload(self, upload: NewUpload) -> UploadAdmission:
        """Persist document, revision, and ingestion before acknowledging."""

    def get_ingestion(self, ingestion_id: UUID) -> IngestionRecord | None:
        """Read the durable receipt state, or None when it never existed."""
