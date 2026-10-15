"""Disabled public demo entry (scaffold only, never serves the journey).

All handlers return typed unavailable. Client mode or provider overrides
cannot enable a live fallback; the real bootstrap/actions are Phase 10 work.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


def _unavailable(capability: str):
    return JSONResponse(
        status_code=503,
        content={
            "code": "demo_unavailable",
            "message": f"demo capability unavailable: {capability}",
            "retryable": False,
            "details": {"capability": capability},
        },
    )


@router.post("/sessions")
async def create_demo_session(_payload: dict | None = None):
    return _unavailable("real_scenario_bootstrap")


@router.get("/session")
async def get_demo_session():
    return _unavailable("real_scenario_bootstrap")


@router.post("/reset")
async def reset_demo_session(_payload: dict | None = None):
    return _unavailable("real_scenario_bootstrap")


@router.post("/actions")
async def demo_action(_payload: dict | None = None):
    return _unavailable("guided_actions")
