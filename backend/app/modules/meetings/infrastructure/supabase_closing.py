"""Supabase adapters for the closing workflow (spec 08).

All lifecycle transitions and paid-attempt checkpoints are RPCs, so the
database owns admission, fencing, idempotency and the ledger. The adapter
only translates rows into application contracts; it never writes a lifecycle
column directly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from app.capabilities.configuration.contracts import RequestDefaults
from app.capabilities.configuration.service import (
    SETTING_NAMES,
    resolve_effective_settings,
)
from app.services.system_ai_settings import SYSTEM_AI_DEFAULTS
from app.platform.config import settings
from app.llm import LLMMessage, get_provider
from app.modules.meetings.application.contracts import (
    ClosingRecord,
    ClosingSnapshot,
    Completion,
    MeetingContext,
    MessageView,
    ParticipantPolicy,
    ProviderOutput,
    RequestOutcome,
    SummaryAttempt,
    SummarySaveResult,
    SummarySettings,
    VoteAttempt,
    VoteRecord,
    VoteResult,
)
from app.modules.meetings.domain.errors import MeetingNotFoundError
from app.modules.meetings.domain.services import ClosingMode, ClosingStage

logger = logging.getLogger(__name__)

_OPEN_STAGES = ("draining", "voting", "summarizing", "failed")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_stage(value: Any) -> ClosingStage | None:
    if value is None:
        return None
    try:
        return ClosingStage(str(value))
    except ValueError:
        return None


def _parse_mode(value: Any) -> ClosingMode:
    try:
        return ClosingMode(str(value))
    except ValueError:
        return ClosingMode.VOTE


def _as_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _closing_from_row(row: Mapping[str, Any]) -> ClosingRecord:
    return ClosingRecord(
        id=str(row["id"]),
        meeting_id=str(row["meeting_id"]),
        request_key=str(row.get("request_key") or ""),
        mode=_parse_mode(row.get("mode")),
        stage=_parse_stage(row.get("stage")) or ClosingStage.DRAINING,
        from_status=str(row.get("from_status") or "active"),
        failed_from_stage=_parse_stage(row.get("failed_from_stage")),
        summary_settings=_as_mapping(row.get("summary_settings")),
        summary_text=row.get("summary_text"),
        summary_message_id=(
            str(row["summary_message_id"])
            if row.get("summary_message_id")
            else None
        ),
        summary_attempt_id=(
            str(row["summary_attempt_id"]) if row.get("summary_attempt_id") else None
        ),
        summary_attempt_number=row.get("summary_attempt_number"),
        summary_attempt_lease_expires_at=_parse_datetime(
            row.get("summary_attempt_lease_expires_at")
        ),
        error_code=row.get("error_code"),
        error_message=row.get("error_message"),
        created_at=_parse_datetime(row.get("created_at")),
        updated_at=_parse_datetime(row.get("updated_at")),
        completed_at=_parse_datetime(row.get("completed_at")),
    )


def _vote_from_row(row: Mapping[str, Any]) -> VoteRecord:
    return VoteRecord(
        participant_id=str(row["participant_id"]),
        participant_name=str(row.get("participant_name") or ""),
        role=str(row.get("role") or ""),
        status=str(row.get("status") or "pending"),
        vote=row.get("vote") if isinstance(row.get("vote"), bool) else None,
        reason=row.get("reason"),
        provider=row.get("provider"),
        model=row.get("model"),
        settings=_as_mapping(row.get("settings")),
        usage=row.get("usage") if isinstance(row.get("usage"), Mapping) else None,
        usage_kind=row.get("usage_kind"),
        price_kind=row.get("price_kind"),
        estimated_cost=(
            float(row["estimated_cost"])
            if row.get("estimated_cost") is not None
            else None
        ),
        reported_cost=(
            float(row["reported_cost"]) if row.get("reported_cost") is not None else None
        ),
        error_code=row.get("error_code"),
        error_message=row.get("error_message"),
        attempt_id=str(row["attempt_id"]) if row.get("attempt_id") else None,
        attempt_number=row.get("attempt_number"),
        attempt_lease_expires_at=_parse_datetime(
            row.get("attempt_lease_expires_at")
        ),
        completed_at=_parse_datetime(row.get("completed_at")),
    )


class SupabaseClosingRepository:
    """Guarded lifecycle repository over Supabase RPCs."""

    def __init__(self, manager, *, now=_now_iso) -> None:
        self.manager = manager
        self.db = manager.db
        self._now = now

    # ------------------------------------------------------------------
    # Admission and reads
    # ------------------------------------------------------------------

    async def request(
        self,
        meeting_id: str,
        request_key: str,
        mode: str,
        summary_settings: Mapping[str, Any],
    ) -> RequestOutcome:
        body = self._rpc(
            "request_meeting_closing",
            {
                "p_meeting_id": meeting_id,
                "p_request_key": request_key,
                "p_mode": mode,
                "p_summary_settings": dict(summary_settings),
                "p_now": self._now(),
            },
        )
        row = body.get("closing")
        return RequestOutcome(
            outcome=str(body.get("outcome") or "invalid"),
            closing=_closing_from_row(row) if row else None,
        )

    async def read(self, meeting_id: str) -> ClosingSnapshot:
        body = self._rpc("read_meeting_closing", {"p_meeting_id": meeting_id})
        meeting_row = body.get("meeting")
        if not meeting_row:
            raise MeetingNotFoundError("Meeting not found")
        meeting = await self.manager.get_meeting(meeting_id)
        if meeting is None:
            raise MeetingNotFoundError("Meeting not found")

        closing_row = body.get("closing")
        closing = _closing_from_row(closing_row) if closing_row else None

        attempts = {}
        if closing is not None:
            result = (
                self.db.table("closing_votes")
                .select("participant_id,attempt_id,attempt_number,attempt_lease_expires_at")
                .eq("closing_id", closing.id)
                .execute()
            )
            attempts = {
                str(row["participant_id"]): row for row in (result.data or [])
            }

        votes = []
        for row in body.get("votes") or []:
            merged = dict(row)
            extra = attempts.get(str(row.get("participant_id")), {})
            merged["attempt_id"] = extra.get("attempt_id")
            merged["attempt_number"] = extra.get("attempt_number")
            merged["attempt_lease_expires_at"] = extra.get(
                "attempt_lease_expires_at"
            )
            votes.append(_vote_from_row(merged))

        started_at = self._processing_turn_started_at(meeting_id)
        context = MeetingContext(
            meeting_id=str(meeting_row["id"]),
            name=str(meeting_row.get("name") or ""),
            agenda=str(meeting_row.get("agenda") or ""),
            status=str(meeting_row.get("status") or "active"),
            archived=meeting_row.get("archived_at") is not None,
            participants=tuple(
                ParticipantPolicy(
                    participant_id=str(participant.id),
                    name=participant.name,
                    role=participant.role,
                    provider_config=_provider_carrier(participant),
                    generation_policy=dict(participant.generation_policy or {}),
                )
                for participant in meeting.participants
            ),
            messages=tuple(
                MessageView(
                    sender_name=message.sender_name,
                    content=message.content,
                )
                for message in meeting.messages
            ),
        )
        return ClosingSnapshot(
            context=context,
            closing=closing,
            votes=tuple(votes),
            processing_turn_started_at=started_at,
        )

    def _processing_turn_started_at(self, meeting_id: str) -> datetime | None:
        result = (
            self.db.table("operations")
            .select("execution_started_at,updated_at")
            .eq("meeting_id", meeting_id)
            .eq("status", "processing")
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        row = rows[0]
        return _parse_datetime(
            row.get("execution_started_at") or row.get("updated_at")
        )

    async def list_open_meeting_ids(self) -> Sequence[str]:
        result = (
            self.db.table("meeting_closings")
            .select("meeting_id")
            .in_("stage", list(_OPEN_STAGES))
            .execute()
        )
        seen: list[str] = []
        for row in result.data or []:
            meeting_id = str(row["meeting_id"])
            if meeting_id not in seen:
                seen.append(meeting_id)
        return seen

    # ------------------------------------------------------------------
    # Lifecycle transitions
    # ------------------------------------------------------------------

    async def mark_stage(
        self, closing_id: str, expected: ClosingStage, next_stage: ClosingStage
    ) -> bool:
        return bool(
            self._rpc(
                "mark_closing_stage",
                {
                    "p_closing_id": closing_id,
                    "p_expected_stage": expected.value,
                    "p_next_stage": next_stage.value,
                    "p_now": self._now(),
                },
            )
        )

    async def fail(
        self,
        closing_id: str,
        expected: ClosingStage,
        code: str,
        message: str,
    ) -> bool:
        return bool(
            self._rpc(
                "fail_meeting_closing",
                {
                    "p_closing_id": closing_id,
                    "p_expected_stage": expected.value,
                    "p_error_code": code,
                    "p_error_message": message,
                    "p_now": self._now(),
                },
            )
        )

    async def retry(self, closing_id: str) -> bool:
        return bool(
            self._rpc(
                "retry_meeting_closing",
                {"p_closing_id": closing_id, "p_now": self._now()},
            )
        )

    async def abort(self, closing_id: str) -> bool:
        return bool(
            self._rpc(
                "abort_meeting_closing",
                {"p_closing_id": closing_id, "p_now": self._now()},
            )
        )

    async def reject(self, closing_id: str) -> bool:
        return bool(
            self._rpc(
                "reject_meeting_closing",
                {"p_closing_id": closing_id, "p_now": self._now()},
            )
        )

    async def complete(self, closing_id: str) -> Completion:
        body = self._rpc(
            "complete_meeting_closing",
            {"p_closing_id": closing_id, "p_now": self._now()},
        )
        return Completion(
            outcome=str(body.get("outcome") or "conflict"),
            message_id=(
                str(body["message_id"]) if body.get("message_id") else None
            ),
        )

    # ------------------------------------------------------------------
    # Votes
    # ------------------------------------------------------------------

    async def start_voting(self, closing_id: str) -> str:
        body = self._rpc(
            "start_closing_voting",
            {"p_closing_id": closing_id, "p_now": self._now()},
        )
        return str(body.get("outcome") or "conflict")

    async def begin_vote(
        self,
        closing_id: str,
        participant_id: str,
        attempt_id: str,
        lease_seconds: int,
        provider: str,
        model: str,
        settings: Mapping[str, Any],
    ) -> VoteAttempt:
        body = self._rpc(
            "begin_closing_vote_attempt",
            {
                "p_closing_id": closing_id,
                "p_participant_id": participant_id,
                "p_attempt_id": attempt_id,
                "p_lease_seconds": lease_seconds,
                "p_provider": provider,
                "p_model": model,
                "p_settings": dict(settings),
                "p_now": self._now(),
            },
        )
        return VoteAttempt(
            outcome=str(body.get("outcome") or "conflict"),
            vote=body.get("vote") if isinstance(body.get("vote"), bool) else None,
            reason=body.get("reason"),
            attempt_number=body.get("attempt_number"),
        )

    async def finish_vote(
        self,
        closing_id: str,
        participant_id: str,
        attempt_id: str,
        *,
        provider: str,
        model: str,
        status: str,
        vote: bool | None,
        reason: str | None,
        usage: Mapping[str, Any] | None,
        usage_kind: str,
        price_kind: str,
        estimated_cost: float,
        reported_cost: float | None,
        error_code: str | None,
        error_message: str | None,
    ) -> VoteResult:
        body = self._rpc(
            "finish_closing_vote_attempt",
            {
                "p_closing_id": closing_id,
                "p_participant_id": participant_id,
                "p_attempt_id": attempt_id,
                "p_provider": provider,
                "p_model": model,
                "p_status": status,
                "p_vote": vote,
                "p_reason": reason,
                "p_usage": dict(usage) if usage else None,
                "p_usage_kind": usage_kind,
                "p_price_kind": price_kind,
                "p_estimated_cost": estimated_cost,
                "p_reported_cost": reported_cost,
                "p_error_code": error_code,
                "p_error_message": error_message,
                "p_now": self._now(),
            },
        )
        return VoteResult(
            outcome=str(body.get("outcome") or "invalid"),
            vote_updated=bool(body.get("vote_updated")),
            ledger_recorded=bool(body.get("ledger_recorded")),
        )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    async def reserve_summary(
        self, closing_id: str, attempt_id: str, lease_seconds: int
    ) -> SummaryAttempt:
        body = self._rpc(
            "reserve_closing_summary_attempt",
            {
                "p_closing_id": closing_id,
                "p_attempt_id": attempt_id,
                "p_lease_seconds": lease_seconds,
                "p_now": self._now(),
            },
        )
        return SummaryAttempt(
            outcome=str(body.get("outcome") or "conflict"),
            summary_text=body.get("summary_text"),
            attempt_number=body.get("attempt_number"),
        )

    async def save_summary(
        self,
        closing_id: str,
        attempt_id: str,
        summary_text: str,
        *,
        provider: str,
        model: str,
        purpose: str,
        usage: Mapping[str, Any] | None,
        usage_kind: str,
        price_kind: str,
        estimated_cost: float,
        reported_cost: float | None,
    ) -> SummarySaveResult:
        body = self._rpc(
            "save_closing_summary_checkpoint",
            {
                "p_closing_id": closing_id,
                "p_attempt_id": attempt_id,
                "p_summary_text": summary_text,
                "p_provider": provider,
                "p_model": model,
                "p_purpose": purpose,
                "p_usage": dict(usage) if usage else None,
                "p_usage_kind": usage_kind,
                "p_price_kind": price_kind,
                "p_estimated_cost": estimated_cost,
                "p_reported_cost": reported_cost,
                "p_now": self._now(),
            },
        )
        return SummarySaveResult(
            outcome=str(body.get("outcome") or "invalid"),
            ledger_recorded=bool(body.get("ledger_recorded")),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _rpc(self, name: str, params: Mapping[str, Any]):
        result = self.db.rpc(name, dict(params)).execute()
        return result.data


@dataclass(frozen=True)
class _ProviderCarrier:
    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None


def _provider_carrier(participant) -> dict[str, Any]:
    config = getattr(participant, "provider_config", None)
    if config is None:
        return {}
    if hasattr(config, "model_dump"):
        return config.model_dump()
    if isinstance(config, Mapping):
        return dict(config)
    return {}


class _PolicyParticipant:
    """Adapter object shaped the way the configuration resolver reads it."""

    def __init__(self, policy: ParticipantPolicy) -> None:
        carrier = policy.provider_config or {}
        self.generation_policy = dict(policy.generation_policy or {})
        self.provider_config = _ProviderCarrier(
            provider=carrier.get("provider"),
            model=carrier.get("model"),
            temperature=carrier.get("temperature"),
            max_tokens=carrier.get("max_tokens"),
        )


class SupabaseInvoker:
    """One provider call bound to a frozen effective policy."""

    def __init__(self, effective) -> None:
        self.provider = effective.provider
        self.model = effective.model
        self.temperature = effective.temperature
        self.max_tokens = effective.max_tokens
        self.settings = effective.as_record()
        self._client = get_provider(
            provider_name=effective.provider,
            model=effective.model,
            base_url=effective.base_url,
        )

    async def complete(self, prompt: str) -> ProviderOutput:
        response = await self._client.complete(
            [LLMMessage(role="user", content=prompt)],
            tools=[],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        usage = dict(response.usage) if response.usage else None
        estimated = float(self._client.estimate_cost(usage or {})) if usage else 0.0
        return ProviderOutput(
            text=response.content or "",
            usage=usage,
            estimated_cost=estimated,
            reported_cost=_reported_cost(usage),
        )


def _reported_cost(usage: Mapping[str, Any] | None) -> float | None:
    if not usage:
        return None
    for key in ("cost", "total_cost"):
        value = usage.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


class SupabaseInvocationFactory:
    """Resolve participant and System AI settings from server configuration."""

    async def participant(self, policy: ParticipantPolicy) -> SupabaseInvoker:
        effective = resolve_effective_settings(_PolicyParticipant(policy))
        return SupabaseInvoker(effective)

    async def system(self, summary: SummarySettings | None) -> SupabaseInvoker:
        overrides = RequestDefaults(
            provider=summary.provider if summary else None,
            model=summary.model if summary else None,
            temperature=summary.temperature if summary else None,
            max_tokens=summary.max_tokens if summary else None,
            base_url=summary.base_url if summary else None,
        )
        provider = overrides.provider
        model = overrides.model
        if provider and not model:
            model_setting = SETTING_NAMES.get(provider, {}).get("model")
            if model_setting:
                model = getattr(settings, model_setting, None) or None
        if provider or model:
            overrides = RequestDefaults(
                provider=provider,
                model=model,
                temperature=overrides.temperature,
                max_tokens=overrides.max_tokens,
                base_url=overrides.base_url,
            )
        effective = resolve_effective_settings(
            None,
            provider_settings=overrides if (provider or model or _has_overrides(overrides)) else None,
            defaults=SYSTEM_AI_DEFAULTS,
        )
        return SupabaseInvoker(effective)


def _has_overrides(overrides: RequestDefaults) -> bool:
    return any(
        value is not None
        for value in (
            overrides.provider,
            overrides.model,
            overrides.temperature,
            overrides.max_tokens,
            overrides.base_url,
        )
    )
