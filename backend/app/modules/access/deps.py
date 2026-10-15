"""FastAPI entry-boundary actor resolution (CONTRACTS section 1).

Identity is resolved here, never from request bodies. Lookup failures map to
generic not-found so cross-owner IDs are indistinguishable from unknown IDs.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, Request

from app.modules.access.actors import Actor, require_owner, resolve_actor


async def require_actor(
    request: Request,
    x_test_actor: Optional[str] = Header(default=None, alias="X-Test-Actor"),
) -> Actor:
    """Resolve the trusted caller or reject with 401."""
    try:
        return resolve_actor(
            authorization=request.headers.get("authorization"),
            test_actor=x_test_actor,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc


def owner_or_404(actor: Actor, owner_id: Optional[str]) -> None:
    """Enforce ownership; cross-owner and ownerless read as not-found."""
    try:
        require_owner(actor, owner_id, resource="meeting")
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Meeting not found") from exc
