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

from .issues import PackageIssue
from .loader import LoadedPackage
from .model import (
    SUPPORTED_EVENT_VERSIONS,
    SUPPORTED_READ_VERSIONS,
    SUPPORTED_SCHEMA_VERSIONS,
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
MAX_TAPE_EVENTS = 400
MAX_TAPE_BYTES = 200_000
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
            citation = {key: payload.get(key) for key in ("source", "title", "url", "snippet")}
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
        recorded_citations = [
            {key: getattr(citation, key) for key in ("source", "title", "url", "snippet")}
            for citation in final_message.citations
        ]
        if Counter(json.dumps(item) for item in citation_events) != Counter(
            json.dumps(item) for item in recorded_citations
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
    # closing snapshot at a non-completed checkpoint must remain empty.
    terminal_texts = [event.text for event in tape.events if event.terminal]
    for checkpoint in package.checkpoints.values():
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

    checkpoint_ids = set(checkpoints)
    tape_ids = set(package.tapes)
    closing_ids = set(package.closing_tapes)
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
        if intent.kind in ("start_participant", "director_follow_up"):
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
