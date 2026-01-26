from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum
import uuid


class MeetingStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class SenderType(str, Enum):
    USER = "user"
    AI = "ai"
    SYSTEM = "system"


class DisagreementStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    CONCEDED = "conceded"


# ============== AI Participant Models ==============

class ProviderConfig(BaseModel):
    """LLM provider configuration for an AI participant.
    
    If provider or model are empty, the global defaults from settings will be used.
    """
    provider: str = ""  # Empty = use DEFAULT_LLM_PROVIDER from settings
    model: str = ""     # Empty = use provider's default model from settings
    temperature: float = 0.7


class AIParticipantBase(BaseModel):
    """Base AI participant fields."""
    name: str
    role: str
    system_prompt: str
    provider_config: ProviderConfig = Field(default_factory=ProviderConfig)
    color: str = "#6366f1"  # Default indigo


class AIParticipantCreate(AIParticipantBase):
    """Create a new AI participant in a meeting."""
    meeting_id: str


class AIParticipant(AIParticipantBase):
    """Full AI participant model with ID."""
    id: str
    meeting_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============== Message Models ==============

class Citation(BaseModel):
    """A citation reference in a message."""
    source: str
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None


class MessageBase(BaseModel):
    """Base message fields."""
    content: str
    sender_type: SenderType
    sender_id: Optional[str] = None
    sender_name: str


class MessageCreate(MessageBase):
    """Create a new message."""
    meeting_id: str
    citations: List[Citation] = Field(default_factory=list)
    tool_artifacts: Optional[dict] = None
    estimated_cost: float = 0.0


class Message(MessageBase):
    """Full message model with ID and timestamps."""
    id: str
    meeting_id: str
    citations: List[Citation] = Field(default_factory=list)
    tool_artifacts: Optional[dict] = None
    estimated_cost: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


# ============== Meeting Models ==============

class MeetingBase(BaseModel):
    """Base meeting fields."""
    name: str
    agenda: str = ""


class MeetingCreate(MeetingBase):
    """Create a new meeting."""
    user_id: Optional[str] = None


class Meeting(MeetingBase):
    """Full meeting model with ID."""
    id: str
    user_id: Optional[str] = None
    status: MeetingStatus = MeetingStatus.ACTIVE
    total_cost: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class MeetingWithParticipants(Meeting):
    """Meeting with its AI participants."""
    participants: List[AIParticipant] = Field(default_factory=list)
    messages: List[Message] = Field(default_factory=list)


# ============== Disagreement Models ==============

class DisagreementBase(BaseModel):
    """Base disagreement fields."""
    target_name: str
    topic: str
    reasoning: str
    severity: int = Field(ge=1, le=5, default=3)


class DisagreementCreate(DisagreementBase):
    """Create a new disagreement."""
    meeting_id: str
    source_ai_id: str


class Disagreement(DisagreementBase):
    """Full disagreement model."""
    id: str
    meeting_id: str
    source_ai_id: str
    status: DisagreementStatus = DisagreementStatus.OPEN
    created_at: datetime

    class Config:
        from_attributes = True


# ============== Consensus Models ==============

class ConsensusBase(BaseModel):
    """Base consensus fields."""
    participants: List[str]
    topic: str
    strength: int = Field(ge=1, le=5, default=3)


class ConsensusCreate(ConsensusBase):
    """Create a new consensus."""
    meeting_id: str


class Consensus(ConsensusBase):
    """Full consensus model."""
    id: str
    meeting_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============== API Request/Response Models ==============

class TurnRequest(BaseModel):
    """Request to trigger an AI's turn."""
    participant_id: str
    
    
class UserMessageRequest(BaseModel):
    """Request to add a user message."""
    content: str


class TurnResponse(BaseModel):
    """Response from an AI turn."""
    message: Message
    disagreements: List[Disagreement] = Field(default_factory=list)
    consensus: List[Consensus] = Field(default_factory=list)
