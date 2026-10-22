"""Ports consumed by the closing application service (spec 08).

The repository owns every guarded lifecycle write; the invocation factory
owns credential resolution and provider construction. The service itself
never touches a database client, an SDK, or a secret.
"""

from __future__ import annotations

from typing import Any, Mapping, Protocol, Sequence

from app.modules.meetings.application.contracts import (
    ClosingSnapshot,
    Completion,
    ParticipantPolicy,
    ProviderOutput,
    RequestOutcome,
    SummaryAttempt,
    SummarySaveResult,
    SummarySettings,
    VoteAttempt,
    VoteResult,
)
from app.modules.meetings.domain.services import ClosingStage


class ClosingRepository(Protocol):
    async def request(
        self,
        meeting_id: str,
        request_key: str,
        mode: str,
        summary_settings: Mapping[str, Any],
    ) -> RequestOutcome: ...

    async def read(self, meeting_id: str) -> ClosingSnapshot: ...

    async def mark_stage(
        self, closing_id: str, expected: ClosingStage, next_stage: ClosingStage
    ) -> bool: ...

    async def fail(
        self,
        closing_id: str,
        expected: ClosingStage,
        code: str,
        message: str,
    ) -> bool: ...

    async def retry(self, closing_id: str) -> bool: ...

    async def abort(self, closing_id: str) -> bool: ...

    async def reject(self, closing_id: str) -> bool: ...

    async def complete(self, closing_id: str) -> Completion: ...

    async def start_voting(self, closing_id: str) -> str: ...

    async def begin_vote(
        self,
        closing_id: str,
        participant_id: str,
        attempt_id: str,
        lease_seconds: int,
        provider: str,
        model: str,
        settings: Mapping[str, Any],
    ) -> VoteAttempt: ...

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
    ) -> VoteResult: ...

    async def reserve_summary(
        self, closing_id: str, attempt_id: str, lease_seconds: int
    ) -> SummaryAttempt: ...

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
    ) -> SummarySaveResult: ...

    async def list_open_meeting_ids(self) -> Sequence[str]: ...


class Invoker(Protocol):
    """One frozen invocation policy, safe to call exactly once per attempt."""

    provider: str
    model: str
    settings: Mapping[str, Any]

    async def complete(self, prompt: str) -> ProviderOutput: ...


class InvocationFactory(Protocol):
    async def participant(self, policy: ParticipantPolicy) -> Invoker: ...

    async def system(self, settings: SummarySettings | None) -> Invoker: ...
