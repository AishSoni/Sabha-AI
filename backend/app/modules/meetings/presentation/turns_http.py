"""Durable turn queue HTTP surface (spec 07).

Submit is admission only. Execution is server-owned; observation is a
separate, replayable read. A disconnect therefore never cancels accepted
work, and a status read never triggers generation.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.platform.config import settings
from app.modules.meetings.presentation.schemas import (
    TurnCancelResponse,
    TurnOperationResponse,
    TurnSubmitRequest,
)
from app.modules.meetings.presentation.turn_stream import (
    operation_dto,
    status,
    turn_event_stream,
)
from app.presentation.dependencies import get_turn_observation, get_turn_queue
from app.modules.meetings.infrastructure.turns import (
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
    return operation_dto(submission.operation)


@router.get(
    "/{meeting_id}/turns",
    response_model=list[TurnOperationResponse],
)
async def list_turns(
    meeting_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    observation=Depends(get_turn_observation),
):
    """Ordered queue and recent terminal operations for one meeting."""
    rows = await observation.list_operations(meeting_id, limit=limit)
    return [operation_dto(row) for row in rows]


@router.get(
    "/{meeting_id}/turns/{operation_id}",
    response_model=TurnOperationResponse,
)
async def get_turn(
    meeting_id: str,
    operation_id: str,
    observation=Depends(get_turn_observation),
):
    """Read durable status without subscribing to or restarting work."""
    try:
        row = await observation.status(meeting_id, operation_id)
    except TurnNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return operation_dto(row)


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
        "status": status(body.get("status", "failed")),
    }


@router.get("/{meeting_id}/turns/{operation_id}/events")
async def observe_turn(
    meeting_id: str,
    operation_id: str,
    after: int = Query(default=0, ge=0),
    observation=Depends(get_turn_observation),
):
    """Replay and follow persisted turn events.

    Polling the durable event log (rather than holding an in-process
    publisher) means observation survives worker/API process separation,
    reconnects, and zero subscribers.
    """
    try:
        await observation.status(meeting_id, operation_id)
    except TurnNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return EventSourceResponse(
        turn_event_stream(
            observation,
            meeting_id,
            operation_id,
            after=after,
            poll_seconds=max(settings.turn_poll_seconds, 0.1),
        ),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
