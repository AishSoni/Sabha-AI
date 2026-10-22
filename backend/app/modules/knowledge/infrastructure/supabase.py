"""Supabase implementation of the durable knowledge persistence port.

Narrow RPC functions own admission, claims, publication, and revocation so
SQL stays the eligibility authority. The adapter translates transport and
PostgREST failures into the module's typed unavailability error; it never
decides eligibility from a vector payload.
"""

from __future__ import annotations

from typing import Any, Callable
from uuid import UUID

import httpx
from postgrest.exceptions import APIError

from app.modules.knowledge.application.ports import (
    IngestionRecord,
    NewUpload,
)
from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.knowledge.domain.models import (
    IngestionState,
    RevisionState,
    UploadAdmission,
)


def _row(result: Any) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and data:
        return data[0]
    return None


class SupabaseKnowledgeRepository:
    """``KnowledgePersistence`` over the narrow knowledge RPC surface."""

    def __init__(self, client_provider: Callable[[], Any]) -> None:
        self._client_provider = client_provider

    def _client(self) -> Any:
        return self._client_provider()

    def _rpc(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            result = self._client().rpc(name, params).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                f"knowledge persistence failed during {name}"
            ) from exc
        row = _row(result)
        if row is None:
            raise KnowledgeUnavailable(
                f"knowledge persistence returned no result for {name}"
            )
        return row

    def admit_upload(self, upload: NewUpload) -> UploadAdmission:
        owner = upload.owner
        row = self._rpc(
            "knowledge_admit_upload",
            {
                "p_document_id": str(upload.document_id),
                "p_revision_id": str(upload.revision_id),
                "p_ingestion_id": str(upload.ingestion_id),
                "p_meeting_id": str(owner.id) if owner.kind == "meeting" else None,
                "p_persona_id": str(owner.id) if owner.kind == "persona" else None,
                "p_stack_id": str(owner.id) if owner.kind == "stack" else None,
                "p_file_name": upload.file_name,
                "p_file_type": upload.file_type,
                "p_file_size_bytes": upload.file_size_bytes,
                "p_collection_name": upload.collection_name,
                "p_source_key": upload.source_key,
                "p_source_sha256": upload.source_sha256,
                "p_embedding_provider": upload.embedding_provider,
                "p_embedding_model": upload.embedding_model,
                "p_embedding_dimension": upload.embedding_dimension,
            },
        )
        outcome = row.get("outcome")
        if outcome not in ("admitted", "existing"):
            raise KnowledgeUnavailable(
                f"knowledge admission returned unexpected outcome {outcome!r}"
            )
        try:
            return UploadAdmission(
                document_id=UUID(str(row["document_id"])),
                revision_id=UUID(str(row["revision_id"])),
                ingestion_id=UUID(str(row["ingestion_id"])),
                state=IngestionState(str(row["state"])),
            )
        except (KeyError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge admission returned an unexpected row shape"
            ) from exc

    def get_ingestion(self, ingestion_id: UUID) -> IngestionRecord | None:
        try:
            ingestion = _row(
                self._client()
                .table("document_ingestions")
                .select(
                    "id,document_id,revision_id,state,last_error"
                )
                .eq("id", str(ingestion_id))
                .limit(1)
                .execute()
            )
            if ingestion is None:
                return None
            revision = _row(
                self._client()
                .table("document_revisions")
                .select(
                    "status,chunk_count,error_message,file_type,qdrant_collection"
                )
                .eq("id", str(ingestion["revision_id"]))
                .limit(1)
                .execute()
            )
            document = _row(
                self._client()
                .table("documents")
                .select("file_name,status,chunk_count,error_message")
                .eq("id", str(ingestion["document_id"]))
                .limit(1)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while reading an ingestion"
            ) from exc

        if revision is None or document is None:
            raise KnowledgeUnavailable(
                "knowledge ingestion references missing rows"
            )
        try:
            return IngestionRecord(
                ingestion_id=UUID(str(ingestion["id"])),
                document_id=UUID(str(ingestion["document_id"])),
                revision_id=UUID(str(ingestion["revision_id"])),
                state=IngestionState(str(ingestion["state"])),
                revision_state=RevisionState(str(revision["status"])),
                document_status=str(document["status"]),
                file_name=str(document["file_name"]),
                file_type=str(revision["file_type"]),
                collection_name=str(revision["qdrant_collection"]),
                chunk_count=int(document.get("chunk_count") or 0),
                error_message=document.get("error_message")
                or revision.get("error_message")
                or ingestion.get("last_error"),
            )
        except (KeyError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge ingestion returned an unexpected row shape"
            ) from exc
