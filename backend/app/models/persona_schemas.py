"""
Persona schemas for the AI Roster feature.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ProviderConfig(BaseModel):
    """LLM provider configuration for a persona. Canonical defaults match meeting participants."""
    provider: str = ""  # Empty = use default
    model: str = ""     # Empty = use provider default
    temperature: float = 0.7
    max_tokens: int = 2048

    @field_validator("provider")
    @classmethod
    def _check_provider(cls, v: str) -> str:
        # Parse layer stays permissive; canonical resolution enforces allowlist.
        return (v or "").strip()

    @field_validator("temperature")
    @classmethod
    def _check_temperature(cls, v: float) -> float:
        if not (0.0 <= float(v) <= 2.0):
            raise ValueError("temperature out of range 0..2")
        return float(v)

    @field_validator("max_tokens")
    @classmethod
    def _check_max_tokens(cls, v: int) -> int:
        if not (1 <= int(v) <= 128000):
            raise ValueError("max_tokens out of range")
        return int(v)


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
