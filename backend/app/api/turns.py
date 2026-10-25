"""Durable turn queue HTTP surface (spec 07).

Submit is admission only. Execution is server-owned; observation is a
separate, replayable read. A disconnect therefore never cancels accepted
work, and a status read never triggers generation.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.platform.config import settings
from app.models import (
    TurnCancelResponse,
    TurnOperationResponse,
    TurnSubmitRequest,
)
from app.presentation.dependencies import get_turn_queue
from app.services.turn_queue import (
    NotCancellableError,
    QueueClosedError,
    QueueConflictError,
    QueueLimitError,
    QueueNotFoundError,
    QueueParticipantNotFoundError,
    TurnNotFoundError,
    TurnQueueService,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meetings", tags=["turns"])

_TERMINAL = {"completed", "failed", "interrupted", "cancelled"}
_STATUS_MAP = {
    "pending": "queued",
    "processing": "executing",
    "done": "completed",
}


def _status(value: str) -> str:
    return _STATUS_MAP.get(value, value)


def _operation_dto(row: dict) -> dict:
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
        "status": _status(row["status"]),
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


def _event_dto(row: dict) -> dict:
    payload = row.get("payload") or {}
    return {
        **payload,
        "event_id": str(row["id"]),
        "operation_id": str(row["operation_id"]),
        "meeting_id": str(row["meeting_id"]),
        "sequence": row["sequence"],
        "type": row["type"],
    }


@router.post(
    "/{meeting_id}/turns",
    response_model=TurnOperationResponse,
    status_code=202,
)
async def submit_turn(
    meeting_id: str,
    data: TurnSubmitRequest,
    request: Request,
    response: Response,
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Admit a turn and return its durable operation identity."""
    try:
        submission = await service.submit(
            meeting_id,
            data.participant_id,
            data.request_key,
            provider_settings=data.provider,
            provider_api_key=request.headers.get("X-Provider-Key"),
        )
    except QueueNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QueueClosedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except QueueConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except QueueParticipantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QueueLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc))

    if not submission.created:
        response.status_code = 200
    return _operation_dto(submission.operation)


@router.get(
    "/{meeting_id}/turns",
    response_model=list[TurnOperationResponse],
)
async def list_turns(
    meeting_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Ordered queue and recent terminal operations for one meeting."""
    rows = await service.list_operations(meeting_id, limit=limit)
    return [_operation_dto(row) for row in rows]


@router.get(
    "/{meeting_id}/turns/{operation_id}",
    response_model=TurnOperationResponse,
)
async def get_turn(
    meeting_id: str,
    operation_id: str,
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Read durable status without subscribing to or restarting work."""
    try:
        row = await service.status(meeting_id, operation_id)
    except TurnNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _operation_dto(row)


@router.post(
    "/{meeting_id}/turns/{operation_id}/cancel",
    response_model=TurnCancelResponse,
)
async def cancel_turn(
    meeting_id: str,
    operation_id: str,
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Cancel a queued turn or request cooperative cancellation while executing."""
    try:
        body = await service.cancel(meeting_id, operation_id)
    except TurnNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except NotCancellableError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {
        "outcome": body.get("outcome", "terminal"),
        "status": _status(body.get("status", "failed")),
    }


@router.get("/{meeting_id}/turns/{operation_id}/events")
async def observe_turn(
    meeting_id: str,
    operation_id: str,
    after: int = Query(default=0, ge=0),
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Replay and follow persisted turn events.

    Polling the durable event log (rather than holding an in-process
    publisher) means observation survives worker/API process separation,
    reconnects, and zero subscribers.
    """
    try:
        await service.status(meeting_id, operation_id)
    except TurnNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    async def generator() -> AsyncGenerator[dict, None]:
        cursor = after
        while True:
            rows = await service.events(meeting_id, operation_id, cursor, 500)
            for row in rows:
                cursor = max(cursor, int(row["sequence"]))
                yield {"data": json.dumps(_event_dto(row))}

            try:
                current = await service.status(meeting_id, operation_id)
            except TurnNotFoundError:
                return
            if _status(current["status"]) in _TERMINAL and not rows:
                return
            await asyncio.sleep(max(settings.turn_poll_seconds, 0.1))

    return EventSourceResponse(
        generator(),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
