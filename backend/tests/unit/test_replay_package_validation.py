"""Validation failures for data-only replay packages (spec-17)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.replay.package import (
    PackageLoadError,
    load_package,
    validate_package,
)

BACKEND = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = BACKEND / "replay_packages" / "placeholder-analyst"
FIXTURES = BACKEND / "tests" / "fixtures" / "replay"


def _load(root: Path):
    package = load_package(root)
    return package, {issue.code for issue in validate_package(package)}


def _copy(tmp_path: Path) -> Path:
    destination = tmp_path / "package"
    shutil.copytree(PACKAGE_ROOT, destination)
    return destination


def _edit_json(root: Path, relative: str, mutate) -> None:
    path = root / relative
    payload = json.loads(path.read_text(encoding="utf-8"))
    mutate(payload)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def test_checked_in_packages_are_valid() -> None:
    for root in (
        PACKAGE_ROOT,
        FIXTURES / "fixture-minimal",
        FIXTURES / "fixture-minimal-v2",
    ):
        _, codes = _load(root)
        assert codes == set(), root


def test_content_hash_mismatch_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "checkpoints/checkpoint-initial.json",
        lambda payload: payload["reads"]["safe_config"]["settings"].update(
            {"notice": "tampered after validation"}
        ),
    )
    _, codes = _load(root)
    assert "hash_mismatch" in codes


def test_unsupported_schema_version_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(root, "manifest.json", lambda payload: payload.update({"schema_version": 99}))
    _, codes = _load(root)
    assert "unsupported_version" in codes


def test_missing_asset_file_is_a_load_failure(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    (root / "assets" / "synthetic-issuer-brief.md").unlink()
    with pytest.raises(PackageLoadError) as excinfo:
        load_package(root)
    assert any(issue.code == "missing_asset" for issue in excinfo.value.issues)


def test_asset_hash_and_size_must_match(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    with (root / "assets" / "synthetic-issuer-brief.md").open("ab") as handle:
        handle.write(b"tampered")
    _, codes = _load(root)
    assert {"hash_mismatch", "size_mismatch"} <= codes


def test_dangling_final_message_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def remove_final(payload):
        payload["reads"]["meeting"]["messages"] = [
            message
            for message in payload["reads"]["meeting"]["messages"]
            if message["id"] != "77777777-7777-4777-8777-777777777777"
        ]

    _edit_json(root, "checkpoints/checkpoint-completed.json", remove_final)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_terminal_content_in_the_active_checkpoint_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    completed = json.loads(
        (root / "checkpoints" / "checkpoint-completed.json").read_text(encoding="utf-8")
    )
    final = next(
        message
        for message in completed["reads"]["meeting"]["messages"]
        if message["id"] == "77777777-7777-4777-8777-777777777777"
    )
    _edit_json(
        root,
        "checkpoints/checkpoint-active.json",
        lambda payload: payload["reads"]["meeting"]["messages"].append(final),
    )
    _, codes = _load(root)
    assert "premature_terminal" in codes


def test_terminal_text_must_match_the_canonical_message(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "tapes/tape-credit-analyst.json",
        lambda payload: payload["events"][-2]["payload"].update(
            {"content": "A different ending."}
        ),
    )
    _, codes = _load(root)
    assert "mismatched_terminal" in codes


def test_tool_call_must_be_paired(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "tapes/tape-credit-analyst.json",
        lambda payload: payload.update(
            {"events": [event for event in payload["events"] if event["type"] != "tool_result"]}
        ),
    )
    _, codes = _load(root)
    assert "unpaired_tool" in codes


def test_duplicate_sequence_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def duplicate(payload):
        payload["events"][1]["sequence"] = payload["events"][0]["sequence"]

    _edit_json(root, "tapes/tape-credit-analyst.json", duplicate)
    _, codes = _load(root)
    assert "duplicate_sequence" in codes


def test_private_retrieval_requires_the_participant_stack(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def ineligible(payload):
        payload["scope"] = "private"
        payload["stack_id"] = "stack-not-on-the-participant"

    _edit_json(root, "retrieval/retrieval-credit-analyst.json", ineligible)
    _, codes = _load(root)
    assert "ineligible_retrieval" in codes


def test_closing_policy_must_accept_the_recorded_outcome(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def reject_outcome(payload):
        payload["reads"]["closing"]["votes"][0]["vote"] = False

    _edit_json(root, "checkpoints/checkpoint-closed.json", reject_outcome)
    _, codes = _load(root)
    assert "policy_conflict" in codes


def test_closing_text_must_match_the_snapshot(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "closing_tapes/tape-closing.json",
        lambda payload: payload["events"][1].update({"text": "Yes — something else."}),
    )
    _, codes = _load(root)
    assert "mismatched_terminal" in codes


def test_secret_fields_are_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "checkpoints/checkpoint-initial.json",
        lambda payload: payload["reads"]["safe_config"].update({"api_key": "sk-test"}),
    )
    _, codes = _load(root)
    assert "forbidden_field" in codes


def test_synthetic_cost_is_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def invent_cost(payload):
        payload["reads"]["meeting"]["total_cost"] = 1.25

    _edit_json(root, "checkpoints/checkpoint-completed.json", invent_cost)
    _, codes = _load(root)
    assert "synthetic_cost" in codes


def test_duplicate_checkpoint_ordinals_are_rejected(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "checkpoints/checkpoint-active.json",
        lambda payload: payload.update({"ordinal": 0}),
    )
    _, codes = _load(root)
    assert "duplicate_id" in codes
