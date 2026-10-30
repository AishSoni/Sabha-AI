"""Exact-operator policy (spec-22).

Positive authorization is never cached: every live request asks the
configured Auth project who the token belongs to, then compares that id with
the one deployment setting. A decoded claim is never trusted as identity.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.modules.access.application.contracts import (
    AccessVerifier,
    OperatorDenied,
    VerifiedIdentity,
)


@dataclass(frozen=True)
class OperatorGuard:
    verifier: AccessVerifier
    operator_user_id: str

    async def authenticate(self, access_token: str) -> VerifiedIdentity:
        identity = await self.verifier.verify(access_token)
        if not _same_uuid(identity.user_id, self.operator_user_id):
            raise OperatorDenied()
        return identity

    async def aclose(self) -> None:
        closer = getattr(self.verifier, "aclose", None)
        if closer is not None:
            await closer()


def _same_uuid(left: str, right: str) -> bool:
    try:
        return UUID(str(left)) == UUID(str(right))
    except (ValueError, AttributeError, TypeError):
        return False
