"""Closing orchestration: drain, vote, summarize, commit (spec 08).

One persisted state machine owns a close request. The database guards each
transition and checkpoints every paid attempt before/after the provider call;
this service decides what to do next from canonical committed state. It never
holds a transaction across a provider call and never replays a confirmed paid
attempt.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Sequence
from uuid import uuid4

from app.modules.meetings.application.contracts import (
    ClosingRecord,
    ClosingSnapshot,
    MeetingContext,
    MessageView,
    ParticipantPolicy,
    ProviderOutput,
    SummarySettings,
)
from app.modules.meetings.application.ports import (
    ClosingRepository,
    InvocationFactory,
)
from app.modules.meetings.domain.errors import (
    ClosingConflictError,
    ClosingNotFoundError,
    ClosingNotRecoverableError,
    MeetingClosedError,
    MeetingNotFoundError,
)
from app.modules.meetings.domain.services import (
    ClosingMode,
    ClosingStage,
    stage_after_drain,
    tally_votes,
)

logger = logging.getLogger(__name__)

MEETING_ENDED_MARKER = "📋 **MEETING ENDED**"

#: How many stage transitions one advance call may chain together. Each
#: iteration either commits a transition or stops, so this only bounds
#: pathological loops; it is not a retry budget.
MAX_STAGE_STEPS = 12

RECENT_MESSAGE_LIMIT = 20
RECENT_CONTENT_LIMIT = 200


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class UsageFacts:
    """Accounting classification shared by ballots and summaries."""

    usage: Mapping[str, Any] | None
    usage_kind: str
    price_kind: str
    estimated_cost: float
    reported_cost: float | None


def classify_usage(provider: str, output: ProviderOutput) -> UsageFacts:
    """Classify one completed call without inventing dollars or tokens.

    Unknown usage stays unknown and prices at zero — never an estimate.
    A local provider's known usage is explicitly zero-priced; a cloud call
    with known usage but no priced amount is ``unpriced``, distinct from a
    metered cost.
    """
    usage = dict(output.usage) if output.usage else None
    reported = output.reported_cost if output.reported_cost is not None else None
    if usage is None:
        return UsageFacts(
            usage=None,
            usage_kind="unknown",
            price_kind="unpriced",
            estimated_cost=0.0,
            reported_cost=reported,
        )
    estimated = float(output.estimated_cost or 0.0)
    if provider == "ollama":
        price_kind = "zero_local"
    elif estimated > 0 or (reported is not None and reported > 0):
        price_kind = "metered"
    else:
        price_kind = "unpriced"
    return UsageFacts(
        usage=usage,
        usage_kind="reported",
        price_kind=price_kind,
        estimated_cost=estimated,
        reported_cost=reported,
    )


def unknown_usage() -> UsageFacts:
    return UsageFacts(
        usage=None,
        usage_kind="unknown",
        price_kind="unpriced",
        estimated_cost=0.0,
        reported_cost=None,
    )


def parse_vote_response(text: str | None) -> tuple[bool, str]:
    """Parse a ballot, preserving the existing product rule.

    A malformed response is an explicit no vote with the parse detail as the
    reason; it is not a provider failure and does not block the round.
    """
    content = text.strip() if text else ""
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()
    try:
        data = json.loads(content)
        vote = data.get("vote", False)
        if not isinstance(vote, bool):
            vote = False
        return vote, data.get("reason") or "No reason provided"
    except (json.JSONDecodeError, AttributeError, TypeError):
        return False, f"Could not parse vote response: {content[:100]}..."


def vote_prompt(context: MeetingContext, participant: ParticipantPolicy) -> str:
    recent = context.messages[-RECENT_MESSAGE_LIMIT:]
    lines = []
    for message in recent:
        content = message.content or ""
        if len(content) > RECENT_CONTENT_LIMIT:
            content = content[:RECENT_CONTENT_LIMIT] + "..."
        lines.append(f"{message.sender_name}: {content}")
    conversation = "\n".join(lines)
    return f"""You are {participant.name}, a {participant.role} in this meeting.

The user is proposing to end this meeting. Based on the recent discussion below, please vote on whether you think the meeting should end now.

RECENT DISCUSSION:
{conversation}

MEETING AGENDA:
{context.agenda}

Please respond with ONLY a JSON object in this exact format (no other text):
{{"vote": true or false, "reason": "Your brief reason (1-2 sentences)"}}

