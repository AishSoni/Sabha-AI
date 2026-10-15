"""Idempotent lifecycle cleanup (P08-T05).

Expiry/reset sweeps remove mutable session records only. The store holds
identifiers and counters — never fixture content — so shared fixtures are
preserved by construction; the sweep report states that explicitly for the
evidence record. Sweeps are safe to rerun and to race with finalization: a
second pass finds nothing to remove.
"""

from typing import Any, Optional

from app.infrastructure.demo.runtime import DemoSessionStore


def run_retention_sweep(
    store: DemoSessionStore, *, now: Optional[float] = None
) -> dict[str, Any]:
    """Remove expired sessions; report counts plus fixture preservation."""
    result = store.sweep(now=now)
    return {
        "removed": result["removed"],
        "kept": result["kept"],
        "failed_cleanups": result["failed_cleanups"],
        # Sessions reference fixtures by ID; sweep deletes session rows,
        # never fixture content.
        "fixtures_preserved": True,
    }
