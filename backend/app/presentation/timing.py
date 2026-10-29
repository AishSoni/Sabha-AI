"""Per-request timing and database-operation accounting (spec-20).

Implemented as pure ASGI middleware rather than ``BaseHTTPMiddleware``:
Starlette runs the downstream app in a child task for the latter, so
context variables written by a handler would not be visible here when the
response finishes. Pure ASGI keeps the handler in the same task, which is what
makes the ``db_ops`` count trustworthy.

The log line is intentionally one record per request. It is the production
counterpart of the round-trip budget tests: an operator can see how many
blocking database operations a slow endpoint issued without turning on a
profiler.
"""

from __future__ import annotations

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.platform.blocking import (
    request_db_max_ms,
    request_db_ops,
    request_db_total_ms,
    reset_request_counters,
)

logger = logging.getLogger("sabha.perf")


class RequestTimingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        reset_request_counters()
        started = time.perf_counter()
        status = 500

        async def _send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message.get("status", 500))
            await send(message)

        try:
            await self.app(scope, receive, _send)
        finally:
            duration_ms = (time.perf_counter() - started) * 1000.0
            logger.info(
                "request method=%s path=%s status=%s duration_ms=%.1f "
                "db_ops=%d db_ms=%.1f db_max_ms=%.1f",
                scope.get("method", ""),
                scope.get("path", ""),
                status,
                duration_ms,
                request_db_ops(),
                request_db_total_ms(),
                request_db_max_ms(),
            )
