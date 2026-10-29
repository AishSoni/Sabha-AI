"""Outbound HTTP policy for the server-side Supabase clients.

``httpx`` keeps connections alive between requests. Supabase's edge — and any
TLS-inspecting proxy or firewall in front of it — can close an idle or half-open
connection without telling the client's pool. The next request that reuses that
connection then dies inside the TLS layer, before a response exists::

    httpcore.WriteError: EOF occurred in violation of protocol (_ssl.c:2427)

That is a transport race, not an application error: the request was never
delivered, so replaying it on a fresh connection is both safe and cheap. Every
database call in this backend is a Supabase REST/RPC round trip through one
long-lived pool, so without a retry a single network blip surfaces as a 500 (or,
for the turn runner, as a warning on every poll).

Only errors that prove no response was produced are retried. Read errors and
read timeouts are *not* retried: the server may already have committed the
write, and these clients call mutating RPCs (claim, publish, fail, cancel).
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

#: Raised before the server could produce a response, therefore replayable.
#: - ConnectError/ConnectTimeout: the connection never carried the request.
#: - WriteError: the pooled connection was already dead while headers were
#:   written; nothing reached the server.
#: - RemoteProtocolError: the peer closed the connection without responding
#:   (the HTTP/1.1 shape of the same race).
RETRYABLE_TRANSPORT_ERRORS: tuple[type[Exception], ...] = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.WriteError,
    httpx.RemoteProtocolError,
)

_DEFAULT = object()


def _is_replayable(request: httpx.Request) -> bool:
    """A request can be sent twice only if its body can be re-read."""
    try:
        request.content
    except httpx.RequestNotRead:
        return False
    return True


class RetryingClient(httpx.Client):
    """``httpx.Client`` that survives a dead pooled connection.

    The retry lives at the client boundary so every Supabase call site
    (PostgREST, storage, auth, functions) inherits it without opting in.
    """

    def __init__(
        self,
        *,
        max_attempts: int = 3,
        backoff_seconds: float = 0.05,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._max_attempts = max(1, int(max_attempts))
        self._backoff_seconds = max(0.0, float(backoff_seconds))

    def send(  # type: ignore[override]
        self,
        request: httpx.Request,
        *,
        stream: bool = False,
        auth: Any = _DEFAULT,
        follow_redirects: Any = _DEFAULT,
    ) -> httpx.Response:
        kwargs: dict[str, Any] = {"stream": stream}
        if auth is not _DEFAULT:
            kwargs["auth"] = auth
        if follow_redirects is not _DEFAULT:
            kwargs["follow_redirects"] = follow_redirects

        attempt = 0
        while True:
            attempt += 1
            try:
                return super().send(request, **kwargs)
            except RETRYABLE_TRANSPORT_ERRORS as exc:
                if attempt >= self._max_attempts or not _is_replayable(request):
                    raise
                delay = self._backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "Supabase transport error on %s %s (%s: %s); "
                    "retrying in %.2fs (attempt %d/%d)",
                    request.method,
                    request.url.copy_with(query=None),
                    type(exc).__name__,
                    exc,
                    delay,
                    attempt + 1,
                    self._max_attempts,
                )
                time.sleep(delay)


def build_client(
    *,
    timeout_seconds: float,
    max_connections: int,
    keepalive_seconds: float,
    retries: int,
) -> httpx.Client:
    """Build the one HTTP client shared by every Supabase sub-client."""
    connections = max(1, int(max_connections))
    return RetryingClient(
        max_attempts=max(1, int(retries) + 1),
        timeout=httpx.Timeout(max(1.0, float(timeout_seconds))),
        limits=httpx.Limits(
            max_connections=connections,
            max_keepalive_connections=connections,
            keepalive_expiry=max(1.0, float(keepalive_seconds)),
        ),
        # Multiplexing keeps RPC latency stable; the retry above covers the
        # stale-connection race this protocol makes visible on write.
        http2=True,
        follow_redirects=True,
    )
