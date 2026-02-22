"""
Persona schemas for the AI Roster feature.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ProviderConfig(BaseModel):
    """LLM provider configuration for a persona."""
    provider: str = ""  # Empty = use default
    model: str = ""     # Empty = use provider default
    temperature: float = 0.7
    max_tokens: int = 2000


class PersonaBase(BaseModel):
    """Base persona fields."""
    name: str
    subtitle: Optional[str] = None  # e.g., "Devil's Advocate"
    color: str = "#6366f1"
    avatar_url: Optional[str] = None
    provider_config: ProviderConfig = Field(default_factory=ProviderConfig)
    is_default: bool = False
    stack_ids: List[str] = Field(default_factory=list)


class PersonaCreate(PersonaBase):
    """Create a new persona."""
    system_prompt: str = ""  # Initial prompt content
    user_id: Optional[str] = None


class PersonaUpdate(BaseModel):
    """Update persona metadata (not prompt)."""
    name: Optional[str] = None
    subtitle: Optional[str] = None
    color: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_config: Optional[ProviderConfig] = None


class Persona(PersonaBase):
    """Full persona model with ID."""
    id: str
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PersonaWithPrompt(Persona):
    """Persona with its active system prompt."""
    active_prompt: Optional[str] = None
    active_prompt_version: Optional[int] = None


# ============== Prompt Version Models ==============

class PromptVersionBase(BaseModel):
    """Base prompt version fields."""
    content: str


class PromptVersionCreate(PromptVersionBase):
    """Create a new prompt version."""
    pass


class PromptVersion(PromptVersionBase):
    """Full prompt version model."""
    id: str
    persona_id: str
    version: int
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


# ============== API Response Models ==============

class PersonaListResponse(BaseModel):
    """Response for listing personas."""
    personas: List[PersonaWithPrompt]
    total: int
