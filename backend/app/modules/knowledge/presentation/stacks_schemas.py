from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class KnowledgeStackBase(BaseModel):
    """Base schema for Knowledge Stacks."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None


class KnowledgeStackCreate(KnowledgeStackBase):
    """Schema for creating a new Knowledge Stack."""
    user_id: Optional[str] = None


class KnowledgeStackUpdate(BaseModel):
    """Schema for updating an existing Knowledge Stack."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class KnowledgeStack(KnowledgeStackBase):
    """Full schema for a Knowledge Stack."""
    id: str
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class KnowledgeStackListResponse(BaseModel):
    """Response schema for listing Knowledge Stacks."""
    stacks: List[KnowledgeStack]
    total: int
