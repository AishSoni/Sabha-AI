"""Ports and typed failures for operator access (spec-22)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class VerifiedIdentity:
    """The user id returned by the configured Auth project."""

    user_id: str


@runtime_checkable
class AccessVerifier(Protocol):
    """Verify a bearer token against the configured Supabase Auth project."""

    async def verify(self, access_token: str) -> VerifiedIdentity:
        ...


class InvalidAccessToken(Exception):
    """The token is missing, malformed, expired, tampered or from elsewhere."""


class OperatorDenied(Exception):
    """The token is valid but its user is not the configured operator."""


class AccessUnavailable(Exception):
    """Auth could not be reached or answered outside the trusted contract."""
