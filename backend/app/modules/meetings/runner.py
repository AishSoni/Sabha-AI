"""Independent turn runner: one execution, many observers."""

import asyncio
from typing import Any, Optional

from app.modules.meetings.engine import TurnEngine, TurnResult
from app.modules.meetings.store import InMemoryTurnStore


class TurnRunner:
    def __init__(self, engine: TurnEngine, store: InMemoryTurnStore) -> None:
        self._engine = engine
        self._store = store
        self._tasks: dict[str, asyncio.Task] = {}

    async def start(
        self, meeting_id: str, participant_id: str, idempotency_key: Optional[str] = None
    ) -> str:
        result = await self._engine.run(meeting_id, participant_id, idempotency_key)
        return result.turn_id

    def start_detached(
        self, meeting_id: str, participant_id: str, idempotency_key: Optional[str] = None
    ) -> asyncio.Task:
        task = asyncio.create_task(self._engine.run(meeting_id, participant_id, idempotency_key))
        self._tasks[idempotency_key or f"{meeting_id}:{participant_id}"] = task
        return task

    async def await_turn(self, turn_id: str, timeout: Optional[float] = None) -> TurnResult:
        # Poll the store for terminal state; execution and observation are separate.
        import time as _time

        start = _time.monotonic()
        while True:
            record = await self._store.get(turn_id)
            if record.state in ("completed", "failed", "cancelled"):
                return await self._engine._replay_result(record)
            if timeout is not None and _time.monotonic() - start > timeout:
                raise TimeoutError(f"turn {turn_id} not terminal within {timeout}s")
            await asyncio.sleep(0.01)

    async def subscribe(self, turn_id: str, after: int = 0):
        seen = after
        while True:
            events = await self._store.list_events(turn_id, seen)
            for event in events:
                seen = event["sequence"]
                yield event
            record = await self._store.get(turn_id)
            if record.state in ("completed", "failed", "cancelled"):
                remaining = await self._store.list_events(turn_id, seen)
                for event in remaining:
                    yield event
                return
            await asyncio.sleep(0.01)

    async def cancel(self, turn_id: str) -> bool:
        return await self._engine.cancel(turn_id)
