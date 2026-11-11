"""Current authored package copy and validation (spec 46)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.replay.package import load_package, validate_package
from app.replay.package.loader import compute_content_sha256
from scripts.build_guided_package import COPY_PROFILE_POLISH, workspace_seed

BACKEND = Path(__file__).resolve().parents[2]
CURRENT_ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v12"
CONTENT_SHA256 = "37438db307f3fc99d69b30d8efbc38d86592988b9ed208bec4420968269d81ba"
SEED_SHA256 = "ff9154e0a34cd1459e28154914d238d59aa0259eb66247f4a3564c7257d43e9d"

BANNED = (
    "Skip to prepared result",
    "Replay this prepared turn",
    "Resume guided journey",
    "Guided replay",
    "Start guided replay",
    "Practice setup created",
    "Practice setup",
    "Try editing this setup",
    "Create practice setup",
    "Open practice setup",
    "Documents in this step",
    "Chapters and inspection screens",
    "Continue (acknowledge)",
    "Review the formal disagreement",
    "Review the formal consensus",
    "This meeting is read-only.",
    "Try the recorded demo",
    "Prepared demo",
    "Recorded session",
    "Recorded summary",
    "Recorded closing",
    "Replay last turn",
    "Prepared for this replay",
    "Prepared participants",
    "Prepared setup",
    "Recorded meeting",
    "Recorded creation",
    "Recorded intake",
    "Recorded board",
    "Recorded evidence",
    "Recorded replay",
    "Recording creation",
)


def _read_json(relative: str) -> dict:
    return json.loads((CURRENT_ROOT / relative).read_text(encoding="utf-8"))


def test_current_package_is_valid_and_hash_pinned() -> None:
    package = load_package(CURRENT_ROOT)
    assert validate_package(package) == []
    assert package.manifest.version == "12"
    assert package.manifest.content_sha256 == CONTENT_SHA256
    assert package.manifest.workspace_seed_sha256 == SEED_SHA256

    file_hashes = {
        path.relative_to(CURRENT_ROOT).as_posix(): hashlib.sha256(
            path.read_bytes()
        ).hexdigest()
        for path in CURRENT_ROOT.rglob("*")
        if path.is_file()
    }
    assert (
        compute_content_sha256(file_hashes, _read_json("manifest.json"))
        == CONTENT_SHA256
    )


def test_current_package_has_no_retired_copy_or_practice_setups() -> None:
    for path in CURRENT_ROOT.rglob("*"):
        if path.is_file() and path.suffix in {".json", ".jsonl", ".md"}:
            text = path.read_text(encoding="utf-8")
            for phrase in BANNED:
                assert phrase not in text, f"{phrase!r} remains in {path.name}"

    seed = _read_json("workspace_seed.json")
    assert "practice_setups" not in seed
    assert seed["disclosure"]["practice"].startswith("Workspace changes live")

    labels = {
        step["step_id"]: step["label"]
        for beat in _read_json("manifest.json")["beats"]
        for step in beat["steps"]
    }
    assert labels["review-disagreement"] == "Review the disagreement"
    assert labels["review-consensus"] == "Review the consensus"


def test_legacy_copy_profile_remains_available_for_historical_builders() -> None:
    legacy = workspace_seed()
    assert legacy["practice_setups"][0]["setup_id"] == "practice-intake"
    assert legacy["disclosure"]["practice"].startswith("Practice changes")

    polish = workspace_seed(copy_profile=COPY_PROFILE_POLISH)
    assert "practice_setups" not in polish
    assert polish["disclosure"]["practice"].startswith("Workspace changes")
