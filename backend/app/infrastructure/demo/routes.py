"""Bond demo entry: the single approved scenario, served deterministically.

Unknown scenarios fail closed; caller-supplied mode/provider headers are
ignored so overrides cannot escape fixture mode. Credential responses carry
private no-store headers and raw tokens never enter logs.
"""

from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.infrastructure.demo import bond_service, errors
from app.infrastructure.demo.bond_service import (
    NotBootstrapped,
    OutOfOrder,
    StaleRevision,
    UnknownAction,
)
from app.modules.meetings.queue import QueueCapacity, QueueConflict, QueueValidation

router = APIRouter()


def _bearer(request: Request) -> Optional[str]:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _error(status: int, code: str, message: str, retryable: bool = False,
           details: Optional[dict] = None):
    body = {"code": code, "message": message, "retryable": retryable}
    if details:
        body["details"] = details
    return JSONResponse(status_code=status, content=body)


_NO_STORE = {"Cache-Control": "no-store, private"}


def _map_progress(exc: Exception):
    if isinstance(exc, UnknownAction):
        return _error(404, "unknown_action", str(exc))
    if isinstance(exc, StaleRevision):
        return _error(409, "stale_scenario_revision", str(exc))
    if isinstance(exc, OutOfOrder):
        return _error(409, "unsupported_at_this_step", str(exc))
    if isinstance(exc, NotBootstrapped):
        return _error(409, "stale_generation", str(exc))
    raise exc


def _map_queue(exc: Exception):
    if isinstance(exc, QueueConflict):
        kind = str(exc.args[0]) if exc.args else "queue_conflict"
        if kind == "not_found":
            return _error(404, "queue_not_found", "Queue entry not found.")
        return _error(409, kind, f"Queue conflict: {kind}.")
    if isinstance(exc, QueueValidation):
        return _error(422, "queue_validation", str(exc))
    if isinstance(exc, QueueCapacity):
        return _error(429, "demo_quota_exceeded", "Queue is full.", True)
    raise exc


@router.post("/sessions")
async def create_demo_session(payload: Optional[dict] = None):
    body = payload or {}
    try:
        result = await bond_service.create_session(
            scenario_id=body.get("scenario_id", ""),
            scenario_revision=int(body.get("scenario_revision", 1)),
            creation_key=str(body.get("creation_key", "anonymous")),
        )
    except errors.ScenarioConflict:
        return _error(404, "unknown_scenario",
                       "Unknown scenario. Only the approved bond review is served.")
    except StaleRevision as exc:
        return _error(409, "stale_scenario_revision", str(exc))
    except errors.QuotaExceeded as exc:
        return _error(429, "demo_quota_exceeded", "Demo quota exceeded.", True)
    response = JSONResponse(status_code=201, content=result)
    response.headers.update(_NO_STORE)
    return response


@router.get("/session")
async def get_demo_session(request: Request):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    try:
        record = bond_service.sessions().get_by_token(token)
        state = bond_service.progress().current(record.session_id, record.generation)
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (StaleRevision, NotBootstrapped):
        return _error(404, "no_walkthrough", "No walkthrough for this generation.")
    return {
        "session": {
            "session_id": record.session_id,
            "generation": record.generation,
            "scenario_id": record.scenario_id,
            "action_count": record.action_count,
            "expires_at": record.expires_at,
        },
        "progress": state,
        "instrument": bond_service.instrument_view(),
    }


@router.post("/reset")
async def reset_demo_session(request: Request, payload: Optional[dict] = None):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    body = payload or {}
    try:
        result = bond_service.reset_session(
            token=token,
            expected_generation=int(body.get("expected_generation", 0)),
            idempotency_key=str(body.get("idempotency_key", "")),
        )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except errors.StaleGeneration:
        return _error(409, "stale_generation", "Stale generation.")
    except errors.ScenarioConflict:
        return _error(409, "scenario_conflict", "Scenario rebinding is not allowed.")
    response = JSONResponse(status_code=200, content=result)
    response.headers.update(_NO_STORE)
    return response


@router.post("/actions")
async def demo_action(request: Request, payload: Optional[dict] = None):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    body = payload or {}
    try:
        result = await bond_service.perform_action(
            token=token,
            action_id=str(body.get("action_id", "")),
            expected_scenario_revision=int(body.get("expected_scenario_revision", 0)),
            expected_generation=int(body.get("expected_generation", 0)),
            idempotency_key=str(body.get("idempotency_key", "")),
        )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except errors.StaleGeneration:
        return _error(409, "stale_generation", "Stale generation.")
    except errors.QuotaExceeded:
        return _error(429, "demo_quota_exceeded", "Demo quota exceeded.", True)
    except (UnknownAction, StaleRevision, OutOfOrder, NotBootstrapped) as exc:
        return _map_progress(exc)
    return JSONResponse(status_code=200, content=result)


@router.get("/queue")
async def demo_queue(request: Request):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    try:
        return await bond_service.list_queue(token)
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (StaleRevision, NotBootstrapped):
        return _error(404, "no_walkthrough", "No walkthrough for this generation.")


@router.patch("/queue/{entry_id}")
async def demo_edit_queue(entry_id: str, request: Request,
                          payload: Optional[dict] = None):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    body = payload or {}
    try:
        return await bond_service.edit_queue_entry(
            token, entry_id,
            content=str(body.get("content", "")),
            expected_revision=int(body.get("expected_revision", 0)),
        )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (QueueConflict, QueueValidation, QueueCapacity) as exc:
        return _map_queue(exc)


@router.delete("/queue/{entry_id}")
async def demo_remove_queue(entry_id: str, request: Request,
                            payload: Optional[dict] = None):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    body = payload or {}
    raw = body.get("expected_revision")
    try:
        result = await bond_service.remove_queue_entry(
            token, entry_id,
            expected_revision=None if raw is None else int(raw),
        )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (QueueConflict, QueueValidation, QueueCapacity) as exc:
        return _map_queue(exc)
    return JSONResponse(status_code=200, content=result)
