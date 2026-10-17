"""Part B source artifacts: original reference PDFs are saved and intact.

Offline only: reads repo-local bytes, computes hashes, never touches the
network (conftest guard enforces this).
"""

import hashlib
import json
from pathlib import Path

SOURCES_DIR = Path(__file__).resolve().parents[3] / "untracked-bond-research"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_original_pdfs_are_saved_with_recorded_hashes():
    manifest = json.loads((SOURCES_DIR / "MANIFEST.json").read_text())
    assert manifest["scenario_id"] == "indian-corporate-bond-review"
    assert len(manifest["artifacts"]) == 2
    for entry in manifest["artifacts"]:
        local = SOURCES_DIR / entry["file"]
        assert local.is_file(), f"original artifact missing: {entry['file']}"
        assert local.stat().st_size == entry["bytes"]
        assert _sha256(local) == entry["sha256"]
        assert entry["url"].startswith("https://")


def test_saved_pdfs_match_prework_inventory():
    assert _sha256(SOURCES_DIR / "TS-V-007.pdf") == (
        "84626479b4b37f25c7b2b2d2ade69ca3e51efcc0da88af93c8970433cfd16a26"
    )
    assert _sha256(SOURCES_DIR / "SE-V007-intimation-150719.pdf") == (
        "56c940b6dce4d11fd562ac8c5bf25e5ae4ee5c60240020f9875d3f4a88525835"
    )


def test_manifest_is_honest_about_what_is_missing():
    manifest = json.loads((SOURCES_DIR / "MANIFEST.json").read_text())
    notes = " ".join(manifest["notes"])
    assert "never saved as byte artifacts" in notes
    assert "No live fetch" in notes
