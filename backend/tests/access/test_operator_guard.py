"""Only the exact configured operator id is admitted."""

from __future__ import annotations

import pytest

from app.modules.access.application.contracts import OperatorDenied, VerifiedIdentity
from app.modules.access.application.guard import OperatorGuard

OPERATOR_ID = "11111111-1111-4111-8111-111111111111"


class FakeVerifier:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.closed = False

    async def verify(self, access_token: str) -> VerifiedIdentity:
        return VerifiedIdentity(user_id=self.user_id)

    async def aclose(self) -> None:
        self.closed = True


async def test_configured_operator_is_admitted():
    guard = OperatorGuard(FakeVerifier(OPERATOR_ID), OPERATOR_ID)
    identity = await guard.authenticate("token")
    assert identity.user_id == OPERATOR_ID


async def test_uuid_formatting_does_not_change_identity():
    guard = OperatorGuard(FakeVerifier(OPERATOR_ID.upper()), OPERATOR_ID)
    await guard.authenticate("token")


async def test_valid_non_operator_is_denied():
    other = "22222222-2222-4222-8222-222222222222"
    guard = OperatorGuard(FakeVerifier(other), OPERATOR_ID)
    with pytest.raises(OperatorDenied):
        await guard.authenticate("token")


async def test_a_non_uuid_identity_cannot_match():
    guard = OperatorGuard(FakeVerifier("operator@example.com"), OPERATOR_ID)
    with pytest.raises(OperatorDenied):
        await guard.authenticate("token")


async def test_guard_closes_the_verifier():
    verifier = FakeVerifier(OPERATOR_ID)
    guard = OperatorGuard(verifier, OPERATOR_ID)
    await guard.aclose()
    assert verifier.closed is True
