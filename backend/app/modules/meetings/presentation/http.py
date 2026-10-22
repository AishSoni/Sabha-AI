"""Coordinated closing routes (spec 08).

A close request is admission plus a best-effort drive; it returns a durable
receipt rather than pretending a summary exists. Observation is read-only,
and retry/abort are explicit commands. Provider calls never happen in a GET.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.modules.meetings.application.closing import ClosingService
from app.modules.meetings.application.contracts import ClosingSnapshot
from app.modules.meetings.domain.errors import (
    ClosingConflictError,
    ClosingNotFoundError,
    ClosingNotRecoverableError,
    MeetingClosedError,
    MeetingNotFoundError,
)
from app.modules.meetings.presentation.schemas import (
    ClosingReceipt,
    ClosingRequest,
    ClosingView,
)
from app.presentation.dependencies import get_closing

router = APIRouter(prefix="/meetings", tags=["closing"])


def _raise_http(exc: Exception) -> None:
    if isinstance(exc, (MeetingNotFoundError, ClosingNotFoundError)):
        raise HTTPException(status_code=404, detail=str(exc) or "Meeting not found")
    if isinstance(
        exc,
        (MeetingClosedError, ClosingConflictError, ClosingNotRecoverableError),
    ):
        raise HTTPException(status_code=409, detail=str(exc) or "Closing conflict")
    raise exc


def _view(snapshot: ClosingSnapshot) -> ClosingView:
    context = snapshot.context
    record = snapshot.closing
    presented = "archived" if context.archived else context.status
    if presented not in ("active", "voting", "ended", "archived"):
        presented = "active"
    return ClosingView(
        meeting_id=context.meeting_id,
        meeting_status=presented,
        archived=context.archived,
        closing_id=record.id if record else None,
        request_key=record.request_key if record else None,
        mode=record.mode.value if record else None,
        stage=record.stage.value if record else None,
        failed_from_stage=(
            record.failed_from_stage.value
            if record and record.failed_from_stage
            else None
        ),
        votes=[
            {
                "participant_id": vote.participant_id,
                "participant_name": vote.participant_name,
                "role": vote.role,
                "status": vote.status,
                "vote": vote.vote,
                "reason": vote.reason,
                "provider": vote.provider,
                "model": vote.model,
                "usage_kind": vote.usage_kind,
                "price_kind": vote.price_kind,
                "estimated_cost": (
                    float(vote.estimated_cost)
                    if vote.estimated_cost is not None
                    else None
                ),
                "reported_cost": (
                    float(vote.reported_cost)
                    if vote.reported_cost is not None
                    else None
                ),
                "error_code": vote.error_code,
                "error_message": vote.error_message,
                "completed_at": vote.completed_at,
            }
            for vote in snapshot.votes
        ],
        summary=record.summary_text if record else None,
        summary_message_id=record.summary_message_id if record else None,
        error=(
            {"code": record.error_code, "message": record.error_message or ""}
            if record and record.error_code
            else None
        ),
        retryable=bool(record and record.stage.is_recoverable),
        abortable=bool(record and record.stage.is_abortable),
        created_at=record.created_at if record else None,
        updated_at=record.updated_at if record else None,
        completed_at=record.completed_at if record else None,
    )


@router.post(
    "/{meeting_id}/closing",
    response_model=ClosingReceipt,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_closing(
    meeting_id: str,
    body: ClosingRequest,
    service: ClosingService = Depends(get_closing),
) -> ClosingReceipt:
    try:
        snapshot = await service.request(
            meeting_id,
            body.request_key,
            body.mode,
            (
                body.summary_settings.model_dump(exclude_none=True)
                if body.summary_settings
                else None
            ),
        )
    except Exception as exc:  # mapped below; unexpected errors still surface
        _raise_http(exc)
    record = snapshot.closing
    if record is None:
        raise HTTPException(status_code=409, detail="The close did not start")
    view = _view(snapshot)
    return ClosingReceipt(
        meeting_id=view.meeting_id,
        closing_id=record.id,
        stage=view.stage or record.stage.value,
        meeting_status=view.meeting_status,
    )


@router.get("/{meeting_id}/closing", response_model=ClosingView)
async def read_closing(
    meeting_id: str,
    service: ClosingService = Depends(get_closing),
) -> ClosingView:
    try:
        snapshot = await service.observe(meeting_id)
    except Exception as exc:
        _raise_http(exc)
    return _view(snapshot)


@router.post(
    "/{meeting_id}/closing/retry",
    response_model=ClosingView,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_closing(
    meeting_id: str,
    service: ClosingService = Depends(get_closing),
) -> ClosingView:
    try:
        snapshot = await service.retry(meeting_id)
    except Exception as exc:
        _raise_http(exc)
    return _view(snapshot)


@router.post("/{meeting_id}/closing/abort", response_model=ClosingView)
async def abort_closing(
    meeting_id: str,
    service: ClosingService = Depends(get_closing),
) -> ClosingView:
    try:
        snapshot = await service.abort(meeting_id)
    except Exception as exc:
        _raise_http(exc)
    return _view(snapshot)
