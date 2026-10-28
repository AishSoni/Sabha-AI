"""Shared encoding for durable turn operations and their event streams.

Live HTTP and the replay surface must speak exactly the same wire contract.
Keeping the DTOs and the persisted-event follower here means a recorded turn
is observed through the same path as a live one; only the observation port
changes.
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from app.modules.meetings.application.ports import TurnObservation

TERMINAL_STATUSES = {"completed", "failed", "interrupted", "cancelled"}
_STATUS_MAP = {
    "pending": "queued",
    "processing": "executing",
    "done": "completed",
}


def status(value: str) -> str:
    return _STATUS_MAP.get(value, value)


def operation_dto(row: dict) -> dict:
    error = None
    if row.get("error_code"):
        error = {
            "code": row["error_code"],
            "message": row.get("error_message") or "The turn did not complete.",
        }
    return {
        "operation_id": str(row["id"]),
        "meeting_id": str(row["meeting_id"]),
        "participant_id": (
            str(row["participant_id"]) if row.get("participant_id") else None
        ),
        "request_key": row["request_key"],
        "status": status(row["status"]),
        "admission": row["admission"],
        "queue_position": row.get("queue_position"),
        "created_at": row["created_at"],
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
        "final_message_id": (
            str(row["final_message_id"]) if row.get("final_message_id") else None
        ),
        "cancel_requested": bool(row.get("cancel_requested_at")),
        "error": error,
        "effective_generation": row.get("effective_settings"),
    }


def event_dto(row: dict) -> dict:
    payload = row.get("payload") or {}
    return {
        **payload,
        "event_id": str(row["id"]),
        "operation_id": str(row["operation_id"]),
        "meeting_id": str(row["meeting_id"]),
        "sequence": row["sequence"],
        "type": row["type"],
    }


async def turn_event_stream(
    observation: TurnObservation,
    meeting_id: str,
    operation_id: str,
    *,
    after: int = 0,
    poll_seconds: float = 0.5,
) -> AsyncGenerator[dict, None]:
    """Replay persisted events from ``after``, then follow until terminal."""
    cursor = after
    while True:
        rows = await observation.events(meeting_id, operation_id, cursor, 500)
        for row in rows:
            cursor = max(cursor, int(row["sequence"]))
            yield {"data": json.dumps(event_dto(row))}

        current = await observation.status(meeting_id, operation_id)
        if status(current["status"]) in TERMINAL_STATUSES and not rows:
            return
        await asyncio.sleep(max(poll_seconds, 0.0))
