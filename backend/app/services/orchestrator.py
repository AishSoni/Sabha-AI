"""
Orchestrator compatibility adapter - delegates to the shared turn engine.

The inference/tool algorithm lives in exactly one place
(app.modules.meetings.engine). This module translates the engine outcome
into the legacy TurnResponse / SSE dict shapes. No second engine here.
"""

from typing import AsyncGenerator, List, Optional

from app.llm import LLMMessage, get_provider
from app.models import AIParticipant, Message, SenderType, TurnResponse
from app.services.meeting_manager import MeetingManager


def _engine_for(meeting_manager: MeetingManager):
    from app.core.database import get_supabase
    from app.modules.meetings.engine import TurnEngine
    from app.modules.meetings.knowledge import ServerKnowledgeSearch
    from app.modules.meetings.store import InMemoryTurnStore
    from app.services.vector_store import get_vector_store

    store = InMemoryTurnStore()
    knowledge = ServerKnowledgeSearch(
        vector_store=get_vector_store(), db_factory=get_supabase
    )
    engine = TurnEngine(
        meeting_loader=meeting_manager,
        provider_resolver=get_provider,
        knowledge_search=knowledge,
        turn_store=store,
    )
    return engine, store


class Orchestrator:
    """Compatibility facade over the shared turn engine."""

    def __init__(self, meeting_manager: MeetingManager):
        self.meeting_manager = meeting_manager
        self._engine, self._store = _engine_for(meeting_manager)

    def _build_context(
        self,
        participant: AIParticipant,
        messages: List[Message],
        agenda: str,
    ) -> List[LLMMessage]:
        context: List[LLMMessage] = []
        system_content = participant.system_prompt
        if agenda:
            system_content += f"\n\nMEETING AGENDA:\n{agenda}"
        context.append(LLMMessage(role="system", content=system_content))
        for msg in messages:
            if msg.sender_type == SenderType.USER:
                context.append(LLMMessage(role="user", content=f"User: {msg.content}"))
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
            else:
                context.append(LLMMessage(role="user", content=f"System: {msg.content}"))
        return context

    async def execute_turn(self, meeting_id: str, participant_id: str) -> TurnResponse:
        result = await self._engine.run(meeting_id, participant_id)
        if result.state != "completed" or result.message is None:
            raise RuntimeError(f"Turn {result.turn_id} ended as {result.state}: {result.terminal_reason}")
        return TurnResponse(
            message=result.message,
            disagreements=list(result.disagreements),
            consensus=list(result.consensus),
        )

    async def execute_turn_streaming(
        self, meeting_id: str, participant_id: str
    ) -> AsyncGenerator[dict, None]:
        """Legacy SSE dicts translated from v2 engine events (adapter only)."""
        try:
            result = await self._engine.run(meeting_id, participant_id)
        except Exception as exc:  # typed terminal failure -> legacy error event
            yield {"type": "error", "content": f"{type(exc).__name__}: {exc}"}
            return
        if result.state != "completed" or result.message is None:
            yield {"type": "error", "content": f"Turn ended as {result.state}"}
            return
        events = await self._store.list_events(result.turn_id, 0)
        for event in events:
            etype = event["type"]
            data = event.get("data", {})
            if etype == "text_delta" and data.get("content"):
                yield {"type": "text", "content": data["content"]}
            elif etype == "tool_call":
                yield {
                    "type": "tool_call",
                    "id": data.get("provider_call_id"),
                    "tool": data.get("tool_name"),
                    "input": data.get("arguments"),
                }
            elif etype == "tool_result":
                yield {
                    "type": "tool_result",
                    "id": data.get("provider_call_id"),
                    "tool": data.get("tool_name"),
                    "result": data.get("result"),
                }
            elif etype == "citation":
                yield {"type": "citation", **data}
        yield {
            "type": "done",
            "message_id": result.message.id,
            "usage": result.usage,
        }

    async def get_turn_status(self, turn_id: str) -> dict:
        record = await self._store.get(turn_id)
        return {
            "turn_id": record.turn_id,
            "meeting_id": record.meeting_id,
            "participant_id": record.participant_id,
            "state": record.state,
            "result_message_id": record.result_message_id,
            "terminal_reason": record.terminal_reason,
            "usage": record.usage,
            "cost": record.cost,
        }
