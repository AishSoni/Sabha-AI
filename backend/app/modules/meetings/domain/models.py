"""Meetings domain models (spec 06).

ParticipantSnapshot is one participant's construction-time truth: a
participant is an INDEPENDENT COPY of its template state, taken once,
at construction — later template edits or deletion never re-read into
existing participants (proven by the persona-instances contract in
tests/regression/test_persona_instances_ab.py).

The generation carrier below is the participant's verbatim snapshot of
the template's provider_config: recorded values (including empty-string
inherit markers) pass through untouched, and keys the template never
recorded are ABSENT — the snapshot never seeds server defaults into an
override slot (that freezing is the spec-06 violation to remove).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Mapping, Optional

from pydantic import BaseModel, Field


GENERATION_CARRIER_KEYS = ("provider", "model", "temperature", "max_tokens")


def participant_provider_carrier(
    template_carrier: Mapping[str, Any] | None,
) -> dict:
    """Verbatim explicit-only snapshot of a template's settings carrier.

    Recorded numbers stay as-is (a ``0.7`` from a legacy seeded row stays
    ``0.7``, an explicit ``0.0`` stays ``0.0``); empty-string provider/
    model markers stay markers; JSON-null or missing keys are omitted so
    inheritance survives at execution start.
    """
    carrier = template_carrier or {}
    carried: dict = {}
    for key in GENERATION_CARRIER_KEYS:
        value = carrier.get(key)
        if value is not None:
            carried[key] = value
    return carried


def resolve_temperature(
    carrier: Mapping[str, Any] | None,
    default_temperature: float = 0.7,
) -> float:
    """Resolve a generation temperature from a participant carrier.

    Explicit recorded values win — including zero, which must never be
    reinterpreted as "no preference" — and only an absent/None entry
    falls through to the server default.
    """
    recorded = (carrier or {}).get("temperature")
    return default_temperature if recorded is None else float(recorded)


@dataclass(frozen=True)
class ParticipantSnapshot:
    """Everything one construction transactions writes for a participant."""

    id: str
    meeting_id: str
    name: str
    role: str
    system_prompt: str
    provider_config: dict
    color: str
    persona_id: Optional[str]
    stack_ids: tuple[str, ...]
    created_at: str
    # Explicit-only policy (inherit fields stay absent); every newly
    # constructed participant records the column ({} at minimum), so a
    # NULL column honest remains "legacy provenance".
    generation_policy: dict = field(default_factory=dict)

    def to_payload(self) -> dict:
        """Insert/RPC-ready mapping (tuples flattened to lists)."""
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "name": self.name,
            "role": self.role,
            "system_prompt": self.system_prompt,
            "provider_config": self.provider_config,
            "color": self.color,
            "persona_id": self.persona_id,
            "stack_ids": list(self.stack_ids),
            "created_at": self.created_at,
            "generation_policy": dict(self.generation_policy),
        }


# ============== Meeting lifecycle ==============


class MeetingStatus(str, Enum):
    ACTIVE = "active"
    VOTING = "voting"  # During vote-to-end process
    ENDED = "ended"    # Meeting has been ended
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
    Empty provider_config (all fields empty) keeps every value on server defaults.
    """
    provider: str = ""  # Empty = use DEFAULT_LLM_PROVIDER from settings
    model: str = ""     # Empty = use provider's default model from settings
    temperature: float = 0.7
    max_tokens: int = 2048


class AIParticipantBase(BaseModel):
    """Base AI participant fields."""
    name: str
    role: str
    system_prompt: str
    provider_config: ProviderConfig = Field(default_factory=ProviderConfig)
    color: str = "#6366f1"  # Default indigo
    persona_id: Optional[str] = None


class AIParticipantCreate(AIParticipantBase):
    """Create a new AI participant in a meeting."""
    meeting_id: str


class AIParticipant(AIParticipantBase):
    """Full AI participant model with ID.

    stack_ids snapshots the participant's knowledge-stack assignments at
    creation (server-managed; never accepted from API input). ``None`` marks
    legacy rows without a snapshot: the orchestrator falls back to the
    template's live join. Stack contents stay live via per-stack collections.
    """

    id: str
    meeting_id: str
    stack_ids: Optional[List[str]] = None
    created_at: datetime
    generation_policy: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ============== Message Models ==============


class Citation(BaseModel):
    """A citation reference in a message.

    ``claim_id``/``locator`` identify replay evidence. Live knowledge
    citations carry the exact retained document revision plus the chunk and
    page that produced the passage so the client can preview that revision
    without guessing from a file name or falling back to the latest one.
    """

    source: str
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    claim_id: Optional[str] = None
    locator: Optional[str] = None
    document_id: Optional[str] = None
    revision_id: Optional[str] = None
    chunk_id: Optional[str] = None
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None


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
    thinking_content: Optional[str] = None  # AI thinking/reasoning content
    estimated_cost: float = 0.0
    # Spec-06: the effective generation record rides only on the final
    # assistant message of a turn; user/system writes stay NULL.
    effective_generation: Optional[Dict[str, Any]] = None
    # Spec-07: user sends carry a stable key so a duplicate click cannot
    # create two messages; AI messages are linked by the turn operation.
    request_key: Optional[str] = None
    operation_id: Optional[str] = None


class Message(MessageBase):
    """Full message model with ID and timestamps."""
    id: str
    meeting_id: str
    citations: List[Citation] = Field(default_factory=list)
    tool_artifacts: Optional[dict] = None
    thinking_content: Optional[str] = None  # AI thinking/reasoning content
    estimated_cost: float = 0.0
    effective_generation: Optional[Dict[str, Any]] = None
    sequence: Optional[int] = None
    request_key: Optional[str] = None
    operation_id: Optional[str] = None
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
    persona_ids: Optional[List[str]] = None  # If provided, use these personas instead of defaults


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


class TurnResponse(BaseModel):
    """Response from an AI turn."""
    message: Message
    disagreements: List[Disagreement] = Field(default_factory=list)
    consensus: List[Consensus] = Field(default_factory=list)


# ============== Generation override contract ==============


class RequestProviderSettings(BaseModel):
    """Browser-supplied generation overrides for one turn (BYOK contract).

    Every field is optional: absent fields fall back to the participant's
    persisted provider_config, then to server defaults. The API key itself
    never lives here — it rides the X-Provider-Key request header.
    """
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    base_url: Optional[str] = None
