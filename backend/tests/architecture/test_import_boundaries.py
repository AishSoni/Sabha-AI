"""Real-tree boundary tests for the spec-03 import contracts.

The engine is validated on synthetic trees by the meta suite; these
checks bind it to the living repository:

- The legacy SDK anchors are recorded as accepted-for-now violations so
  their removal has a test to fail (the extraction in the next slice is
  about resolve_generation_settings, not about these).
- Every modular root that exists (modules/*/domain, application,
  capabilities/*) must come out clean — the scan starts empty and
  activates as the first roots land.
"""

from pathlib import Path

import pytest

from tests.architecture.checker import (
    check_file,
    direct_sdk_roots,
    modular_roots,
    scan_sdk_reach,
)

pytestmark = pytest.mark.architecture

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def test_legacy_database_anchor_still_carries_the_supabase_root():
    roots = direct_sdk_roots(BACKEND_ROOT / "app" / "core" / "database.py", BACKEND_ROOT)
    assert roots == ["supabase"], "the legacy adapter state changed; re-record the anchor"


def test_legacy_service_anchors_reach_supabase_transitively_today():
    for service in ("orchestrator.py", "meeting_manager.py"):
        hits = scan_sdk_reach(
            BACKEND_ROOT / "app" / "services" / service, BACKEND_ROOT
        )
        supabase_hits = [hit for hit in hits if hit.sdk_root == "supabase"]
        assert supabase_hits, f"the checker lost the legacy reach from {service}"
        chains = [hit.render() for hit in supabase_hits]
        assert all("database.py" in chain for chain in chains), chains


def test_modular_roots_respect_their_rules():
    scanned = modular_roots(BACKEND_ROOT)
    if not scanned:
        pytest.skip(
            "no modular roots exist yet — the meta suite proves the engine; "
            "this scan activates with the first modules/*/domain, application "
            "or capabilities/* file"
        )
    offenders = []
    for path, policy in scanned:
        for violation in check_file(path, policy, BACKEND_ROOT, check_reach=True):
            offenders.append(str(violation))
    assert offenders == [], "\n".join(offenders)
