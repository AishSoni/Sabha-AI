"""Turn context assembly (spec 06/07).

The prompt is the participant's frozen system prompt plus the meeting agenda.
History keeps the legacy role mapping: the speaker's own messages are
assistant turns; other speakers arrive as user-visible transcript lines.
"""

from __future__ import annotations

from typing import List

from app.capabilities.inference.contracts import LLMMessage
from app.modules.meetings.domain.models import AIParticipant, Message, SenderType


def build_context(
    participant: AIParticipant,
    messages: List[Message],
    agenda: str,
) -> List[LLMMessage]:
    """Build the LLM message context from system prompt and chat history."""

    context: list[LLMMessage] = []

    system_content = participant.system_prompt
    if agenda:
        system_content += f"\n\nMEETING AGENDA:\n{agenda}"

    context.append(LLMMessage(role="system", content=system_content))

    for msg in messages:
        if msg.sender_type == SenderType.USER:
            context.append(
                LLMMessage(role="user", content=f"User: {msg.content}")
            )
        elif msg.sender_type == SenderType.AI:
            if msg.sender_id == participant.id:
                context.append(LLMMessage(role="assistant", content=msg.content))
            else:
                context.append(
                    LLMMessage(
                        role="user",
                        content=f"AI [{msg.sender_name}]: {msg.content}",
                    )
                )
        elif msg.sender_type == SenderType.SYSTEM:
            context.append(
                LLMMessage(role="user", content=f"System: {msg.content}")
            )

    return context
