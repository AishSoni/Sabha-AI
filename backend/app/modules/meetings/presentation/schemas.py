"""HTTP contracts owned by the meetings module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.modules.meetings.domain.models import RequestProviderSettings


# ============== Turn queue ==============

TurnStatus = Literal[
    "queued",
    "executing",
    "completed",
    "failed",
    "interrupted",
    "cancelled",
]


class TurnSubmitRequest(BaseModel):
    """Submit one logical turn.

    ``request_key`` is globally unique (migration 014). Reusing it with the
    same payload returns the original operation; a different payload is a
    conflict. The provider key never appears here; it rides X-Provider-Key.
    """

    participant_id: str
    request_key: str = Field(min_length=1, max_length=200)
    provider: Optional[RequestProviderSettings] = None


class TurnError(BaseModel):
    code: str
    message: str


class TurnOperationResponse(BaseModel):
    operation_id: str
    meeting_id: str
    participant_id: Optional[str] = None
    request_key: str
    status: TurnStatus
    admission: int
    queue_position: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    final_message_id: Optional[str] = None
    cancel_requested: bool = False
    error: Optional[TurnError] = None
    effective_generation: Optional[dict[str, Any]] = None


class TurnCancelResponse(BaseModel):
    outcome: Literal["cancelled", "cancel_requested", "terminal"]
    status: TurnStatus


# ============== Meeting commands and turn results ==============


class TurnRequest(BaseModel):
    """Request to trigger an AI's turn."""
    participant_id: str
    provider: Optional[RequestProviderSettings] = None


class SummaryRequest(BaseModel):
    """Request to generate an interim meeting summary (real endpoint).

    Same BYOK contract as turns: browser overrides in the body, secret in
    the X-Provider-Key header (read by the route, never persisted).
    """
    provider: Optional[RequestProviderSettings] = None


class UserMessageRequest(BaseModel):
    """Request to add a user message."""
    content: str
    request_key: Optional[str] = None


# ============== Coordinated closing ==============


class SummarySettingsRequest(BaseModel):
    """Optional per-request System AI override for the final summary."""

    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    base_url: str | None = None


class ClosingRequest(BaseModel):
    """Ask to end a meeting through the coordinated closing workflow."""

    mode: Literal["vote", "force"]
    request_key: str = Field(min_length=1, max_length=200)
    summary_settings: SummarySettingsRequest | None = None


class ClosingVoteView(BaseModel):
    participant_id: str
    participant_name: str
    role: str | None = None
    status: str
    vote: bool | None = None
    reason: str | None = None
    provider: str | None = None
    model: str | None = None
    usage_kind: str | None = None
    price_kind: str | None = None
    estimated_cost: float | None = None
    reported_cost: float | None = None
    error_code: str | None = None
    error_message: str | None = None
    completed_at: datetime | None = None


class ClosingErrorView(BaseModel):
    code: str
    message: str


class ClosingView(BaseModel):
    """Canonical progress plus the committed result, if any."""

    meeting_id: str
    meeting_status: Literal["active", "voting", "ended", "archived"]
    archived: bool
    closing_id: str | None = None
    request_key: str | None = None
    mode: str | None = None
    stage: str | None = None
    failed_from_stage: str | None = None
    votes: list[ClosingVoteView] = Field(default_factory=list)
    summary: str | None = None
    summary_message_id: str | None = None
    error: ClosingErrorView | None = None
    retryable: bool = False
    abortable: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


class ClosingReceipt(BaseModel):
    """Durable acknowledgement that a close operation exists."""

    meeting_id: str
    closing_id: str
    stage: str
    meeting_status: Literal["active", "voting", "ended", "archived"]
