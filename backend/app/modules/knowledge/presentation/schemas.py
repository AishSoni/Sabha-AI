"""HTTP schemas owned by the Knowledge module."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    """Current document state plus its revision/operation identity."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    file_name: str
    file_type: str
    file_size_bytes: int
    chunk_count: int = 0
    qdrant_collection: str | None = None
    status: str = "pending"
    error_message: str | None = None
    created_at: datetime | None = None
    meeting_id: UUID | None = None
    persona_id: UUID | None = None
    stack_id: UUID | None = None
    revision_id: UUID | None = None
    revision_state: str | None = None
    operation_id: UUID | None = None


class UploadReceiptResponse(BaseModel):
    """Acknowledgement; only ``state=ready`` means eligible for retrieval."""

    model_config = ConfigDict(populate_by_name=True)

    state: Literal["pending", "ready"]
    document_id: UUID = Field(alias="documentId")
    operation_id: UUID | None = Field(default=None, alias="operationId")
    revision_id: UUID | None = Field(default=None, alias="revisionId")

    # Legacy acknowledgement fields kept until the frontend cutover completes.
    id: UUID
    file_name: str
    status: str
    chunk_count: int = 0
    message: str


class IngestionStatusResponse(BaseModel):
    """Durable progress for one upload operation."""

    model_config = ConfigDict(populate_by_name=True)

    operation_id: UUID = Field(alias="operationId")
    document_id: UUID = Field(alias="documentId")
    revision_id: UUID = Field(alias="revisionId")
    state: str
    revision_state: str = Field(alias="revisionState")
    document_status: str = Field(alias="documentStatus")
    file_name: str = Field(alias="fileName")
    file_type: str = Field(alias="fileType")
    chunk_count: int = Field(alias="chunkCount")
    error_message: str | None = Field(default=None, alias="errorMessage")


class DocumentSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    meeting_id: str | None = None
    stack_ids: list[str] | None = None
    limit: int = Field(default=5, ge=1, le=20)


class DocumentSearchResult(BaseModel):
    text: str
    score: float
    document_id: str
    revision_id: str
    chunk_id: str | None = None
    chunk_index: int
    file_name: str
    page_number: int | None = None


class DocumentSearchResponse(BaseModel):
    query: str
    results: list[DocumentSearchResult]
    total_results: int
