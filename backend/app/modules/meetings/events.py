"""Version 2 turn event envelope (CONTRACTS section 10)."""

from typing import Any, Optional

from pydantic import BaseModel


class TurnEvent(BaseModel):
    version: int = 2
    event_id: str
    sequence: int
    meeting_id: str
    turn_id: str
    session_generation: Optional[int] = None
    type: str
    data: dict[str, Any] = {}


def make_event(
    sequence: int,
    meeting_id: str,
    turn_id: str,
    event_type: str,
    data: Optional[dict[str, Any]] = None,
    session_generation: Optional[int] = None,
) -> TurnEvent:
    return TurnEvent(
        version=2,
        event_id=f"{turn_id}:{sequence}",
        sequence=sequence,
        meeting_id=meeting_id,
        turn_id=turn_id,
        session_generation=session_generation,
        type=event_type,
        data=data or {},
    )
