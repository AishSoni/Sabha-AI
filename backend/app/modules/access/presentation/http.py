"""The single operator gate for every live HTTP route (spec-22)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.modules.access.application.contracts import (
    AccessUnavailable,
    InvalidAccessToken,
    OperatorDenied,
    VerifiedIdentity,
)
from app.modules.access.application.guard import OperatorGuard

_UNAUTHORIZED_DETAIL = "Operator authentication required"
_FORBIDDEN_DETAIL = "Operator access denied"
_UNAVAILABLE_DETAIL = "Access verification unavailable"

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="OperatorBearer",
    description="Supabase access token for the configured Sabha operator.",
)

UNAUTHORIZED_RESPONSE = {
    "description": "Missing, malformed, expired, tampered or wrong-project token",
    "content": {
        "application/json": {"example": {"detail": _UNAUTHORIZED_DETAIL}}
    },
}
FORBIDDEN_RESPONSE = {
    "description": "A valid account that is not the configured operator",
    "content": {"application/json": {"example": {"detail": _FORBIDDEN_DETAIL}}},
}
UNAVAILABLE_RESPONSE = {
    "description": "Auth verification could not be completed safely",
    "content": {"application/json": {"example": {"detail": _UNAVAILABLE_DETAIL}}},
}

router = APIRouter(prefix="/api/access", tags=["access"])


async def require_operator_access(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> VerifiedIdentity:
    """Admission check shared by every live module router."""

    guard: OperatorGuard | None = getattr(request.app.state, "access", None)
    if guard is None:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail=_UNAUTHORIZED_DETAIL,
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return await guard.authenticate(credentials.credentials)
    except InvalidAccessToken:
        raise HTTPException(
            status_code=401,
            detail=_UNAUTHORIZED_DETAIL,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except OperatorDenied:
        raise HTTPException(status_code=403, detail=_FORBIDDEN_DETAIL)
    except AccessUnavailable:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)


@router.get("/session")
async def access_session(
    _identity: VerifiedIdentity = Depends(require_operator_access),
):
    """Authoritative admission probe; returns no workspace or provider data."""

    return {"authorized": True}
