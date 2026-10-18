"""Recoverable meeting ending (spec-02).

Phases (each independently retryable, per the locked policy "stay voting,
allow retry"):

1. Entry serialization: ACTIVE -> VOTING via CAS. An attempt that loses the
   CAS merges into the already-running ending attempt (the meeting is in
   `voting`, so it just proceeds to the summary phase).
2. Vote phase: only when entering normally from ACTIVE. Majority-NO reverts
   the meeting to ACTIVE (again CAS) and reports `success=False`.
3. Summary phase (always reached in `voting`): generation runs with NO
   database transaction open — paid inference never holds a DB transaction.
   A failure strands nothing: the meeting stays `voting` and the caller
   receives an explicitly retryable outcome.
4. Commit: a single atomic RPC persists the ending message and flips the
   status (`voting` or `active` -> `ended`). Losing that CAS means another
   request already committed the ending; that attempt reports a
   conflict (409) instead of double-committing.

Race note: two user-initiated end attempts (double click, two tabs) may both
pass generation before the commit CAS arbitrates. The atomic commit ensures
at most one committed ending and one persisted final summary; the loser's
summary is never saved and its inference is wasted cost only in that narrow
window — never a correctness violation.

Force policy: `force_end` skips the vote phase but still serializes through
`voting` first, so a forced ending and a concurrent normal ending share the
same single winner arbitration.
"""

import json
import logging
from typing import List, Optional

from app.llm import LLMMessage, get_provider
from app.models.schemas import (
    EndMeetingResponse,
    EndMeetingVote,
    MeetingStatus,
)
from app.services.meeting_manager import MeetingManager
from app.services.accounting import record_inference_attempt

logger = logging.getLogger(__name__)

# Persisted prefix for the final-ending system message. The closer and the
# summary/notes UI both key off this marker, so it is intentionally a single
# shared constant and never rewritten.
MEETING_ENDED_MARKER = "📋 **MEETING ENDED**"


class MeetingClosedConflict(RuntimeError):
    """The ending race was lost: another writer already committed (409)."""


class EndAttemptIncomplete(RuntimeError):
    """A recoverable, explicitly retryable failure (meeting stays as-is)."""


class MeetingNotFoundError(LookupError):
    """Unknown meeting id (routes map this to 404)."""


