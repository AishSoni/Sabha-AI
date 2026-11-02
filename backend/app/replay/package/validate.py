"""Semantic validation for replay packages (spec-17).

Validation is intentionally independent of any database: the same function
runs against a package directory before publication and against staged rows
during publication. Every failure is a stable code plus a path, so the CLI and
tests can assert on the contract rather than on prose.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from typing import Any, Iterable

from pydantic import ValidationError, TypeAdapter

from app.modules.knowledge.presentation.schemas import DocumentResponse
from app.modules.meetings.domain.models import (
    Consensus,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
)
from app.modules.meetings.domain.services import (
    ClosingMode,
    ClosingStage,
    has_strict_majority,
    requires_vote,
    tally_votes,
)
from app.modules.meetings.presentation.schemas import ClosingView

from app.replay.constants import MAX_TAPE_BYTES, MAX_TAPE_EVENTS

from .issues import PackageIssue
from .loader import LoadedPackage, _canonical_sha256
from .model import (
    MAX_CLOSING_TAPES,
    MAX_EXPLORATION_CHAPTERS,
    MAX_EXPLORATION_CHECKPOINTS,
    MAX_EXPLORATION_OUTGOING,
    MAX_EXPLORATION_TRANSITIONS,
    MAX_PARTICIPANT_TAPES,
    MAX_WORKSPACE_CHUNKS_PER_DOCUMENT,
    MAX_WORKSPACE_DOCUMENTS,
    MAX_WORKSPACE_PERSONAS,
    MAX_WORKSPACE_PRACTICE_SETUPS,
    MAX_WORKSPACE_PROMPT_CHARS,
    MAX_WORKSPACE_REVISIONS_PER_PERSONA,
    MAX_WORKSPACE_SAMPLES,
    MAX_WORKSPACE_STACKS,
    MAX_WORKSPACE_TOTAL_PROMPT_CHARS,
    MAX_WORKSPACE_TOTAL_SAMPLE_BYTES,
    PREPARED_FOLLOW_UP_TURN_COUNT,
    PREPARED_REPLY_TURN_COUNT,
    PREVIEWABLE_MEDIA_TYPES,
    SUPPORTED_EVENT_VERSIONS,
    SUPPORTED_READ_VERSIONS,
    SUPPORTED_SCHEMA_VERSIONS,
    SUPPORTED_WORKSPACE_SEED_VERSIONS,
    TERMINAL_EVENT_TYPES,
    resolve_passive_url,
)

OPERATION_STATUSES = {
    "queued",
    "executing",
    "completed",
    "failed",
    "interrupted",
    "cancelled",
}
NON_TERMINAL_STATUSES = {"queued", "executing"}
OPERATION_REQUIRED_KEYS = {
    "operation_id",
    "meeting_id",
    "participant_id",
    "request_key",
    "status",
    "admission",
    "queue_position",
    "created_at",
    "started_at",
    "completed_at",
    "final_message_id",
    "cancel_requested",
    "error",
    "effective_generation",
}
SECRET_KEYS = {
    "api_key",
    "apikey",
    "service_key",
    "service_role_key",
    "password",
    "secret",
    "authorization",
    "provider_key",
    "access_token",
    "refresh_token",
}


class _Issues:
    def __init__(self) -> None:
        self.items: list[PackageIssue] = []

    def add(self, code: str, path: str, detail: str) -> None:
        self.items.append(PackageIssue(code, path, detail))

    def expect(self, condition: bool, code: str, path: str, detail: str) -> bool:
        if not condition:
            self.add(code, path, detail)
        return condition


def _parse(model, payload: Any, path: str, issues: _Issues):
    try:
        return model.model_validate(payload)
    except Exception as exc:  # pydantic ValidationError or domain ValueError
        message = str(exc).splitlines()[0] if str(exc) else "invalid shape"
        issues.add("invalid_dto", path, message)
        return None


def _parse_list(model, payload: Any, path: str, issues: _Issues):
    try:
        return TypeAdapter(list[model]).validate_python(payload)
    except (ValidationError, ValueError, TypeError) as exc:
        message = str(exc).splitlines()[0] if str(exc) else "invalid shape"
        issues.add("invalid_dto", path, message)
        return None


def _hash_matches(loaded: LoadedPackage, relative: str, sha: str, path: str, issues: _Issues) -> None:
    actual = loaded.file_hashes.get(relative)
    if actual is None:
        issues.add("missing_asset", path, f"{relative} is not part of the package")
        return
    if actual != sha:
        issues.add("hash_mismatch", path, f"expected {sha}, found {actual}")


def _scan_secrets(value: Any, path: str, issues: _Issues) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in SECRET_KEYS:
                issues.add("forbidden_field", path, f"field {key!r} is not allowed")
            _scan_secrets(item, f"{path}.{key}", issues)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _scan_secrets(item, f"{path}[{index}]", issues)


def _is_tz_aware(value: datetime | None) -> bool:
    return value is None or value.tzinfo is not None


def _check_citations(value: Any, path: str, issues: _Issues) -> list[dict]:
    citations: list[dict] = []
    if not isinstance(value, list):
        issues.add("invalid_dto", path, "citations must be a list")
        return citations
    for index, citation in enumerate(value):
        if not isinstance(citation, dict):
            issues.add("invalid_citation", f"{path}[{index}]", "citation must be an object")
            continue
        source = citation.get("source")
        if not isinstance(source, str) or not source:
            issues.add("invalid_citation", f"{path}[{index}]", "citation source is required")
        url = citation.get("url")
        if url is not None and resolve_passive_url(url) is None:
            issues.add(
                "unsafe_url",
                f"{path}[{index}]",
                "citation URL must be passive http(s) without credentials",
            )
        citations.append(citation)
    return citations


def _check_message(
    message: dict,
    path: str,
    participant_ids: set[str],
    issues: _Issues,
) -> None:
    sender_type = message.get("sender_type")
    if sender_type not in ("user", "ai", "system"):
        issues.add("invalid_message", path, "unknown sender_type")
    if sender_type == "ai" and message.get("sender_id") not in participant_ids:
        issues.add("dangling_id", path, "AI message sender is not a participant")
    if not isinstance(message.get("content"), str):
        issues.add("invalid_message", path, "content must be a string")
    _check_citations(message.get("citations") or [], f"{path}.citations", issues)
    if message.get("estimated_cost"):
        issues.add("synthetic_cost", path, "recorded messages must not invent cost")
    request_key = message.get("request_key")
    if request_key is not None and not isinstance(request_key, str):
        issues.add("invalid_message", path, "request_key must be a string")


def _validate_meeting_reads(
    checkpoint,
    manifest,
    issues: _Issues,
) -> tuple[MeetingWithParticipants | None, dict[str, Any]]:
    reads = checkpoint.reads
    path = f"checkpoints/{checkpoint.checkpoint_id}.json"
    meeting = None

    if "meeting" in reads:
        meeting = _parse(
            MeetingWithParticipants, reads["meeting"], f"{path}#/meeting", issues
        )
        if meeting is not None:
            if str(meeting.id) != manifest.meeting_id:
                issues.add("meeting_mismatch", f"{path}#/meeting", "meeting id differs from manifest")
            participant_ids = {str(item.id) for item in meeting.participants}
            seen_messages: set[str] = set()
            last_sequence = -1
            for index, message in enumerate(meeting.messages):
                message_path = f"{path}#/meeting/messages[{index}]"
                if str(message.id) in seen_messages:
                    issues.add("duplicate_id", message_path, "duplicate message id")
                seen_messages.add(str(message.id))
                if message.sequence is not None:
                    if message.sequence <= last_sequence:
                        issues.add(
                            "non_monotonic",
                            message_path,
                            "message sequence must increase",
                        )
                    last_sequence = message.sequence
                for stamp in (message.created_at,):
                    if not _is_tz_aware(stamp):
                        issues.add("naive_timestamp", message_path, "timestamp must be timezone-aware")
                _check_message(
                    message.model_dump(mode="json"),
                    message_path,
                    participant_ids,
                    issues,
                )
            for index, participant in enumerate(meeting.participants):
                if not _is_tz_aware(participant.created_at):
                    issues.add(
                        "naive_timestamp",
                        f"{path}#/meeting/participants[{index}]",
                        "timestamp must be timezone-aware",
                    )

    if "meetings" in reads:
        meetings = _parse_list(Meeting, reads["meetings"], f"{path}#/meetings", issues)
        if meetings is not None:
            if manifest.meeting_id not in {str(item.id) for item in meetings}:
                issues.add(
                    "dangling_id",
                    f"{path}#/meetings",
                    "meeting list does not contain the recorded meeting",
                )

    if "disagreements" in reads:
        disagreements = _parse_list(
            Disagreement, reads["disagreements"], f"{path}#/disagreements", issues
        )
        if disagreements is not None and meeting is not None:
            participant_ids = {str(item.id) for item in meeting.participants}
            for index, item in enumerate(disagreements):
                if str(item.meeting_id) != manifest.meeting_id:
                    issues.add(
                        "meeting_mismatch",
                        f"{path}#/disagreements[{index}]",
                        "disagreement belongs to another meeting",
                    )
                if str(item.source_ai_id) not in participant_ids:
                    issues.add(
                        "dangling_id",
                        f"{path}#/disagreements[{index}]",
                        "source participant is unknown",
                    )

    if "consensus" in reads:
        consensus = _parse_list(
            Consensus, reads["consensus"], f"{path}#/consensus", issues
        )
        if consensus is not None:
            for index, item in enumerate(consensus):
                if str(item.meeting_id) != manifest.meeting_id:
                    issues.add(
                        "meeting_mismatch",
                        f"{path}#/consensus[{index}]",
                        "consensus belongs to another meeting",
                    )

    if "context_stats" in reads:
        stats = reads["context_stats"]
        if not isinstance(stats, dict):
            issues.add("invalid_dto", f"{path}#/context_stats", "must be an object")
        else:
            for field in ("current_tokens", "max_tokens", "usage_percent"):
                value = stats.get(field)
                if not isinstance(value, (int, float)) or value < 0:
                    issues.add(
                        "invalid_dto",
                        f"{path}#/context_stats.{field}",
                        "must be a non-negative number",
                    )
            if isinstance(stats.get("max_tokens"), (int, float)) and stats["max_tokens"] <= 0:
                issues.add(
                    "invalid_dto",
                    f"{path}#/context_stats.max_tokens",
                    "max_tokens must be positive",
                )
            if isinstance(stats.get("usage_percent"), (int, float)) and not (
                0 <= stats["usage_percent"] <= 100
            ):
                issues.add(
                    "invalid_dto",
                    f"{path}#/context_stats.usage_percent",
                    "usage_percent must be within 0..100",
                )

    if "documents" in reads:
        documents = _parse_list(
            DocumentResponse, reads["documents"], f"{path}#/documents", issues
        )
        if documents is not None:
            for index, document in enumerate(documents):
                if document.meeting_id is not None and str(document.meeting_id) != manifest.meeting_id:
                    issues.add(
                        "meeting_mismatch",
                        f"{path}#/documents[{index}]",
                        "document belongs to another meeting",
                    )

    if "closing" in reads:
        closing = _parse(ClosingView, reads["closing"], f"{path}#/closing", issues)
        if closing is not None:
            if closing.meeting_id != manifest.meeting_id:
                issues.add(
                    "meeting_mismatch",
                    f"{path}#/closing",
                    "closing belongs to another meeting",
                )
            _validate_closing_view(closing, meeting, f"{path}#/closing", issues)

    if "safe_config" in reads:
        config = reads["safe_config"]
        if not isinstance(config, dict):
            issues.add("invalid_dto", f"{path}#/safe_config", "must be an object")
        _scan_secrets(config, f"{path}#/safe_config", issues)

    if "operations" in reads:
        operations = reads["operations"]
        if not isinstance(operations, list):
            issues.add("invalid_dto", f"{path}#/operations", "must be a list")
        else:
            seen: set[str] = set()
            for index, operation in enumerate(operations):
                operation_path = f"{path}#/operations[{index}]"
                if not isinstance(operation, dict):
                    issues.add("invalid_dto", operation_path, "must be an object")
                    continue
                missing = OPERATION_REQUIRED_KEYS - set(operation)
                if missing:
                    issues.add(
                        "invalid_dto",
                        operation_path,
                        f"missing fields: {', '.join(sorted(missing))}",
                    )
                operation_id = str(operation.get("operation_id"))
                if operation_id in seen:
                    issues.add("duplicate_id", operation_path, "duplicate operation id")
                seen.add(operation_id)
                if operation.get("status") not in OPERATION_STATUSES:
                    issues.add("invalid_operation", operation_path, "unknown status")
                if str(operation.get("meeting_id")) != manifest.meeting_id:
                    issues.add(
                        "meeting_mismatch", operation_path, "operation belongs to another meeting"
                    )
                if meeting is not None and operation.get("participant_id") not in {
                    str(item.id) for item in meeting.participants
                }:
                    issues.add(
                        "dangling_id", operation_path, "operation participant is unknown"
                    )

    return meeting, reads


def _validate_closing_view(
    closing: ClosingView,
    meeting: MeetingWithParticipants | None,
    path: str,
    issues: _Issues,
) -> None:
    if closing.stage is not None and closing.stage not in {stage.value for stage in ClosingStage}:
        issues.add("invalid_closing", path, f"unknown closing stage {closing.stage!r}")

    if closing.mode is not None and closing.mode not in {mode.value for mode in ClosingMode}:
        issues.add("invalid_closing", path, f"unknown closing mode {closing.mode!r}")

    if closing.stage == ClosingStage.COMPLETED.value:
        if closing.meeting_status not in ("ended", "archived"):
            issues.add(
                "policy_conflict",
                path,
                "a completed closing must present ended/archived",
            )
        if meeting is not None:
            participant_ids = {str(item.id) for item in meeting.participants}
            for index, vote in enumerate(closing.votes):
                if vote.participant_id not in participant_ids:
                    issues.add(
                        "dangling_id",
                        f"{path}#/votes[{index}]",
                        "closing vote belongs to an unknown participant",
                    )
        if closing.mode == ClosingMode.VOTE.value:
            tally = tally_votes([vote.vote for vote in closing.votes])
            if not has_strict_majority(tally.yes_count, tally.eligible_count):
                issues.add(
                    "policy_conflict",
                    path,
                    "recorded vote tally is not a strict majority",
                )
        if meeting is not None:
            message_ids = {str(item.id) for item in meeting.messages}
            if closing.summary_message_id and closing.summary_message_id not in message_ids:
                issues.add(
                    "dangling_id",
                    path,
                    "summary message is missing from the completed meeting",
                )
        if closing.mode is not None and meeting is not None:
            try:
                if requires_vote(closing.mode, "active"):
                    if not closing.votes:
                        issues.add(
                            "policy_conflict",
                            path,
                            "a vote closing must record ballots",
                        )
            except ValueError:
                issues.add("policy_conflict", path, "closing mode cannot close an active meeting")


def _validate_turn_tape(tape, package: LoadedPackage, issues: _Issues) -> None:
    path = f"tapes/{tape.tape_id}.json"
    if len(tape.events) > MAX_TAPE_EVENTS:
        issues.add("tape_too_large", path, "turn tape exceeds the event cap")
    if len(json.dumps(tape.model_dump(mode="json"))) > MAX_TAPE_BYTES:
        issues.add("tape_too_large", path, "turn tape exceeds the byte cap")
    initial = package.checkpoints.get(tape.initial_checkpoint)
    completed = package.checkpoints.get(tape.completed_checkpoint)
    if initial is None:
        issues.add("dangling_id", path, "initial checkpoint is missing")
    if completed is None:
        issues.add("dangling_id", path, "completed checkpoint is missing")
        return

    sequences = [event.sequence for event in tape.events]
    if len(set(sequences)) != len(sequences):
        issues.add("duplicate_sequence", path, "event sequences must be unique")
    if sequences != sorted(sequences):
        issues.add("non_monotonic", path, "event sequences must increase")
    if not tape.events:
        issues.add("missing_terminal", path, "a tape needs at least a terminal event")
        return

    terminals = [event for event in tape.events if event.type in TERMINAL_EVENT_TYPES]
    if len(terminals) != 1:
        issues.add("terminal_count", path, f"expected exactly one terminal, found {len(terminals)}")
    elif tape.events[-1] is not terminals[0]:
        issues.add("terminal_not_last", path, "the terminal event must be last")
    elif any(event.type in TERMINAL_EVENT_TYPES for event in tape.events[:-1]):
        issues.add("terminal_not_last", path, "no terminal event may precede the end")

    tool_calls: dict[tuple[str, str], dict] = {}
    text_parts: list[str] = []
    thinking_parts: list[str] = []
    citation_events: list[dict] = []
    tool_records: list[dict] = []

    for event in tape.events:
        event_path = f"{path}#/{event.event_id}"
        payload = event.payload
        if event.type in ("text", "thinking"):
            content = payload.get("content")
            if not isinstance(content, str) or not content:
                issues.add("invalid_event", event_path, "content must be a non-empty string")
            elif event.type == "text":
                text_parts.append(content)
            else:
                thinking_parts.append(content)
        elif event.type == "status":
            if payload.get("status") not in NON_TERMINAL_STATUSES:
                issues.add("invalid_event", event_path, "status events must be non-terminal")
        elif event.type == "tool_call":
            invocation_id = payload.get("invocation_id")
            call_id = payload.get("call_id")
            if not invocation_id or not call_id or not payload.get("tool_name"):
                issues.add(
                    "unpaired_tool",
                    event_path,
                    "tool_call needs invocation_id, call_id, and tool_name",
                )
            elif (invocation_id, call_id) in tool_calls:
                issues.add("duplicate_tool", event_path, "tool call identity repeats")
            else:
                tool_calls[(invocation_id, call_id)] = payload
        elif event.type == "tool_result":
            identity = (payload.get("invocation_id"), payload.get("call_id"))
            if identity not in tool_calls:
                issues.add("unpaired_tool", event_path, "tool_result has no prior tool_call")
            else:
                tool_records.append({**tool_calls[identity], "result": payload.get("result"), "is_error": bool(payload.get("is_error"))})
                del tool_calls[identity]
        elif event.type == "citation":
            citation = {
                key: payload.get(key)
                for key in (
                    "source",
                    "title",
                    "url",
                    "snippet",
                    "claim_id",
                    "locator",
                    "document_id",
                    "revision_id",
                    "chunk_id",
                    "chunk_index",
                    "page_number",
                )
                if payload.get(key) is not None
            }
            if not citation.get("source"):
                issues.add("invalid_event", event_path, "citation source is required")
            if citation.get("url") and resolve_passive_url(citation["url"]) is None:
                issues.add("unsafe_url", event_path, "citation URL must be passive http(s)")
            citation_events.append(citation)
        elif event.type == "done":
            if not payload.get("message_id"):
                issues.add("invalid_event", event_path, "done needs message_id")
        elif event.type in ("error", "interrupted", "cancelled"):
            if event.type == "error" and not payload.get("code"):
                issues.add("invalid_event", event_path, "error needs a code")

    if tool_calls:
        issues.add(
            "unpaired_tool",
            path,
            f"{len(tool_calls)} tool call(s) never received a result",
        )

    if initial is not None:
        initial_operations = {
            str(operation.get("operation_id")): operation
            for operation in initial.reads.get("operations", [])
            if isinstance(operation, dict)
        }
        if tape.operation_id not in initial_operations:
            issues.add(
                "dangling_id",
                path,
                "initial checkpoint does not expose the recorded operation",
            )
        else:
            status = initial_operations[tape.operation_id].get("status")
            if status not in NON_TERMINAL_STATUSES:
                issues.add(
                    "terminal_visible",
                    path,
                    "initial checkpoint already exposes a terminal operation",
                )

    completed_meeting, _ = _validate_meeting_reads(completed, package.manifest, issues)
    completed_operations = {
        str(operation.get("operation_id")): operation
        for operation in completed.reads.get("operations", [])
        if isinstance(operation, dict)
    }
    operation = completed_operations.get(tape.operation_id)
    if operation is None:
        issues.add("dangling_id", path, "completed checkpoint has no such operation")
        return
    if operation.get("status") != "completed":
        issues.add("invalid_operation", path, "completed checkpoint operation is not completed")

    final_message = None
    if completed_meeting is not None:
        final_id = operation.get("final_message_id")
        if not final_id:
            issues.add("invalid_operation", path, "completed operation has no final message")
        else:
            final_message = next(
                (message for message in completed_meeting.messages if str(message.id) == str(final_id)),
                None,
            )
            if final_message is None:
                issues.add("dangling_id", path, "final message is absent from the completed meeting")

    done_payload = terminals[0].payload if terminals else {}
    if final_message is not None and done_payload.get("message_id"):
        if str(done_payload["message_id"]) != str(final_message.id):
            issues.add("mismatched_terminal", path, "terminal message id disagrees with checkpoint")
        if "".join(text_parts) != final_message.content:
            issues.add("mismatched_terminal", path, "streamed text disagrees with the final message")
        if "".join(thinking_parts) != (final_message.thinking_content or ""):
            issues.add(
                "mismatched_terminal",
                path,
                "streamed thinking disagrees with the final message",
            )
        citation_keys = (
            "source",
            "title",
            "url",
            "snippet",
            "claim_id",
            "locator",
            "document_id",
            "revision_id",
            "chunk_id",
            "chunk_index",
            "page_number",
        )
        recorded_citations = [
            {
                key: value
                for key in citation_keys
                if (value := getattr(citation, key, None)) is not None
            }
            for citation in final_message.citations
        ]
        streamed_citations = [
            {
                key: value
                for key in citation_keys
                if (value := item.get(key)) is not None
            }
            for item in citation_events
        ]
        if Counter(json.dumps(item, sort_keys=True) for item in streamed_citations) != Counter(
            json.dumps(item, sort_keys=True) for item in recorded_citations
        ):
            issues.add("mismatched_terminal", path, "citation events disagree with the final message")
        if tool_records:
            expected = {"calls": tool_records}
            if final_message.tool_artifacts != expected:
                issues.add(
                    "mismatched_terminal",
                    path,
                    "tool events disagree with the final message artifacts",
                )
        elif final_message.tool_artifacts:
            issues.add(
                "mismatched_terminal",
                path,
                "final message has artifacts but the tape records no tools",
            )

    if operation.get("final_message_id") and completed_meeting is not None and str(operation["final_message_id"]) != str(done_payload.get("message_id")):
        issues.add("mismatched_terminal", path, "operation/message terminal ids disagree")

    # The active checkpoint must not reveal the outcome early.
    active_meeting, _ = _validate_meeting_reads(initial, package.manifest, issues)
    if active_meeting is not None:
        if any(str(message.id) == str(done_payload.get("message_id")) for message in active_meeting.messages):
            issues.add("premature_terminal", path, "initial checkpoint exposes the final message")
        final_text = "".join(text_parts)
        if final_text and any(message.content == final_text for message in active_meeting.messages):
            issues.add(
                "premature_terminal",
                path,
                "initial checkpoint exposes the final text",
            )


def _validate_closing_tape(tape, package: LoadedPackage, issues: _Issues) -> None:
    path = f"closing_tapes/{tape.tape_id}.json"
    if len(tape.events) > MAX_TAPE_EVENTS:
        issues.add("tape_too_large", path, "closing tape exceeds the event cap")
    if len(json.dumps(tape.model_dump(mode="json"))) > MAX_TAPE_BYTES:
        issues.add("tape_too_large", path, "closing tape exceeds the byte cap")
    completed = package.checkpoints.get(tape.completed_checkpoint)
    if completed is None:
        issues.add("dangling_id", path, "completed checkpoint is missing")
        return
    if "closing" not in completed.reads:
        issues.add("dangling_id", path, "completed checkpoint has no closing read")
        return
    closing = _parse(
        ClosingView,
        completed.reads["closing"],
        f"checkpoints/{completed.checkpoint_id}.json#/closing",
        issues,
    )
    if closing is None:
        return
    if closing.closing_id != tape.closing_id:
        issues.add("mismatched_terminal", path, "closing identity disagrees with checkpoint")
    if closing.stage != ClosingStage.COMPLETED.value:
        issues.add("invalid_closing", path, "recorded closing tape requires a completed closing")

    # No earlier checkpoint may already expose the closing prose. The visible
    # closing snapshot at a non-completed checkpoint must remain empty. With an
    # exploration graph, "earlier" means graph ancestry; checkpoint ordinals are
    # serialization metadata only.
    terminal_texts = [event.text for event in tape.events if event.terminal]
    if package.manifest.transitions:
        earlier_ids = _transition_reachability(package).get(
            tape.completed_checkpoint, {tape.completed_checkpoint}
        ) - {tape.completed_checkpoint}
        earlier_checkpoints = [
            package.checkpoints[checkpoint_id]
            for checkpoint_id in earlier_ids
            if checkpoint_id in package.checkpoints
        ]
    else:
        earlier_checkpoints = [
            checkpoint
            for checkpoint in package.checkpoints.values()
            if checkpoint.ordinal < completed.ordinal
        ]
    for checkpoint in earlier_checkpoints:
        if checkpoint.checkpoint_id == tape.completed_checkpoint:
            continue
        earlier = checkpoint.reads.get("closing")
        if not isinstance(earlier, dict):
            continue
        if earlier.get("summary") and any(
            text in earlier["summary"] for text in terminal_texts
        ):
            issues.add(
                "premature_terminal",
                f"checkpoints/{checkpoint.checkpoint_id}.json#/closing",
                "an earlier checkpoint exposes the closing summary",
            )
        for vote in earlier.get("votes") or []:
            reason = vote.get("reason")
            if reason and any(text in reason for text in terminal_texts):
                issues.add(
                    "premature_terminal",
                    f"checkpoints/{checkpoint.checkpoint_id}.json#/closing",
                    "an earlier checkpoint exposes a closing ballot reason",
                )

    sequences = [event.sequence for event in tape.events]
    if sequences != sorted(sequences) or len(set(sequences)) != len(sequences):
        issues.add("non_monotonic", path, "closing event sequences must strictly increase")

    items: dict[str, list] = {}
    for event in tape.events:
        event_path = f"{path}#/{event.event_id}"
        if event.provisional == event.terminal:
            issues.add(
                "invalid_event", event_path, "event must be exactly provisional or terminal"
            )
        if event.kind == "ballot" and not event.subject_id:
            issues.add("invalid_event", event_path, "ballot text needs a subject_id")
        if event.terminal and event.result is None:
            issues.add("invalid_event", event_path, "terminal text needs a result")
        if event.kind == "summary" and event.terminal and event.result != "completed":
            issues.add("invalid_event", event_path, "summary result must be completed")
        items.setdefault(event.item_id, []).append(event)

    for item_id, events in items.items():
        terminals = [event for event in events if event.terminal]
        if len(terminals) != 1:
            issues.add("terminal_count", f"{path}#/{item_id}", "each item needs one terminal event")
            continue
        terminal = terminals[0]
        if terminal.sequence != max(event.sequence for event in events):
            issues.add("mismatched_terminal", f"{path}#/{item_id}", "terminal must be the last item event")
        previous = [event for event in events if event.sequence < terminal.sequence]
        for event in previous:
            if not terminal.text.startswith(event.text):
                issues.add(
                    "mismatched_terminal",
                    f"{path}#/{item_id}",
                    "terminal text does not continue the provisional text",
                )
        if terminal.kind == "ballot":
            vote = next(
                (item for item in closing.votes if item.participant_id == terminal.subject_id),
                None,
            )
            if vote is None:
                issues.add("dangling_id", f"{path}#/{item_id}", "ballot subject is not a recorded vote")
            else:
                expected = "yes" if vote.vote is True else "no" if vote.vote is False else "no-vote"
                if terminal.result != expected:
                    issues.add("mismatched_terminal", f"{path}#/{item_id}", "ballot result disagrees with the vote")
                if vote.reason != terminal.text:
                    issues.add("mismatched_terminal", f"{path}#/{item_id}", "ballot text disagrees with the closing snapshot")
        else:
            if closing.summary != terminal.text:
                issues.add("mismatched_terminal", f"{path}#/{item_id}", "summary text disagrees with the closing snapshot")
            if closing.summary_message_id is None:
                issues.add("dangling_id", f"{path}#/{item_id}", "summary has no message id")


def _validate_retrieval(record, package: LoadedPackage, issues: _Issues) -> None:
    path = f"retrieval/{record.retrieval_key}.json"
    if record.meeting_id != package.manifest.meeting_id:
        issues.add("meeting_mismatch", path, "retrieval belongs to another meeting")
    ranks = [hit.rank for hit in record.hits]
    if ranks != list(range(1, len(ranks) + 1)):
        issues.add("invalid_retrieval", path, "hit ranks must be 1..n in order")
    chunk_ids = [hit.chunk_id for hit in record.hits]
    if len(set(chunk_ids)) != len(chunk_ids):
        issues.add("duplicate_id", path, "retrieval repeats a chunk")
    for index, hit in enumerate(record.hits):
        hit_path = f"{path}#/hits[{index}]"
        if not hit.passage.strip():
            issues.add("invalid_retrieval", hit_path, "passage must not be empty")
        if hit.score < 0:
            issues.add("invalid_retrieval", hit_path, "score must be non-negative")
        if hit.citation:
            _check_citations([hit.citation], f"{hit_path}.citation", issues)

    completed = next(
        (
            checkpoint
            for checkpoint in package.checkpoints.values()
            if checkpoint.phase == "completed"
        ),
        None,
    )
    if completed is None:
        return
    documents = completed.reads.get("documents") or []
    document_ids = {
        str(document.get("id"))
        for document in documents
        if isinstance(document, dict)
    }
    for hit in record.hits:
        if document_ids and hit.document_id not in document_ids:
            issues.add(
                "dangling_id",
                path,
                f"retrieval document {hit.document_id!r} is not in the checkpoint",
            )

    if record.scope == "private":
        if not record.stack_id:
            issues.add("ineligible_retrieval", path, "private retrieval needs a stack_id")
        meeting = completed.reads.get("meeting") or {}
        participants = meeting.get("participants") or []
        participant = next(
            (
                item
                for item in participants
                if isinstance(item, dict) and str(item.get("id")) == record.participant_id
            ),
            None,
        )
        if participant is None:
            issues.add("dangling_id", path, "private retrieval participant is unknown")
        elif record.stack_id not in (participant.get("stack_ids") or []):
            issues.add(
                "ineligible_retrieval",
                path,
                "private retrieval stack is not on the participant snapshot",
            )


def _iter_claim_references(value: Any, path: str) -> Iterable[tuple[dict[str, Any], str]]:
    """Yield citation-like mappings that carry a claim reference."""

    if isinstance(value, dict):
        if "claim_id" in value:
            yield value, path
        for key, child in value.items():
            yield from _iter_claim_references(child, f"{path}/{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _iter_claim_references(child, f"{path}[{index}]")


def _validate_claims(package: LoadedPackage, issues: _Issues) -> None:
    manifest = package.manifest
    claims = {claim.claim_id: claim for claim in manifest.claims}
    asset_ids = {record.asset_id for record in package.assets.assets}

    for index, claim in enumerate(manifest.claims):
        claim_path = f"manifest.json#/claims[{index}]"
        if claim.evidence_asset_id is not None and claim.evidence_asset_id not in asset_ids:
            issues.add(
                "dangling_id",
                claim_path,
                f"evidence asset {claim.evidence_asset_id} is missing",
            )
            continue
        if (
            claim.excerpt
            and claim.evidence_asset_id
            and claim.evidence_asset_id in asset_ids
        ):
            record = next(
                record
                for record in package.assets.assets
                if record.asset_id == claim.evidence_asset_id
            )
            raw = package.asset_bytes.get(record.path)
            if raw is not None and (
                record.media_type.startswith("text/")
                or record.media_type in ("application/json", "application/xml")
            ):
                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = ""
                if claim.excerpt not in text:
                    issues.add(
                        "invalid_claim",
                        claim_path,
                        "claim excerpt is not present in the retained evidence asset",
                    )

    for index, beat in enumerate(manifest.beats):
        beat_path = f"manifest.json#/beats[{index}]"
        for claim_id in beat.claim_ids:
            if claim_id not in claims:
                issues.add(
                    "dangling_id",
                    beat_path,
                    f"beat claim {claim_id} is missing",
                )

    for checkpoint_id, checkpoint in package.checkpoints.items():
        for reference, path in _iter_claim_references(
            checkpoint.reads, f"checkpoints/{checkpoint_id}.json#/reads"
        ):
            _validate_claim_reference(reference, path, claims, issues)

    for tape_id, tape in package.tapes.items():
        for index, event in enumerate(tape.events):
            for reference, path in _iter_claim_references(
                event.payload, f"tapes/{tape_id}.json#/events[{index}]/payload"
            ):
                _validate_claim_reference(reference, path, claims, issues)

    for retrieval_key, record in package.retrievals.items():
        for index, hit in enumerate(record.hits):
            for reference, path in _iter_claim_references(
                hit.citation, f"retrieval/{retrieval_key}.json#/hits[{index}]/citation"
            ):
                _validate_claim_reference(reference, path, claims, issues)


def _validate_claim_reference(
    reference: dict[str, Any],
    path: str,
    claims: dict[str, Any],
    issues: _Issues,
) -> None:
    claim_id = reference.get("claim_id")
    if claim_id is None:
        return
    if not isinstance(claim_id, str) or not claim_id:
        issues.add("invalid_claim", path, "claim_id must be a non-empty string")
        return
    if claim_id not in claims:
        issues.add("dangling_id", path, f"citation claim {claim_id} is missing")
        return
    snippet = reference.get("snippet")
    locator = reference.get("locator")
    if not isinstance(snippet, str) or not snippet.strip():
        issues.add("invalid_claim", path, "claim citation needs a readable snippet")
    if not isinstance(locator, str) or not locator.strip():
        issues.add("invalid_claim", path, "claim citation needs a locator")


def _validate_guided_intents(package: LoadedPackage, issues: _Issues) -> None:
    manifest = package.manifest
    for index, intent in enumerate(manifest.intents):
        intent_path = f"manifest.json#/intents[{index}]"
        checkpoint = package.checkpoints.get(intent.checkpoint)
        if intent.kind in ("create_meeting", "archive_meeting"):
            if intent.operation_id or intent.tape_id or intent.closing_tape_id:
                issues.add(
                    "invalid_intent",
                    intent_path,
                    "checkpoint intents cannot reference a tape or operation",
                )
            if checkpoint is not None:
                if intent.kind == "create_meeting" and checkpoint.phase != "active":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "create meeting intent must select an active checkpoint",
                    )
                if intent.kind == "create_meeting" and "meeting" not in checkpoint.reads:
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "create meeting intent must select a meeting checkpoint",
                    )
                if intent.kind == "archive_meeting" and checkpoint.phase != "archived":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "archive intent must select an archived checkpoint",
                    )
        if intent.kind == "request_closing" and (intent.operation_id or intent.tape_id):
            issues.add(
                "invalid_intent",
                intent_path,
                "closing intents cannot reference a turn operation or tape",
            )
        if (
            intent.kind == "director_follow_up"
            and not intent.operation_id
            and not intent.tape_id
        ):
            if intent.closing_tape_id:
                issues.add(
                    "invalid_intent",
                    intent_path,
                    "a checkpoint follow-up cannot reference a closing tape",
                )
            if checkpoint is not None:
                if checkpoint.phase != "active":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "a checkpoint follow-up must select an active checkpoint",
                    )
                if "meeting" not in checkpoint.reads:
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "a checkpoint follow-up must select a meeting checkpoint",
                    )


def _meeting_message_ids(checkpoint) -> list[str]:
    if checkpoint is None:
        return []
    meeting = checkpoint.reads.get("meeting")
    if not isinstance(meeting, dict):
        return []
    return [
        str(message.get("id"))
        for message in meeting.get("messages") or []
        if isinstance(message, dict)
    ]


def _transition_reachability(package: LoadedPackage) -> dict[str, set[str]]:
    """Return checkpoints that can reach each checkpoint (including itself)."""

    adjacency: dict[str, set[str]] = {
        checkpoint_id: set() for checkpoint_id in package.checkpoints
    }
    for transition in package.manifest.transitions:
        adjacency.setdefault(transition.source_checkpoint, set()).add(
            transition.completed_checkpoint
        )
    reverse: dict[str, set[str]] = {
        checkpoint_id: set() for checkpoint_id in adjacency
    }
    for source, destinations in adjacency.items():
        for destination in destinations:
            reverse.setdefault(destination, set()).add(source)
    ancestors: dict[str, set[str]] = {}
    for checkpoint_id in adjacency:
        seen = {checkpoint_id}
        stack = [checkpoint_id]
        while stack:
            current = stack.pop()
            for parent in reverse.get(current, ()):
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        ancestors[checkpoint_id] = seen
    return ancestors


def _transition_kind_issue(kinds: set[str]) -> str | None:
    if "request_closing" in kinds and len(kinds) > 1:
        return "closing cannot share a source state with other actions"
    if "create_meeting" in kinds and len(kinds) > 1:
        return "meeting creation cannot share a source state"
    if "archive_meeting" in kinds and len(kinds) > 1:
        return "archiving cannot share a source state"
    return None


def _validate_exploration(package: LoadedPackage, issues: _Issues) -> None:
    """Validate the bounded prepared-transition graph and chapter catalog.

    Canonical beats keep their separate linear gate. This validator only
    accepts explicit, data-only legal actions whose source, tape, transcript,
    and terminal state agree.
    """

    manifest = package.manifest
    transitions = manifest.transitions
    chapters = manifest.chapters

    if manifest.schema_version < 2 and (transitions or chapters):
        issues.add(
            "invalid_exploration",
            "manifest.json",
            "exploration metadata requires schema version 2",
        )
        return
    if not transitions and not chapters:
        return
    if not transitions or not chapters:
        issues.add(
            "invalid_exploration",
            "manifest.json",
            "chapters and transitions must be authored together",
        )
    if len(package.checkpoints) > MAX_EXPLORATION_CHECKPOINTS:
        issues.add("exploration_limit", "checkpoints", "too many checkpoints")
    if len(transitions) > MAX_EXPLORATION_TRANSITIONS:
        issues.add("exploration_limit", "manifest.json#/transitions", "too many transitions")
    if len(chapters) > MAX_EXPLORATION_CHAPTERS:
        issues.add("exploration_limit", "manifest.json#/chapters", "too many chapters")
    if len(package.tapes) > MAX_PARTICIPANT_TAPES:
        issues.add("exploration_limit", "tapes", "too many participant tapes")
    if len(package.closing_tapes) > MAX_CLOSING_TAPES:
        issues.add("exploration_limit", "closing_tapes", "too many closing tapes")

    intents = {intent.intent_id: intent for intent in manifest.intents}
    transition_by_id = {
        transition.transition_id: transition for transition in transitions
    }
    asset_ids = {asset.asset_id for asset in package.assets.assets}
    claim_ids = {claim.claim_id for claim in manifest.claims}
    outgoing: dict[str, list] = {}

    for index, transition in enumerate(transitions):
        path = f"manifest.json#/transitions[{index}]"
        source = package.checkpoints.get(transition.source_checkpoint)
        completed = package.checkpoints.get(transition.completed_checkpoint)
        intent = intents.get(transition.intent_id)
        outgoing.setdefault(transition.source_checkpoint, []).append(transition)
        if source is None:
            issues.add("dangling_id", path, "source checkpoint is missing")
        if completed is None:
            issues.add("dangling_id", path, "completed checkpoint is missing")
        if intent is None:
            issues.add("dangling_id", path, "transition intent is missing")
            continue
        if transition.kind != intent.kind:
            issues.add("mismatched_id", path, "transition kind disagrees with intent")
        for field in (
            "participant_id",
            "operation_id",
            "tape_id",
            "closing_tape_id",
        ):
            declared = getattr(intent, field)
            if declared is not None and declared != getattr(transition, field):
                issues.add(
                    "mismatched_id",
                    path,
                    f"transition {field} disagrees with intent",
                )
        if transition.source_checkpoint == transition.completed_checkpoint:
            issues.add("invalid_transition", path, "transition must advance the checkpoint")

        if transition.kind in ("start_participant", "director_follow_up") and (
            transition.tape_id or transition.operation_id
        ):
            tape = package.tapes.get(transition.tape_id or "")
            if tape is None:
                issues.add("dangling_id", path, "transition tape is missing")
            else:
                if tape.initial_checkpoint != transition.source_checkpoint:
                    issues.add("mismatched_id", path, "tape does not start at the transition source")
                if tape.completed_checkpoint != transition.completed_checkpoint:
                    issues.add("mismatched_id", path, "tape does not end at the transition destination")
                if tape.participant_id != transition.participant_id:
                    issues.add("mismatched_id", path, "tape participant disagrees")
                if tape.operation_id != transition.operation_id:
                    issues.add("mismatched_id", path, "tape operation disagrees")
                if source is not None and completed is not None:
                    initial_ids = _meeting_message_ids(source)
                    completed_ids = _meeting_message_ids(completed)
                    if completed_ids[: len(initial_ids)] != initial_ids:
                        issues.add(
                            "invalid_merge",
                            path,
                            "branch transcript does not accumulate the source transcript",
                        )
                    done = next(
                        (
                            event
                            for event in reversed(tape.events)
                            if event.type == "done"
                        ),
                        None,
                    )
                    final_message_id = (
                        done.payload.get("message_id") if done is not None else None
                    )
                    if not final_message_id:
                        issues.add("missing_terminal", path, "tape has no final message id")
                    elif completed_ids[-1:] != [str(final_message_id)]:
                        issues.add(
                            "mismatched_terminal",
                            path,
                            "completed checkpoint does not end with the tape message",
                        )
                    elif len(completed_ids) != len(initial_ids) + 1:
                        issues.add(
                            "invalid_merge",
                            path,
                            "turn transition must add exactly one message",
                        )

        if transition.kind == "request_closing":
            tape = package.closing_tapes.get(transition.closing_tape_id or "")
            if tape is None:
                issues.add("dangling_id", path, "transition closing tape is missing")
            else:
                if tape.initial_checkpoint != transition.source_checkpoint:
                    issues.add("mismatched_id", path, "closing tape does not start at the source")
                if tape.completed_checkpoint != transition.completed_checkpoint:
                    issues.add("mismatched_id", path, "closing tape does not end at the destination")
                if completed is not None and completed.phase != "closed":
                    issues.add("invalid_transition", path, "closing must complete a closed checkpoint")
                if source is not None and completed is not None:
                    initial_ids = _meeting_message_ids(source)
                    completed_ids = _meeting_message_ids(completed)
                    if completed_ids[: len(initial_ids)] != initial_ids:
                        issues.add(
                            "invalid_merge",
                            path,
                            "closing transcript does not accumulate the source transcript",
                        )
                    if len(completed_ids) not in (len(initial_ids), len(initial_ids) + 1):
                        issues.add(
                            "invalid_merge",
                            path,
                            "closing transition may add at most one final message",
                        )

        if transition.kind in ("create_meeting", "archive_meeting"):
            if transition.completed_checkpoint != intent.checkpoint:
                issues.add(
                    "mismatched_id",
                    path,
                    "instant transition must complete the intent checkpoint",
                )
            if transition.tape_id or transition.closing_tape_id or transition.operation_id:
                issues.add("invalid_transition", path, "instant transition cannot use a tape")
            if transition.kind == "create_meeting" and completed is not None:
                if completed.phase != "active":
                    issues.add("invalid_transition", path, "create must complete an active checkpoint")
            if transition.kind == "archive_meeting":
                if completed is not None and completed.phase != "archived":
                    issues.add("invalid_transition", path, "archive must complete an archived checkpoint")
                if source is not None and completed is not None:
                    if _meeting_message_ids(source) != _meeting_message_ids(completed):
                        issues.add(
                            "invalid_merge",
                            path,
                            "archive transition must preserve the transcript",
                        )

        if transition.kind == "director_follow_up" and not transition.tape_id:
            if transition.completed_checkpoint != intent.checkpoint:
                issues.add(
                    "mismatched_id",
                    path,
                    "checkpoint follow-up must complete the intent checkpoint",
                )
            if source is not None and completed is not None:
                initial_ids = _meeting_message_ids(source)
                completed_ids = _meeting_message_ids(completed)
                if completed_ids[: len(initial_ids)] != initial_ids:
                    issues.add(
                        "invalid_merge",
                        path,
                        "checkpoint follow-up must preserve the transcript",
                    )
                elif len(completed_ids) != len(initial_ids) + 1:
                    issues.add(
                        "invalid_merge",
                        path,
                        "checkpoint follow-up must add exactly the Director message",
                    )

    # Each intent maps to one transition, and every transition has a unique
    # intent. This keeps repeated participants unambiguous.
    by_intent: dict[str, list] = {}
    for transition in transitions:
        by_intent.setdefault(transition.intent_id, []).append(transition)
    for intent_id, items in by_intent.items():
        if len(items) != 1:
            issues.add(
                "duplicate_id",
                "manifest.json#/transitions",
                f"intent {intent_id!r} has more than one transition",
            )
    deck_intent_ids = {
        turn.intent_id
        for turn in manifest.prepared_turns
        if turn.kind == "reply"
    }
    for intent_id in intents:
        if intent_id in deck_intent_ids:
            continue
        if intent_id not in by_intent:
            issues.add(
                "dangling_id",
                "manifest.json#/transitions",
                f"intent {intent_id!r} has no transition",
            )

    for source, items in outgoing.items():
        if len(items) > MAX_EXPLORATION_OUTGOING:
            issues.add(
                "exploration_limit",
                f"manifest.json#/transitions[{source}]",
                "too many outgoing choices",
            )
        destinations = [item.completed_checkpoint for item in items]
        if len(set(destinations)) != len(destinations):
            issues.add("duplicate_id", f"manifest.json#/transitions[{source}]", "duplicate destination")
        kinds = {item.kind for item in items}
        if kind := _transition_kind_issue(kinds):
            issues.add("invalid_transition", f"manifest.json#/transitions[{source}]", kind)

    # Directed acyclic graph. Checkpoint ordinals are serialization metadata,
    # never branch chronology.
    state: dict[str, int] = {}

    def visit(node: str) -> None:
        state[node] = 1
        for item in outgoing.get(node, ()):
            target = item.completed_checkpoint
            if state.get(target) == 1:
                issues.add(
                    "exploration_cycle",
                    "manifest.json#/transitions",
                    f"cycle through {target!r}",
                )
            elif state.get(target, 0) == 0:
                visit(target)
        state[node] = 2

    for checkpoint_id in package.checkpoints:
        if state.get(checkpoint_id, 0) == 0:
            visit(checkpoint_id)

    ancestors = _transition_reachability(package)
    for index, transition in enumerate(transitions):
        path = f"manifest.json#/transitions[{index}]"
        for prerequisite_id in transition.prerequisites:
            prerequisite = transition_by_id.get(prerequisite_id)
            if prerequisite is None:
                issues.add("dangling_id", path, "prerequisite transition is missing")
                continue
            if prerequisite.completed_checkpoint not in ancestors.get(
                transition.source_checkpoint, set()
            ):
                issues.add(
                    "invalid_prerequisite",
                    path,
                    "prerequisite is not completed before this source state",
                )

    # Reject implicit branch merges: one checkpoint may only receive multiple
    # transitions when their source transcripts are genuinely identical.
    incoming: dict[str, list] = {}
    for transition in transitions:
        incoming.setdefault(transition.completed_checkpoint, []).append(transition)
    for destination, items in incoming.items():
        if len(items) < 2:
            continue
        transcripts = {
            tuple(_meeting_message_ids(package.checkpoints.get(item.source_checkpoint)))
            for item in items
        }
        if len(transcripts) > 1:
            issues.add(
                "invalid_merge",
                f"manifest.json#/transitions[{destination}]",
                "different branch transcripts merge into one checkpoint",
            )

    # Every reachable state must offer a coherent route to a closed and
    # archived result. Dead ends and closings without archive fail closed.
    archived = {
        checkpoint_id
        for checkpoint_id, checkpoint in package.checkpoints.items()
        if checkpoint.phase == "archived"
    }
    closed = {
        checkpoint_id
        for checkpoint_id, checkpoint in package.checkpoints.items()
        if checkpoint.phase == "closed"
    }
    forward: dict[str, set[str]] = {
        checkpoint_id: set() for checkpoint_id in package.checkpoints
    }
    for transition in transitions:
        forward.setdefault(transition.source_checkpoint, set()).add(
            transition.completed_checkpoint
        )

    def reachable(start: str, targets: set[str]) -> bool:
        seen: set[str] = set()
        stack = [start]
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            if node in targets:
                return True
            stack.extend(forward.get(node, ()))
        return False

    reachable_states: set[str] = set()
    stack = [manifest.initial_checkpoint]
    while stack:
        node = stack.pop()
        if node in reachable_states or node not in package.checkpoints:
            continue
        reachable_states.add(node)
        stack.extend(forward.get(node, ()))
    for checkpoint_id in reachable_states:
        if checkpoint_id in archived:
            continue
        if not reachable(checkpoint_id, archived):
            issues.add(
                "missing_continuation",
                f"checkpoints/{checkpoint_id}.json",
                "checkpoint cannot reach an archived result",
            )
        if checkpoint_id not in closed and not reachable(checkpoint_id, closed):
            issues.add(
                "missing_continuation",
                f"checkpoints/{checkpoint_id}.json",
                "checkpoint cannot reach a completed closing",
            )

    # Two meaningful choice opportunities: participant turns and prepared
    # Director follow-ups. Cosmetic duplicate labels are rejected.
    participant_sources = {
        source: [item for item in items if item.kind == "start_participant"]
        for source, items in outgoing.items()
    }
    director_sources = {
        source: [item for item in items if item.kind == "director_follow_up"]
        for source, items in outgoing.items()
    }
    if not any(len(items) >= 2 for items in participant_sources.values()):
        issues.add(
            "invalid_exploration",
            "manifest.json#/transitions",
            "expanded package needs a state with two prepared participant turns",
        )
    if not any(len(items) >= 2 for items in director_sources.values()):
        issues.add(
            "invalid_exploration",
            "manifest.json#/transitions",
            "expanded package needs a state with two prepared Director follow-ups",
        )
    for source, items in director_sources.items():
        labels = [item.label.strip().lower() for item in items]
        if len(set(labels)) != len(labels):
            issues.add(
                "invalid_exploration",
                f"manifest.json#/transitions[{source}]",
                "prepared follow-ups need distinct labels",
            )

    # Canonical steps keep their approved linear path through canonical
    # transitions. A branch action can never complete an unrelated beat.
    canonical_by_intent = {
        item.intent_id: item for item in transitions if item.canonical
    }
    for index, beat in enumerate(manifest.beats):
        for step_index, step in enumerate(beat.steps):
            if step.intent_id is None or step.completion == "acknowledge":
                continue
            transition = canonical_by_intent.get(step.intent_id)
            if transition is None:
                issues.add(
                    "invalid_beat",
                    f"manifest.json#/beats[{index}]/steps[{step_index}]",
                    "canonical step has no canonical transition",
                )

    for index, chapter in enumerate(chapters):
        path = f"manifest.json#/chapters[{index}]"
        checkpoint = package.checkpoints.get(chapter.checkpoint)
        if checkpoint is None:
            issues.add("dangling_id", path, "chapter checkpoint is missing")
            continue
        reads = checkpoint.reads
        if chapter.route == "list" and "meetings" not in reads:
            issues.add("invalid_chapter", path, "list chapter needs a meetings read")
        if chapter.route == "new" and "safe_config" not in reads:
            issues.add("invalid_chapter", path, "new chapter needs the board safe config")
        if chapter.route in ("board", "meeting") and "meeting" not in reads:
            issues.add("invalid_chapter", path, "chapter needs a meeting read")
        if chapter.tab in ("disagreements", "consensus", "closing", "documents"):
            if chapter.tab not in reads:
                issues.add("invalid_chapter", path, f"chapter needs a {chapter.tab} read")
        if chapter.tab in ("chat", "roster") and "meeting" not in reads:
            issues.add("invalid_chapter", path, "conversation chapters need a meeting read")
        for claim_id in chapter.claim_ids:
            if claim_id not in claim_ids:
                issues.add("dangling_id", path, f"chapter claim {claim_id} is missing")
        for asset_id in chapter.input_asset_ids:
            if asset_id not in asset_ids:
                issues.add("dangling_id", path, f"chapter asset {asset_id} is missing")
        if chapter.tab == "summary":
            meeting = reads.get("meeting")
            messages = meeting.get("messages") if isinstance(meeting, dict) else []
            summary = next(
                (
                    message
                    for message in messages or []
                    if isinstance(message, dict)
                    and str(message.get("id")) == chapter.summary_message_id
                ),
                None,
            )
            if summary is None:
                issues.add("dangling_id", path, "summary message is missing")
            else:
                if summary.get("sender_type") != "system":
                    issues.add("invalid_chapter", path, "recorded summary must be a system message")
                if not isinstance(summary.get("content"), str) or not summary["content"].strip():
                    issues.add("invalid_chapter", path, "recorded summary must have text")
                if summary.get("estimated_cost"):
                    issues.add("synthetic_cost", path, "recorded summary must not carry a charge")



    manifest = package.manifest
    for index, intent in enumerate(manifest.intents):
        intent_path = f"manifest.json#/intents[{index}]"
        checkpoint = package.checkpoints.get(intent.checkpoint)
        if intent.kind in ("create_meeting", "archive_meeting"):
            if intent.operation_id or intent.tape_id or intent.closing_tape_id:
                issues.add(
                    "invalid_intent",
                    intent_path,
                    "checkpoint intents cannot reference a tape or operation",
                )
            if checkpoint is not None:
                if intent.kind == "create_meeting" and checkpoint.phase != "active":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "create meeting intent must select an active checkpoint",
                    )
                if intent.kind == "create_meeting" and "meeting" not in checkpoint.reads:
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "create meeting intent must select a meeting checkpoint",
                    )
                if intent.kind == "archive_meeting" and checkpoint.phase != "archived":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "archive intent must select an archived checkpoint",
                    )
        if intent.kind == "request_closing" and (intent.operation_id or intent.tape_id):
            issues.add(
                "invalid_intent",
                intent_path,
                "closing intents cannot reference a turn operation or tape",
            )
        if (
            intent.kind == "director_follow_up"
            and not intent.operation_id
            and not intent.tape_id
        ):
            if intent.closing_tape_id:
                issues.add(
                    "invalid_intent",
                    intent_path,
                    "a checkpoint follow-up cannot reference a closing tape",
                )
            if checkpoint is not None:
                if checkpoint.phase != "active":
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "a checkpoint follow-up must select an active checkpoint",
                    )
                if "meeting" not in checkpoint.reads:
                    issues.add(
                        "invalid_intent",
                        intent_path,
                        "a checkpoint follow-up must select a meeting checkpoint",
                    )


def _validate_guided_beats(package: LoadedPackage, issues: _Issues) -> None:
    manifest = package.manifest
    checkpoints = package.checkpoints
    intents = {intent.intent_id: intent for intent in manifest.intents}
    asset_ids = {asset.asset_id for asset in package.assets.assets}
    previous_completed: str | None = None
    seen_step_intents: set[str] = set()
    completion_intents = {
        "turn_terminal": {"start_participant", "director_follow_up"},
        "closing_completed": {"request_closing"},
        "checkpoint": {"create_meeting", "archive_meeting", "director_follow_up"},
    }

    for index, beat in enumerate(manifest.beats):
        beat_path = f"manifest.json#/beats[{index}]"
        rich = bool(beat.steps) or any(
            value is not None
            for value in (
                beat.ordinal,
                beat.objective,
                beat.route,
                beat.start_checkpoint,
                beat.completed_checkpoint,
                beat.disclosure,
            )
        )
        if not rich:
            continue

        for field_name, value in (
            ("ordinal", beat.ordinal),
            ("objective", beat.objective),
            ("route", beat.route),
            ("start_checkpoint", beat.start_checkpoint),
            ("completed_checkpoint", beat.completed_checkpoint),
            ("disclosure", beat.disclosure),
        ):
            if value is None:
                issues.add("invalid_beat", beat_path, f"guided beat needs {field_name}")
        if not beat.steps:
            issues.add("invalid_beat", beat_path, "guided beat needs ordered steps")
        if beat.intent_id is not None:
            issues.add("invalid_beat", beat_path, "guided beats use step intents")
        if beat.ordinal is not None and beat.ordinal != index + 1:
            issues.add("invalid_beat", beat_path, "beat ordinal must match journey order")
        if beat.checkpoint != beat.start_checkpoint:
            issues.add("invalid_beat", beat_path, "beat checkpoint must be its start checkpoint")

        for field_name, value in (
            ("start_checkpoint", beat.start_checkpoint),
            ("completed_checkpoint", beat.completed_checkpoint),
        ):
            if value is not None and value not in checkpoints:
                issues.add("dangling_id", beat_path, f"{field_name} is missing")

        if beat.start_checkpoint is not None:
            if previous_completed is None:
                if beat.start_checkpoint != manifest.initial_checkpoint:
                    issues.add(
                        "invalid_beat",
                        beat_path,
                        "first guided beat must start at the initial checkpoint",
                    )
            elif beat.start_checkpoint != previous_completed:
                issues.add(
                    "invalid_beat",
                    beat_path,
                    "guided beats must form a linear checkpoint chain",
                )

        step_checkpoint = beat.start_checkpoint
        seen_beat_intents: set[str] = set()
        for step_index, step in enumerate(beat.steps):
            step_path = f"{beat_path}/steps[{step_index}]"
            if step.completion == "acknowledge":
                if step.intent_id is not None:
                    issues.add(
                        "invalid_beat",
                        step_path,
                        "acknowledge steps cannot reference an intent",
                    )
                continue
            if step.intent_id is None:
                issues.add("invalid_beat", step_path, "completing steps need an intent")
                continue
            if step.intent_id in seen_beat_intents:
                issues.add("duplicate_id", step_path, "step intent repeats")
            if step.intent_id in seen_step_intents:
                issues.add("duplicate_id", step_path, "intent is used by another beat")
            seen_beat_intents.add(step.intent_id)
            seen_step_intents.add(step.intent_id)
            intent = intents.get(step.intent_id)
            if intent is None:
                issues.add("dangling_id", step_path, "step intent is missing")
                continue
            allowed = completion_intents.get(step.completion, set())
            if intent.kind not in allowed:
                issues.add(
                    "invalid_beat",
                    step_path,
                    "step completion does not match intent kind",
                )
                continue
            source: str | None = None
            destination: str | None = None
            if step.completion == "checkpoint":
                source = step_checkpoint
                destination = intent.checkpoint
            elif step.completion == "turn_terminal":
                tape = package.tapes.get(intent.tape_id or "")
                source = intent.checkpoint
                destination = tape.completed_checkpoint if tape is not None else None
            elif step.completion == "closing_completed":
                tape = package.closing_tapes.get(intent.closing_tape_id or "")
                source = intent.checkpoint
                destination = tape.completed_checkpoint if tape is not None else None
            if (
                source is not None
                and step_checkpoint is not None
                and source != step_checkpoint
            ):
                issues.add(
                    "invalid_beat",
                    step_path,
                    "step does not start at the previous checkpoint",
                )
            if destination is not None:
                step_checkpoint = destination

        if (
            step_checkpoint is not None
            and beat.completed_checkpoint is not None
            and step_checkpoint != beat.completed_checkpoint
        ):
            issues.add(
                "mismatched_id",
                beat_path,
                "step sequence does not reach beat completion",
            )

        for asset_id in beat.input_asset_ids:
            if asset_id not in asset_ids:
                issues.add("dangling_id", beat_path, f"input asset {asset_id} is missing")
        previous_completed = beat.completed_checkpoint


def _validate_workspace_seed(package: LoadedPackage, issues: _Issues) -> None:
    """Validate the optional schema-2 expansion without inventing live links."""

    manifest = package.manifest
    seed = package.workspace_seed
    path = manifest.workspace_seed or "manifest.json#/workspace_seed"

    if manifest.schema_version >= 2:
        if manifest.workspace_seed is None:
            issues.add(
                "invalid_manifest",
                "manifest.json",
                "schema 2 requires a workspace seed reference",
            )
        elif seed is None:
            issues.add("missing_file", path, "declared workspace seed is missing")
        if manifest.workspace_seed_sha256 is None:
            issues.add(
                "invalid_manifest",
                "manifest.json",
                "schema 2 requires a workspace seed hash",
            )
        elif (
            package.workspace_seed_payload is not None
            and manifest.workspace_seed_sha256
            != _canonical_sha256(package.workspace_seed_payload)
        ):
            issues.add(
                "hash_mismatch",
                path,
                "declared workspace seed hash disagrees with the file",
            )
    elif manifest.workspace_seed is not None:
        issues.add(
            "invalid_manifest",
            path,
            "schema 1 packages cannot declare a workspace seed",
        )

    if seed is None:
        return

    if seed.seed_version not in SUPPORTED_WORKSPACE_SEED_VERSIONS:
        issues.add(
            "unsupported_version",
            path,
            f"seed_version {seed.seed_version} is not supported",
        )

    if len(seed.personas) > MAX_WORKSPACE_PERSONAS:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed exceeds {MAX_WORKSPACE_PERSONAS} personas",
        )
    if len(seed.stacks) > MAX_WORKSPACE_STACKS:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed exceeds {MAX_WORKSPACE_STACKS} stacks",
        )
    if len(seed.practice_setups) > MAX_WORKSPACE_PRACTICE_SETUPS:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed exceeds {MAX_WORKSPACE_PRACTICE_SETUPS} practice setups",
        )

    stack_ids = set()
    for index, stack in enumerate(seed.stacks):
        stack_path = f"{path}#/stacks[{index}]"
        if stack.stack_id in stack_ids:
            issues.add("duplicate_id", stack_path, "stack_id repeats")
        stack_ids.add(stack.stack_id)

    assets = {asset.asset_id: asset for asset in package.assets.assets}
    if len(seed.samples) > MAX_WORKSPACE_SAMPLES:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed exceeds {MAX_WORKSPACE_SAMPLES} upload samples",
        )
    sample_ids: set[str] = set()
    total_sample_bytes = 0
    for index, sample in enumerate(seed.samples):
        sample_path = f"{path}#/samples[{index}]"
        if sample.sample_id in sample_ids:
            issues.add("duplicate_id", sample_path, "sample_id repeats")
        sample_ids.add(sample.sample_id)
        total_sample_bytes += sample.size_bytes
        asset = assets.get(sample.asset_id)
        if asset is None:
            issues.add(
                "dangling_id",
                sample_path,
                f"sample asset {sample.asset_id!r} is not in the package",
            )
            continue
        if not asset.upload_approved:
            issues.add(
                "invalid_sample",
                sample_path,
                "sample asset is not approved for upload",
            )
        if not asset.public_demo:
            issues.add(
                "invalid_sample",
                sample_path,
                "sample bytes must be public package assets",
            )
        if sample.provenance == "demo-authored" and not asset.authored:
            issues.add(
                "invalid_sample",
                sample_path,
                "demo-authored samples must reference authored bytes",
            )
        if sample.provenance == "approved-source" and asset.authored:
            issues.add(
                "invalid_sample",
                sample_path,
                "approved-source samples must reference sourced bytes",
            )
        if sample.file_name != asset.path.rsplit("/", 1)[-1]:
            issues.add("sample_mismatch", sample_path, "file_name does not match the asset")
        if sample.media_type != asset.media_type:
            issues.add("sample_mismatch", sample_path, "media_type does not match the asset")
        if sample.size_bytes != asset.size:
            issues.add("sample_mismatch", sample_path, "size_bytes does not match the asset")
        if sample.sha256 != asset.sha256:
            issues.add("sample_mismatch", sample_path, "sha256 does not match the asset")
        if sample.preview_mode == "inline" and sample.media_type not in PREVIEWABLE_MEDIA_TYPES:
            issues.add(
                "invalid_sample",
                sample_path,
                "inline preview needs a supported preview media type",
            )
    if total_sample_bytes > MAX_WORKSPACE_TOTAL_SAMPLE_BYTES:
        issues.add(
            "too_many_records",
            path,
            f"upload samples exceed {MAX_WORKSPACE_TOTAL_SAMPLE_BYTES} bytes",
        )

    if len(seed.documents) > MAX_WORKSPACE_DOCUMENTS:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed exceeds {MAX_WORKSPACE_DOCUMENTS} seeded documents",
        )
    sample_by_id = {sample.sample_id: sample for sample in seed.samples}
    document_ids: set[str] = set()
    for index, document in enumerate(seed.documents):
        document_path = f"{path}#/documents[{index}]"
        if document.document_id in document_ids:
            issues.add("duplicate_id", document_path, "document_id repeats")
        document_ids.add(document.document_id)
        sample = sample_by_id.get(document.sample_id)
        if sample is None:
            issues.add(
                "dangling_id",
                document_path,
                f"sample {document.sample_id!r} is not seeded",
            )
            continue
        if document.status != "ready":
            issues.add(
                "invalid_document",
                document_path,
                "seeded documents must start ready",
            )
        if document.chunk_count != sample.prepared_chunk_count:
            issues.add(
                "invalid_document",
                document_path,
                "seeded chunk count does not match the sample scenario",
            )
        if document.chunk_count > MAX_WORKSPACE_CHUNKS_PER_DOCUMENT:
            issues.add(
                "invalid_document",
                document_path,
                "chunk count exceeds the practice ceiling",
            )
        if document.scope_kind not in sample.destination_kinds:
            issues.add(
                "invalid_document",
                document_path,
                "sample is not permitted in this destination kind",
            )
        if document.scope_kind == "stack":
            if document.scope_id not in stack_ids:
                issues.add(
                    "dangling_id",
                    document_path,
                    f"stack {document.scope_id!r} is not seeded",
                )
        else:
            issues.add(
                "invalid_document",
                document_path,
                "seeded practice documents must belong to a stack",
            )

    board_participant_ids: set[str] = set()
    initial = package.checkpoints.get(manifest.initial_checkpoint)
    if initial is not None:
        safe_config = initial.reads.get("safe_config") or {}
        if isinstance(safe_config, dict):
            board = safe_config.get("board")
            candidates: list[Any] = []
            if isinstance(board, dict):
                candidates.extend(board.get("participants") or [])
            # Legacy/fixture safe-config snapshots carry the participant list
            # at the top level; accept both shapes for the same cross-check.
            candidates.extend(safe_config.get("participants") or [])
            for participant in candidates:
                if isinstance(participant, dict):
                    participant_id = participant.get("participant_id")
                    if participant_id:
                        board_participant_ids.add(str(participant_id))

    persona_ids: set[str] = set()
    total_prompt_chars = 0
    for index, persona in enumerate(seed.personas):
        persona_path = f"{path}#/personas[{index}]"
        if persona.persona_id in persona_ids:
            issues.add("duplicate_id", persona_path, "persona_id repeats")
        persona_ids.add(persona.persona_id)
        if persona.recorded_participant_id is not None and (
            persona.recorded_participant_id not in board_participant_ids
        ):
            issues.add(
                "dangling_id",
                persona_path,
                "recorded_participant_id is not a prepared board participant",
            )
        if len(persona.revisions) > MAX_WORKSPACE_REVISIONS_PER_PERSONA:
            issues.add(
                "too_many_records",
                persona_path,
                f"persona exceeds {MAX_WORKSPACE_REVISIONS_PER_PERSONA} revisions",
            )
        for revision in persona.revisions:
            revision_path = f"{persona_path}/revisions/{revision.revision_id}"
            if len(revision.prompt) > MAX_WORKSPACE_PROMPT_CHARS:
                issues.add(
                    "invalid_prompt",
                    revision_path,
                    f"prompt exceeds {MAX_WORKSPACE_PROMPT_CHARS} characters",
                )
            total_prompt_chars += len(revision.prompt)
        for stack_id in persona.stack_ids:
            if stack_id not in stack_ids:
                issues.add(
                    "dangling_id",
                    persona_path,
                    f"stack {stack_id!r} is not seeded",
                )

    if total_prompt_chars > MAX_WORKSPACE_TOTAL_PROMPT_CHARS:
        issues.add(
            "too_many_records",
            path,
            f"workspace seed prompts exceed {MAX_WORKSPACE_TOTAL_PROMPT_CHARS} characters",
        )

    recorded_ids = (
        {intent.intent_id for intent in manifest.intents}
        | {beat.beat_id for beat in manifest.beats}
        | set(manifest.checkpoints)
    )
    setup_ids: set[str] = set()
    for index, setup in enumerate(seed.practice_setups):
        setup_path = f"{path}#/practice_setups[{index}]"
        if setup.setup_id in setup_ids:
            issues.add("duplicate_id", setup_path, "setup_id repeats")
        setup_ids.add(setup.setup_id)
        if setup.recorded_example_id not in recorded_ids:
            issues.add(
                "dangling_id",
                setup_path,
                "recorded_example_id does not name a recorded example",
            )

    _scan_secrets(seed.model_dump(mode="json"), path, issues)


def _checkpoint_messages(checkpoint) -> list[dict[str, Any]]:
    meeting = checkpoint.reads.get("meeting")
    if not isinstance(meeting, dict):
        return []
    messages = meeting.get("messages")
    if not isinstance(messages, list):
        return []
    return [message for message in messages if isinstance(message, dict)]


def _checkpoint_effect_ids(checkpoint) -> set[str]:
    """Collect the stable identities a settled checkpoint can expose."""

    known: set[str] = set()
    for message in _checkpoint_messages(checkpoint):
        message_id = message.get("id")
        if isinstance(message_id, str):
            known.add(message_id)
        citations = message.get("citations")
        if isinstance(citations, list):
            for citation in citations:
                if isinstance(citation, dict) and isinstance(
                    citation.get("claim_id"), str
                ):
                    known.add(citation["claim_id"])
        artifacts = message.get("tool_artifacts")
        if isinstance(artifacts, dict):
            calls = artifacts.get("calls")
            if isinstance(calls, list):
                for call in calls:
                    if not isinstance(call, dict):
                        continue
                    for key in ("invocation_id", "call_id"):
                        if isinstance(call.get(key), str):
                            known.add(call[key])
            tool_calls = artifacts.get("tool_calls")
            if isinstance(tool_calls, list):
                for call in tool_calls:
                    if not isinstance(call, dict):
                        continue
                    for key in ("invocation_id", "call_id"):
                        if isinstance(call.get(key), str):
                            known.add(call[key])
    operations = checkpoint.reads.get("operations")
    if isinstance(operations, list):
        for operation in operations:
            if isinstance(operation, dict) and isinstance(
                operation.get("operation_id"), str
            ):
                known.add(operation["operation_id"])
    for key in ("disagreements", "consensus"):
        records = checkpoint.reads.get(key)
        if isinstance(records, list):
            for record in records:
                if isinstance(record, dict) and isinstance(record.get("id"), str):
                    known.add(record["id"])
    closing = checkpoint.reads.get("closing")
    if isinstance(closing, dict) and isinstance(closing.get("summary_message_id"), str):
        known.add(closing["summary_message_id"])
    return known


def _validate_prepared_turn_deck(package: LoadedPackage, issues: _Issues) -> None:
    manifest = package.manifest

    if manifest.schema_version < 3:
        if (
            manifest.prepared_base_checkpoint is not None
            or manifest.prepared_turns
            or manifest.prepared_closing is not None
        ):
            issues.add(
                "invalid_prepared_turns",
                "manifest.json",
                "prepared turn decks require schema version 3",
            )
        return

    base = manifest.prepared_base_checkpoint
    if base is None:
        issues.add(
            "invalid_prepared_turns",
            "manifest.json",
            "schema 3 requires prepared_base_checkpoint",
        )
    elif base not in package.checkpoints:
        issues.add(
            "dangling_id",
            "manifest.json#/prepared_base_checkpoint",
            "prepared base checkpoint is missing",
        )
    else:
        base_checkpoint = package.checkpoints[base]
        if base_checkpoint.phase != "active":
            issues.add(
                "invalid_prepared_turns",
                "manifest.json#/prepared_base_checkpoint",
                "prepared base must be an active checkpoint",
            )
        if "meeting" not in base_checkpoint.reads:
            issues.add(
                "invalid_prepared_turns",
                "manifest.json#/prepared_base_checkpoint",
                "prepared base must expose the meeting",
            )

    replies = [turn for turn in manifest.prepared_turns if turn.kind == "reply"]
    follow_ups = [
        turn for turn in manifest.prepared_turns if turn.kind == "follow_up"
    ]
    if len(replies) != PREPARED_REPLY_TURN_COUNT:
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_turns",
            f"the turn deck requires exactly {PREPARED_REPLY_TURN_COUNT} replies",
        )
    if len(follow_ups) != PREPARED_FOLLOW_UP_TURN_COUNT:
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_turns",
            f"the turn deck requires exactly {PREPARED_FOLLOW_UP_TURN_COUNT} follow-up",
        )

    turn_by_id = {turn.turn_id: turn for turn in manifest.prepared_turns}
    reply_ids_by_turn = {
        turn.turn_id: set(turn.reply_message_ids) for turn in replies
    }
    all_reply_ids = set().union(*reply_ids_by_turn.values()) if replies else set()
    operations: dict[str, str] = {}
    tapes: dict[str, str] = {}
    checkpoints: dict[str, str] = {}
    intents = {intent.intent_id: intent for intent in manifest.intents}
    claims = {claim.claim_id for claim in manifest.claims}
    assets = {asset.asset_id for asset in package.assets.assets}

    for index, turn in enumerate(manifest.prepared_turns):
        turn_path = f"manifest.json#/prepared_turns[{index}]"
        if not turn.required:
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "every turn in the closed deck must be required",
            )
        if turn.kind == "follow_up":
            if turn.intent_id is not None:
                intent = intents.get(turn.intent_id)
                if intent is None:
                    issues.add(
                        "dangling_id",
                        turn_path,
                        "follow-up intent is missing",
                    )
                elif intent.kind != "director_follow_up":
                    issues.add(
                        "invalid_prepared_turns",
                        turn_path,
                        "follow-up intent must have kind director_follow_up",
                    )
            if turn.message_id in all_reply_ids:
                issues.add(
                    "invalid_prepared_turns",
                    turn_path,
                    "follow-up message collides with a deck reply",
                )
            for reply_turn in replies:
                result = package.checkpoints.get(reply_turn.result_checkpoint)
                if result is not None and turn.message_id in {
                    message.get("id") for message in _checkpoint_messages(result)
                }:
                    issues.add(
                        "invalid_prepared_turns",
                        turn_path,
                        "follow-up message is already present in a result checkpoint",
                    )
            continue

        if turn.operation_id in operations:
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "two deck replies share an operation",
            )
        operations[turn.operation_id] = turn.turn_id
        if turn.tape_id in tapes:
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "two deck replies share a tape",
            )
        tapes[turn.tape_id] = turn.turn_id
        if turn.result_checkpoint in checkpoints:
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "two deck replies share a result checkpoint",
            )
        checkpoints[turn.result_checkpoint] = turn.turn_id

        intent = intents.get(turn.intent_id)
        if intent is None:
            issues.add("dangling_id", turn_path, "turn intent is missing")
        else:
            if intent.kind != "start_participant":
                issues.add(
                    "invalid_prepared_turns",
                    turn_path,
                    "reply intent must have kind start_participant",
                )
            if intent.operation_id != turn.operation_id:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn operation disagrees with its intent",
                )
            if intent.tape_id != turn.tape_id:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn tape disagrees with its intent",
                )
            if intent.participant_id != turn.participant_id:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn participant disagrees with its intent",
                )

        tape = package.tapes.get(turn.tape_id)
        if tape is None:
            issues.add("dangling_id", turn_path, "turn tape is missing")
        else:
            if tape.operation_id != turn.operation_id:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn operation disagrees with its tape",
                )
            if tape.participant_id != turn.participant_id:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn participant disagrees with its tape",
                )
            if tape.initial_checkpoint != base:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn tape must start at the prepared base",
                )
            if tape.completed_checkpoint != turn.result_checkpoint:
                issues.add(
                    "mismatched_id",
                    turn_path,
                    "turn tape must complete at its isolated result",
                )

        result = package.checkpoints.get(turn.result_checkpoint)
        if result is None:
            issues.add("dangling_id", turn_path, "turn result checkpoint is missing")
            continue
        if result.phase != "active":
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "turn result must be an active checkpoint",
            )
        messages = _checkpoint_messages(result)
        message_ids = {message.get("id") for message in messages}
        for message_id in turn.reply_message_ids:
            if message_id not in message_ids:
                issues.add(
                    "dangling_id",
                    turn_path,
                    f"reply message {message_id} is missing from the result",
                )
        for message in messages:
            if message.get("id") in turn.reply_message_ids and message.get(
                "sender_type"
            ) != "ai":
                issues.add(
                    "invalid_prepared_turns",
                    turn_path,
                    "deck replies must be AI messages",
                )
        for other in replies:
            if other.turn_id == turn.turn_id:
                continue
            if message_ids & reply_ids_by_turn[other.turn_id]:
                issues.add(
                    "invalid_prepared_turns",
                    turn_path,
                    f"result contains the reply for {other.turn_id}",
                )
        if base is not None:
            base_ids = {
                message.get("id")
                for message in _checkpoint_messages(package.checkpoints[base])
            }
            if all_reply_ids & base_ids:
                issues.add(
                    "invalid_prepared_turns",
                    "manifest.json#/prepared_base_checkpoint",
                    "prepared base already contains a deck reply",
                )

        known_effects = _checkpoint_effect_ids(result) | claims | assets
        for effect_id in turn.effect_ids:
            if effect_id not in known_effects:
                issues.add(
                    "dangling_id",
                    turn_path,
                    f"effect {effect_id} is not present in the result",
                )
        if not turn.effect_ids:
            issues.add(
                "invalid_prepared_turns",
                turn_path,
                "a deck reply must name at least one settled effect",
            )

    closing = manifest.prepared_closing
    if closing is None:
        issues.add(
            "invalid_prepared_turns",
            "manifest.json",
            "schema 3 requires prepared_closing",
        )
        return

    if closing.closing_tape_id not in package.closing_tapes:
        issues.add("dangling_id", "manifest.json#/prepared_closing", "closing tape is missing")
    if closing.completed_checkpoint not in package.checkpoints:
        issues.add(
            "dangling_id",
            "manifest.json#/prepared_closing",
            "closing completion checkpoint is missing",
        )
    elif package.checkpoints[closing.completed_checkpoint].phase != "closed":
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_closing",
            "closing completion checkpoint must be closed",
        )
    if closing.archived_checkpoint not in package.checkpoints:
        issues.add(
            "dangling_id",
            "manifest.json#/prepared_closing",
            "archive checkpoint is missing",
        )
    elif package.checkpoints[closing.archived_checkpoint].phase != "archived":
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_closing",
            "archive checkpoint must be archived",
        )
    required_ids = {turn.turn_id for turn in manifest.prepared_turns if turn.required}
    if set(closing.required_turn_ids) != required_ids:
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_closing",
            "closing must require every required deck turn",
        )
    if set(closing.required_turn_ids) != set(turn_by_id):
        issues.add(
            "invalid_prepared_turns",
            "manifest.json#/prepared_closing",
            "closing must name the complete closed deck",
        )


def validate_package(package: LoadedPackage) -> list[PackageIssue]:
    issues = _Issues()
    manifest = package.manifest
    path = "manifest.json"

    issues.expect(
        manifest.schema_version in SUPPORTED_SCHEMA_VERSIONS,
        "unsupported_version",
        path,
        f"schema_version {manifest.schema_version} is not supported",
    )
    issues.expect(
        manifest.read_version in SUPPORTED_READ_VERSIONS,
        "unsupported_version",
        path,
        f"read_version {manifest.read_version} is not supported",
    )
    issues.expect(
        manifest.event_version in SUPPORTED_EVENT_VERSIONS,
        "unsupported_version",
        path,
        f"event_version {manifest.event_version} is not supported",
    )

    if package.content_sha256 != manifest.content_sha256:
        issues.add(
            "hash_mismatch",
            path,
            f"manifest content hash {manifest.content_sha256} does not match {package.content_sha256}",
        )

    checkpoints = package.checkpoints
    if manifest.initial_checkpoint not in checkpoints:
        issues.add("dangling_id", path, "initial checkpoint is missing")
    if len(set(manifest.checkpoints)) != len(manifest.checkpoints):
        issues.add("duplicate_id", path, "checkpoint list repeats an id")
    ordinals = [checkpoint.ordinal for checkpoint in checkpoints.values()]
    if len(set(ordinals)) != len(ordinals):
        issues.add("duplicate_id", "checkpoints", "checkpoint ordinals must be unique")

    for checkpoint_id, checkpoint in checkpoints.items():
        checkpoint_path = f"checkpoints/{checkpoint_id}.json"
        if checkpoint.checkpoint_id != checkpoint_id:
            issues.add("mismatched_id", checkpoint_path, "file name disagrees with checkpoint id")
        if checkpoint.meeting_id != manifest.meeting_id:
            issues.add("meeting_mismatch", checkpoint_path, "checkpoint meeting id differs")
        if checkpoint.phase == "initial" and checkpoint_id != manifest.initial_checkpoint:
            issues.add("invalid_checkpoint", checkpoint_path, "only the manifest initial checkpoint may be initial")
        if checkpoint.phase == "completed" and "meeting" not in checkpoint.reads:
            issues.add("invalid_checkpoint", checkpoint_path, "completed checkpoint needs a meeting read")
        issues.expect(
            bool(checkpoint.reads),
            "invalid_checkpoint",
            checkpoint_path,
            "checkpoint must expose at least one read",
        )
        _scan_secrets(checkpoint.reads, checkpoint_path, issues)
        _validate_meeting_reads(checkpoint, manifest, issues)

    initial = checkpoints.get(manifest.initial_checkpoint)
    if initial is not None and initial.phase != "initial":
        issues.add("invalid_checkpoint", "manifest.json", "initial checkpoint must have initial phase")

    for tape_id, tape in package.tapes.items():
        if tape.tape_id != tape_id:
            issues.add("mismatched_id", f"tapes/{tape_id}.json", "file name disagrees with tape id")
        if tape.meeting_id != manifest.meeting_id:
            issues.add("meeting_mismatch", f"tapes/{tape_id}.json", "tape meeting id differs")
        _validate_turn_tape(tape, package, issues)

    for tape_id, tape in package.closing_tapes.items():
        if tape.tape_id != tape_id:
            issues.add(
                "mismatched_id",
                f"closing_tapes/{tape_id}.json",
                "file name disagrees with tape id",
            )
        _validate_closing_tape(tape, package, issues)

    for key, record in package.retrievals.items():
        if record.retrieval_key != key:
            issues.add("mismatched_id", f"retrieval/{key}.json", "file name disagrees with retrieval key")
        _validate_retrieval(record, package, issues)

    asset_paths: set[str] = set()
    for record in package.assets.assets:
        asset_path = f"assets/index.json#{record.asset_id}"
        relative = f"assets/{record.path}"
        _hash_matches(package, relative, record.sha256, asset_path, issues)
        raw = package.asset_bytes.get(record.path)
        if raw is not None and len(raw) != record.size:
            issues.add("size_mismatch", asset_path, "declared size disagrees with the file")
        if record.path in asset_paths:
            issues.add("duplicate_id", asset_path, "asset path repeats")
        asset_paths.add(record.path)
        if not record.public_demo:
            issues.add("forbidden_asset", asset_path, "public demo packages require demo-safe assets")
        if resolve_passive_url(record.locator) is None and not record.locator.startswith("package:"):
            issues.add("unsafe_url", asset_path, "asset locator must be passive")
        if record.media_type not in PREVIEWABLE_MEDIA_TYPES:
            issues.add(
                "unsupported_asset",
                asset_path,
                f"no in-app renderer exists for media type {record.media_type}",
            )

    checkpoint_ids = set(checkpoints)
    tape_ids = set(package.tapes)
    closing_ids = set(package.closing_tapes)
    _validate_claims(package, issues)
    intent_ids: set[str] = set()
    for index, intent in enumerate(manifest.intents):
        intent_path = f"manifest.json#/intents[{index}]"
        if intent.intent_id in intent_ids:
            issues.add("duplicate_id", intent_path, "intent id repeats")
        intent_ids.add(intent.intent_id)
        if intent.checkpoint not in checkpoint_ids:
            issues.add("dangling_id", intent_path, "intent checkpoint is missing")
        if intent.tape_id is not None and intent.tape_id not in tape_ids:
            issues.add("dangling_id", intent_path, "intent tape is missing")
        if intent.closing_tape_id is not None and intent.closing_tape_id not in closing_ids:
            issues.add("dangling_id", intent_path, "intent closing tape is missing")
        if intent.kind == "start_participant" or (
            intent.kind == "director_follow_up"
            and (intent.operation_id or intent.tape_id)
        ):
            if not intent.operation_id:
                issues.add("invalid_intent", intent_path, "turn intents need an operation id")
            if not intent.tape_id:
                issues.add("invalid_intent", intent_path, "turn intents need a tape")
            if intent.tape_id in package.tapes:
                tape = package.tapes[intent.tape_id]
                if tape.operation_id != intent.operation_id:
                    issues.add("mismatched_id", intent_path, "intent operation disagrees with its tape")
                if tape.initial_checkpoint not in (intent.checkpoint, manifest.initial_checkpoint):
                    issues.add("mismatched_id", intent_path, "intent checkpoint is not the tape start")
        if intent.kind == "request_closing" and not intent.closing_tape_id:
            issues.add("invalid_intent", intent_path, "closing intent needs a closing tape")
        if intent.kind == "director_follow_up" and not intent.participant_id:
            issues.add("invalid_intent", intent_path, "follow-up needs a participant")

    for index, beat in enumerate(manifest.beats):
        beat_path = f"manifest.json#/beats[{index}]"
        if beat.checkpoint not in checkpoint_ids:
            issues.add("dangling_id", beat_path, "beat checkpoint is missing")
        if beat.intent_id is not None and beat.intent_id not in intent_ids:
            issues.add("dangling_id", beat_path, "beat intent is missing")

    _validate_prepared_turn_deck(package, issues)
    _validate_guided_intents(package, issues)
    _validate_guided_beats(package, issues)
    _validate_exploration(package, issues)
    _validate_workspace_seed(package, issues)

    costs_recorded = manifest.provenance.get("costs") == "recorded"
    if not costs_recorded:
        _scan_costs(package, issues)

    seen: set[tuple[str, str, str]] = set()
    unique: list[PackageIssue] = []
    for issue in issues.items:
        key = (issue.code, issue.path, issue.detail)
        if key in seen:
            continue
        seen.add(key)
        unique.append(issue)
    return unique


def _scan_costs(package: LoadedPackage, issues: _Issues) -> None:
    for checkpoint in package.checkpoints.values():
        meeting = checkpoint.reads.get("meeting")
        if isinstance(meeting, dict):
            if meeting.get("total_cost"):
                issues.add(
                    "synthetic_cost",
                    f"checkpoints/{checkpoint.checkpoint_id}.json#/meeting",
                    "package does not record costs",
                )
        closing = checkpoint.reads.get("closing")
        if isinstance(closing, dict):
            for vote in closing.get("votes") or []:
                if vote.get("estimated_cost") or vote.get("reported_cost"):
                    issues.add(
                        "synthetic_cost",
                        f"checkpoints/{checkpoint.checkpoint_id}.json#/closing",
                        "package does not record costs",
                    )
    for tape in package.tapes.values():
        for event in tape.events:
            if event.type == "done" and event.payload.get("estimated_cost"):
                issues.add(
                    "synthetic_cost",
                    f"tapes/{tape.tape_id}.json#/{event.event_id}",
                    "package does not record costs",
                )
