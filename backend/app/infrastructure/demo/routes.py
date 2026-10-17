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

