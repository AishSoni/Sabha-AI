"""
Meetings API routes.
"""

import asyncio
import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from app.modules.meetings.domain.models import (
    Consensus,
    Disagreement,
    Message,
    TurnResponse,
)
from app.modules.meetings.presentation.schemas import SummaryRequest, TurnRequest
from app.platform.config import settings
from app.presentation.dependencies import get_meeting_manager, get_turn_queue
from app.capabilities.configuration.contracts import MissingProviderKeyError
from app.modules.meetings.domain.errors import MeetingClosedError
from app.modules.meetings.infrastructure.orchestrator import Orchestrator
from app.modules.meetings.infrastructure.summary import (
    EmptyConversationError,
    generate_meeting_summary,
)
from app.modules.meetings.infrastructure.turns import (
    QueueClosedError,
    QueueConflictError,
    QueueLimitError,
    QueueNotFoundError,
    QueueParticipantNotFoundError,
    TurnNotFoundError,
    TurnQueueService,
)
from app.capabilities.runtime.runner import TERMINAL_STATUSES, TurnRunner
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _legacy_request_key() -> str:
    return f"legacy-turn-{uuid.uuid4()}"


async def _submit_legacy_turn(
    service: TurnQueueService,
    meeting_id: str,
    data: TurnRequest,
    request: Request,
):
    try:
        return await service.submit(
            meeting_id,
            data.participant_id,
            _legacy_request_key(),
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


async def _drive_legacy_operation(
    service: TurnQueueService,
    request: Request,
    meeting_id: str,
    operation_id: str,
) -> dict:
    """Wait for the durable operation while keeping execution in the queue.

    If this process owns an inline runner, it is already working. In tests and
    in one-shot deployments without a background runner, a local runner is
    started for this compatibility call. It still claims through the same
    fenced RPCs, so it can never bypass the database guards.
    """
    container = request.app.state.container
    runner = getattr(container, "turn_runner", None)
    local_runner = None
    if runner is None or not runner.is_running:
        local_runner = TurnRunner(
            service, concurrency=1, worker_id=f"legacy:{uuid.uuid4()}"
        )

    deadline = time.monotonic() + max(
        settings.turn_execution_timeout_seconds + settings.turn_lease_seconds, 30
    )
    while True:
        status = await service.status(meeting_id, operation_id)
        if status.get("status") in ("done", *TERMINAL_STATUSES):
            return status
        if local_runner is not None:
            await local_runner.run_once()
            await local_runner.wait_idle()
        if time.monotonic() >= deadline:
            return status
        await asyncio.sleep(max(settings.turn_poll_seconds, 0.05))


def _raise_for_legacy_terminal(status: dict) -> None:
    state = status.get("status")
    if state in ("done", "completed"):
        return
    code = status.get("error_code")
    message = status.get("error_message") or f"Turn {state}"
    if code == "credential_unavailable":
        raise HTTPException(status_code=422, detail=message)
    if code == "meeting_not_found":
        raise HTTPException(status_code=404, detail=message)
    if code == "meeting_closed":
        raise HTTPException(status_code=409, detail=message)
    if state == "cancelled":
        raise HTTPException(status_code=409, detail=message)
    raise HTTPException(status_code=500, detail=f"Error executing turn: {message}")


def _legacy_stream_payload(row: dict) -> dict | None:
    """Translate one durable event into the legacy StreamEvent wire shape."""
    event_type = row.get("type")
    payload = row.get("payload") or {}
    if event_type in ("status",):
        return None
    if event_type in ("text", "thinking"):
        return {"type": event_type, "content": payload.get("content", "")}
    if event_type == "tool_call":
        return {
            "type": "tool_call",
            "tool_name": payload.get("tool_name"),
            "tool_arguments": payload.get("arguments") or {},
            "tool_call_id": payload.get("call_id"),
        }
    if event_type == "tool_result":
        return {
            "type": "tool_result",
            "tool_name": payload.get("tool_name"),
            "tool_result": payload.get("result"),
            "tool_call_id": payload.get("call_id"),
        }
    if event_type == "citation":
        return {
            "type": "citation",
            "source": payload.get("source"),
            "title": payload.get("title"),
            "url": payload.get("url"),
            "snippet": payload.get("snippet"),
        }
    if event_type == "done":
        return {
            "type": "done",
            "message_id": str(payload.get("message_id", "")),
            "usage": payload.get("usage") or {},
        }
    if event_type in ("error", "interrupted", "cancelled"):
        return {
            "type": "error",
            "content": payload.get("message") or payload.get("code") or "Turn failed",
        }
    return None


@router.post("/{meeting_id}/summary", response_model=Message)
async def generate_summary(
    meeting_id: str,
    data: SummaryRequest,
    request: Request,
    manager=Depends(get_meeting_manager),
):
    """Generate and persist a real interim meeting summary.

    Same generation-settings/BYOK contract as turns: request overrides compose
    over server defaults and the secret rides the X-Provider-Key header,
    never storage. The attempt is charged once in the inference ledger.
    """
    try:
        message = await generate_meeting_summary(
            meeting_id,
            provider_settings=data.provider,
            provider_api_key=request.headers.get("X-Provider-Key"),
            manager=manager,
        )
        return message
    except MeetingClosedError as e:
        # ended/archived meetings are read-only (409), like all writes.
        raise HTTPException(status_code=409, detail=str(e))
    except EmptyConversationError as e:
        # Nothing to summarize (system messages alone don't count).
        raise HTTPException(status_code=422, detail=str(e))
    except MissingProviderKeyError as e:
        # Cloud provider without any callable key: loud, actionable failure.
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")


@router.post("/{meeting_id}/turn", response_model=TurnResponse)
async def execute_turn(
    meeting_id: str,
    data: TurnRequest,
    request: Request,
    service: TurnQueueService = Depends(get_turn_queue),
    manager=Depends(get_meeting_manager),
):
    """Synchronous compatibility adapter over the durable turn workflow.

    New callers submit through POST /meetings/{id}/turns and observe the
    operation separately. This adapter submits, waits for the same fenced
    operation, and shapes the old response.
    """
    submission = await _submit_legacy_turn(service, meeting_id, data, request)
    operation_id = str(submission.operation["id"])
    status = await _drive_legacy_operation(
        service, request, meeting_id, operation_id
    )
    if status.get("status") not in ("done", *TERMINAL_STATUSES):
        raise HTTPException(
            status_code=504,
            detail=(
                f"Turn operation {operation_id} is still {status.get('status')}; "
                "it remains accepted and observable."
            ),
        )
    _raise_for_legacy_terminal(status)

    meeting = await manager.get_meeting(meeting_id)
    final_message_id = status.get("final_message_id")
    message = None
    if meeting is not None:
        message = next(
            (item for item in meeting.messages if item.id == final_message_id),
            None,
        )
    if message is None:
        raise HTTPException(
            status_code=500,
            detail="The turn completed but its final message could not be read",
        )

    disagreement_rows, consensus_rows = service.operation_effects(operation_id)
    return TurnResponse(
        message=message,
        disagreements=[Disagreement.model_validate(row) for row in disagreement_rows],
        consensus=[Consensus.model_validate(row) for row in consensus_rows],
    )


@router.post("/{meeting_id}/turn/stream")
async def execute_turn_stream(
    meeting_id: str,
    data: TurnRequest,
    request: Request,
    service: TurnQueueService = Depends(get_turn_queue),
):
    """Streaming compatibility adapter over the durable turn workflow.

    It submits exactly once and only observes persisted events. Disconnecting
    stops this observer; it does not cancel the accepted operation.
    """
    from sse_starlette.sse import EventSourceResponse

    async def stream_generator():
        try:
            submission = await _submit_legacy_turn(service, meeting_id, data, request)
        except HTTPException as exc:
            yield {"data": json.dumps({"type": "error", "content": str(exc.detail)})}
            return
        except Exception as exc:  # noqa: BLE001 - stream boundary
            yield {"data": json.dumps({"type": "error", "content": str(exc)})}
            return

        operation_id = str(submission.operation["id"])
        driver = asyncio.create_task(
            _drive_legacy_operation(service, request, meeting_id, operation_id),
            name=f"legacy-turn-{operation_id}",
        )
        cursor = 0
        try:
            while True:
                try:
                    rows = await service.events(
                        meeting_id, operation_id, cursor, 500
                    )
                except TurnNotFoundError:
                    return
                for row in rows:
                    cursor = max(cursor, int(row["sequence"]))
                    payload = _legacy_stream_payload(row)
                    if payload is not None:
                        yield {"data": json.dumps(payload)}

                try:
                    status = await service.status(meeting_id, operation_id)
                except TurnNotFoundError:
                    return
                if status.get("status") in ("done", *TERMINAL_STATUSES) and not rows:
                    return
                await asyncio.sleep(max(settings.turn_poll_seconds, 0.05))
        finally:
            if not driver.done():
                driver.cancel()
                await asyncio.gather(driver, return_exceptions=True)

    return EventSourceResponse(stream_generator())