Vote TRUE if you believe the meeting has achieved its objectives or reached a natural conclusion.
Vote FALSE if you believe there are important topics still to discuss."""


def summary_prompt(context: MeetingContext) -> str:
    conversation = "\n".join(
        f"{message.sender_name}: {message.content}" for message in context.messages
    )
    participants = (
        ", ".join(f"{p.name} ({p.role})" for p in context.participants)
        or "No AI participants"
    )
    return f"""Generate an Executive Summary of this meeting.

MEETING NAME: {context.name}

MEETING AGENDA:
{context.agenda}

PARTICIPANTS:
{participants}

FULL CONVERSATION:
{conversation}

Please create a comprehensive executive summary in this format:

# Executive Summary

## Overview
[Brief 2-3 sentence overview of the meeting]

## Key Discussion Points
[Bullet points of main topics discussed]

## Decisions Made
[Any decisions or consensus reached]

## Action Items
[Any action items identified, if applicable]

## Areas of Disagreement
[Any unresolved disagreements, if applicable]

## Conclusion
[Brief concluding statement]"""


class ClosingService:
    """Drive one meeting's closing operation to a committed outcome."""

    def __init__(
        self,
        repository: ClosingRepository,
        invocations: InvocationFactory,
        *,
        lease_seconds: int = 120,
        drain_timeout_seconds: int = 300,
        now=_utcnow,
    ) -> None:
        self.repository = repository
        self.invocations = invocations
        self.lease_seconds = lease_seconds
        self.drain_timeout_seconds = drain_timeout_seconds
        self._now = now

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    async def request(
        self,
        meeting_id: str,
        request_key: str,
        mode: ClosingMode | str,
        summary_settings: SummarySettings | Mapping[str, Any] | None = None,
    ) -> ClosingSnapshot:
        parsed_mode = ClosingMode(mode)
        settings = _coerce_settings(summary_settings)
        outcome = await self.repository.request(
            meeting_id,
            request_key,
            parsed_mode.value,
            settings.as_mapping(),
        )
        if outcome.outcome == "not_found":
            raise MeetingNotFoundError("Meeting not found")
        if outcome.outcome in {"meeting_closed", "already_completed"}:
            raise MeetingClosedError(
                "The meeting is closed and cannot be closed again"
            )
        if outcome.outcome == "invalid":
            raise ClosingConflictError("The closing request is invalid")
        return await self.advance(meeting_id)

    async def retry(self, meeting_id: str) -> ClosingSnapshot:
        snapshot = await self.repository.read(meeting_id)
        closing = self._require_closing(snapshot)
        if closing.stage is not ClosingStage.FAILED:
            raise ClosingNotRecoverableError(
                "Only a failed closing can be retried"
            )
        if not await self.repository.retry(closing.id):
            raise ClosingConflictError(
                "The closing changed before it could be retried"
            )
        return await self.advance(meeting_id)

    async def abort(self, meeting_id: str) -> ClosingSnapshot:
        snapshot = await self.repository.read(meeting_id)
        closing = self._require_closing(snapshot)
        if closing.stage not in {
            ClosingStage.DRAINING,
            ClosingStage.VOTING,
            ClosingStage.FAILED,
        }:
            raise ClosingNotRecoverableError(
                "This closing can no longer be aborted"
            )
        if not await self.repository.abort(closing.id):
            raise ClosingConflictError(
                "The closing changed before it could be aborted"
            )
        return await self.repository.read(meeting_id)

    async def observe(self, meeting_id: str) -> ClosingSnapshot:
        return await self.repository.read(meeting_id)

    # ------------------------------------------------------------------
    # Stage driver
    # ------------------------------------------------------------------

    async def advance(self, meeting_id: str) -> ClosingSnapshot:
        """Advance as far as committed state allows, inline.

        Returns the canonical snapshot. Provider calls happen outside any
        transaction and every attempt is checkpointed before and after the
        call, so repeating this method is safe after a crash or a lost HTTP
        connection.
        """
        attempted_votes: set[str] = set()
        for _ in range(MAX_STAGE_STEPS):
            snapshot = await self.repository.read(meeting_id)
            closing = snapshot.closing
            if closing is None or closing.stage is None:
                return snapshot
            if closing.stage.is_terminal or closing.stage is ClosingStage.FAILED:
                return snapshot
            progressed = await self._advance_stage(snapshot, attempted_votes)
            if not progressed:
                return await self.repository.read(meeting_id)
        logger.warning("Closing %s exceeded its stage-step budget", meeting_id)
        return await self.repository.read(meeting_id)

    async def _advance_stage(
        self, snapshot: ClosingSnapshot, attempted_votes: set[str]
    ) -> bool:
        closing = snapshot.closing
        assert closing is not None
        if closing.stage is ClosingStage.DRAINING:
            return await self._advance_draining(snapshot)
        if closing.stage is ClosingStage.VOTING:
            return await self._advance_voting(snapshot, attempted_votes)
        if closing.stage is ClosingStage.SUMMARIZING:
            return await self._advance_summarizing(snapshot)
        return False

    async def _advance_draining(self, snapshot: ClosingSnapshot) -> bool:
        closing = snapshot.closing
        assert closing is not None
        started = snapshot.processing_turn_started_at
        if started is not None:
            if self._is_stale(started, self.drain_timeout_seconds):
                await self.repository.fail(
                    closing.id,
                    ClosingStage.DRAINING,
                    "turn_stalled",
                    "The executing turn did not finish within the closing "
                    "drain deadline.",
                )
            return False
        next_stage = stage_after_drain(closing.mode, closing.from_status)
        return await self.repository.mark_stage(
            closing.id, ClosingStage.DRAINING, next_stage
        )

    async def _advance_voting(
        self, snapshot: ClosingSnapshot, attempted_votes: set[str]
    ) -> bool:
        closing = snapshot.closing
        assert closing is not None
        outcome = await self.repository.start_voting(closing.id)
        if outcome != "started":
            return False
        snapshot = await self.repository.read(closing.meeting_id)
        closing = snapshot.closing
        if closing is None or closing.stage is not ClosingStage.VOTING:
            return False

        policies = {
            participant.participant_id: participant
            for participant in snapshot.context.participants
        }
        for vote in snapshot.votes:
            if vote.status == "completed":
                continue
            if vote.status == "failed" and vote.participant_id in attempted_votes:
                continue
            if vote.status in {"pending", "unknown", "failed"}:
                if not await self._cast_ballot(
                    snapshot, closing, vote, policies, attempted_votes
                ):
                    return False
            elif vote.status in {"in_flight"}:
                return False

        snapshot = await self.repository.read(closing.meeting_id)
        closing = snapshot.closing
        if closing is None or closing.stage is not ClosingStage.VOTING:
            return False
        if any(vote.status in {"pending", "unknown"} for vote in snapshot.votes):
            return False
        tally = tally_votes(
            [
                vote.vote if vote.status == "completed" else None
                for vote in snapshot.votes
            ]
        )
        if tally.passed:
            return await self.repository.mark_stage(
                closing.id, ClosingStage.VOTING, ClosingStage.SUMMARIZING
            )
        return await self.repository.reject(closing.id)

    async def _cast_ballot(
        self,
        snapshot: ClosingSnapshot,
        closing: ClosingRecord,
        vote,
        policies: Mapping[str, ParticipantPolicy],
        attempted_votes: set[str],
    ) -> bool:
        participant = policies.get(vote.participant_id)
        if participant is None:
            await self.repository.fail(
                closing.id,
                ClosingStage.VOTING,
                "participant_missing",
                "A participant in the frozen ballot no longer exists.",
            )
            return False

        try:
            invoker = await self.invocations.participant(participant)
        except Exception as exc:
            # A resolution failure is a failed ballot, exactly like a
            # provider exception: it counts as no and never blocks the round.
            return await self._record_failed_ballot(
                closing,
                vote.participant_id,
                provider="",
                model="",
                settings={},
                reason=f"Error getting vote: {exc}",
                attempted_votes=attempted_votes,
            )

        attempt_id = str(uuid4())
        attempt = await self.repository.begin_vote(
            closing.id,
            vote.participant_id,
            attempt_id,
            self.lease_seconds,
            invoker.provider,
            invoker.model,
            dict(invoker.settings),
        )
        if attempt.outcome == "completed":
            return True
        if attempt.outcome == "in_flight":
            return False
        if attempt.outcome == "uncertain":
            await self.repository.fail(
                closing.id,
                ClosingStage.VOTING,
                "vote_uncertain",
                "A previous ballot attempt's outcome is unknown; retry the "
                "closing to cast a fresh ballot.",
            )
            return False
        if attempt.outcome != "started":
            return False

        attempted_votes.add(vote.participant_id)
        try:
            output = await invoker.complete(vote_prompt(snapshot.context, participant))
        except Exception as exc:
            facts = unknown_usage()
            await self.repository.finish_vote(
                closing.id,
                vote.participant_id,
                attempt_id,
                provider=invoker.provider,
                model=invoker.model,
                status="failed",
                vote=None,
                reason=f"Error getting vote: {exc}",
                error_code="provider_error",
                error_message=str(exc),
                **facts_fields(facts),
            )
            return True

        balloted, reason = parse_vote_response(output.text)
        facts = classify_usage(invoker.provider, output)
        await self.repository.finish_vote(
            closing.id,
            vote.participant_id,
            attempt_id,
            provider=invoker.provider,
            model=invoker.model,
            status="completed",
            vote=balloted,
            reason=reason,
            error_code=None,
            error_message=None,
            **facts_fields(facts),
        )
        return True

    async def _record_failed_ballot(
        self,
        closing: ClosingRecord,
        participant_id: str,
        *,
        provider: str,
        model: str,
        settings: Mapping[str, Any],
        reason: str,
        attempted_votes: set[str],
    ) -> bool:
        attempt_id = str(uuid4())
        attempt = await self.repository.begin_vote(
            closing.id,
            participant_id,
            attempt_id,
            self.lease_seconds,
            provider,
            model,
            settings,
        )
        if attempt.outcome != "started":
            return attempt.outcome in {"completed"}
        attempted_votes.add(participant_id)
        facts = unknown_usage()
        await self.repository.finish_vote(
            closing.id,
            participant_id,
            attempt_id,
            provider=provider,
            model=model,
            status="failed",
            vote=None,
            reason=reason,
            error_code="configuration_error",
            error_message=reason,
            **facts_fields(facts),
        )
        return True

    async def _advance_summarizing(self, snapshot: ClosingSnapshot) -> bool:
        closing = snapshot.closing
        assert closing is not None
        if closing.summary_text:
            await self.repository.complete(closing.id)
            return False

        attempt_id = str(uuid4())
        reserved = await self.repository.reserve_summary(
            closing.id, attempt_id, self.lease_seconds
        )
        if reserved.outcome == "checkpointed":
            if reserved.summary_text:
                await self.repository.complete(closing.id)
            return False
        if reserved.outcome == "in_flight":
            return False
        if reserved.outcome == "uncertain":
            await self.repository.fail(
                closing.id,
                ClosingStage.SUMMARIZING,
                "summary_uncertain",
                "A previous summary attempt's outcome is unknown; retry the "
                "closing to generate it again.",
            )
            return False
        if reserved.outcome != "started":
            return False

        settings = SummarySettings.from_mapping(closing.summary_settings)
        try:
            invoker = await self.invocations.system(settings)
        except Exception as exc:
            await self.repository.fail(
                closing.id,
                ClosingStage.SUMMARIZING,
                "summary_configuration_failed",
                f"The closing summary could not be configured: {exc}",
            )
            return False

        try:
            output = await invoker.complete(summary_prompt(snapshot.context))
        except Exception as exc:
            await self.repository.fail(
                closing.id,
                ClosingStage.SUMMARIZING,
                "summary_generation_failed",
                f"The closing summary provider failed: {exc}",
            )
            return False

        body = (output.text or "").strip()
        if not body:
            await self.repository.fail(
                closing.id,
                ClosingStage.SUMMARIZING,
                "summary_empty",
                "The closing summary provider returned no text.",
            )
            return False

        content = f"{MEETING_ENDED_MARKER}\n\n{body}"
        facts = classify_usage(invoker.provider, output)
        saved = await self.repository.save_summary(
            closing.id,
            attempt_id,
            content,
            provider=invoker.provider,
            model=invoker.model,
            purpose=(
                "forced_summary"
                if closing.mode is ClosingMode.FORCE
                else "summary"
            ),
            **facts_fields(facts),
        )
        if saved.outcome in {"saved", "already_saved"}:
            await self.repository.complete(closing.id)
        return False

    # ------------------------------------------------------------------
    # Startup reconciliation
    # ------------------------------------------------------------------

    async def reconcile_open_closings(self) -> None:
        """Resolve committed state after a restart without paid calls.

        Only writes that follow deterministically from committed rows happen
        here: drain advance, tallying complete ballots, committing a stored
        summary, or surfacing an interrupted/uncertain operation as a
        recoverable failure. No provider is ever contacted.
        """
        meeting_ids = await self.repository.list_open_meeting_ids()
        for meeting_id in meeting_ids:
            try:
                await self._reconcile_one(meeting_id)
            except Exception:
                logger.warning(
                    "Closing reconciliation failed for %s", meeting_id, exc_info=True
                )

    async def _reconcile_one(self, meeting_id: str) -> None:
        snapshot = await self.repository.read(meeting_id)
        closing = snapshot.closing
        if closing is None or closing.stage.is_terminal:
            return

        if closing.stage is ClosingStage.DRAINING:
            if snapshot.processing_turn_started_at is None:
                await self.repository.mark_stage(
                    closing.id,
                    ClosingStage.DRAINING,
                    stage_after_drain(closing.mode, closing.from_status),
                )
            elif self._is_stale(
                snapshot.processing_turn_started_at, self.drain_timeout_seconds
            ):
                await self.repository.fail(
                    closing.id,
                    ClosingStage.DRAINING,
                    "turn_stalled",
                    "The executing turn did not finish within the closing "
                    "drain deadline.",
                )
            return

        if closing.stage is ClosingStage.VOTING:
            await self._reconcile_voting(snapshot, closing)
            return

        if closing.stage is ClosingStage.SUMMARIZING:
            if closing.summary_text:
                await self.repository.complete(closing.id)
                return
            if closing.summary_attempt_id is None:
                await self.repository.fail(
                    closing.id,
                    ClosingStage.SUMMARIZING,
                    "summary_interrupted",
                    "The closing summary was interrupted before it started; "
                    "retry to generate it.",
                )
                return
            if self._is_stale(
                closing.summary_attempt_lease_expires_at, 0
            ) or closing.summary_attempt_lease_expires_at is None:
                await self.repository.fail(
                    closing.id,
                    ClosingStage.SUMMARIZING,
                    "summary_uncertain",
                    "A previous summary attempt's outcome is unknown; retry "
                    "the closing to generate it again.",
                )

    async def _reconcile_voting(
        self, snapshot: ClosingSnapshot, closing: ClosingRecord
    ) -> None:
        pending = [vote for vote in snapshot.votes if vote.status in {"pending", "unknown"}]
        if not pending:
            tally = tally_votes(
                [
                    vote.vote if vote.status == "completed" else None
                    for vote in snapshot.votes
                ]
            )
            if tally.passed:
                await self.repository.mark_stage(
                    closing.id, ClosingStage.VOTING, ClosingStage.SUMMARIZING
                )
            else:
                await self.repository.reject(closing.id)
            return

        now = self._now()
        for vote in pending:
            lease = vote.attempt_lease_expires_at
            if vote.attempt_id is not None and (lease is None or lease <= now):
                await self.repository.fail(
                    closing.id,
                    ClosingStage.VOTING,
                    "vote_uncertain",
                    "A ballot attempt's outcome is unknown; retry the closing "
                    "to cast a fresh ballot.",
                )
                return
        if any(vote.attempt_id is None for vote in pending):
            # Nothing is in flight: no process is casting these ballots, so
            # make the interruption visible instead of leaving the meeting
            # silently stuck in voting.
            await self.repository.start_voting(closing.id)
            await self.repository.fail(
                closing.id,
                ClosingStage.VOTING,
                "voting_interrupted",
                "The closing ballot was interrupted before it finished; retry "
                "the closing to continue.",
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _is_stale(self, timestamp: datetime | None, seconds: int) -> bool:
        if timestamp is None:
            return False
        return self._now() - timestamp > timedelta(seconds=seconds)

    def _require_closing(self, snapshot: ClosingSnapshot) -> ClosingRecord:
        if snapshot.closing is None:
            raise ClosingNotFoundError("This meeting has no closing operation")
        return snapshot.closing


def facts_fields(facts: UsageFacts) -> dict[str, Any]:
    return {
        "usage": facts.usage,
        "usage_kind": facts.usage_kind,
        "price_kind": facts.price_kind,
        "estimated_cost": facts.estimated_cost,
        "reported_cost": facts.reported_cost,
    }


def _coerce_settings(
    settings: SummarySettings | Mapping[str, Any] | None,
) -> SummarySettings:
    if isinstance(settings, SummarySettings):
        return settings
    return SummarySettings.from_mapping(settings)
