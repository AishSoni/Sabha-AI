"""Knowledge domain models.

SQL owns eligibility; these value objects describe what an adapter may
write or read without letting a vector payload become authoritative.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from .errors import InvalidOwner

OwnerKind = Literal["meeting", "persona", "stack"]


class RevisionState(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"
    REVOKED = "revoked"
    UNAVAILABLE = "unavailable"


class IngestionState(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    REVOKED = "revoked"


@dataclass(frozen=True)
class KnowledgeOwner:
    kind: OwnerKind
    id: UUID

    def __post_init__(self) -> None:
        if self.kind not in ("meeting", "persona", "stack"):
            raise InvalidOwner(f"unsupported knowledge owner {self.kind!r}")

    @property
    def collection_name(self) -> str:
        if self.kind == "meeting":
            return f"meeting_{self.id}_shared"
        return f"{self.kind}_{self.id}_knowledge"


@dataclass(frozen=True)
class DocumentRevision:
    id: UUID
    document_id: UUID
    revision_number: int
    state: RevisionState
    file_type: str
    source_key: str | None = None
    source_sha256: str | None = None
    source_size_bytes: int | None = None
    collection_name: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    embedding_dimension: int | None = None
    chunk_count: int = 0
    revoked_at: datetime | None = None


@dataclass(frozen=True)
class EligibleRevision:
    document_id: UUID
    revision_id: UUID
    collection_name: str
    file_name: str


@dataclass(frozen=True)
class ChunkIdentity:
    id: UUID
    chunk_index: int
    content_sha256: str
    char_count: int


@dataclass(frozen=True)
class PassageEvidence:
    meeting_id: UUID | None
    document_id: UUID
    revision_id: UUID
    chunk_id: UUID | None
    chunk_sha256: str | None
    raw_passage: str
    source_name: str | None = None
    participant_id: UUID | None = None
    operation_id: UUID | None = None
    tool_call_id: str | None = None
    message_id: UUID | None = None
    score: float | None = None


@dataclass(frozen=True)
class CleanupIntent:
    kind: str
    target_id: UUID
    document_id: UUID | None = None
    revision_id: UUID | None = None
    collection_name: str | None = None
    source_key: str | None = None
    reason: str | None = None
    attempts: int = 0


@dataclass(frozen=True)
class UploadAdmission:
    document_id: UUID
    revision_id: UUID
    ingestion_id: UUID
    state: IngestionState
