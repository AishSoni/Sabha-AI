"""Demo write denial as a live-router dependency (spec-01/spec-22).

The dependency runs after operator admission, so an unauthenticated request
still receives 401 even in demo mode; an admitted operator receives the
existing read-only 403 before body validation or any adapter dispatch.
Replay has its own independent read-only guard.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.platform.config import settings

_DEMO_DETAIL = "Demo workspace is read-only — mutations are disabled"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


async def deny_demo_writes(request: Request) -> None:
    if settings.runtime_mode == "demo" and request.method.upper() not in _SAFE_METHODS:
        raise HTTPException(status_code=403, detail=_DEMO_DETAIL)
