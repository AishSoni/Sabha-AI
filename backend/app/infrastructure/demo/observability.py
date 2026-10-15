"""Operational evidence: structured logs, health, safe headers (P08-T06).

Logs carry correlation identifiers and safe error codes only. There is no
token/secret/content parameter on `log_event` by design, so credentials
cannot leak through this path. Readiness checks never probe paid providers
(`paid_probes` is always empty; dependencies are local store + fixtures).
"""

import json
import logging
from typing import Any, Optional

from app.infrastructure.demo.runtime import DemoSessionStore

logger = logging.getLogger("sabha.demo")

_DETAIL_BUDGET = 500


def log_event(
    target: logging.Logger = logger,
    *,
    event: str,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meeting_id: Optional[str] = None,
    turn_id: Optional[str] = None,
    job_id: Optional[str] = None,
    code: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Emit one JSON log line with allowlisted fields only."""
    payload: dict[str, Any] = {"event": event}
    for key, value in (
        ("request_id", request_id),
        ("session_id", session_id),
        ("meeting_id", meeting_id),
        ("turn_id", turn_id),
        ("job_id", job_id),
        ("code", code),
    ):
        if value is not None:
            payload[key] = value
    if detail is not None:
        payload["detail"] = detail[:_DETAIL_BUDGET]
    target.info(json.dumps(payload, sort_keys=True))


def build_health(store: DemoSessionStore) -> dict[str, Any]:
    """Local readiness: backlog, cleanup failures, pending expiry. No probes."""
    stats = store.stats()
    degraded = stats["failed_cleanups"] > 0
    return {
        "status": "degraded" if degraded else "ready",
        "active_sessions": stats["active_sessions"],
        "expired_pending": stats["expired_pending"],
        "failed_cleanups": stats["failed_cleanups"],
        "total_issued": stats["total_issued"],
        "total_resets": stats["total_resets"],
        "denials": stats["denials"],
        # Readiness never dials a metered provider; always empty by policy.
        "paid_probes": [],
    }


def private_no_store_headers() -> dict[str, str]:
    """Non-cacheable headers for session-specific/credential responses."""
    return {"Cache-Control": "no-store, private", "Pragma": "no-cache"}
