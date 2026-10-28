"""Checkpoint-consistent feature reads for recorded playback (spec-17)."""

from __future__ import annotations

from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.modules.knowledge.presentation.schemas import DocumentResponse
from app.modules.meetings.domain.models import (
    Consensus,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
)
from app.modules.meetings.presentation.schemas import ClosingView
from app.replay.contracts import ReplayNotFound
from app.replay.source import PublishedPackage, ReplayPackageUnavailable, ReplaySource


def operation_row(record: dict[str, Any]) -> dict[str, Any]:
    error = record.get("error") or {}
    return {
        "id": record.get("operation_id"),
        "meeting_id": record.get("meeting_id"),
        "participant_id": record.get("participant_id"),
        "request_key": record.get("request_key"),
        "status": record.get("status"),
        "admission": record.get("admission"),
        "queue_position": record.get("queue_position"),
        "created_at": record.get("created_at"),
        "started_at": record.get("started_at"),
        "completed_at": record.get("completed_at"),
        "final_message_id": record.get("final_message_id"),
        "cancel_requested": bool(record.get("cancel_requested")),
        "error_code": error.get("code"),
        "error_message": error.get("message"),
        "effective_settings": record.get("effective_generation"),
    }


class ReplayReads:
    def __init__(
        self,
        source: ReplaySource,
        published: PublishedPackage,
        checkpoint_id: str,
    ) -> None:
        self._source = source
        self._published = published
        self._checkpoint_id = checkpoint_id

    async def _reads(self) -> dict[str, Any]:
        checkpoint = await self._source.read_checkpoint(
            self._published.package_id,
            self._published.version,
            self._checkpoint_id,
        )
        return checkpoint.reads

    async def _read(self, key: str) -> Any:
        reads = await self._reads()
        if key not in reads:
            raise ReplayNotFound(f"recorded read {key!r} is not available here")
        return reads[key]

    def _parse(self, model, value: Any):
        try:
            return model.model_validate(value)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("a recorded read is corrupt") from exc

    async def get_meeting(self, meeting_id: str) -> MeetingWithParticipants | None:
        if meeting_id != self._published.meeting_id:
            return None
        value = await self._read("meeting")
        meeting = self._parse(MeetingWithParticipants, value)
        if str(meeting.id) != meeting_id:
            raise ReplayPackageUnavailable("the recorded meeting identity differs")
        return meeting

    async def list_meetings(self) -> list[Meeting]:
        value = await self._read("meetings")
        try:
            return TypeAdapter(list[Meeting]).validate_python(value)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("the recorded meeting list is corrupt") from exc

    async def get_disagreements(self, meeting_id: str) -> list[Disagreement]:
        value = await self._read("disagreements")
        try:
            result = TypeAdapter(list[Disagreement]).validate_python(value)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("recorded disagreements are corrupt") from exc
        return [item for item in result if str(item.meeting_id) == meeting_id]

    async def get_consensus_list(self, meeting_id: str) -> list[Consensus]:
        value = await self._read("consensus")
        try:
            result = TypeAdapter(list[Consensus]).validate_python(value)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("recorded consensus is corrupt") from exc
        return [item for item in result if str(item.meeting_id) == meeting_id]

    async def context_stats(self, meeting_id: str) -> dict[str, Any]:
        value = await self._read("context_stats")
        if not isinstance(value, dict):
            raise ReplayPackageUnavailable("recorded context stats are corrupt")
        return value

    async def documents(self, meeting_id: str) -> list[DocumentResponse]:
        value = await self._read("documents")
        try:
            result = TypeAdapter(list[DocumentResponse]).validate_python(value)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("recorded documents are corrupt") from exc
        return [
            item
            for item in result
            if item.meeting_id is None or str(item.meeting_id) == meeting_id
        ]

    async def closing(self, meeting_id: str) -> ClosingView:
        value = await self._read("closing")
        closing = self._parse(ClosingView, value)
        if closing.meeting_id != meeting_id:
            raise ReplayPackageUnavailable("the recorded closing belongs to another meeting")
        return closing

    async def operations(self, meeting_id: str) -> list[dict[str, Any]]:
        value = await self._read("operations")
        if not isinstance(value, list):
            raise ReplayPackageUnavailable("recorded operations are corrupt")
        return [
            operation_row(item)
            for item in value
            if isinstance(item, dict) and str(item.get("meeting_id")) == meeting_id
        ]

    async def safe_config(self, meeting_id: str) -> dict[str, Any]:
        value = await self._read("safe_config")
        if not isinstance(value, dict):
            raise ReplayPackageUnavailable("the recorded safe config is corrupt")
        return value


class ReplayObservation:
    def __init__(
        self,
        source: ReplaySource,
        published: PublishedPackage,
        checkpoint_id: str,
    ) -> None:
        self._source = source
        self._published = published
        self._checkpoint_id = checkpoint_id
        self._reads = ReplayReads(source, published, checkpoint_id)

    async def status(self, meeting_id: str, operation_id: str) -> dict:
        operations = await self._reads.operations(meeting_id)
        for row in operations:
            if str(row["id"]) == operation_id:
                return row
        raise ReplayNotFound("Recorded turn not found")

    async def list_operations(self, meeting_id: str, limit: int = 100) -> list[dict]:
        operations = await self._reads.operations(meeting_id)
        return operations[: max(0, limit)]

    async def events(
        self,
        meeting_id: str,
        operation_id: str,
        after_sequence: int = 0,
        limit: int = 500,
    ) -> list[dict]:
        try:
            tape = await self._source.read_tape(
                self._published.package_id,
                self._published.version,
                operation_id,
            )
        except ReplayPackageUnavailable as exc:
            raise ReplayNotFound("Recorded turn not found") from exc
        if tape.meeting_id != meeting_id:
            raise ReplayNotFound("Recorded turn not found")
        return [
            event
            for event in tape.events
            if int(event["sequence"]) > max(0, after_sequence)
        ][: max(0, limit)]
