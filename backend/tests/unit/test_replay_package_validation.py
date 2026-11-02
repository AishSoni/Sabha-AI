"""Validation failures for data-only replay packages (spec-17)."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from app.modules.meetings.application.prompts import BASE_SYSTEM_PROMPT, get_full_prompt
from app.replay.package import (
    PackageLoadError,
    load_package,
    validate_package,
)
from app.replay.package.loader import compute_content_sha256
from tests.fixtures.replay.build_packages import build_expanded, workspace_seed

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


def _copy_guided(tmp_path: Path) -> Path:
    destination = tmp_path / "guided"
    shutil.copytree(GUIDED_ROOT, destination)
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


def _claim_citation(claim_id: str) -> dict:
    return {
        "source": "Synthetic issuer brief",
        "title": "Synthetic issuer brief",
        "url": "https://example.com/synthetic-brief",
        "snippet": "Illustrative coverage ratio: 1.8x",
        "claim_id": claim_id,
        "locator": "Synthetic issuer brief, coverage ratio",
    }


def _add_claim_citation(claim_id: str):
    def mutate(payload):
        final_id = next(
            operation["final_message_id"]
            for operation in payload["reads"]["operations"]
            if operation["final_message_id"]
        )
        for message in payload["reads"]["meeting"]["messages"]:
            if message["id"] == final_id:
                message["citations"] = [_claim_citation(claim_id)]

    return mutate


def _add_streamed_claim_citation(claim_id: str):
    def mutate(payload):
        for event in payload["events"]:
            if event["type"] == "citation":
                event["payload"].update(_claim_citation(claim_id))

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


def test_schema_one_fixtures_keep_their_published_identity() -> None:
    """Schema 2 must not rewrite the already-published schema-1 fixtures."""
    legacy = {
        "fixture-minimal": (
            "1",
            "a17dad569249af149a7b45d0391d243924c9b77bdafa89b4358864e9bdb4ab00",
        ),
        "fixture-minimal-v2": (
            "2",
            "e457cac097cce9323d72a569a3ed84b6cca88486f2a099c013a00ebabb52678a",
        ),
    }
    for name, (version, content_sha256) in legacy.items():
        root = FIXTURES / name
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["schema_version"] == 1
        assert manifest["read_version"] == 1
        assert manifest["event_version"] == 1
        assert manifest["version"] == version
        assert manifest["content_sha256"] == content_sha256

        package = load_package(root)
        assert package.content_sha256 == content_sha256
        assert validate_package(package) == []


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


def test_asset_media_type_needs_an_in_app_renderer(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _edit_json(
        root,
        "assets/index.json",
        lambda payload: payload["assets"][0].update({"media_type": "text/html"}),
    )
    _finalize(root)
    _, codes = _load(root)
    assert "unsupported_asset" in codes


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
    _edit_json(root, "checkpoints/checkpoint-completed.json", _add_claim_citation("c1-coverage"))
    _edit_json(root, "tapes/tape-credit-analyst.json", _add_streamed_claim_citation("c1-coverage"))
    _finalize(root)
    _, codes = _load(root)
    assert codes == set()


def test_guided_streamed_claim_identity_must_match_final_message(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _install_guided_manifest(root)
    _edit_json(root, "checkpoints/checkpoint-completed.json", _add_claim_citation("c1-coverage"))
    _edit_json(root, "tapes/tape-credit-analyst.json", _add_streamed_claim_citation("c1-coverage"))
    _edit_json(
        root,
        "tapes/tape-credit-analyst.json",
        lambda payload: [
            event["payload"].update({"locator": "A different retained locator"})
            for event in payload["events"]
            if event["type"] == "citation"
        ],
    )
    _finalize(root)
    _, codes = _load(root)
    assert "mismatched_terminal" in codes


def test_guided_claim_citation_must_reference_a_known_claim(tmp_path: Path) -> None:
    root = _copy(tmp_path)
    _install_guided_manifest(root)
    _edit_json(
        root,
        "checkpoints/checkpoint-completed.json",
        _add_claim_citation("missing-claim"),
    )
    _edit_json(
        root,
        "tapes/tape-credit-analyst.json",
        _add_streamed_claim_citation("missing-claim"),
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
        final_id = next(
            operation["final_message_id"]
            for operation in payload["reads"]["operations"]
            if operation["final_message_id"]
        )
        for message in payload["reads"]["meeting"]["messages"]:
            if message["id"] == final_id:
                message["citations"] = [
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
    _edit_json(root, "checkpoints/checkpoint-completed.json", strip_citation)
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_claim" in codes

# --- Expanded workspace seed (spec-23) -------------------------------------


def test_schema_two_package_with_workspace_seed_is_valid(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    package, codes = _load(root)
    assert codes == set()
    assert package.manifest.schema_version == 2
    assert package.workspace_seed is not None
    assert package.workspace_seed.seed_version == 2
    assert package.workspace_seed_sha256 is not None


def test_schema_two_package_requires_a_declared_seed(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(root, "manifest.json", lambda payload: payload.pop("workspace_seed"))
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_manifest" in codes


def test_legacy_package_cannot_declare_a_workspace_seed(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root, "manifest.json", lambda payload: payload.update({"schema_version": 1})
    )
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_manifest" in codes


def test_workspace_seed_rejects_a_dangling_stack(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["personas"][0].update(
            {"stack_ids": ["shared-fact-sheet", "missing-stack"]}
        ),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_workspace_seed_rejects_a_missing_active_revision(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["personas"][0].update(
            {"active_revision_id": "rev-missing"}
        ),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)


def test_workspace_seed_prompt_ceiling_is_enforced(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["personas"][0]["revisions"][0].update(
            {"prompt": "x" * 16_385}
        ),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)


def test_workspace_seed_size_ceiling_is_enforced(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    payload = workspace_seed()
    (root / "workspace_seed.json").write_text(
        json.dumps({**payload, "padding": "x" * (1024 * 1024)}), encoding="utf-8"
    )
    with pytest.raises(PackageLoadError) as excinfo:
        load_package(root)
    assert any(issue.code == "file_too_large" for issue in excinfo.value.issues)

def test_guided_package_carries_the_expanded_workspace_seed() -> None:
    package = load_package(GUIDED_ROOT)
    assert package.manifest.schema_version == 2
    assert package.manifest.version == "7"
    assert package.manifest.workspace_seed == "workspace_seed.json"
    assert package.workspace_seed is not None
    seed = package.workspace_seed
    assert seed.seed_version == 3
    assert seed.base_instructions == BASE_SYSTEM_PROMPT
    assert seed.highlighted_persona_id == "persona-credit"
    assert len(seed.personas) == 3
    assert len(seed.stacks) == 4
    assert len(seed.personas[0].revisions) == 3
    assert validate_package(package) == []


def test_guided_package_publishes_a_validated_upload_sample_library() -> None:
    package = load_package(GUIDED_ROOT)
    seed = package.workspace_seed
    assert seed is not None
    assert seed.seed_version == 3
    assert 4 <= len(seed.samples) <= 16
    assets = {asset.asset_id: asset for asset in package.assets.assets}

    assert {sample.sample_id for sample in seed.samples} == {
        "sample-shared-fact-sheet",
        "sample-credit-notes",
        "sample-portfolio-mandate",
        "sample-downside-retry",
    }
    sample_assets = {sample.asset_id for sample in seed.samples}
    assert "source-register" not in sample_assets
    assert "crisil-annexure" not in sample_assets
    assert "hdfc-fy20-mda" not in sample_assets

    total = 0
    for sample in seed.samples:
        asset = assets[sample.asset_id]
        assert asset.upload_approved is True
        assert asset.public_demo is True
        assert asset.authored is True
        assert sample.file_name == asset.path.rsplit("/", 1)[-1]
        assert sample.media_type == asset.media_type
        assert sample.size_bytes == asset.size
        assert sample.sha256 == asset.sha256
        assert sample.rights_status == "approved-for-upload"
        assert sample.destination_kinds
        assert sample.preview_mode == "inline"
        total += sample.size_bytes
    assert total <= 8 * 1024 * 1024

    assert len(seed.documents) == 4
    documents = {document.sample_id: document for document in seed.documents}
    assert set(documents) == {
        "sample-shared-fact-sheet",
        "sample-credit-notes",
        "sample-downside-retry",
        "sample-portfolio-mandate",
    }
    assert {
        (document.scope_id, document.status, document.chunk_count)
        for document in seed.documents
    } == {
        ("shared-meeting-documents", "ready", 4),
        ("credit-private", "ready", 2),
        ("downside-private", "ready", 3),
        ("portfolio-private", "ready", 3),
    }
    assert all(document.scope_kind == "stack" for document in seed.documents)


def test_workspace_sample_fields_must_match_the_package_asset(tmp_path: Path) -> None:
    root = _copy_guided(tmp_path)
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["samples"][0].update({"size_bytes": 999}),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    _, codes = _load(root)
    assert "sample_mismatch" in codes


def test_workspace_sample_cannot_bypass_upload_approval(tmp_path: Path) -> None:
    root = _copy_guided(tmp_path)

    def revoke_upload_approval(payload):
        for asset in payload["assets"]:
            if asset["asset_id"] == "shared-fact-sheet":
                asset["upload_approved"] = False

    _edit_json(root, "assets/index.json", revoke_upload_approval)
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_sample" in codes


def test_workspace_document_must_name_an_uploadable_sample(tmp_path: Path) -> None:
    root = _copy_guided(tmp_path)
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["documents"][0].update({"sample_id": "sample-missing"}),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_workspace_sample_rejects_an_incomplete_failure_scenario(tmp_path: Path) -> None:
    root = _copy_guided(tmp_path)
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["samples"][3].pop("failure_message"),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)


def test_prompt_assembly_fixture_matches_the_backend_composer() -> None:
    fixture = json.loads(
        (BACKEND.parent / "frontend/tests/fixtures/demo/prompt-assembly.json").read_text(
            encoding="utf-8"
        )
    )
    assert fixture["base_instructions"] == BASE_SYSTEM_PROMPT
    assert get_full_prompt(fixture["persona_prompt"]) == fixture["composed_prompt"]


def test_guided_seed_prompts_match_the_prepared_board_prompts() -> None:
    package = load_package(GUIDED_ROOT)
    seed = package.workspace_seed
    assert seed is not None
    initial = package.checkpoints[package.manifest.initial_checkpoint]
    board = initial.reads["safe_config"]["board"]
    participants = {
        str(participant["participant_id"]): participant
        for participant in board["participants"]
    }

    linked = 0
    for persona in seed.personas:
        if persona.recorded_participant_id is None:
            continue
        linked += 1
        participant = participants[persona.recorded_participant_id]
        active = next(
            revision
            for revision in persona.revisions
            if revision.revision_id == persona.active_revision_id
        )
        assert participant["persona_summary"] == active.prompt
        assert get_full_prompt(active.prompt) == get_full_prompt(
            participant["persona_summary"]
        )

    assert linked == 3


def test_workspace_seed_v1_remains_readable(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload.update(
            {
                "seed_version": 1,
                "base_instructions": None,
                "highlighted_persona_id": None,
            }
        ),
    )
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: [
            persona.pop("recorded_participant_id", None) for persona in payload["personas"]
        ],
    )
    _refresh_seed_hash(root)
    _finalize(root)
    package, codes = _load(root)
    assert codes == set()
    assert package.workspace_seed is not None
    assert package.workspace_seed.seed_version == 1


def test_workspace_seed_v2_requires_base_instructions(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload.pop("base_instructions"),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)


def test_workspace_seed_rejects_an_unknown_recorded_participant(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload["personas"][0].update(
            {"recorded_participant_id": "unknown-participant"}
        ),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    _, codes = _load(root)
    assert "dangling_id" in codes


def test_workspace_seed_rejects_an_unknown_highlighted_persona(tmp_path: Path) -> None:
    root = tmp_path / "expanded"
    build_expanded(root, version="4")
    _edit_json(
        root,
        "workspace_seed.json",
        lambda payload: payload.update({"highlighted_persona_id": "persona-missing"}),
    )
    _refresh_seed_hash(root)
    _finalize(root)
    with pytest.raises(PackageLoadError):
        load_package(root)

def _refresh_seed_hash(root: Path) -> None:
    seed = json.loads((root / "workspace_seed.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256(
        json.dumps(seed, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode(
            "utf-8"
        )
    ).hexdigest()
    _edit_json(
        root,
        "manifest.json",
        lambda payload: payload.update({"workspace_seed_sha256": digest}),
    )


def _exploration_codes(tmp_path: Path, mutate) -> set[str]:
    root = _copy_guided(tmp_path)
    _edit_json(root, "manifest.json", mutate)
    _finalize(root)
    _, codes = _load(root)
    return codes


def test_expanded_package_validates_a_bounded_exploration_graph() -> None:
    package = load_package(GUIDED_ROOT)
    assert validate_package(package) == []
    manifest = package.manifest
    assert len(manifest.transitions) == 27
    assert len(manifest.chapters) == 14
    assert sum(1 for item in manifest.transitions if item.canonical) == 8


def test_exploration_rejects_a_cycle(tmp_path: Path) -> None:
    def mutate(payload):
        payload["transitions"].append(
            {
                "transition_id": "explore-cycle",
                "source_checkpoint": "checkpoint-archived",
                "completed_checkpoint": "checkpoint-created",
                "intent_id": "archive-meeting",
                "kind": "archive_meeting",
                "canonical": False,
                "label": "Cycle",
                "explanation": "Invalid cycle.",
            }
        )

    assert "exploration_cycle" in _exploration_codes(tmp_path, mutate)


def test_exploration_requires_a_closing_continuation(tmp_path: Path) -> None:
    def mutate(payload):
        payload["transitions"] = [
            transition
            for transition in payload["transitions"]
            if transition["kind"] != "request_closing"
        ]

    assert "missing_continuation" in _exploration_codes(tmp_path, mutate)


def test_exploration_rejects_an_unreachable_prerequisite(tmp_path: Path) -> None:
    def mutate(payload):
        transition = next(
            item
            for item in payload["transitions"]
            if item["transition_id"] == "explore-credit-liquidity"
        )
        transition["prerequisites"] = ["explore-close-first"]

    assert "invalid_prerequisite" in _exploration_codes(tmp_path, mutate)


def test_exploration_rejects_a_discarded_branch_message(tmp_path: Path) -> None:
    root = _copy_guided(tmp_path)
    _edit_json(
        root,
        "checkpoints/checkpoint-followup-liquidity.json",
        lambda payload: payload["reads"]["meeting"]["messages"].pop(1),
    )
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_merge" in codes


def test_schema_one_cannot_carry_exploration_metadata(tmp_path: Path) -> None:
    root = tmp_path / "legacy"
    shutil.copytree(PACKAGE_ROOT, root)
    checkpoint = load_package(root).manifest.initial_checkpoint

    def mutate(payload):
        payload["chapters"] = [
            {
                "chapter_id": "chapter-legacy",
                "title": "Legacy",
                "objective": "Legacy chapter.",
                "checkpoint": checkpoint,
                "route": "meeting",
                "tab": "chat",
                "mode": "inspection",
                "disclosure": "Legacy chapter.",
            }
        ]
        payload["transitions"] = [
            {
                "transition_id": "legacy-transition",
                "source_checkpoint": checkpoint,
                "completed_checkpoint": checkpoint,
                "intent_id": payload["intents"][0]["intent_id"],
                "kind": payload["intents"][0]["kind"],
                "canonical": True,
                "label": "Legacy",
                "explanation": "Legacy transition.",
            }
        ]

    _edit_json(root, "manifest.json", mutate)
    _finalize(root)
    _, codes = _load(root)
    assert "invalid_exploration" in codes
