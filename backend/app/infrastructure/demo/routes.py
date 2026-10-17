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


@router.post("/real-session")
async def create_real_session(request: Request, payload: Optional[dict] = None):
    """Demo session dispatch (thin facilitation on normal infrastructure).

    Modes by bearer presence + body.mode:
    - no bearer (or mode "session"): create a demo SESSION only (credential +
      durable progress bootstrap + seeded specialist personas); NO meeting yet.
    - bearer + mode "meeting": attach/reuse the pinned real walkthrough
      meeting for the session (idempotent per generation).
    - bearer + mode "fork": bounded once-per-generation exploration fork
      (J09), honestly gated until end_walkthrough is complete.
    Fails closed (503) when storage is unavailable; unknown scenarios as
    404/409.
    """
    body = payload or {}
    mode = str(body.get("mode", "") or "").strip().lower()
    bearer = _bearer(request)

    if mode in {"meeting", "fork"} and bearer is None:
        return _error(
            401,
            "unauthenticated",
            "Bearer session token required for this mode.",
        )

    if bearer is None or mode in {"", "session"}:
        try:
            result = await bond_service.create_session(
                scenario_id=str(
                    body.get("scenario_id") or bond_service.REAL_SCENARIO_ID
                ),
                scenario_revision=int(
                    body.get(
                        "scenario_revision", bond_service.BOND_CONTENT_REVISION
                    )
                ),
                creation_key=str(body.get("creation_key", "anonymous")),
            )
        except errors.ScenarioConflict:
            return _error(
                404,
                "unknown_scenario",
                "Unknown scenario. Only the approved bond review is served.",
            )
        except StaleRevision as exc:
            return _error(409, "stale_scenario_revision", str(exc))
        except RuntimeError as exc:
            return _error(503, "demo_storage_unavailable", str(exc), True)
        # Session-only mode: no meeting yet (synthetic bootstrap placeholder is
        # intentionally not surfaced); specialist personas seed best-effort.
        result["meeting"] = None
        try:
            seeds = await bond_service.seed_demo_assets()
            result["persona_ids"] = seeds.get("persona_ids", [])
        except Exception:
            result["persona_ids"] = []
        return JSONResponse(status_code=201, content=result)

    try:
        if mode == "meeting":
            result = await bond_service.attach_real_meeting(bearer)
        elif mode == "fork":
            result = await bond_service.create_explore_fork(bearer)
        else:
            return _error(
                422,
                "missing_fields",
                f"Unsupported demo session mode: {mode or '(unset)'}",
            )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (UnknownAction, StaleRevision, OutOfOrder, NotBootstrapped) as exc:
        return _map_progress(exc)
    except RuntimeError as exc:
        return _error(503, "demo_storage_unavailable", str(exc), True)
    return JSONResponse(status_code=201, content=result)


@router.get("/guide")
async def get_demo_guide():
    """Guide content from the DB package: journey UI00-UI08 + J00-J09 step
    copy keyed by frontend-owned anchors. Auth-free (published content only)."""
    return bond_service.guide_view()


@router.get("/journey-state")
async def get_journey_state(request: Request):
    """Authoritative journey state for resume (bearer session -> progress)."""
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    try:
        return bond_service.journey_state_for_token(token)
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except RuntimeError as exc:
        return _error(503, "demo_storage_unavailable", str(exc), True)


@router.post("/journey-progress")
async def post_journey_progress(request: Request, payload: Optional[dict] = None):
    """Record client-observed steps (inspect_board, queue exercise) through
    the ordered progress store: bearer + action_id + idempotency_key."""
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    body = payload or {}
    action_id = str(body.get("action_id", "") or "")
    if not action_id:
        return _error(422, "missing_fields", "action_id required.")
    idempotency_key = body.get("idempotency_key")
    try:
        return bond_service.apply_observed_progress(
            token,
            action_id,
            str(idempotency_key) if idempotency_key else None,
        )
    except errors.SessionNotFound:
        return _error(404, "unknown_session", "Unknown session.")
    except errors.SessionExpired:
        return _error(410, "demo_session_expired", "Session expired.", True)
    except (UnknownAction, StaleRevision, OutOfOrder, NotBootstrapped) as exc:
        return _map_progress(exc)
    except RuntimeError as exc:
        return _error(503, "demo_storage_unavailable", str(exc), True)


@router.post("/recorded-turn")
async def start_recorded_turn(payload: Optional[dict] = None):
    """Start one recorded journey turn on a REAL meeting via shared TurnEngine.

    C0 vertical slice: submit_bond_question (search-only) streams chunked
    text_delta frames before turn_completed on the NORMAL turn SSE journal.
    Returns turn_id + events_url (/api/meetings/turns/{turn_id}/events).
    """
    body = payload or {}
    meeting_id = str(body.get("meeting_id", "") or "")
    action_id = str(body.get("action_id", "") or "")
    idempotency_key = body.get("idempotency_key")
    if not meeting_id or not action_id:
        return _error(422, "missing_fields", "meeting_id and action_id required.")
    try:
        result = await bond_service.start_demo_recorded_turn(
            meeting_id=meeting_id,
            action_id=action_id,
            idempotency_key=str(idempotency_key) if idempotency_key else None,
        )
    except UnknownAction as exc:
        return _error(404, "unknown_action", str(exc))
    except ValueError as exc:
        return _error(404, "meeting_not_found", str(exc))
    except RuntimeError as exc:
        msg = str(exc)
        if "tool_result_mismatch" in msg or "TurnFailure" in type(exc).__name__:
            return _error(409, "tool_result_mismatch", msg, True)
        if "reservation" in msg or "reserved" in msg:
            return _error(503, "demo_turn_unavailable", msg, True)
        return _error(503, "demo_storage_unavailable", msg, True)
    return JSONResponse(status_code=202, content=result)


@router.get("/session")
async def get_demo_session(request: Request):
    token = _bearer(request)
    if token is None:
        return _error(401, "unauthenticated", "Missing bearer token.")
    try:
        record = bond_service.sessions().get_by_token(token)
        view = bond_service.progress().get(record.session_id, record.generation)
        state = {
            "session_id": view.session_id,
            "generation": view.generation,
            "meeting_id": view.meeting_id,
            "current_meeting_id": view.meeting_id,
            "stage": view.stage,
            "specialists": list(view.specialists),
            "completed": list(view.completed),
            "failed": view.failed,
            "turn_reference": view.turn_reference,
        }
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
