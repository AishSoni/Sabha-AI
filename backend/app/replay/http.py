"""Read-only replay HTTP surface (spec-14).

Every route depends on ``app.state.replay``; none imports the live container,
database client, provider adapter, or recovery workers. Non-GET replay intents
are rejected here, before any live adapter can be reached. Guide steps and
recorded package provisioning belong to Specs 17/18.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.modules.meetings.domain.models import Consensus, Disagreement, MeetingWithParticipants
from app.modules.meetings.presentation.turn_stream import (
    operation_dto,
    turn_event_stream,
)
from app.replay.contracts import ReplayContainer, ReplayNotFound

router = APIRouter(prefix="/api/replay", tags=["replay"])


class ReplayCapabilitiesView(BaseModel):
    meetingRead: bool
    turnObservation: bool
    disagreements: bool
    consensus: bool
    contextStats: bool
    createMeeting: bool
    sendMessage: bool
    submitTurn: bool
    cancelTurn: bool
    summary: bool
    documents: bool
    closing: bool


class ReplaySessionView(BaseModel):
    run_id: str
    package_version: str
    meeting_id: str
    label: str
    provenance: dict = Field(default_factory=dict)
    capabilities: ReplayCapabilitiesView


def get_replay(request: Request) -> ReplayContainer:
    replay = getattr(request.app.state, "replay", None)
    if replay is None:
        raise HTTPException(status_code=503, detail="replay_not_configured")
    return replay


def _require_recorded_meeting(replay: ReplayContainer, meeting_id: str) -> None:
    if meeting_id != replay.session.meeting_id:
        raise HTTPException(status_code=404, detail="Recorded meeting not found")


@router.get("/session", response_model=ReplaySessionView)
async def read_session(replay: ReplayContainer = Depends(get_replay)):
    session = replay.session
    return ReplaySessionView(
        run_id=session.run_id,
        package_version=session.package_version,
        meeting_id=session.meeting_id,
        label=session.label,
        provenance=session.provenance,
        capabilities=ReplayCapabilitiesView(**session.capabilities.as_dict()),
    )


@router.get(
    "/meetings/{meeting_id}",
    response_model=MeetingWithParticipants,
)
async def read_meeting(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    meeting = await replay.reads.get_meeting(meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Recorded meeting not found")
    return meeting


@router.get(
    "/meetings/{meeting_id}/disagreements",
    response_model=list[Disagreement],
)
async def read_disagreements(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await replay.reads.get_disagreements(meeting_id)


@router.get(
    "/meetings/{meeting_id}/consensus",
    response_model=list[Consensus],
)
async def read_consensus(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await replay.reads.get_consensus_list(meeting_id)


@router.get("/meetings/{meeting_id}/turns/{operation_id}")
async def read_turn(
    meeting_id: str,
    operation_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    try:
        row = await replay.observation.status(meeting_id, operation_id)
    except ReplayNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Recorded turn not found")
    return operation_dto(row)


@router.get("/meetings/{meeting_id}/turns/{operation_id}/events")
async def observe_turn(
    meeting_id: str,
    operation_id: str,
    after: int = 0,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    try:
        await replay.observation.status(meeting_id, operation_id)
    except ReplayNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Recorded turn not found")

    return EventSourceResponse(
        turn_event_stream(
            replay.observation,
            meeting_id,
            operation_id,
            after=after,
            poll_seconds=0.01,
        ),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.api_route(
    "/{path:path}",
    methods=["POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def reject_replay_command(path: str):
    """Replay intents select recorded transitions, never live commands."""
    raise HTTPException(status_code=403, detail="replay_read_only")
