"""Typed demo-runtime errors (safe codes only, no secrets or content).

Plain `Exception` subclasses (deliberately not dataclasses: tracebacks must
stay assignable). Carries a stable `code`, a fixed message, an HTTP
`status_hint` for later route wiring, and structured detail for quotas.
"""

from typing import Any, Optional


class DemoRuntimeError(Exception):
    code = "demo_runtime_error"
    message = "demo runtime error"
    status_hint = 400

    def __init__(self, **extra: Any) -> None:
        super().__init__(self.message)
        self.extra = dict(extra)

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "retryable": False}


class SessionNotFound(DemoRuntimeError):
    code = "demo_session_not_found"
    message = "demo session not found"
    status_hint = 404


class SessionExpired(DemoRuntimeError):
    code = "demo_session_expired"
    message = "demo session expired"
    status_hint = 410


class StaleGeneration(DemoRuntimeError):
    code = "demo_stale_generation"
    message = "stale session generation"
    status_hint = 409

    def __init__(self, *, expected: int = 0, got: int = 0) -> None:
        super().__init__(expected=expected, got=got)
        self.expected = expected
        self.got = got


class ScenarioConflict(DemoRuntimeError):
    code = "demo_scenario_conflict"
    message = "session is already bound to a different scenario"
    status_hint = 409


class QuotaExceeded(DemoRuntimeError):
    code = "demo_quota_exceeded"
    message = "demo quota exceeded"
    status_hint = 429

    def __init__(
        self,
        *,
        scope: str = "",
        limit: int = 0,
        retry_after_s: Optional[int] = None,
    ) -> None:
        super().__init__(scope=scope, limit=limit, retry_after_s=retry_after_s)
        self.scope = scope
        self.limit = limit
        self.retry_after_s = retry_after_s

    def to_dict(self) -> dict[str, Any]:
        body = super().to_dict()
        body["details"] = {"scope": self.scope, "limit": self.limit}
        if self.retry_after_s is not None:
            body["details"]["retry_after_s"] = self.retry_after_s
        return body
