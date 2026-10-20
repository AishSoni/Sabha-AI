"""API shapes for the durable turn queue (spec 07).

The database uses the legacy operation states ``pending``/``processing``/
``done``; the public contract uses ``queued``/``executing``/``completed``.
The route layer performs that mapping so no caller needs to know the storage
vocabulary.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.models.schemas import RequestProviderSettings

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
