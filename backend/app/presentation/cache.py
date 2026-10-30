"""Private-response cache policy for the live API (spec-22).

Every live response — JSON, document bytes, probes and streams — is marked
private and non-storable. Replay responses keep their own public package
policy. The middleware is pure ASGI so streaming responses are not buffered.
"""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_PRIVATE_CACHE = "private, no-store"


class PrivateApiCacheMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._is_private(scope):
            await self.app(scope, receive, send)
            return

        async def send_with_policy(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = _PRIVATE_CACHE
            await send(message)

        await self.app(scope, receive, send_with_policy)

    @staticmethod
    def _is_private(scope: Scope) -> bool:
        if scope.get("type") != "http":
            return False
        if scope.get("method") == "OPTIONS":
            return False
        path = scope.get("path", "")
        if path != "/api" and not path.startswith("/api/"):
            return False
        return not path.startswith("/api/replay")