class MeetingCloser:
    """Runs the ending phases for one meeting."""

    def __init__(self, manager: Optional[MeetingManager] = None):
        self.manager = manager or MeetingManager()

    # --- public entry point --------------------------------------------------

    async def end_meeting(self, meeting_id: str, force_end: bool = False) -> EndMeetingResponse:
        meeting = await self.manager.get_meeting(meeting_id)
        if not meeting:
            raise MeetingNotFoundError(meeting_id)

        if meeting.status in (MeetingStatus.ENDED, MeetingStatus.ARCHIVED):
            raise MeetingClosedConflict(f"Meeting is already {meeting.status.value}")

        votes: List[EndMeetingVote] = []
        from_status = meeting.status.value

        if from_status == MeetingStatus.ACTIVE.value:
            # Serialize all entering attempts through `voting`...
            entered = await self.manager.transition_meeting_status(
                meeting_id, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
            )
            from_status = MeetingStatus.VOTING.value

            # ...but only a normally-entered attempt consults the participants.
            if entered and not force_end:
                votes = await self._collect_votes(meeting, meeting_id)
                yes_votes = sum(1 for v in votes if v.vote)
                should_end = yes_votes > len(votes) / 2
                if not should_end:
                    reverted = await self.manager.transition_meeting_status(
                        meeting_id,
                        expected_from=MeetingStatus.VOTING,
                        next_status=MeetingStatus.ACTIVE,
                    )
                    if not reverted:
                        # The vote window was superseded by another attempt.
                        raise MeetingClosedConflict(
                            "the meeting ended while votes were being collected"
                        )
                    return EndMeetingResponse(
                        success=False,
                        votes=votes,
                        summary=None,
                        message=(
                            f"Vote failed: {yes_votes}/{len(votes)} voted to end. "
                            "Meeting continues."
                        ),
                    )
        # Entering with status `voting` (retry after a failed attempt, or a
        # loser of the entry CAS) skips the vote phase by design — the vote
        # decision was already made before the earlier summary failed.

        summary_purpose = "forced_summary" if force_end else "summary"
        summary, insert_content = await self._summary_for_commit(meeting, meeting_id, summary_purpose)

        committed = await self.manager.commit_meeting_ending(
            meeting_id, from_status=from_status, content=insert_content
        )
        if not committed:
            raise MeetingClosedConflict(
                "the meeting was ended by another request before this attempt committed"
            )

        return EndMeetingResponse(
            success=True,
            votes=votes,
            summary=summary,
            message="Meeting ended successfully. Executive summary generated.",
        )

    # --- phases ---------------------------------------------------------------

    async def _collect_votes(self, meeting, meeting_id: str) -> List[EndMeetingVote]:
        votes: List[EndMeetingVote] = []

        meeting_messages = meeting.messages[-20:]
        conversation_context = "\n".join([
            f"{msg.sender_name}: {msg.content[:200]}..." if len(msg.content) > 200
            else f"{msg.sender_name}: {msg.content}"
            for msg in meeting_messages
        ])

        for participant in meeting.participants:
            try:
                provider = get_provider(
                    participant.provider_config.provider or None,
                    participant.provider_config.model or None,
                )
                response = await provider.complete(
                    messages=[LLMMessage(
                        role="user",
                        content=self._vote_prompt(participant, meeting, conversation_context),
                    )],
                    tools=[],
                    temperature=0.3,
                )
                # Completed vote attempt: charge it in the ledger. A failed
                # inference (exception below) is never charged.
                await record_inference_attempt(
                    self.manager,
                    meeting_id=meeting_id,
                    purpose="vote",
                    provider=participant.provider_config.provider or None,
                    model=participant.provider_config.model or None,
                    usage=response.usage,
                    estimator=provider,
                )
                votes.append(self._parse_vote(participant, response))
            except Exception as exc:
                # A failed participant vote counts as "not okay to end yet"
                # (the pre-existing behavior); meeting voting verdict comes
                # from the majority of remaining participants.
                logger.warning("Vote inference failed for %s: %s", participant.name, exc)
                votes.append(EndMeetingVote(
                    participant_id=participant.id,
                    participant_name=participant.name,
                    vote=False,
                    reason=f"Error getting vote: {str(exc)}",
                ))
        return votes

    @staticmethod
    def _vote_prompt(participant, meeting, conversation_context: str) -> str:
        return f"""You are {participant.name}, a {participant.role} in this meeting.

The user is proposing to end this meeting. Based on the recent discussion below, please vote on whether you think the meeting should end now.

RECENT DISCUSSION:
{conversation_context}

MEETING AGENDA:
{meeting.agenda}

Please respond with ONLY a JSON object in this exact format (no other text):
{{"vote": true or false, "reason": "Your brief reason (1-2 sentences)"}}

Vote TRUE if you believe the meeting has achieved its objectives or reached a natural conclusion.
Vote FALSE if you believe there are important topics still to discuss."""

    @staticmethod
    def _parse_vote(participant, response) -> EndMeetingVote:
        content = response.content.strip() if response.content else ""
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        try:
            vote_data = json.loads(content)
            return EndMeetingVote(
                participant_id=participant.id,
                participant_name=participant.name,
                vote=vote_data.get("vote", False),
                reason=vote_data.get("reason", "No reason provided"),
            )
        except (json.JSONDecodeError, KeyError):
            return EndMeetingVote(
                participant_id=participant.id,
                participant_name=participant.name,
                vote=False,
                reason=f"Could not parse vote response: {content[:100]}...",
            )

    @staticmethod
    def _summary_prompt(meeting) -> str:
        conversation_full = "\n".join(
            f"{msg.sender_name}: {msg.content}" for msg in meeting.messages
        )
        participants = ", ".join(
            f"{p.name} ({p.role})" for p in meeting.participants
        ) or "No AI participants"

        return f"""Generate an Executive Summary of this meeting.

MEETING NAME: {meeting.name}

MEETING AGENDA:
{meeting.agenda}

PARTICIPANTS:
{participants}

FULL CONVERSATION:
{conversation_full}

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

    async def _summary_for_commit(
        self, meeting, meeting_id: str, purpose: str
    ) -> tuple[str, Optional[str]]:
        """Return `(summary_body, insert_content)`.

        - Recovery: an ending message already persisted (legacy crash, or a
          persist-only race window) → reuse its body and pass `insert_content
          = None` so the commit flips the status WITHOUT duplicating the
          stored summary.
        - Fresh generation: the body plus the exact content to insert.
        Generation happens outside any transaction; failures raise
        EndAttemptIncomplete (explicitly retryable, nothing persisted)."""
        stored = await self.manager.get_latest_message_with_prefix(
            meeting_id, MEETING_ENDED_MARKER
        )
        if stored:
            body = stored.content[len(MEETING_ENDED_MARKER):].strip()
            return body, None

        provider = self._summary_provider(meeting)
        try:
            response = await provider.complete(
                messages=[LLMMessage(role="user", content=self._summary_prompt(meeting))],
                tools=[],
                temperature=0.3,
            )
        except Exception as exc:
            raise EndAttemptIncomplete(
                "Executive summary generation failed "
                f"({type(exc).__name__}: {exc}); nothing was persisted. The meeting "
                "stays in its current status - call end again to retry."
            ) from exc

        config = meeting.participants[0].provider_config if meeting.participants else None
        await record_inference_attempt(
            self.manager,
            meeting_id=meeting_id,
            purpose=purpose,
            provider=(config.provider if config else None) or None,
            model=(config.model if config else None) or None,
            usage=response.usage,
            estimator=provider,
        )

        body = (response.content or "").strip()
        return body, f"{MEETING_ENDED_MARKER}\n\n{body}"

    @staticmethod
    def _summary_provider(meeting):
        """First participant's provider when available, else server default."""
        if meeting.participants:
            config = meeting.participants[0].provider_config
            return get_provider(config.provider or None, config.model or None)
        return get_provider()
