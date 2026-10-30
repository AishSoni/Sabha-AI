"""Async Supabase Auth verifier (spec-22).

Uses the project's ``/auth/v1/user`` endpoint with the public API key and the
caller's bearer token. The adapter owns a bounded async connection pool, never
follows redirects, never caches a positive result and never touches the shared
service-role database client. Any transport/5xx/malformed response is a
service failure (503 at the HTTP boundary), not a denial.
"""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

import httpx

from app.modules.access.application.contracts import (
    AccessUnavailable,
    InvalidAccessToken,
    VerifiedIdentity,
)

_INVALID_STATUSES = frozenset({400, 401, 403})
_SAFE_USER_AGENT = "sabha-operator-access/1.0"


class SupabaseAuthVerifier:
    """Verify tokens against one configured Supabase project."""

    def __init__(
        self,
        *,
        supabase_url: str,
        publishable_key: str,
        timeout_seconds: float,
        max_connections: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._user_url = f"{supabase_url.rstrip('/')}/auth/v1/user"
        self._publishable_key = publishable_key
        self._timeout_seconds = timeout_seconds
        self._max_connections = max_connections
        self._transport = transport
        # httpx pools belong to an event loop. Production runs one loop; tests
        # may build several through TestClient, so key the pool by loop and
        # close every client on shutdown.
        self._clients: dict[int, httpx.AsyncClient] = {}

    async def verify(self, access_token: str) -> VerifiedIdentity:
        token = (access_token or "").strip()
        if not token:
            raise InvalidAccessToken()

        client = self._client_for_loop()
        try:
            response = await client.get(
                self._user_url,
                headers={
                    "apikey": self._publishable_key,
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "User-Agent": _SAFE_USER_AGENT,
                },
            )
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPError) as exc:
            raise AccessUnavailable() from exc

        if response.status_code in _INVALID_STATUSES:
            raise InvalidAccessToken()
        if response.status_code != 200:
            raise AccessUnavailable()

        payload = _json_object(response)
        user_id = payload.get("id") if payload is not None else None
        if not isinstance(user_id, str):
            raise AccessUnavailable()
        try:
            canonical = str(UUID(user_id))
        except (ValueError, AttributeError, TypeError) as exc:
            raise AccessUnavailable() from exc
        return VerifiedIdentity(user_id=canonical)

    async def aclose(self) -> None:
        clients = list(self._clients.values())
        self._clients.clear()
        for client in clients:
            try:
                await client.aclose()
            except Exception:  # noqa: BLE001 - shutdown must not mask the app stop
                pass

    def _client_for_loop(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        key = id(loop)
        client = self._clients.get(key)
        if client is None:
            client = httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout_seconds),
                limits=httpx.Limits(
                    max_connections=self._max_connections,
                    max_keepalive_connections=self._max_connections,
                ),
                follow_redirects=False,
                transport=self._transport,
            )
            self._clients[key] = client
        return client


def _json_object(response: httpx.Response) -> dict[str, Any] | None:
    try:
        payload = response.json()
    except (ValueError, UnicodeDecodeError):
        return None
    return payload if isinstance(payload, dict) else None
