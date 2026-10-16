"""
Orchestrator compatibility adapter - delegates to the shared turn engine.

The inference/tool algorithm lives in exactly one place
(app.modules.meetings.engine). This module translates engine outcomes into
the legacy TurnResponse shape and streams the shared v2 journal (CONTRACTS
§3/§10): execution is detached from the SSE iterator, and subscribers read
committed journal events live instead of awaiting the whole turn.
"""

import asyncio
import uuid
from typing import AsyncGenerator, List, Optional, Tuple

from app.llm import LLMMessage, get_provider
from app.models import AIParticipant, Message, SenderType, TurnResponse
from app.services.meeting_manager import MeetingManager

_RESERVATION_TIMEOUT_SECONDS = 30.0
_RESERVATION_POLL_SECONDS = 0.01


def _engine_for(meeting_manager: MeetingManager):
    from app.core.database import get_supabase
    from app.modules.meetings.engine import TurnEngine
    from app.modules.meetings.knowledge import ServerKnowledgeSearch
    from app.modules.meetings.leases import DurableCoordinator, default_lease_path
    from app.modules.meetings.runner import TurnRunner
    from app.modules.meetings.store import get_shared_turn_store
    from app.services.vector_store import get_vector_store

    # Process-wide store: busy detection, streaming subscribers, and the
    # orchestrator must observe the same reservations/journal.
    store = get_shared_turn_store()
    knowledge = ServerKnowledgeSearch(
        vector_store=get_vector_store(), db_factory=get_supabase
    )
    # Fail closed: silently disabling lease fencing would allow concurrent
    # workers to run the same turn (CONTRACTS §3 single-flight).
    try:
        leases = DurableCoordinator(path=default_lease_path())
    except Exception as exc:
        raise RuntimeError(f"lease coordinator unavailable: {exc}") from exc
    engine = TurnEngine(
        meeting_loader=meeting_manager,
        provider_resolver=get_provider,
        knowledge_search=knowledge,
        turn_store=store,
        lease_coordinator=leases,
    )
    return engine, store, TurnRunner(engine, store)


class Orchestrator:
    """Compatibility facade over the shared turn engine."""

    def __init__(self, meeting_manager: MeetingManager):
        self.meeting_manager = meeting_manager
        self._engine, self._store, self._runner = _engine_for(meeting_manager)

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

    async def _drain_after_turn(self, meeting_id: str) -> None:
        """FIFO queue drain after terminalization (CONTRACTS §5).

        Fakes without drain_queue are tolerated; drain failures must never
        mask the turn outcome.
        """
        drain = getattr(self.meeting_manager, "drain_queue", None)
        if drain is None:
            return
        try:
            await drain(meeting_id)
        except Exception:
            pass

    def start_detached_turn(
        self,
        meeting_id: str,
        participant_id: str,
        idempotency_key: Optional[str] = None,
    ) -> asyncio.Task:
        """Start execution detached from any subscriber (CONTRACTS §3).

        A dropped SSE connection cancels only the subscription; the turn
        keeps running and drains its queue on terminalization.
        """

        async def _run() -> None:
            try:
                await self._engine.run(meeting_id, participant_id, idempotency_key)
            finally:
                await self._drain_after_turn(meeting_id)

        task = asyncio.create_task(_run())
        from app.modules.meetings.runner import TurnRunner

        TurnRunner.register_detached(task)
        return task

    async def _await_reservation(
        self, task: asyncio.Task, idempotency_key: str
    ) -> Tuple[Optional[str], Optional[BaseException]]:
        """Resolve the reserved turn id (or a pre-reserve failure)."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _RESERVATION_TIMEOUT_SECONDS
        while True:
            turn_id = await self._store.turn_id_for_key(idempotency_key)
            if turn_id is not None:
                return turn_id, None
            if task.done():
                if task.cancelled():
                    return None, RuntimeError("turn execution cancelled before reservation")
                exc = task.exception()
                if exc is not None:
                    # Key never registered => reservation itself failed.
                    return None, exc
                return None, RuntimeError("turn execution ended before reservation")
            if loop.time() >= deadline:
                return None, RuntimeError("turn reservation timed out")
            await asyncio.sleep(_RESERVATION_POLL_SECONDS)

    async def execute_turn(self, meeting_id: str, participant_id: str) -> TurnResponse:
        try:
            result = await self._engine.run(meeting_id, participant_id)
        finally:
            await self._drain_after_turn(meeting_id)
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
        """Live v2 journal SSE frames; execution runs detached.

        Reservation failures surface as a single legacy error dict (route
        contract); everything after a successful reserve is streamed as the
        committed v2 envelope sequence (CONTRACTS §10).
        """
        idempotency_key = f"stream:{uuid.uuid4().hex}"
        task = self.start_detached_turn(meeting_id, participant_id, idempotency_key)
        turn_id, reservation_error = await self._await_reservation(task, idempotency_key)
        if turn_id is None:
            exc = reservation_error or RuntimeError("reservation failed")
            code = getattr(exc, "code", None)
            if code:
                yield {"type": "error", "content": f"{code}: {exc}"}
            else:
                yield {"type": "error", "content": f"{type(exc).__name__}: {exc}"}
            return
        try:
            async for event in self._runner.subscribe(turn_id, after=0):
                yield event
        except Exception as exc:  # journal access failure -> legacy error event
            yield {"type": "error", "content": f"{type(exc).__name__}: {exc}"}

    async def subscribe_turn(
        self, turn_id: str, after: int = 0
    ) -> AsyncGenerator[dict, None]:
        """Cursor-based replay + live journal subscription for GET endpoints."""
        async for event in self._runner.subscribe(turn_id, after=after):
            yield event

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
