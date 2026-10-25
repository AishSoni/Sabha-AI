"""Durable turn queue service (spec 07).

The database owns admission, ordering, leases, fences, attempts and events.
This module is the application-side workflow: submit a turn, claim one, run
the bounded inference/tool loop, publish exactly one final message, or record
an explicit terminal failure.

No database transaction is held while a provider or tool is running. Every
provider call has a durable attempt row created before it starts, and a stale
worker can never publish a final message for a newer fence.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from app.capabilities.configuration.contracts import (
    IncompatibleGenerationPlan,
    MissingProviderKeyError,
)
from app.capabilities.configuration.service import resolve_effective_settings
from app.platform.config import settings
from app.capabilities.inference.contracts import LLMMessage, StreamEventType, ToolCall
from app.platform.providers import get_provider
from app.modules.meetings.domain.models import (
    AIParticipant,
    MeetingStatus,
    Message,
    RequestProviderSettings,
    SenderType,
)
from app.platform.database import get_supabase
from app.modules.meetings.application.context import build_context
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.application.tools import get_default_tools
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 5
MAX_TOOL_RESULT_CHARS = 12_000
MAX_CONTEXT_CHARS = 120_000


class QueueNotFoundError(ValueError):
    pass


class QueueConflictError(ValueError):
    pass


class QueueClosedError(ValueError):
    pass


class QueueParticipantNotFoundError(ValueError):
    pass


class QueueLimitError(ValueError):
    pass


class TurnNotFoundError(ValueError):
    pass


class NotCancellableError(ValueError):
    pass


class TransientCredentialStore:
    """Process-local BYOK handoff keyed by operation id.

    Secrets never reach the database, logs or operation events. A queued
    operation recovered by another process therefore has no browser key and
    must become ``interrupted`` before any provider call.
    """

    def __init__(self) -> None:
        self._keys: dict[str, str] = {}

    def put(self, operation_id: str, key: Optional[str]) -> None:
        if key:
            self._keys[operation_id] = key

    def pop(self, operation_id: str) -> Optional[str]:
        return self._keys.pop(operation_id, None)

    def discard(self, operation_id: str) -> None:
        self._keys.pop(operation_id, None)

    def clear(self) -> None:
        self._keys.clear()


@dataclass(frozen=True)
class TurnClaim:
    operation: dict
    operation_id: str
    meeting_id: str
    participant_id: str
    fence: int
    context_boundary: int

    @classmethod
    def from_row(cls, row: dict) -> "TurnClaim":
        return cls(
            operation=row,
            operation_id=str(row["id"]),
            meeting_id=str(row["meeting_id"]),
            participant_id=str(row["participant_id"]),
            fence=int(row["fence_version"]),
            context_boundary=int(row.get("context_boundary") or 0),
        )


@dataclass(frozen=True)
class TurnSubmission:
    """The admitted operation plus whether this call created it."""

    operation: dict
    created: bool


@dataclass(frozen=True)
class TurnExecutionResult:
    operation_id: str
    status: str
    message_id: Optional[str] = None
    error_code: Optional[str] = None


def payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _merge_usage(total: dict, usage: dict | None) -> dict:
    for key, value in (usage or {}).items():
        if isinstance(value, (int, float)):
            total[key] = total.get(key, 0) + value
    return total


def _truncate(text: str, limit: int = MAX_TOOL_RESULT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[truncated]"


class TurnQueueService:
    """Application service over the queue RPCs plus the inference loop."""

    def __init__(
        self,
        meeting_manager: MeetingService | None = None,
        *,
        provider_factory=get_provider,
        vector_store_factory=None,
        credentials: TransientCredentialStore | None = None,
        max_queued: int | None = None,
    ) -> None:
        self.meeting_manager = meeting_manager or build_meeting_service(
            get_supabase()
        )
        self.provider_factory = provider_factory
        self.vector_store_factory = vector_store_factory
        self.credentials = credentials or TransientCredentialStore()
        self.max_queued = max_queued or settings.turn_max_queued_per_meeting
        self.db = self.meeting_manager.db

    # ------------------------------------------------------------------
    # Admission / reads
    # ------------------------------------------------------------------
    async def submit(
        self,
        meeting_id: str,
        participant_id: str,
        request_key: str,
        provider_settings: RequestProviderSettings | None = None,
        provider_api_key: str | None = None,
    ) -> TurnSubmission:
        payload = {
            "meeting_id": str(meeting_id),
            "participant_id": str(participant_id),
            "provider": (
                provider_settings.model_dump(exclude_none=True)
                if provider_settings is not None
                else {}
            ),
        }
        result = self.db.rpc(
            "admit_turn_operation",
            {
                "p_meeting_id": str(meeting_id),
                "p_participant_id": str(participant_id),
                "p_request_key": request_key,
                "p_payload_hash": payload_hash(payload),
                "p_payload": payload,
                "p_max_queued": self.max_queued,
                "p_now": _now(),
            },
        ).execute()
        body = result.data or {}
        outcome = body.get("outcome")
        if outcome == "not_found":
            raise QueueNotFoundError("Meeting not found")
        if outcome == "meeting_closed":
            current = await self.meeting_manager.get_meeting(meeting_id)
            status_value = (
                current.status.value if current is not None else "closed"
            )
            raise QueueClosedError(
                f"Meeting is {status_value}; turns can only be submitted "
                "to an active meeting"
            )
        if outcome == "participant_not_found":
            raise QueueParticipantNotFoundError("Participant not found in this meeting")
        if outcome == "conflict":
            raise QueueConflictError("Request key was already used with a different payload")
        if outcome == "queue_limit":
            raise QueueLimitError("The meeting's turn queue is full")

        operation = body.get("operation") or {}
        operation_id = str(operation.get("id"))
        if outcome == "created" or outcome == "existing":
            # An idempotent retry with a fresh browser key can still attach it
            # to a still-queued operation in this process. Executing operations
            # in another worker cannot receive it.
            self.credentials.put(operation_id, provider_api_key)

        operation["queue_position"] = body.get("queue_position")
        return TurnSubmission(operation=operation, created=outcome == "created")

    async def status(self, meeting_id: str, operation_id: str) -> dict:
        result = self.db.rpc(
            "get_turn_operation_status",
            {
                "p_operation_id": str(operation_id),
                "p_meeting_id": str(meeting_id),
            },
        ).execute()
        if not result.data:
            raise TurnNotFoundError("Turn operation not found")
        return result.data

    async def list_operations(self, meeting_id: str, limit: int = 100) -> list[dict]:
        result = self.db.rpc(
            "list_turn_operations",
            {"p_meeting_id": str(meeting_id), "p_limit": limit},
        ).execute()
        return result.data or []

    async def events(
        self, meeting_id: str, operation_id: str, after_sequence: int = 0, limit: int = 500
    ) -> list[dict]:
        result = self.db.rpc(
            "read_turn_events",
            {
                "p_operation_id": str(operation_id),
                "p_meeting_id": str(meeting_id),
                "p_after_sequence": after_sequence,
                "p_limit": limit,
            },
        ).execute()
        return result.data or []

    def operation_effects(self, operation_id: str) -> tuple[list[dict], list[dict]]:
        """Effects committed by one turn, for the legacy synchronous response.

        New callers read the meeting's effect collections. This narrow lookup
        exists only while the legacy /turn adapter is still accepted.
        """
        disagreements = (
            self.db.table("disagreements")
            .select("*")
            .eq("operation_id", str(operation_id))
            .execute()
            .data
            or []
        )
        consensus = (
            self.db.table("consensus")
            .select("*")
            .eq("operation_id", str(operation_id))
            .execute()
            .data
            or []
        )
        return disagreements, consensus

    async def cancel(self, meeting_id: str, operation_id: str) -> dict:
        result = self.db.rpc(
            "cancel_turn_operation",
            {
                "p_operation_id": str(operation_id),
                "p_meeting_id": str(meeting_id),
                "p_now": _now(),
            },
        ).execute()
        body = result.data or {}
        outcome = body.get("outcome")
        if outcome == "not_found":
            raise TurnNotFoundError("Turn operation not found")
        if outcome == "terminal":
            raise NotCancellableError(f"Turn is already {body.get('status')}")
        return body

    async def cancel_for_meeting(self, meeting_id: str, reason: str = "meeting_closed") -> int:
        result = self.db.rpc(
            "cancel_turn_operations_for_meeting",
            {
                "p_meeting_id": str(meeting_id),
                "p_reason": reason,
                "p_now": _now(),
            },
        ).execute()
        return int(result.data or 0)

    # ------------------------------------------------------------------
    # Claim / execute
    # ------------------------------------------------------------------
    async def claim(
        self, claimant: str, *, meeting_id: str | None = None, global_limit: int | None = None
    ) -> TurnClaim | None:
        result = self.db.rpc(
            "claim_next_turn_operation",
            {
                "p_claimant": claimant,
                "p_lease_seconds": settings.turn_lease_seconds,
                "p_global_limit": global_limit or settings.turn_global_concurrency,
                "p_now": _now(),
                "p_meeting_id": str(meeting_id) if meeting_id else None,
            },
        ).execute()
        if not result.data:
            return None
        return TurnClaim.from_row(result.data)

    async def recover(self) -> dict:
        result = self.db.rpc("recover_turn_operations", {"p_now": _now()}).execute()
        return result.data or {}

    def _renew(self, claim: TurnClaim) -> bool:
        result = self.db.rpc(
            "renew_turn_operation_lease",
            {
                "p_operation_id": claim.operation_id,
                "p_expected_fence": claim.fence,
                "p_lease_seconds": settings.turn_lease_seconds,
                "p_now": _now(),
            },
        ).execute()
        return bool(result.data)

    def _start(self, claim: TurnClaim, effective_record: dict) -> bool:
        result = self.db.rpc(
            "start_turn_operation",
            {
                "p_operation_id": claim.operation_id,
                "p_expected_fence": claim.fence,
                "p_effective_settings": effective_record,
                "p_now": _now(),
            },
        ).execute()
        return bool(result.data)

    def _begin_attempt(self, claim: TurnClaim, provider: str, model: str) -> tuple[str, int] | None:
        attempt_id = str(uuid.uuid4())
        result = self.db.rpc(
            "begin_turn_attempt",
            {
                "p_operation_id": claim.operation_id,
                "p_attempt_id": attempt_id,
                "p_expected_fence": claim.fence,
                "p_provider": provider,
                "p_model": model,
                "p_now": _now(),
            },
        ).execute()
        if result.data is None:
            return None
        return attempt_id, int(result.data)

    def _complete_attempt(
        self,
        attempt_id: str,
        usage: dict | None,
        cost: float,
        provider_request_id: str | None = None,
    ) -> bool:
        result = self.db.rpc(
            "complete_turn_attempt",
            {
                "p_attempt_id": attempt_id,
                "p_usage": usage or {},
                "p_cost": cost,
                "p_provider_request_id": provider_request_id,
                "p_now": _now(),
            },
        ).execute()
        return bool(result.data)

    def _fail_attempt(self, attempt_id: str, status: str, code: str) -> bool:
        result = self.db.rpc(
            "fail_turn_attempt",
            {
                "p_attempt_id": attempt_id,
                "p_status": status,
                "p_error_code": code,
                "p_now": _now(),
            },
        ).execute()
        return bool(result.data)

    def _append_event(
        self, claim: TurnClaim, event_type: str, payload: dict, event_id: str | None = None
    ) -> dict | None:
        result = self.db.rpc(
            "append_turn_event",
            {
                "p_operation_id": claim.operation_id,
                "p_expected_fence": claim.fence,
                "p_event_id": event_id or str(uuid.uuid4()),
                "p_type": event_type,
                "p_payload": payload,
                "p_now": _now(),
            },
        ).execute()
        return result.data

    def _publish(
        self,
        claim: TurnClaim,
        message: dict,
        usage: dict,
        cost: float,
    ) -> dict:
        result = self.db.rpc(
            "publish_turn_operation",
            {
                "p_operation_id": claim.operation_id,
                "p_expected_fence": claim.fence,
                "p_message": message,
                "p_usage": usage,
                "p_cost": cost,
                "p_now": _now(),
            },
        ).execute()
        return result.data or {}

    def _fail_operation(
        self, claim: TurnClaim, status: str, code: str, message: str
    ) -> bool:
        result = self.db.rpc(
            "fail_turn_operation",
            {
                "p_operation_id": claim.operation_id,
                "p_expected_fence": claim.fence,
                "p_status": status,
                "p_error_code": code,
                "p_error_message": message,
                "p_now": _now(),
            },
        ).execute()
        return bool(result.data)

    def _current_operation(self, claim: TurnClaim) -> dict | None:
        result = self.db.rpc(
            "get_turn_operation_status",
            {
                "p_operation_id": claim.operation_id,
                "p_meeting_id": claim.meeting_id,
            },
        ).execute()
        return result.data

    def _interrupt(
        self, claim: TurnClaim, code: str, message: str, *, cancelled: bool = False
    ) -> TurnExecutionResult:
        status = "cancelled" if cancelled else "interrupted"
        self._fail_operation(claim, status, code, message)
        return TurnExecutionResult(claim.operation_id, status, error_code=code)

    def interrupt_claim(
        self, claim: TurnClaim, code: str, message: str
    ) -> TurnExecutionResult:
        """Explicit terminal failure for a claim owned by this worker.

        Used by the runtime when the execution deadline expires; a stale
        fence makes the write a no-op, which is the desired outcome.
        """
        self._interrupt(claim, code, message)
        return TurnExecutionResult(claim.operation_id, "interrupted", error_code=code)

    async def execute_claim(self, claim: TurnClaim) -> TurnExecutionResult:
        """Run one claimed operation to a committed terminal state."""
        operation = claim.operation
        payload = operation.get("payload") or {}
        provider_payload = payload.get("provider") or {}

        current = self._current_operation(claim)
        if not current or current.get("status") != "processing":
            return TurnExecutionResult(claim.operation_id, "stale", error_code="stale_claim")
        if current.get("cancel_requested_at"):
            return self._interrupt(
                claim,
                "cancelled_by_user",
                "Cancelled before execution.",
                cancelled=True,
            )

        meeting = await self.meeting_manager.get_meeting(claim.meeting_id)
        if not meeting:
            self._interrupt(claim, "meeting_not_found", "Meeting no longer exists.")
            return TurnExecutionResult(
                claim.operation_id, "failed", error_code="meeting_not_found"
            )
        if meeting.status != MeetingStatus.ACTIVE:
            self._interrupt(claim, "meeting_closed", "Meeting is no longer active.")
            return TurnExecutionResult(
                claim.operation_id, "cancelled", error_code="meeting_closed"
            )
        participant = next(
            (p for p in meeting.participants if p.id == claim.participant_id), None
        )
        if participant is None:
            self._fail_operation(
                claim,
                "cancelled",
                "participant_removed",
                "The participant was removed before the turn could run.",
            )
            return TurnExecutionResult(
                claim.operation_id, "cancelled", error_code="participant_removed"
            )

        await self.meeting_manager.ensure_participant_knowledge_scope(participant)

        provider_api_key = self.credentials.pop(claim.operation_id)
        provider_settings = (
            RequestProviderSettings(**provider_payload) if provider_payload else None
        )
        try:
            effective = resolve_effective_settings(
                participant, provider_settings, provider_api_key
            )
        except MissingProviderKeyError as exc:
            # No paid call happened. This is safe to classify as interrupted:
            # explicit resubmission with a fresh key is required.
            return self._interrupt(claim, "credential_unavailable", str(exc))
        except IncompatibleGenerationPlan as exc:
            return self._interrupt(claim, "incompatible_generation", str(exc))
        except Exception as exc:  # noqa: BLE001 - configuration failure is terminal
            logger.warning("Turn configuration failed for %s", claim.operation_id, exc_info=True)
            return self._interrupt(claim, "configuration_error", str(exc))

        if not self._start(claim, effective.as_record()):
            return TurnExecutionResult(claim.operation_id, "stale", error_code="stale_claim")

        gen = effective.as_gen_dict()
        try:
            provider = self.provider_factory(
                provider_name=gen["provider"],
                model=gen["model"] or None,
                api_key=provider_api_key,
                base_url=gen["base_url"],
            )
        except Exception as exc:  # noqa: BLE001 - no provider call happened
            return self._interrupt(claim, "provider_unavailable", str(exc))

        messages = self._build_bounded_context(
            participant, meeting.messages, meeting.agenda, claim.context_boundary
        )
        tools = get_default_tools()

        return await self._run_loop(
            claim=claim,
            participant=participant,
            provider=provider,
            gen=gen,
            effective_record=effective.as_record(),
            messages=messages,
            tools=tools,
        )

    def _build_bounded_context(
        self,
        participant: AIParticipant,
        messages: list[Message],
        agenda: str,
        boundary: int,
    ) -> list[LLMMessage]:
        eligible = [
            message
            for message in messages
            if message.sequence is None or message.sequence <= boundary
        ]
        context = build_context(participant, eligible, agenda)
        # Keep the newest messages up to a deterministic character budget.
        if not context:
            return context
        system = context[0]
        history = context[1:]
        budget = MAX_CONTEXT_CHARS - len(system.content or "")
        kept: list[LLMMessage] = []
        for message in reversed(history):
            size = len(message.content or "")
            if size > budget:
                break
            kept.append(message)
            budget -= size
        kept.reverse()
        return [system, *kept]

    async def _knowledge_still_eligible(
        self, claim: TurnClaim, participant, revisions: set
    ) -> bool:
        """Recheck SQL eligibility immediately before dispatching context."""
        try:
            from app.modules.knowledge.public import get_knowledge_lifecycle

            allowed = await get_knowledge_lifecycle().revalidate_revisions(
                revisions,
                meeting_id=_as_uuid(claim.meeting_id),
                stack_ids=[
                    _as_uuid(stack_id)
                    for stack_id in (participant.stack_ids or [])
                ],
            )
        except Exception:  # noqa: BLE001 - fail closed on eligibility errors
            logger.warning(
                "Could not revalidate knowledge for %s",
                claim.operation_id,
                exc_info=True,
            )
            return False
        return set(revisions).issubset(allowed)

    async def _attach_knowledge_evidence(
        self,
        claim: TurnClaim,
        tool_calls_made: list[dict],
        message_id: str,
    ) -> None:
        """Link retained retrieval evidence to the final message, best effort."""
        calls = [
            item["call_id"]
            for item in tool_calls_made
            if item.get("tool") == "search_knowledge_base" and item.get("call_id")
        ]
        if not calls:
            return
        try:
            from app.modules.knowledge.public import get_knowledge_lifecycle

            lifecycle = get_knowledge_lifecycle()
            for call_id in calls:
                await lifecycle.attach_evidence_message(
                    _as_uuid(claim.operation_id),
                    call_id,
                    _as_uuid(message_id),
                )
        except Exception:  # noqa: BLE001 - evidence linking is not turn-fatal
            logger.warning(
                "Could not attach knowledge evidence for %s",
                claim.operation_id,
                exc_info=True,
            )

    async def _run_loop(
        self,
        *,
        claim: TurnClaim,
        participant: AIParticipant,
        provider,
        gen: dict,
        effective_record: dict,
        messages: list[LLMMessage],
        tools: list,
    ) -> TurnExecutionResult:
        accumulated_content = ""
        accumulated_thinking = ""
        tool_calls_made: list[dict] = []
        knowledge_revisions: set = set()
        usage_total: dict = {}
        cost_total = 0.0

        for round_number in range(MAX_TOOL_ROUNDS):
            current = self._current_operation(claim)
            if not current or current.get("status") != "processing":
                return TurnExecutionResult(claim.operation_id, "stale", error_code="stale_claim")
            if current.get("cancel_requested_at"):
                return self._interrupt(
                    claim,
                    "cancelled_by_user",
                    "Cancelled by the user.",
                    cancelled=True,
                )
            if not self._renew(claim):
                return TurnExecutionResult(claim.operation_id, "stale", error_code="lease_lost")

            if knowledge_revisions and not await self._knowledge_still_eligible(
                claim, participant, knowledge_revisions
            ):
                return self._interrupt(
                    claim,
                    "knowledge_revoked",
                    "A knowledge source used in this turn was deleted; retry the turn.",
                )

            attempt = self._begin_attempt(claim, gen["provider"], gen["model"] or "")
            if attempt is None:
                return TurnExecutionResult(claim.operation_id, "stale", error_code="stale_claim")
            attempt_id, _attempt_number = attempt

            round_text = ""
            round_thinking = ""
            round_usage: dict = {}
            tool_calls: list[ToolCall] = []
            invocation_id = str(uuid.uuid4())
            provider_error: str | None = None

            try:
                async for event in provider.stream(
                    messages=messages,
                    tools=tools,
                    temperature=gen["temperature"],
                    max_tokens=gen["max_tokens"],
                ):
                    if event.type == StreamEventType.TEXT:
                        content = event.content or ""
                        if content:
                            round_text += content
                            self._append_event(claim, "text", {"content": content})
                    elif event.type == StreamEventType.THINKING:
                        content = event.content or ""
                        if content:
                            round_thinking += content
                            self._append_event(claim, "thinking", {"content": content})
                    elif event.type == StreamEventType.TOOL_CALL and event.tool_name:
                        call_id = event.tool_call_id or str(uuid.uuid4())
                        tool_call = ToolCall(
                            id=call_id,
                            name=event.tool_name,
                            arguments=event.tool_arguments or {},
                        )
                        tool_calls.append(tool_call)
                        self._append_event(
                            claim,
                            "tool_call",
                            {
                                "invocation_id": invocation_id,
                                "call_id": call_id,
                                "tool_name": tool_call.name,
                                "arguments": tool_call.arguments,
                            },
                        )
                    elif event.type == StreamEventType.CITATION:
                        self._append_event(
                            claim,
                            "citation",
                            {
                                "source": event.source,
                                "title": event.title,
                                "url": event.url,
                                "snippet": event.snippet,
                            },
                        )
                    elif event.type == StreamEventType.DONE:
                        _merge_usage(round_usage, event.usage)
                        _merge_usage(usage_total, event.usage)
                    elif event.type == StreamEventType.ERROR:
                        provider_error = event.content or "Provider returned an error"
                        break
            except Exception as exc:  # noqa: BLE001 - provider boundary
                logger.warning("Provider failed for %s", claim.operation_id, exc_info=True)
                self._fail_attempt(attempt_id, "unknown", "provider_error")
                return self._interrupt(claim, "provider_error", str(exc))

            if provider_error:
                self._fail_attempt(attempt_id, "failed", "provider_error")
                return self._interrupt(claim, "provider_error", provider_error)

            cost = 0.0
            try:
                cost = float(provider.estimate_cost(round_usage) or 0.0)
            except Exception:  # noqa: BLE001 - cost estimation is best effort
                logger.warning("Cost estimation failed for %s", claim.operation_id, exc_info=True)
            self._complete_attempt(attempt_id, round_usage, cost)
            cost_total += cost

            accumulated_content += round_text
            accumulated_thinking += round_thinking
            if round_text:
                messages.append(LLMMessage(role="assistant", content=round_text))

            if not tool_calls:
                break

            for tool_call in tool_calls:
                current = self._current_operation(claim)
                if current and current.get("cancel_requested_at"):
                    return self._interrupt(
                        claim,
                        "cancelled_by_user",
                        "Cancelled by the user.",
                        cancelled=True,
                    )
                if not current or current.get("status") != "processing":
                    return TurnExecutionResult(
                        claim.operation_id, "stale", error_code="stale_claim"
                    )

                messages.append(
                    LLMMessage(
                        role="assistant",
                        content="",
                        tool_calls=[tool_call],
                    )
                )
                result, is_error = await self._execute_tool(
                    claim, participant, tool_call, invocation_id, knowledge_revisions
                )
                result = _truncate(result)
                messages.append(
                    LLMMessage(
                        role="tool",
                        tool_call_id=tool_call.id,
                        content=json.dumps(result),
                    )
                )
                tool_calls_made.append(
                    {"tool": tool_call.name, "call_id": tool_call.id, "result": result}
                )
                self._append_event(
                    claim,
                    "tool_result",
                    {
                        "invocation_id": invocation_id,
                        "call_id": tool_call.id,
                        "tool_name": tool_call.name,
                        "result": result,
                        "is_error": is_error,
                    },
                )

        content = accumulated_content
        if not content and tool_calls_made:
            content = (
                f"[{participant.name} used tools: "
                + ", ".join(item["tool"] for item in tool_calls_made)
                + "]"
            )

        message_id = str(uuid.uuid4())
        publication = self._publish(
            claim,
            {
                "id": message_id,
                "sender_id": participant.id,
                "sender_name": participant.name,
                "content": content,
                "citations": [],
                "tool_artifacts": (
                    {"tool_calls": tool_calls_made} if tool_calls_made else None
                ),
                "thinking_content": accumulated_thinking or None,
                "estimated_cost": cost_total,
                "effective_generation": effective_record,
            },
            usage_total,
            cost_total,
        )
        outcome = publication.get("outcome")
        if outcome in ("published", "already_published"):
            message = publication.get("message") or {}
            final_message_id = str(message.get("id") or message_id)
            await self._attach_knowledge_evidence(
                claim, tool_calls_made, final_message_id
            )
            return TurnExecutionResult(
                claim.operation_id,
                "completed",
                message_id=final_message_id,
            )
        if outcome == "cancel_requested":
            return self._interrupt(
                claim,
                "cancelled_by_user",
                "Cancelled before the final message was published.",
                cancelled=True,
            )
        if outcome == "stale":
            return TurnExecutionResult(claim.operation_id, "stale", error_code="stale_fence")
        # A message conflict or missing operation is not recoverable by this
        # worker; leave an explicit terminal state for reconciliation.
        self._fail_operation(
            claim,
            "interrupted",
            "publication_failed",
            "The final message could not be published.",
        )
        return TurnExecutionResult(
            claim.operation_id, "interrupted", error_code="publication_failed"
        )

    async def _execute_tool(
        self,
        claim: TurnClaim,
        participant: AIParticipant,
        tool_call: ToolCall,
        invocation_id: str,
        knowledge_revisions: set | None = None,
    ) -> tuple[str, bool]:
        name = tool_call.name
        args = tool_call.arguments or {}

        if name == "log_disagreement":
            result = self.db.rpc(
                "record_turn_disagreement",
                {
                    "p_operation_id": claim.operation_id,
                    "p_expected_fence": claim.fence,
                    "p_invocation_id": invocation_id,
                    "p_call_id": tool_call.id,
                    "p_source_ai_id": participant.id,
                    "p_target_name": args.get("target_participant_name", "Unknown"),
                    "p_topic": args.get("topic", ""),
                    "p_reasoning": args.get("reasoning", ""),
                    "p_severity": int(args.get("severity", 3)),
                    "p_now": _now(),
                },
            ).execute()
            if not result.data:
                return "Disagreement could not be recorded for this turn.", True
            return (
                f"Disagreement logged with {args.get('target_participant_name', 'Unknown')} "
                f"on: {args.get('topic', '')}",
                False,
            )

        if name == "log_consensus":
            result = self.db.rpc(
                "record_turn_consensus",
                {
                    "p_operation_id": claim.operation_id,
                    "p_expected_fence": claim.fence,
                    "p_invocation_id": invocation_id,
                    "p_call_id": tool_call.id,
                    "p_participants": args.get("participants", []),
                    "p_topic": args.get("topic", ""),
                    "p_strength": int(args.get("strength", 3)),
                    "p_now": _now(),
                },
            ).execute()
            if not result.data:
                return "Consensus could not be recorded for this turn.", True
            return f"Consensus logged: {args.get('topic', '')}", False

        if name == "web_search":
            return "Web search is not yet implemented. Please respond without this tool.", True

        if name == "search_knowledge_base":
            query = args.get("query", "")
            if not query:
                return "Search query is empty. Please provide a query.", True
            try:
                if self.vector_store_factory is not None:
                    return await self._legacy_knowledge_search(
                        participant, query, claim
                    )
                return await self._durable_knowledge_search(
                    participant, query, claim, tool_call, knowledge_revisions
                )
            except Exception as exc:  # noqa: BLE001 - tool boundary
                return f"Error searching knowledge base: {exc}", True

        return f"Unknown tool: {name}", True

    async def _legacy_knowledge_search(
        self, participant, query: str, claim: TurnClaim
    ) -> tuple[str, bool]:
        """Search the legacy vector store (used by injected test stores)."""
        factory = self.vector_store_factory
        vector_store = factory()
        collections: list[str] = []
        from app.services.vector_store import VectorStoreManager

        shared = VectorStoreManager.meeting_collection_name(claim.meeting_id)
        if await vector_store.collection_exists(shared):
            collections.append(shared)
        for stack_id in participant.stack_ids or []:
            stack_col = VectorStoreManager.stack_collection_name(stack_id)
            if await vector_store.collection_exists(stack_col):
                collections.append(stack_col)
        if not collections:
            return (
                "No documents found in your knowledge stack or the meeting's "
                "shared documents. Please ask the user to upload documents.",
                True,
            )
        results = await vector_store.search_multiple_collections(
            collection_names=collections, query=query, limit=5
        )
        if not results:
            return f"No relevant documents found for query: '{query}'", False
        formatted = []
        for index, item in enumerate(results, 1):
            file_name = item.metadata.get("file_name", "Unknown")
            formatted.append(
                f"[{index}] (Score: {item.score:.2f}, Source: {file_name})\n{item.text}"
            )
        return (
            f"Found {len(results)} relevant passages:\n\n"
            + "\n\n---\n\n".join(formatted),
            False,
        )

    async def _durable_knowledge_search(
        self,
        participant,
        query: str,
        claim: TurnClaim,
        tool_call: ToolCall,
        knowledge_revisions: set | None = None,
    ) -> tuple[str, bool]:
        """Search only eligible revisions in the meeting + saved stack scope."""
        from app.modules.knowledge.application.retrieval import (
            KnowledgeScope,
            RetrievalIdentity,
            RetrievalRequest,
        )
        from app.modules.knowledge.public import get_knowledge_lifecycle

        lifecycle = get_knowledge_lifecycle()
        passages = await lifecycle.search(
            RetrievalRequest(
                query=query,
                scope=KnowledgeScope(
                    meeting_id=_as_uuid(claim.meeting_id),
                    stack_ids=[
                        _as_uuid(stack_id)
                        for stack_id in (participant.stack_ids or [])
                    ],
                ),
                identity=RetrievalIdentity(
                    operation_id=_as_uuid(claim.operation_id),
                    participant_id=_as_uuid(participant.id),
                    tool_call_id=tool_call.id,
                ),
                limit=5,
            )
        )
        if not passages:
            return f"No relevant documents found for query: '{query}'", False
        if knowledge_revisions is not None:
            knowledge_revisions.update(
                passage.revision_id for passage in passages
            )
        formatted = [
            f"[{index}] (Score: {item.score:.2f}, Source: {item.file_name})\n{item.text}"
            for index, item in enumerate(passages, 1)
        ]
        return (
            f"Found {len(passages)} relevant passages:\n\n"
            + "\n\n---\n\n".join(formatted),
            False,
        )
