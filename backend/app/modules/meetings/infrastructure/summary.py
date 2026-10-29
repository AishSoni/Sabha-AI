"""Runtime meeting summaries (spec-02 C4).

The Summary tab used to render canned client-side mock text. This service is
the real contract behind POST /meetings/{id}/summary:

- works for `active` AND `voting` meetings (voting = ending in progress —
  the interim synthesis is part of finishing a meeting, recovery semantics);
- closed meetings (ended/archived) reject with MeetingClosedError;
- only user/ai messages feed the prompt — system events (ending markers,
  interim summaries) are excluded so summaries never recursively quote
  themselves;
- empty conversations cannot be summarized (EmptyConversationError -> 422);
- BYOK: the browser's composed settings compose over server defaults, the
  secret rides the X-Provider-Key header only and is persisted nowhere;
- the completed attempt is charged once in the inference ledger
  (purpose="summary") and the persisted system message mirrors that cost
  as display data.
"""

import logging
from typing import List, Optional

from app.capabilities.inference.contracts import LLMMessage
from app.platform.providers import get_provider
from app.modules.meetings.domain.models import (
    MeetingStatus,
    Message,
    MessageCreate,
    RequestProviderSettings,
    SenderType,
)
from app.capabilities.inference.usage import record_inference_attempt
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.domain.errors import MeetingClosedError
from app.capabilities.configuration.service import resolve_effective_settings
from app.modules.settings.infrastructure.system_ai import SYSTEM_AI_DEFAULTS

logger = logging.getLogger(__name__)

# Persisted prefix for interim summary messages. The frontend derives the
# visible summary list from these markers (never from client-side mock data).
SUMMARY_MARKER = "📋 **MEETING SUMMARY**"


class EmptyConversationError(ValueError):
    """Nothing summarizable in the conversation (route maps to 422)."""


def _summary_prompt(meeting, transcript: List[Message]) -> str:
    lines = "\n".join(f"{m.sender_name}: {m.content}" for m in transcript)
    participants = ", ".join(
        f"{p.name} ({p.role})" for p in meeting.participants
    ) or "No AI participants"

    return f"""Summarize the discussion so far in this advisory meeting.

MEETING: {meeting.name}

AGENDA:
{meeting.agenda or "(no agenda was set)"}

PARTICIPANTS:
{participants}

DISCUSSION SO FAR:
{lines}

Write a crisp Markdown synthesis that keeps the meeting moving:

# Interim Summary

## Where We Stand
[2-3 sentences of the current position]

## Key Points
[Brief bullets of the strongest points made]

## Open Questions
[What still needs input or a decision]

Keep it under 250 words. Do not invent facts that were not said."""


async def generate_meeting_summary(
    meeting_id: str,
    *,
    provider_settings: Optional[RequestProviderSettings] = None,
    provider_api_key: Optional[str] = None,
    manager: MeetingService,
) -> Message:
    """Generate and persist one interim summary message for the meeting."""
    if manager is None:
        raise ValueError("A meeting service is required to generate a summary")

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise ValueError("Meeting not found")

    if meeting.status in (MeetingStatus.ENDED, MeetingStatus.ARCHIVED):
        raise MeetingClosedError(
            f"Meeting is {meeting.status.value}; summaries cannot be generated "
            "for closed meetings"
        )

    transcript = [
        msg for msg in meeting.messages if msg.sender_type != SenderType.SYSTEM
    ]
    if not transcript:
        raise EmptyConversationError("There is no conversation yet to summarize.")

    # No participant here: the browser's composed settings (or server defaults)
    # decide who generates. BYOK key rides the header, never storage.
    await SYSTEM_AI_DEFAULTS.acurrent()
    resolved = resolve_effective_settings(
        None,
        provider_settings,
        provider_api_key,
        defaults=SYSTEM_AI_DEFAULTS,
    )
    gen = resolved.as_gen_dict()

    provider = get_provider(
        gen["provider"] or None,
        gen["model"] or None,
        api_key=provider_api_key,  # transient browser BYOK key; unused keys are ignored by the transport
        base_url=gen["base_url"],
    )

    logger.info(
        "Generating interim summary for meeting %s (provider=%s, model=%s)",
        meeting_id,
        gen["provider"],
        gen["model"],
    )

    response = await provider.complete(
        messages=[LLMMessage(role="user", content=_summary_prompt(meeting, transcript))],
        tools=[],
        temperature=gen["temperature"],
        max_tokens=gen["max_tokens"],
    )

    cost = await record_inference_attempt(
        manager,
        meeting_id=meeting_id,
        purpose="summary",
        provider=gen["provider"] or None,
        model=gen["model"] or None,
        usage=response.usage,
        estimator=provider,
    )

    return await manager.save_message(
        MessageCreate(
            meeting_id=meeting_id,
            sender_type=SenderType.SYSTEM,
            sender_name="System",
            content=f"{SUMMARY_MARKER}\n\n{(response.content or '').strip()}",
            estimated_cost=cost,
        )
    )
