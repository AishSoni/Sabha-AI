"""HTTP contracts for coordinated meeting closing (spec 08)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
