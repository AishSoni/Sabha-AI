"""Typed contracts for the closing workflow (spec 08).

These values cross the application boundary: the service decides stages and
ballots, the repository owns guarded persistence, and the invocation factory
hides credentials behind a per-call invoker. No transport or database type
leaks in here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping

from app.modules.meetings.domain.services import ClosingMode, ClosingStage


@dataclass(frozen=True)
class SummarySettings:
    """Optional per-request System AI override for the closing summary.

    Empty fields inherit the server's configured System AI defaults; this is
    never resolved from an arbitrary meeting participant.
    """

    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    base_url: str | None = None

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any] | None) -> "SummarySettings":
        if not data:
            return cls()
        return cls(
            provider=_clean_text(data.get("provider")),
            model=_clean_text(data.get("model")),
            temperature=_clean_number(data.get("temperature")),
            max_tokens=_clean_int(data.get("max_tokens")),
            base_url=_clean_text(data.get("base_url")),
        )

    def as_mapping(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in {
                "provider": self.provider,
                "model": self.model,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
                "base_url": self.base_url,
            }.items()
            if value not in (None, "")
        }


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clean_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class ParticipantPolicy:
    """The saved configuration a ballot resolves at vote start."""

    participant_id: str
    name: str
    role: str
    provider_config: Mapping[str, Any] = field(default_factory=dict)
    generation_policy: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MessageView:
    sender_name: str
    content: str


@dataclass(frozen=True)
class MeetingContext:
    meeting_id: str
    name: str
    agenda: str
    status: str
    archived: bool
    participants: tuple[ParticipantPolicy, ...] = ()
    messages: tuple[MessageView, ...] = ()


@dataclass(frozen=True)
class ClosingRecord:
    id: str
    meeting_id: str
    request_key: str
    mode: ClosingMode
    stage: ClosingStage
    from_status: str
    failed_from_stage: ClosingStage | None = None
    summary_settings: Mapping[str, Any] = field(default_factory=dict)
    summary_text: str | None = None
    summary_message_id: str | None = None
    summary_attempt_id: str | None = None
    summary_attempt_number: int | None = None
    summary_attempt_lease_expires_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(frozen=True)
class VoteRecord:
    participant_id: str
    participant_name: str
    role: str
    status: str
    vote: bool | None = None
    reason: str | None = None
    provider: str | None = None
    model: str | None = None
    settings: Mapping[str, Any] = field(default_factory=dict)
    usage: Mapping[str, Any] | None = None
    usage_kind: str | None = None
    price_kind: str | None = None
    estimated_cost: float | None = None
    reported_cost: float | None = None
    error_code: str | None = None
    error_message: str | None = None
    attempt_id: str | None = None
    attempt_number: int | None = None
    attempt_lease_expires_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(frozen=True)
class ClosingSnapshot:
    context: MeetingContext
    closing: ClosingRecord | None
    votes: tuple[VoteRecord, ...] = ()
    processing_turn_started_at: datetime | None = None


@dataclass(frozen=True)
class RequestOutcome:
    outcome: str
    closing: ClosingRecord | None = None


@dataclass(frozen=True)
class VoteAttempt:
    outcome: str
    vote: bool | None = None
    reason: str | None = None
    attempt_number: int | None = None


@dataclass(frozen=True)
class VoteResult:
    outcome: str
    vote_updated: bool = False
    ledger_recorded: bool = False


@dataclass(frozen=True)
class SummaryAttempt:
    outcome: str
    summary_text: str | None = None
    attempt_number: int | None = None


@dataclass(frozen=True)
class SummarySaveResult:
    outcome: str
    ledger_recorded: bool = False


@dataclass(frozen=True)
class Completion:
    outcome: str
    message_id: str | None = None


@dataclass(frozen=True)
class ProviderOutput:
    """One completed provider call, with honest accounting facts.

    ``usage`` is the provider's reported usage mapping or ``None`` when the
    provider did not report it. ``estimated_cost`` is the local estimator's
    amount for known usage and must stay zero when usage is unknown.
    ``reported_cost`` is present only when the provider itself reported a
    monetary amount.
    """

    text: str
    usage: Mapping[str, Any] | None = None
    estimated_cost: float = 0.0
    reported_cost: float | None = None
