"""Schema-3 prepared-turn deck validation (spec-28)."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from app.replay.package import PackageLoadError, load_package, validate_package
from app.replay.package.loader import compute_content_sha256
from app.replay.source import prepared_operation_ids

BACKEND = Path(__file__).resolve().parents[2]
GUIDED_ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5"
SCHEMA3_ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v9"


def _copy(tmp_path: Path) -> Path:
    destination = tmp_path / "schema3"
    shutil.copytree(SCHEMA3_ROOT, destination)
    return destination


def _edit_json(root: Path, relative: str, mutate) -> None:
    path = root / relative
    payload = json.loads(path.read_text(encoding="utf-8"))
    mutate(payload)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _finalize(root: Path) -> None:
    file_hashes = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            file_hashes[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["content_sha256"] = compute_content_sha256(file_hashes, manifest)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _codes(root: Path) -> set[str]:
    return {issue.code for issue in validate_package(load_package(root))}


def test_schema_three_deck_is_valid_and_closed() -> None:
    package = load_package(SCHEMA3_ROOT)
    assert package.manifest.schema_version == 3
    assert package.manifest.version == "9"
    assert len(package.manifest.prepared_turns) == 5
    replies = [
        turn for turn in package.manifest.prepared_turns if turn.kind == "reply"
    ]
    follow_ups = [
        turn for turn in package.manifest.prepared_turns if turn.kind == "follow_up"
    ]
    assert len(replies) == 4
    assert len(follow_ups) == 1
    assert all(turn.required for turn in package.manifest.prepared_turns)
    assert package.manifest.prepared_closing is not None
    assert set(package.manifest.prepared_closing.required_turn_ids) == {
        turn.turn_id for turn in package.manifest.prepared_turns
    }
    assert package.manifest.prepared_closing.closing_tape_id == "tape-closing"
    assert package.manifest.prepared_closing.completed_checkpoint == "checkpoint-closed"
    assert package.manifest.prepared_closing.archived_checkpoint == "checkpoint-archived"
    assert (SCHEMA3_ROOT / "closing_tapes" / "tape-closing.json").is_file()
    assert validate_package(package) == []


def test_schema_two_package_has_no_inferred_deck() -> None:
    package = load_package(GUIDED_ROOT)
    assert package.manifest.schema_version == 2
    assert package.manifest.prepared_turns == []
    assert package.manifest.prepared_closing is None
    assert validate_package(package) == []
    assert prepared_operation_ids(package) is None


def test_schema_three_streams_only_deck_and_chapter_operations() -> None:
    package = load_package(SCHEMA3_ROOT)
    allowed = prepared_operation_ids(package)
    assert allowed is not None
    assert "a0000000-0000-4000-8000-000000000321" in allowed
    assert "a0000000-0000-4000-8000-000000000999" not in allowed


def test_deck_rejects_duplicate_turn_ids(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload["prepared_turns"][1].update(
            {"turn_id": payload["prepared_turns"][0]["turn_id"]}
        ),
    )
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)


def test_deck_rejects_a_duplicate_reply_operation(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload["prepared_turns"][1].update(
            {"operation_id": payload["prepared_turns"][0]["operation_id"]}
        ),
    )
    _finalize(root)
    assert "invalid_prepared_turns" in _codes(root)


def test_deck_rejects_a_fifth_guided_reply(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload["prepared_turns"].append(
            {
                **payload["prepared_turns"][0],
                "turn_id": "prepared-extra",
            }
        ),
    )
    _finalize(root)
    assert "invalid_prepared_turns" in _codes(root)


def test_deck_rejects_a_result_containing_another_reply(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    first, second = manifest["prepared_turns"][:2]
    other_id = second["reply_message_ids"][0]
    _edit_json(
        root,
        f"checkpoints/{first['result_checkpoint']}.json",
        lambda payload: payload["reads"]["meeting"]["messages"].append(
            {
                "id": other_id,
                "meeting_id": payload["meeting_id"],
                "content": "A different prepared reply.",
                "sender_type": "ai",
                "sender_id": second["participant_id"],
                "sender_name": "Another participant",
                "citations": [],
                "tool_artifacts": None,
                "thinking_content": None,
                "estimated_cost": 0.0,
                "effective_generation": None,
                "sequence": 2,
                "request_key": "turn-other",
                "operation_id": second["operation_id"],
                "created_at": "2020-07-31T09:03:00Z",
            }
        ),
    )
    _finalize(root)
    assert "invalid_prepared_turns" in _codes(root)


def test_deck_rejects_missing_closing_prerequisites(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload["prepared_closing"]["required_turn_ids"].pop(),
    )
    _finalize(root)
    assert "invalid_prepared_turns" in _codes(root)


def test_deck_rejects_a_dangling_effect(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def mutate(payload):
        payload["prepared_turns"][0]["effect_ids"] = ["missing-effect"]

    _edit_json(root, "manifest.json", mutate)
    _finalize(root)
    assert "dangling_id" in _codes(root)


def test_deck_is_part_of_the_content_hash(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    before = json.loads((root / "manifest.json").read_text(encoding="utf-8"))[
        "content_sha256"
    ]
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload["prepared_turns"][0].update({"label": "Changed label"}),
    )
    _finalize(root)
    after = json.loads((root / "manifest.json").read_text(encoding="utf-8"))[
        "content_sha256"
    ]
    assert before != after
    assert _codes(root) == set()


ORDER_DEPENDENT_PHRASES = (
    "previous speaker",
    "earlier speaker",
    "prior speaker",
    "just heard",
    "as discussed",
    "building on",
    "going back",
    "first speaker",
    "second speaker",
    "third speaker",
    "the credit analyst established",
    "the downside reviewer separated",
    "the portfolio analyst showed",
)


def _prepared_reply_messages() -> dict[str, dict]:
    manifest = json.loads(
        (SCHEMA3_ROOT / "manifest.json").read_text(encoding="utf-8")
    )
    messages: dict[str, dict] = {}
    for turn in manifest["prepared_turns"]:
        if turn["kind"] != "reply":
            continue
        checkpoint = json.loads(
            (SCHEMA3_ROOT / "checkpoints" / f"{turn['result_checkpoint']}.json")
            .read_text(encoding="utf-8")
        )
        reply_ids = set(turn["reply_message_ids"])
        for message in checkpoint["reads"]["meeting"]["messages"]:
            if message["id"] in reply_ids:
                messages[turn["turn_id"]] = message
    return messages


def test_prepared_replies_read_in_any_order() -> None:
    replies = _prepared_reply_messages()
    assert set(replies) == {
        "prepared-credit",
        "prepared-downside",
        "prepared-portfolio",
        "prepared-consensus",
    }
    for turn_id, message in replies.items():
        copy = " ".join(
            filter(None, (message["content"], message.get("thinking_content")))
        ).lower()
        for phrase in ORDER_DEPENDENT_PHRASES:
            assert phrase not in copy, (turn_id, phrase)


def test_consensus_reasoning_names_no_other_speaker() -> None:
    thinking = _prepared_reply_messages()["prepared-consensus"]["thinking_content"]
    for name in ("Downside Reviewer", "Portfolio Analyst"):
        assert name.lower() not in thinking.lower()


def test_manifest_content_hash_matches_package_files() -> None:
    manifest = json.loads(
        (SCHEMA3_ROOT / "manifest.json").read_text(encoding="utf-8")
    )
    file_hashes = {
        path.relative_to(SCHEMA3_ROOT).as_posix(): hashlib.sha256(
            path.read_bytes()
        ).hexdigest()
        for path in SCHEMA3_ROOT.rglob("*")
        if path.is_file()
    }
    assert (
        compute_content_sha256(file_hashes, manifest)
        == manifest["content_sha256"]
    )
