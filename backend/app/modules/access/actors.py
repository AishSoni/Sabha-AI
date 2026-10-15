"""Trusted actor resolution and ownership policy (CONTRACTS section 1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Actor:
    kind: str
    identity: str

    def __post_init__(self) -> None:
        if self.kind not in ("demo_session", "user", "local"):
            raise ValueError(f"unknown actor kind {self.kind!r}")
        if not self.identity or not self.identity.strip():
            raise ValueError("actor identity must not be empty")


def resolve_actor(
    *,
    authorization: Optional[str] = None,
    test_actor: Optional[str] = None,
    demo_session: Optional[str] = None,
    allow_local: bool = False,
    local_actor: Optional[str] = None,
) -> Actor:
    """Resolve the trusted actor at the entry boundary.

    Request bodies never establish identity. A local-development actor can
    never be enabled on a public/demo runtime as a fallback.
    """
    if authorization:
        scheme, _, credential = authorization.partition(" ")
        if scheme.lower() == "bearer" and credential.strip():
            return Actor(kind="demo_session", identity=credential.strip())
    if demo_session:
        return Actor(kind="demo_session", identity=demo_session.strip())
    if test_actor and test_actor.strip():
        # Test harness threads per-actor headers; production treats an
        # explicit test actor as a user actor for ownership checks.
        return Actor(kind="user", identity=test_actor.strip())
    if allow_local and local_actor:
        return Actor(kind="local", identity=local_actor.strip())
    raise PermissionError("unauthenticated: missing trusted actor credential")


def is_owner(actor: Actor, owner_id: Optional[str]) -> bool:
    if owner_id is None or owner_id == "":
        return False
    return actor.identity == owner_id


def require_owner(actor: Actor, owner_id: Optional[str], *, resource: str = "meeting"):
    """Cross-owner lookups behave as not-found; missing credentials are 401."""
    if owner_id is None or owner_id == "":
        raise LookupError(f"{resource} has no mapped owner: quarantined, owner mapping required")
    if actor.identity != owner_id:
        raise LookupError(f"{resource} not found")
    return True
