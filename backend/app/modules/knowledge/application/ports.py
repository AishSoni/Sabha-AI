"""Ports owned by the Knowledge application layer.

Ports are narrow, typed seams. They may raise only the typed errors defined
here so callers never depend on an SDK or HTTP exception.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO, Literal, Protocol
from uuid import UUID

from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    CleanupIntent,
    EligibleRevision,
    IngestionState,
    KnowledgeOwner,
    PassageEvidence,
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

    def list_prefix(
        self, prefix: str, *, limit: int = 100, recursive: bool = False
    ) -> list[StoredSource]:
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
class DocumentRecord:
    """A document with its current revision and upload operation identity."""

    document_id: UUID
    file_name: str
    file_type: str
    file_size_bytes: int
    status: str
    chunk_count: int
    created_at: datetime | None
    qdrant_collection: str | None = None
    error_message: str | None = None
    revision_id: UUID | None = None
    revision_state: RevisionState | None = None
    operation_id: UUID | None = None


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

    def claim_ingestion(
        self,
        ingestion_id: UUID,
        *,
        lease_owner: str,
        now: datetime,
        lease_seconds: int,
    ) -> "IngestionClaim":
        """Lease one ingestion for a bounded worker attempt."""

    def start_indexing(self, ingestion_id: UUID, revision_id: UUID) -> bool:
        """Enter indexing unless the revision was revoked meanwhile."""

    def publish_revision(
        self,
        ingestion_id: UUID,
        revision_id: UUID,
        *,
        chunk_count: int,
        chunks: list[ChunkIdentity],
    ) -> "PublishResult":
        """Commit chunk metadata and readiness in one conditional transaction."""

    def fail_ingestion(
        self, ingestion_id: UUID, revision_id: UUID, error: str
    ) -> bool:
        """Record an honest failure without overriding a revocation."""

    def recoverable_ingestions(
        self, *, now: datetime, limit: int = 20
    ) -> list[UUID]:
        """Pending or expired-lease ingestion ids eligible for a retry."""

    def eligible_revisions(
        self, *, meeting_id: UUID | None, stack_ids: list[UUID]
    ) -> list[EligibleRevision]:
        """Ready, unrevoked revisions in the meeting or saved stack scope."""

    def revalidate_revisions(
        self,
        revision_ids: list[UUID],
        *,
        meeting_id: UUID | None,
        stack_ids: list[UUID],
    ) -> set[UUID]:
        """Intersect candidate revisions with current SQL eligibility."""

    def record_evidence(self, passages: list[PassageEvidence]) -> None:
        """Persist raw retrieved passages for later source-linked redaction."""

    def revoke_parent(
        self, parent_kind: str, parent_id: UUID, *, reason: str
    ) -> "ParentRevocationResult":
        """Revoke every document owned by a meeting, stack, or persona."""

    def revoke_document(
        self, document_id: UUID, *, reason: str
    ) -> "RevocationResult":
        """Revoke eligibility and persist retryable cleanup intents."""

    def list_cleanup_intents(self, *, limit: int = 50) -> list[CleanupIntent]:
        """Unresolved physical cleanup work in creation order."""

    def resolve_cleanup(self, intent_id: UUID) -> bool:
        """Mark one cleanup intent resolved."""

    def note_cleanup_failure(self, intent_id: UUID, error: str) -> bool:
        """Keep a failed intent visible with its latest error."""

    def redact_evidence(self, revision_id: UUID, *, reason: str) -> int:
        """Null retained raw passages for one revision."""

    def redact_message_artifacts(
        self, revision_id: UUID, *, reason: str
    ) -> int:
        """Redact matching tool-artifact and citation passages in messages."""

    def attach_evidence_message(
        self, operation_id: UUID, tool_call_id: str | None, message_id: UUID
    ) -> int:
        """Attach published message identity to evidence recorded mid-turn."""

    def list_documents(
        self, *, owner_kind: str, owner_id: UUID
    ) -> list[DocumentRecord]:
        """Documents owned by one meeting, persona, or stack, newest first."""

    def get_document(self, document_id: UUID) -> DocumentRecord | None:
        """One document with its current revision and operation identity."""

    def delete_document_row(self, document_id: UUID) -> bool:
        """Remove the document row after revocation; cleanup stays durable."""


@dataclass(frozen=True)
class RevocationResult:
    document_id: UUID
    revisions: int


@dataclass(frozen=True)
class ParentRevocationResult:
    parent_kind: str
    parent_id: UUID
    documents: int
    collection_name: str


@dataclass(frozen=True)
class IngestionClaim:
    outcome: Literal["claimed", "busy", "ready", "revoked", "not_found"]
    document_id: UUID | None = None
    revision_id: UUID | None = None
    file_name: str | None = None
    file_type: str | None = None
    source_key: str | None = None
    source_sha256: str | None = None
    source_size_bytes: int | None = None
    collection_name: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    embedding_dimension: int | None = None
    attempts: int = 0


@dataclass(frozen=True)
class PublishResult:
    outcome: Literal["ready", "revoked", "not_found"]


@dataclass(frozen=True)
class ParsedChunk:
    """Extracted text before deterministic chunk identity is assigned."""

    text: str
    chunk_index: int


class DocumentParser(Protocol):
    """Extract ordered text from original bytes, off the event loop."""

    def parse(
        self, data: bytes, *, file_name: str, file_type: str
    ) -> list[ParsedChunk]:
        """Parse supported formats or raise a typed knowledge error."""


class VectorProjection(Protocol):
    """Derived Qdrant projection; SQL always decides eligibility."""

    async def ensure_collection(self, collection_name: str) -> None: ...

    async def upsert_revision(
        self,
        collection_name: str,
        *,
        document_id: UUID,
        revision_id: UUID,
        file_name: str,
        chunks: list[tuple[ChunkIdentity, str]],
    ) -> int: ...

    async def delete_revision(
        self, collection_name: str, revision_id: UUID
    ) -> int: ...

    async def delete_collection(self, collection_name: str) -> bool: ...

    async def search(
        self,
        collection_name: str,
        *,
        revision_ids: list[UUID],
        query: str,
        limit: int,
    ) -> list["VectorHit"]: ...


@dataclass(frozen=True)
class VectorHit:
    text: str
    score: float
    document_id: UUID
    revision_id: UUID
    chunk_id: UUID
    chunk_index: int
    content_sha256: str
    file_name: str
