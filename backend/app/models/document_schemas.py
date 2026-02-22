"""
Pydantic schemas for document operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class DocumentBase(BaseModel):
    """Base document schema."""
    file_name: str
    file_type: str
    file_size_bytes: int


class DocumentCreate(DocumentBase):
    """Schema for creating a document record."""
    meeting_id: Optional[str] = None
    persona_id: Optional[str] = None
    stack_id: Optional[str] = None
    qdrant_collection: Optional[str] = None


class DocumentUpdate(BaseModel):
    """Schema for updating a document."""
    status: Optional[str] = None
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None


class Document(DocumentBase):
    """Full document schema from database."""
    id: str
    meeting_id: Optional[str] = None
    persona_id: Optional[str] = None
    stack_id: Optional[str] = None
    chunk_count: int = 0
    qdrant_collection: Optional[str] = None
    status: str = "processing"
    error_message: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class DocumentUploadResponse(BaseModel):
    """Response after uploading a document."""
    id: str
    file_name: str
    status: str
    chunk_count: int
    message: str


class DocumentSearchRequest(BaseModel):
    """Request body for document search."""
    query: str = Field(..., min_length=1, max_length=1000)
    meeting_id: Optional[str] = None
    persona_id: Optional[str] = None
    stack_ids: Optional[List[str]] = None
    limit: int = Field(default=5, ge=1, le=20)


class DocumentSearchResult(BaseModel):
    """Single search result."""
    text: str
    score: float
    document_id: str
    file_name: str
    chunk_index: int


class DocumentSearchResponse(BaseModel):
    """Response from document search."""
    query: str
    results: List[DocumentSearchResult]
    total_results: int
