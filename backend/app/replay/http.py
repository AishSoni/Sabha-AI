"""Read-only replay HTTP surface (spec-14/17).

Every route depends on ``app.state.replay``; none imports the live container,
database client, provider adapter, or recovery workers. Non-GET replay intents
are rejected here, before any live adapter can be reached. The package runtime
resolves the pinned package/version plus one allowlisted checkpoint selector.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.modules.knowledge.presentation.schemas import DocumentResponse
from app.modules.meetings.domain.models import (
    Consensus,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
)
from app.modules.meetings.presentation.schemas import ClosingView
from app.modules.meetings.presentation.turn_stream import (
    operation_dto,
    turn_event_stream,
)
from app.replay.constants import REPLAY_FOLLOWER_POLL_SECONDS, TURN_LIST_LIMIT
from app.replay.contracts import ReplayContainer, ReplayNotFound
from app.replay.source import (
    ReplayNotConfigured,
    ReplayPackageUnavailable,
    ReplaySelectorInvalid,
)
from app.replay.streaming import ReplayStreamLimit

router = APIRouter(prefix="/api/replay", tags=["replay"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


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


class ReplayPreviewView(BaseModel):
    available: bool = False
    asset_ids: list[str] = Field(default_factory=list)


class ReplaySessionView(BaseModel):
    run_id: str
    package_version: str
    meeting_id: str
    label: str
    title: str = ""
    as_of: str = ""
    disclosure: str = ""
    stack_labels: dict[str, str] = Field(default_factory=dict)
    provenance: dict = Field(default_factory=dict)
    capabilities: ReplayCapabilitiesView
    package_id: str = ""
    content_sha256: str = ""
    checkpoint_id: str = ""
    initial_checkpoint: str = ""
    checkpoints: list[str] = Field(default_factory=list)
    intents: list[dict] = Field(default_factory=list)
    beats: list[dict] = Field(default_factory=list)
    tapes: list[dict] = Field(default_factory=list)
    assets: list[dict] = Field(default_factory=list)
    claims: list[dict] = Field(default_factory=list)
    preview: ReplayPreviewView = Field(default_factory=ReplayPreviewView)
    retired: bool = False


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc) or "replay_package_unavailable")


def register_replay_error_handlers(app: FastAPI) -> None:
    """Keep an absent checkpoint read honest instead of a 500.

    The initial checkpoint intentionally carries less than the later
    checkpoints (only the safe creation config in the guided package). A read
    that is not present is a normal replay outcome, not an internal failure.
    """

    @app.exception_handler(ReplayNotFound)
    async def replay_not_found_handler(
        request: Request, exc: ReplayNotFound
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "replay_read_unavailable"})



async def get_replay(
    request: Request,
    checkpoint: str | None = Query(default=None),
    package: str | None = Query(default=None),
    version: str | None = Query(default=None),
) -> ReplayContainer:
    replay = getattr(request.app.state, "replay", None)
    if replay is None:
        raise HTTPException(status_code=503, detail="replay_not_configured")
    if hasattr(replay, "for_request"):
        try:
            return await replay.for_request(package, version, checkpoint)
        except ReplayNotConfigured as exc:
            raise HTTPException(status_code=503, detail="replay_not_configured") from exc
        except ReplaySelectorInvalid as exc:
            raise HTTPException(
                status_code=400, detail="replay_selector_invalid"
            ) from exc
        except ReplayPackageUnavailable as exc:
            raise _unavailable(exc) from exc
    return replay


def _require_recorded_meeting(replay: ReplayContainer, meeting_id: str) -> None:
    if meeting_id != replay.session.meeting_id:
        raise HTTPException(status_code=404, detail="Recorded meeting not found")


def _recorded_method(reads: Any, name: str):
    method = getattr(reads, name, None)
    if method is None:
        raise HTTPException(status_code=404, detail="replay_read_unavailable")
    return method


def _client(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


async def _acquire_stream(request: Request, replay: ReplayContainer) -> None:
    limiter = getattr(replay, "limiter", None)
    if limiter is None:
        return
    try:
        await limiter.acquire(_client(request))
    except ReplayStreamLimit as exc:
        raise HTTPException(
            status_code=429, detail="replay_stream_limit"
        ) from exc


def _release_stream(request: Request, replay: ReplayContainer) -> None:
    limiter = getattr(replay, "limiter", None)
    if limiter is not None:
        limiter.release(_client(request))


@router.get("/session", response_model=ReplaySessionView)
async def read_session(replay: ReplayContainer = Depends(get_replay)):
    session = replay.session
    return ReplaySessionView(
        run_id=session.run_id,
        package_version=session.package_version,
        meeting_id=session.meeting_id,
        label=session.label,
        title=session.title,
        as_of=session.as_of,
        disclosure=session.disclosure,
        stack_labels=session.stack_labels,
        provenance=session.provenance,
        capabilities=ReplayCapabilitiesView(**session.capabilities.as_dict()),
        package_id=session.package_id,
        content_sha256=session.content_sha256,
        checkpoint_id=session.checkpoint_id,
        initial_checkpoint=session.initial_checkpoint,
        checkpoints=list(session.checkpoints),
        intents=list(session.intents),
        beats=list(session.beats),
        tapes=list(session.tapes),
        assets=list(session.assets),
        claims=list(session.claims),
        preview=ReplayPreviewView(
            available=session.preview.available,
            asset_ids=list(session.preview.asset_ids),
        ),
        retired=session.retired,
    )


@router.get("/meetings", response_model=list[Meeting])
async def list_meetings(replay: ReplayContainer = Depends(get_replay)):
    return await replay.reads.list_meetings()


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


@router.get("/meetings/{meeting_id}/context-stats")
async def read_context_stats(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await _recorded_method(replay.reads, "context_stats")(meeting_id)


@router.get(
    "/meetings/{meeting_id}/documents",
    response_model=list[DocumentResponse],
)
async def read_documents(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await _recorded_method(replay.reads, "documents")(meeting_id)


@router.get("/meetings/{meeting_id}/safe-config")
async def read_safe_config(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await _recorded_method(replay.reads, "safe_config")(meeting_id)


@router.get(
    "/meetings/{meeting_id}/closing",
    response_model=ClosingView,
)
async def read_closing(
    meeting_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    return await _recorded_method(replay.reads, "closing")(meeting_id)


@router.get("/meetings/{meeting_id}/turns")
async def list_turns(
    meeting_id: str,
    limit: int = TURN_LIST_LIMIT,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    rows = await replay.observation.list_operations(meeting_id, limit)
    return [operation_dto(row) for row in rows]


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
    request: Request,
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

    stream = getattr(replay, "stream", None)
    if stream is None:
        return EventSourceResponse(
            turn_event_stream(
                replay.observation,
                meeting_id,
                operation_id,
                after=after,
                poll_seconds=REPLAY_FOLLOWER_POLL_SECONDS,
            ),
            headers=SSE_HEADERS,
        )

    await _acquire_stream(request, replay)

    async def body():
        try:
            async for frame in stream.events(
                meeting_id, operation_id, after=max(0, after)
            ):
                yield frame
        finally:
            _release_stream(request, replay)

    return EventSourceResponse(body(), headers=SSE_HEADERS)


@router.get("/meetings/{meeting_id}/closing/events")
async def observe_closing(
    request: Request,
    meeting_id: str,
    after: int = 0,
    replay: ReplayContainer = Depends(get_replay),
):
    _require_recorded_meeting(replay, meeting_id)
    closing = await _recorded_method(replay.reads, "closing")(meeting_id)
    closing_id = getattr(closing, "closing_id", None)
    if not closing_id:
        raise HTTPException(status_code=404, detail="Recorded closing not found")

    stream = getattr(replay, "closing_events", None)
    if stream is None:
        raise HTTPException(status_code=404, detail="replay_read_unavailable")

    await _acquire_stream(request, replay)

    async def body():
        try:
            async for frame in stream.events(
                meeting_id, closing_id, after=max(0, after)
            ):
                yield frame
        finally:
            _release_stream(request, replay)

    return EventSourceResponse(body(), headers=SSE_HEADERS)


@router.get("/assets/{asset_id}")
async def read_asset(
    asset_id: str,
    replay: ReplayContainer = Depends(get_replay),
):
    for asset in replay.session.assets:
        if str(asset.get("asset_id")) == asset_id:
            return asset
    raise HTTPException(status_code=404, detail="Recorded asset not found")


@router.api_route(
    "/{path:path}",
    methods=["POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def reject_replay_command(path: str):
    """Replay intents select recorded transitions, never live commands."""
    raise HTTPException(status_code=403, detail="replay_read_only")
