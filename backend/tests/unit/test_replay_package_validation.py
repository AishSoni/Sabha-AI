"""Validation failures for data-only replay packages (spec-17)."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from app.replay.package import (
    PackageLoadError,
    load_package,
    validate_package,
)
from app.replay.package.loader import compute_content_sha256

BACKEND = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = BACKEND / "replay_packages" / "placeholder-analyst"
GUIDED_ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5"
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


def _guided_claims() -> list[dict]:
    return [
        {
            "claim_id": "c1-coverage",
            "kind": "fact",
            "text": "The synthetic brief states an illustrative coverage ratio of 1.8x.",
            "evidence_asset_id": "brief",
            "locator": "Synthetic issuer brief, coverage ratio",
            "excerpt": "Illustrative coverage ratio: 1.8x",
            "source_url": "https://example.com/synthetic-brief",
            "source_title": "Synthetic issuer brief",
            "capture_date": "2026-01-15",
        }
    ]


def _add_claim_citation(claim_id: str):
    def mutate(payload):
        payload["reads"]["meeting"]["messages"][0]["citations"] = [
            {
                "source": "Synthetic issuer brief",
                "title": "Synthetic issuer brief",
                "url": "https://example.com/synthetic-brief",
                "snippet": "Illustrative coverage ratio: 1.8x",
                "claim_id": claim_id,
                "locator": "Synthetic issuer brief, coverage ratio",
            }
        ]

    return mutate


def _guided_beats() -> list[dict]:
    return [
        {
            "beat_id": "meet-the-board",
            "title": "Meet the board",
            "anchor": "roster",
            "checkpoint": "checkpoint-initial",
            "intent_id": None,
            "ordinal": 1,
            "objective": "Inspect the prepared board and its knowledge assignments.",
            "route": "board",
            "tab": "roster",
            "start_checkpoint": "checkpoint-initial",
            "completed_checkpoint": "checkpoint-initial",
            "disclosure": "Prepared board for the recorded meeting.",
            "steps": [
                {
                    "step_id": "inspect-board",
                    "label": "Inspect the board",
                    "completion": "acknowledge",
                    "requires_tab": "roster",
                }
            ],
            "claim_ids": ["c1-coverage"],
            "input_asset_ids": [],
        },
        {
            "beat_id": "start-the-meeting",
            "title": "Start the meeting",
            "anchor": "creation-form",
            "checkpoint": "checkpoint-initial",
            "intent_id": None,
            "ordinal": 2,
            "objective": "Complete the supported creation form.",
            "route": "new",
            "tab": None,
            "start_checkpoint": "checkpoint-initial",
            "completed_checkpoint": "checkpoint-active",
            "disclosure": "The creation form uses a prepared preset.",
            "steps": [
                {
                    "step_id": "create-meeting",
                    "label": "Start the meeting",
                    "completion": "checkpoint",
                    "intent_id": "create-meeting",
                }
            ],
            "claim_ids": [],
            "input_asset_ids": ["brief"],
        },
        {
            "beat_id": "establish-facts",
            "title": "Establish facts",
            "anchor": "credit-action",
            "checkpoint": "checkpoint-active",
            "intent_id": None,
            "ordinal": 3,
            "objective": "Request the Credit Analyst.",
            "route": "meeting",
            "tab": "chat",
            "start_checkpoint": "checkpoint-active",
            "completed_checkpoint": "checkpoint-completed",
            "disclosure": "The recorded turn is prepared content.",
            "steps": [
                {
                    "step_id": "ask-credit",
                    "label": "Ask the Credit Analyst",
                    "completion": "turn_terminal",
                    "intent_id": "start-credit-analyst",
                    "requires_tab": "chat",
                }
            ],
            "claim_ids": [],
            "input_asset_ids": [],
        },
        {
            "beat_id": "close-the-meeting",
            "title": "Close the meeting",
            "anchor": "closing-entry",
            "checkpoint": "checkpoint-completed",
            "intent_id": None,
            "ordinal": 4,
            "objective": "Use the recorded closing workflow.",
            "route": "meeting",
            "tab": "closing",
            "start_checkpoint": "checkpoint-completed",
            "completed_checkpoint": "checkpoint-closed",
            "disclosure": "The closing is recorded, not live.",
            "steps": [
                {
                    "step_id": "close",
                    "label": "Close the meeting",
                    "completion": "closing_completed",
                    "intent_id": "close-meeting",
                    "requires_tab": "closing",
                }
            ],
            "claim_ids": [],
            "input_asset_ids": [],
        },
    ]


def _install_guided_manifest(root: Path, extra=None) -> None:
    def mutate(payload):
        payload["intents"].append(
            {
                "intent_id": "create-meeting",
                "kind": "create_meeting",
                "checkpoint": "checkpoint-active",
                "participant_id": None,
                "operation_id": None,
                "tape_id": None,
                "closing_tape_id": None,
                "label": "Start the meeting",
            }
        )
        payload["beats"] = _guided_beats()
        payload["claims"] = _guided_claims()

    _edit_json(root, "manifest.json", mutate)
    if extra is not None:
        _edit_json(root, "manifest.json", extra)
    _finalize(root)


def test_checked_in_packages_are_valid() -> None:
    for root in (
        PACKAGE_ROOT,
        GUIDED_ROOT,
        FIXTURES / "fixture-minimal",
        FIXTURES / "fixture-minimal-v2",
    ):
        _, codes = _load(root)
        assert codes == set(), root


def test_guided_persona_tapes_stream_prepared_reasoning() -> None:
    package = load_package(GUIDED_ROOT)
    for tape_id in ("tape-credit", "tape-downside", "tape-portfolio", "tape-consensus"):
        tape = package.tapes[tape_id]
        thinking_events = [event for event in tape.events if event.type == "thinking"]
        assert thinking_events, tape_id
        assert tape.events[0].type == "thinking"
        thinking = "".join(event.payload["content"] for event in thinking_events)

        checkpoint = package.checkpoints[tape.completed_checkpoint]
        operation = next(
            item
            for item in checkpoint.reads["operations"]
            if item["operation_id"] == tape.operation_id
        )
        final_message = next(
            item
            for item in checkpoint.reads["meeting"]["messages"]
            if item["id"] == operation["final_message_id"]
        )
        assert final_message["thinking_content"] == thinking


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


def test_closing_prose_cannot_appear_in_an_earlier_checkpoint(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "checkpoints/checkpoint-active.json",
        lambda payload: payload["reads"]["closing"].update(
            {
                "summary": (
                    "The board recorded the coverage and liquidity checks. "
                    "This is placeholder content, not investment advice."
                )
            }
        ),
    )
    _, codes = _load(root)
    assert "premature_terminal" in codes


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


def test_guided_beats_and_checkpoint_intent_are_valid(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _install_guided_manifest(root)
    _, codes = _load(root)
    assert codes == set()


def test_guided_beats_must_form_a_linear_chain(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def break_chain(payload):
        payload["beats"][2]["start_checkpoint"] = "checkpoint-initial"

    _install_guided_manifest(root, break_chain)
    _, codes = _load(root)
    assert "invalid_beat" in codes


def test_guided_step_completion_must_match_intent_kind(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def wrong_completion(payload):
        payload["beats"][2]["steps"][0]["completion"] = "closing_completed"

    _install_guided_manifest(root, wrong_completion)
    _, codes = _load(root)
    assert "invalid_beat" in codes


def test_guided_step_intent_must_exist(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def missing_intent(payload):
        payload["beats"][2]["steps"][0]["intent_id"] = "missing-intent"

    _install_guided_manifest(root, missing_intent)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_checkpoint_intent_cannot_reference_a_tape(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def add_tape(payload):
        intent = next(
            item for item in payload["intents"] if item["intent_id"] == "create-meeting"
        )
        intent["tape_id"] = "tape-credit-analyst"

    _install_guided_manifest(root, add_tape)
    _, codes = _load(root)
    assert "invalid_intent" in codes


def test_guided_multi_step_beat_must_chain_checkpoints(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def add_closing_step(payload):
        beats = payload["beats"][:3]
        beats[2]["completed_checkpoint"] = "checkpoint-closed"
        beats[2]["steps"].append(
            {
                "step_id": "close-meeting",
                "label": "Close the meeting",
                "intent_id": "close-meeting",
                "completion": "closing_completed",
                "requires_tab": "closing",
            }
        )
        payload["beats"] = beats

    _install_guided_manifest(root, add_closing_step)
    _, codes = _load(root)
    assert codes == set()


def test_guided_multi_step_beat_rejects_wrong_start(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def start_at_completed(payload):
        beats = payload["beats"][:3]
        beats[2]["completed_checkpoint"] = "checkpoint-closed"
        beats[2]["steps"] = [
            {
                "step_id": "close-meeting",
                "label": "Close the meeting",
                "intent_id": "close-meeting",
                "completion": "closing_completed",
                "requires_tab": "closing",
            }
        ]
        payload["beats"] = beats

    _install_guided_manifest(root, start_at_completed)
    _, codes = _load(root)
    assert "invalid_beat" in codes


def test_guided_claim_citation_resolves_to_retained_evidence(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _install_guided_manifest(root)
    _edit_json(root, "checkpoints/checkpoint-active.json", _add_claim_citation("c1-coverage"))
    _finalize(root)
    _, codes = _load(root)
    assert codes == set()


def test_guided_claim_citation_must_reference_a_known_claim(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _install_guided_manifest(root)
    _edit_json(
        root,
        "checkpoints/checkpoint-active.json",
        _add_claim_citation("missing-claim"),
    )
    _finalize(root)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_guided_claim_evidence_asset_must_exist(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def missing_asset(payload):
        payload["claims"][0]["evidence_asset_id"] = "missing-asset"

    _install_guided_manifest(root, missing_asset)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_guided_claim_excerpt_must_appear_in_retained_asset(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def missing_excerpt(payload):
        payload["claims"][0]["excerpt"] = "A claim that is not in the retained brief."

    _install_guided_manifest(root, missing_excerpt)
    _, codes = _load(root)
    assert "invalid_claim" in codes


def test_guided_claim_reference_needs_readable_snippet_and_locator(tmp_path: Path) -> None:
    root = _copy(tmp_path)

    def strip_citation(payload):
        payload["reads"]["meeting"]["messages"][0]["citations"] = [
            {
                "source": "Synthetic issuer brief",
                "title": "Synthetic issuer brief",
                "url": "https://example.com/synthetic-brief",
                "snippet": "",
                "claim_id": "c1-coverage",
                "locator": "",
            }
        ]

    _install_guided_manifest(root)
    _edit_json(root, "checkpoints/checkpoint-active.json", strip_citation)
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_claim" in codes
