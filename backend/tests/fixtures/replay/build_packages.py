"""Rebuild the checked-in replay packages deterministically.

Run from ``backend/``:

    python tests/fixtures/replay/build_packages.py

The generated files are the source of truth for publication; this script only
keeps the hashes and duplicated timestamps consistent. The placeholder is
explicitly synthetic and must be replaced by spec-18's approved content.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
ROOT = BACKEND.parent
PLACEHOLDER = ROOT / "backend" / "replay_packages" / "placeholder-analyst"
FIXTURES = BACKEND / "tests" / "fixtures" / "replay"

MEETING_ID = "11111111-1111-4111-8111-111111111111"
PARTICIPANT_ID = "22222222-2222-4222-8222-222222222222"
DOCUMENT_ID = "33333333-3333-4333-8333-333333333333"
REVISION_ID = "44444444-4444-4444-8444-444444444444"
INGEST_OPERATION_ID = "55555555-5555-4555-8555-555555555555"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
FINAL_MESSAGE_ID = "77777777-7777-4777-8777-777777777777"
SUMMARY_MESSAGE_ID = "88888888-8888-4888-8888-888888888888"
CLOSING_ID = "99999999-9999-4999-8999-999999999999"

AS_OF = "2026-01-15"
T0 = "2026-01-15T10:00:00Z"
T1 = "2026-01-15T10:00:05Z"
T2 = "2026-01-15T10:00:20Z"
T3 = "2026-01-15T10:01:00Z"

BRIEF = (
    "# Synthetic issuer brief (placeholder)\n\n"
    "This document is synthetic test content. It is not research, not advice,\n"
    "and does not describe a real issuer or security.\n\n"
    "- Illustrative coverage ratio: 1.8x\n"
    "- Illustrative liquidity buffer: 12% of obligations\n"
    "- Illustrative leverage: 2.4x\n\n"
    "The recording requires cash-flow verification before any conclusion.\n"
)

PASSAGE = (
    "Illustrative coverage ratio: 1.8x and liquidity buffer: 12% of "
    "obligations. The recording requires cash-flow verification before any "
    "conclusion."
)


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )


def participant() -> dict:
    return {
        "id": PARTICIPANT_ID,
        "meeting_id": MEETING_ID,
        "name": "The Credit Analyst",
        "role": "Credit Analyst",
        "system_prompt": (
            "You are a recorded placeholder participant focused on synthetic "
            "credit analysis. You never present placeholder content as advice."
        ),
        "provider_config": {"provider": "recorded", "model": "recorded"},
        "color": "#6366f1",
        "persona_id": None,
        "stack_ids": [],
        "created_at": T0,
        "generation_policy": {},
    }


def meeting(*, status: str, messages: list[dict], total_cost: float = 0.0) -> dict:
    return {
        "id": MEETING_ID,
        "name": "Recorded placeholder: synthetic credit review",
        "agenda": (
            "Assess a synthetic issuer's coverage and liquidity. "
            "Placeholder content only; the outcome is a research checklist."
        ),
        "user_id": None,
        "status": status,
        "total_cost": total_cost,
        "created_at": T0,
        "participants": [participant()],
        "messages": messages,
    }


def director_message() -> dict:
    return {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "meeting_id": MEETING_ID,
        "content": "Please assess the synthetic issuer brief and list what you would verify.",
        "sender_type": "user",
        "sender_id": None,
        "sender_name": "Director",
        "citations": [],
        "tool_artifacts": None,
        "thinking_content": None,
        "estimated_cost": 0.0,
        "effective_generation": None,
        "sequence": 0,
        "request_key": "director-brief-1",
        "operation_id": None,
        "created_at": T1,
    }


TOOL_ARGUMENTS = {"query": "synthetic issuer coverage and liquidity"}
TOOL_RESULT = {"retrieval_key": "retrieval-credit-analyst", "hits": 1}
CITATION = {
    "source": "meeting-document",
    "title": "Synthetic issuer brief",
    "url": None,
    "snippet": PASSAGE,
}
TEXT_CHUNKS = [
    "Placeholder recording. ",
    "The synthetic brief shows coverage of 1.8x and a 12% liquidity buffer. ",
    "I would verify the underlying cash flow before relying on either number. ",
    "This is a research checklist, not a recommendation.",
]


def final_message() -> dict:
    return {
        "id": FINAL_MESSAGE_ID,
        "meeting_id": MEETING_ID,
        "content": "".join(TEXT_CHUNKS),
        "sender_type": "ai",
        "sender_id": PARTICIPANT_ID,
        "sender_name": "The Credit Analyst",
        "citations": [CITATION],
        "tool_artifacts": {
            "calls": [
                {
                    "invocation_id": "inv-1",
                    "call_id": "call-1",
                    "tool_name": "search_knowledge_base",
                    "arguments": TOOL_ARGUMENTS,
                    "result": TOOL_RESULT,
                    "is_error": False,
                }
            ]
        },
        "thinking_content": None,
        "estimated_cost": 0.0,
        "effective_generation": None,
        "sequence": 1,
        "request_key": "turn-credit-analyst-1",
        "operation_id": OPERATION_ID,
        "created_at": T2,
    }


def summary_message() -> dict:
    return {
        "id": SUMMARY_MESSAGE_ID,
        "meeting_id": MEETING_ID,
        "content": (
            "The board recorded the coverage and liquidity checks. "
            "This is placeholder content, not investment advice."
        ),
        "sender_type": "system",
        "sender_id": None,
        "sender_name": "Sabha",
        "citations": [],
        "tool_artifacts": None,
        "thinking_content": None,
        "estimated_cost": 0.0,
        "effective_generation": None,
        "sequence": 2,
        "request_key": "closing-summary-1",
        "operation_id": None,
        "created_at": T3,
    }


def operation(status: str, *, final_message_id: str | None) -> dict:
    return {
        "operation_id": OPERATION_ID,
        "meeting_id": MEETING_ID,
        "participant_id": PARTICIPANT_ID,
        "request_key": "turn-credit-analyst-1",
        "status": status,
        "admission": 1,
        "queue_position": 0 if status == "executing" else None,
        "created_at": T1,
        "started_at": T1 if status != "queued" else None,
        "completed_at": T2 if status in {"completed", "failed", "interrupted", "cancelled"} else None,
        "final_message_id": final_message_id,
        "cancel_requested": False,
        "error": None,
        "effective_generation": None,
    }


def context_stats(messages: int) -> dict:
    return {
        "current_tokens": 1200 if messages == 0 else 1480,
        "max_tokens": 128000,
        "usage_percent": 0.9 if messages == 0 else 1.2,
        "message_tokens": 0 if messages == 0 else 280,
        "system_tokens": 1100,
        "agenda_tokens": 100,
        "message_count": messages,
        "participant_count": 1,
    }


def documents() -> list[dict]:
    return [
        {
            "id": DOCUMENT_ID,
            "file_name": "synthetic-issuer-brief.md",
            "file_type": "markdown",
            "file_size_bytes": len(BRIEF.encode("utf-8")),
            "chunk_count": 1,
            "qdrant_collection": None,
            "status": "ready",
            "error_message": None,
            "created_at": T0,
            "meeting_id": MEETING_ID,
            "persona_id": None,
            "stack_id": None,
            "revision_id": REVISION_ID,
            "revision_state": "ready",
            "operation_id": INGEST_OPERATION_ID,
        }
    ]


def closing(
    *,
    status: str,
    archived: bool = False,
    stage: str | None = None,
    votes: list[dict] | None = None,
    summary: str | None = None,
    summary_message_id: str | None = None,
) -> dict:
    return {
        "meeting_id": MEETING_ID,
        "meeting_status": status,
        "archived": archived,
        "closing_id": CLOSING_ID if stage else None,
        "request_key": "closing-request-1" if stage else None,
        "mode": "vote" if stage else None,
        "stage": stage,
        "failed_from_stage": None,
        "votes": votes or [],
        "summary": summary,
        "summary_message_id": summary_message_id,
        "error": None,
        "retryable": False,
        "abortable": False,
        "created_at": T2 if stage else None,
        "updated_at": T3 if stage else None,
        "completed_at": T3 if stage == "completed" else None,
    }


BALLOT_TEXT = (
    "Yes — the synthetic brief supports a careful review, not a recommendation."
)
SUMMARY_TEXT = (
    "The board recorded the coverage and liquidity checks. "
    "This is placeholder content, not investment advice."
)


def closing_votes() -> list[dict]:
    return [
        {
            "participant_id": PARTICIPANT_ID,
            "participant_name": "The Credit Analyst",
            "role": "Credit Analyst",
            "status": "completed",
            "vote": True,
            "reason": BALLOT_TEXT,
            "provider": "recorded",
            "model": "recorded",
            "usage_kind": "unknown",
            "price_kind": None,
            "estimated_cost": None,
            "reported_cost": None,
            "error_code": None,
            "error_message": None,
            "completed_at": T3,
        }
    ]


def safe_config() -> dict:
    return {
        "participants": [
            {
                "participant_id": PARTICIPANT_ID,
                "name": "The Credit Analyst",
                "role": "Credit Analyst",
                "stack_ids": [],
                "provider": "recorded",
                "model": "recorded",
            }
        ],
        "settings": {
            "runtime": "recorded",
            "notice": "Placeholder replay package; not live research.",
        },
    }


def checkpoint(
    checkpoint_id: str,
    ordinal: int,
    phase: str,
    *,
    status: str,
    messages: list[dict],
    operations: list[dict],
    closing_view: dict,
    include_consensus: bool,
    include_documents: bool,
) -> dict:
    return {
        "checkpoint_id": checkpoint_id,
        "ordinal": ordinal,
        "phase": phase,
        "meeting_id": MEETING_ID,
        "reads": {
            "meeting": meeting(status=status, messages=messages),
            "meetings": [meeting(status=status, messages=[])],
            "disagreements": (
                [
                    {
                        "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        "meeting_id": MEETING_ID,
                        "source_ai_id": PARTICIPANT_ID,
                        "target_name": "Director",
                        "topic": "Coverage assumption",
                        "reasoning": "The brief is synthetic and cannot support a conclusion.",
                        "severity": 3,
                        "status": "open",
                        "created_at": T2,
                    }
                ]
                if include_consensus
                else []
            ),
            "consensus": (
                [
                    {
                        "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                        "meeting_id": MEETING_ID,
                        "participants": ["The Credit Analyst"],
                        "topic": "Cash-flow verification is required",
                        "strength": 3,
                        "created_at": T2,
                    }
                ]
                if include_consensus
                else []
            ),
            "context_stats": context_stats(len(messages)),
            "documents": documents() if include_documents else [],
            "closing": closing_view,
            "operations": operations,
            "safe_config": safe_config(),
        },
    }


def tape() -> dict:
    events = [
        {
            "event_id": "evt-1",
            "sequence": 1,
            "type": "tool_call",
            "delay_ms": 120,
            "payload": {
                "invocation_id": "inv-1",
                "call_id": "call-1",
                "tool_name": "search_knowledge_base",
                "arguments": TOOL_ARGUMENTS,
            },
        },
        {
            "event_id": "evt-2",
            "sequence": 2,
            "type": "tool_result",
            "delay_ms": 180,
            "payload": {
                "invocation_id": "inv-1",
                "call_id": "call-1",
                "result": TOOL_RESULT,
                "is_error": False,
            },
        },
        {
            "event_id": "evt-3",
            "sequence": 3,
            "type": "citation",
            "delay_ms": 80,
            "payload": CITATION,
        },
    ]
    sequence = 4
    for index, chunk in enumerate(TEXT_CHUNKS):
        events.append(
            {
                "event_id": f"evt-{sequence}",
                "sequence": sequence,
                "type": "text",
                "delay_ms": 0 if index == 0 else 140,
                "payload": {"content": chunk},
            }
        )
        sequence += 1
    events.append(
        {
            "event_id": f"evt-{sequence}",
            "sequence": sequence,
            "type": "done",
            "delay_ms": 60,
            "payload": {"message_id": FINAL_MESSAGE_ID},
        }
    )
    return {
        "tape_id": "tape-credit-analyst",
        "meeting_id": MEETING_ID,
        "operation_id": OPERATION_ID,
        "participant_id": PARTICIPANT_ID,
        "request_key": "turn-credit-analyst-1",
        "initial_checkpoint": "checkpoint-active",
        "completed_checkpoint": "checkpoint-completed",
        "events": events,
    }


def closing_tape() -> dict:
    events = [
        {
            "event_id": "close-1",
            "sequence": 1,
            "item_id": f"ballot:{PARTICIPANT_ID}",
            "kind": "ballot",
            "text": "Yes — the synthetic brief supports",
            "provisional": True,
            "terminal": False,
            "result": None,
            "subject_id": PARTICIPANT_ID,
            "delay_ms": 80,
        },
        {
            "event_id": "close-2",
            "sequence": 2,
            "item_id": f"ballot:{PARTICIPANT_ID}",
            "kind": "ballot",
            "text": BALLOT_TEXT,
            "provisional": False,
            "terminal": True,
            "result": "yes",
            "subject_id": PARTICIPANT_ID,
            "delay_ms": 120,
        },
        {
            "event_id": "close-3",
            "sequence": 3,
            "item_id": "summary:final",
            "kind": "summary",
            "text": "The board recorded the coverage and liquidity checks.",
            "provisional": True,
            "terminal": False,
            "result": None,
            "subject_id": None,
            "delay_ms": 100,
        },
        {
            "event_id": "close-4",
            "sequence": 4,
            "item_id": "summary:final",
            "kind": "summary",
            "text": SUMMARY_TEXT,
            "provisional": False,
            "terminal": True,
            "result": "completed",
            "subject_id": None,
            "delay_ms": 140,
        },
    ]
    return {
        "tape_id": "tape-closing",
        "meeting_id": MEETING_ID,
        "closing_id": CLOSING_ID,
        "initial_checkpoint": "checkpoint-completed",
        "completed_checkpoint": "checkpoint-closed",
        "events": events,
    }


def retrieval() -> dict:
    return {
        "retrieval_key": "retrieval-credit-analyst",
        "meeting_id": MEETING_ID,
        "participant_id": PARTICIPANT_ID,
        "scope": "shared",
        "stack_id": None,
        "query": "synthetic issuer coverage and liquidity",
        "hits": [
            {
                "rank": 1,
                "document_id": DOCUMENT_ID,
                "revision_id": REVISION_ID,
                "chunk_id": "chunk-1",
                "content_sha256": hashlib.sha256(PASSAGE.encode("utf-8")).hexdigest(),
                "passage": PASSAGE,
                "score": 0.82,
                "file_name": "synthetic-issuer-brief.md",
                "page_number": None,
                "locator": {"type": "document", "document_id": DOCUMENT_ID},
                "citation": CITATION,
            }
        ],
    }


def manifest(
    *,
    package_id: str,
    version: str,
    title: str,
    content_sha256: str,
    checkpoints: list[str],
    tapes: list[str],
    closing_tapes: list[str],
    retrieval_keys: list[str],
    intents: list[dict],
    beats: list[dict],
    provenance: dict,
) -> dict:
    return {
        "package_id": package_id,
        "version": version,
        "schema_version": 1,
        "read_version": 1,
        "event_version": 1,
        "title": title,
        "as_of": AS_OF,
        "content_sha256": content_sha256,
        "meeting_id": MEETING_ID,
        "initial_checkpoint": "checkpoint-initial",
        "checkpoints": checkpoints,
        "tapes": tapes,
        "closing_tapes": closing_tapes,
        "retrieval": retrieval_keys,
        "provenance": provenance,
        "label": "Recorded placeholder",
        "intents": intents,
        "beats": beats,
    }


def finalize(root: Path) -> None:
    """Compute and write the content hash after all content files exist."""
    from app.replay.package.loader import compute_content_sha256

    files = {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    manifest_path = root / "manifest.json"
    manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = compute_content_sha256(files, manifest_payload)
    manifest_payload["content_sha256"] = digest
    write_json(manifest_path, manifest_payload)


def build_placeholder() -> None:
    if PLACEHOLDER.exists():
        shutil.rmtree(PLACEHOLDER)
    PLACEHOLDER.mkdir(parents=True)

    write_json(PLACEHOLDER / "manifest.json", {"placeholder": True})
    (PLACEHOLDER / "assets").mkdir(parents=True)
    (PLACEHOLDER / "assets" / "synthetic-issuer-brief.md").write_bytes(
        BRIEF.encode("utf-8")
    )
    write_json(
        PLACEHOLDER / "assets" / "index.json",
        {
            "assets": [
                {
                    "asset_id": "brief",
                    "path": "synthetic-issuer-brief.md",
                    "media_type": "text/markdown",
                    "sha256": hashlib.sha256(BRIEF.encode("utf-8")).hexdigest(),
                    "size": len(BRIEF.encode("utf-8")),
                    "locator": "package:assets/synthetic-issuer-brief.md",
                    "source": "synthetic fixture authored for the replay slice",
                    "capture_date": AS_OF,
                    "rights": "synthetic demo content; no third-party rights",
                    "authored": True,
                    "public_demo": True,
                    "extraction": None,
                }
            ]
        },
    )

    empty_closing = closing(status="active")
    checkpoints = [
        checkpoint(
            "checkpoint-initial",
            0,
            "initial",
            status="active",
            messages=[],
            operations=[],
            closing_view=empty_closing,
            include_consensus=False,
            include_documents=False,
        ),
        checkpoint(
            "checkpoint-active",
            1,
            "active",
            status="active",
            messages=[director_message()],
            operations=[operation("executing", final_message_id=None)],
            closing_view=empty_closing,
            include_consensus=False,
            include_documents=True,
        ),
        checkpoint(
            "checkpoint-completed",
            2,
            "completed",
            status="active",
            messages=[director_message(), final_message()],
            operations=[operation("completed", final_message_id=FINAL_MESSAGE_ID)],
            closing_view=empty_closing,
            include_consensus=True,
            include_documents=True,
        ),
        checkpoint(
            "checkpoint-closed",
            3,
            "closed",
            status="ended",
            messages=[director_message(), final_message(), summary_message()],
            operations=[operation("completed", final_message_id=FINAL_MESSAGE_ID)],
            closing_view=closing(
                status="ended",
                stage="completed",
                votes=closing_votes(),
                summary=SUMMARY_TEXT,
                summary_message_id=SUMMARY_MESSAGE_ID,
            ),
            include_consensus=True,
            include_documents=True,
        ),
    ]
    for item in checkpoints:
        write_json(
            PLACEHOLDER / "checkpoints" / f"{item['checkpoint_id']}.json", item
        )

    write_json(PLACEHOLDER / "tapes" / "tape-credit-analyst.json", tape())
    write_json(PLACEHOLDER / "closing_tapes" / "tape-closing.json", closing_tape())
    write_json(PLACEHOLDER / "retrieval" / "retrieval-credit-analyst.json", retrieval())

    write_json(
        PLACEHOLDER / "manifest.json",
        manifest(
            package_id="placeholder-analyst",
            version="1",
            title="Recorded placeholder: synthetic credit review",
            content_sha256="0" * 64,
            checkpoints=[
                "checkpoint-initial",
                "checkpoint-active",
                "checkpoint-completed",
                "checkpoint-closed",
            ],
            tapes=["tape-credit-analyst"],
            closing_tapes=["tape-closing"],
            retrieval_keys=["retrieval-credit-analyst"],
            intents=[
                {
                    "intent_id": "start-credit-analyst",
                    "kind": "start_participant",
                    "checkpoint": "checkpoint-active",
                    "participant_id": PARTICIPANT_ID,
                    "operation_id": OPERATION_ID,
                    "tape_id": "tape-credit-analyst",
                    "closing_tape_id": None,
                    "label": "Ask the Credit Analyst",
                },
                {
                    "intent_id": "close-meeting",
                    "kind": "request_closing",
                    "checkpoint": "checkpoint-completed",
                    "participant_id": None,
                    "operation_id": None,
                    "tape_id": None,
                    "closing_tape_id": "tape-closing",
                    "label": "Close the meeting",
                },
            ],
            beats=[
                {
                    "beat_id": "meet-the-board",
                    "title": "Meet the board",
                    "anchor": "roster",
                    "checkpoint": "checkpoint-initial",
                    "intent_id": None,
                },
                {
                    "beat_id": "request-credit-analyst",
                    "title": "Request the Credit Analyst",
                    "anchor": "chat",
                    "checkpoint": "checkpoint-active",
                    "intent_id": "start-credit-analyst",
                },
                {
                    "beat_id": "review-the-answer",
                    "title": "Review the recorded answer",
                    "anchor": "chat",
                    "checkpoint": "checkpoint-completed",
                    "intent_id": None,
                },
                {
                    "beat_id": "close-the-meeting",
                    "title": "Close the meeting",
                    "anchor": "closing",
                    "checkpoint": "checkpoint-completed",
                    "intent_id": "close-meeting",
                },
            ],
            provenance={
                "kind": "recorded",
                "authored": True,
                "synthetic": True,
                "note": (
                    "Placeholder content for the spec-17 mechanism. "
                    "Spec 18 replaces it with approved bond content."
                ),
            },
        ),
    )
    finalize(PLACEHOLDER)


def build_minimal(root: Path, *, version: str, title: str) -> None:
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    payload = checkpoint(
        "checkpoint-initial",
        0,
        "initial",
        status="active",
        messages=[],
        operations=[],
        closing_view=closing(status="active"),
        include_consensus=False,
        include_documents=False,
    )
    write_json(root / "checkpoints" / "checkpoint-initial.json", payload)
    write_json(
        root / "manifest.json",
        manifest(
            package_id="fixture-minimal",
            version=version,
            title=title,
            content_sha256="0" * 64,
            checkpoints=["checkpoint-initial"],
            tapes=[],
            closing_tapes=[],
            retrieval_keys=[],
            intents=[],
            beats=[],
            provenance={"kind": "recorded", "authored": True, "synthetic": True},
        ),
    )
    finalize(root)


def main() -> None:
    build_placeholder()
    build_minimal(FIXTURES / "fixture-minimal", version="1", title="Fixture minimal v1")
    build_minimal(
        FIXTURES / "fixture-minimal-v2", version="2", title="Fixture minimal v2"
    )
    print("replay packages rebuilt")


if __name__ == "__main__":
    main()
