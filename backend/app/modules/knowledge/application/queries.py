"""Knowledge read models used by upload receipts and observation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from app.modules.knowledge.application.ports import (
    IngestionRecord,
    KnowledgePersistence,
)
from app.modules.knowledge.domain.models import IngestionState, RevisionState


@dataclass(frozen=True)
class IngestionStatusView:
    operation_id: UUID
    document_id: UUID
    revision_id: UUID
    state: IngestionState
    revision_state: RevisionState
    document_status: str
    file_name: str
    file_type: str
    chunk_count: int
    error_message: str | None


class GetIngestionStatus:
    """Read the durable state behind an upload operation receipt."""

    def __init__(self, persistence: KnowledgePersistence) -> None:
        self._persistence = persistence

    async def execute(self, operation_id: UUID) -> IngestionStatusView | None:
        record = await asyncio.to_thread(
            self._persistence.get_ingestion, operation_id
        )
        return None if record is None else _view(record)


def _view(record: IngestionRecord) -> IngestionStatusView:
    return IngestionStatusView(
        operation_id=record.ingestion_id,
        document_id=record.document_id,
        revision_id=record.revision_id,
        state=record.state,
        revision_state=record.revision_state,
        document_status=record.document_status,
        file_name=record.file_name,
        file_type=record.file_type,
        chunk_count=record.chunk_count,
        error_message=record.error_message,
    )
