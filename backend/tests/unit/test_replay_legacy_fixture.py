"""Checked-in version-5 package fixture (spec-27).

The original approved package must remain reproducible from a clean checkout.
It is kept as a test fixture so compatibility acceptance never depends on Git
history or a mutable published package.
"""

from pathlib import Path

from app.replay.package import load_package

BACKEND_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = (
    BACKEND_ROOT
    / "tests"
    / "fixtures"
    / "replay"
    / "hdfc-ine001a07rw5-v5"
)
APPROVED_SHA256 = "005a274a178ed7489bb108d7703d833316ac9e1933093866ec87040340f65d8f"


def test_version_five_fixture_retains_the_approved_identity() -> None:
    package = load_package(FIXTURE)

    assert package.manifest.package_id == "hdfc-ine001a07rw5"
    assert package.manifest.version == "5"
    assert package.manifest.schema_version == 2
    assert package.manifest.content_sha256 == APPROVED_SHA256
    assert package.manifest.meeting_id == "a0000000-0000-4000-8000-000000000001"


def test_version_five_fixture_has_no_expanded_chapters_or_branches() -> None:
    package = load_package(FIXTURE)

    assert package.manifest.chapters == []
    assert package.manifest.transitions == []
    assert len(package.manifest.beats) == 8
