"""Supabase implementation of the durable knowledge persistence port.

Narrow RPC functions own admission, claims, publication, and revocation so
SQL stays the eligibility authority. The adapter translates transport and
PostgREST failures into the module's typed unavailability error; it never
decides eligibility from a vector payload.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable
from uuid import UUID

import httpx
from postgrest.exceptions import APIError

from app.modules.knowledge.application.ports import (
    IngestionClaim,
    IngestionRecord,
    NewUpload,
    PublishResult,
)
from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    EligibleRevision,
    IngestionState,
    PassageEvidence,
    RevisionState,
    UploadAdmission,
)


def _as_datetime(value: Any) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


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

    def _rpc_rows(self, name: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            result = self._client().rpc(name, params).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                f"knowledge persistence failed during {name}"
            ) from exc
        data = getattr(result, "data", None)
        if data is None:
            return []
        if isinstance(data, dict):
            return [data]
        if not isinstance(data, list):
            raise KnowledgeUnavailable(
                f"knowledge persistence returned an unexpected shape for {name}"
            )
        return data

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

    def _rpc_value(self, name: str, params: dict[str, Any]) -> Any:
        try:
            return self._client().rpc(name, params).execute().data
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                f"knowledge persistence failed during {name}"
            ) from exc

    def claim_ingestion(
        self,
        ingestion_id: UUID,
        *,
        lease_owner: str,
        now: datetime,
        lease_seconds: int,
    ) -> IngestionClaim:
        row = self._rpc(
            "knowledge_claim_ingestion",
            {
                "p_ingestion_id": str(ingestion_id),
                "p_lease_owner": lease_owner,
                "p_now": now.isoformat(),
                "p_lease_seconds": lease_seconds,
            },
        )
        outcome = row.get("outcome")
        if outcome not in ("claimed", "busy", "ready", "revoked", "not_found"):
            raise KnowledgeUnavailable(
                f"knowledge claim returned unexpected outcome {outcome!r}"
            )
        if outcome != "claimed":
            return IngestionClaim(outcome=outcome)
        try:
            return IngestionClaim(
                outcome="claimed",
                document_id=UUID(str(row["document_id"])),
                revision_id=UUID(str(row["revision_id"])),
                file_name=str(row["file_name"]),
                file_type=str(row["file_type"]),
                source_key=str(row["source_key"]),
                source_sha256=str(row["source_sha256"]),
                source_size_bytes=int(row["source_size_bytes"]),
                collection_name=str(row["collection_name"]),
                embedding_provider=str(row["embedding_provider"]),
                embedding_model=str(row["embedding_model"]),
                embedding_dimension=int(row["embedding_dimension"]),
                attempts=int(row.get("attempts") or 0),
            )
        except (KeyError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge claim returned an unexpected row shape"
            ) from exc

    def start_indexing(self, ingestion_id: UUID, revision_id: UUID) -> bool:
        value = self._rpc_value(
            "knowledge_start_indexing",
            {
                "p_ingestion_id": str(ingestion_id),
                "p_revision_id": str(revision_id),
            },
        )
        if not isinstance(value, bool):
            raise KnowledgeUnavailable(
                "knowledge start_indexing returned an unexpected shape"
            )
        return value

    def publish_revision(
        self,
        ingestion_id: UUID,
        revision_id: UUID,
        *,
        chunk_count: int,
        chunks: list[ChunkIdentity],
    ) -> PublishResult:
        row = self._rpc(
            "knowledge_publish_revision",
            {
                "p_ingestion_id": str(ingestion_id),
                "p_revision_id": str(revision_id),
                "p_chunk_count": chunk_count,
                "p_chunks": [
                    {
                        "id": str(chunk.id),
                        "chunk_index": chunk.chunk_index,
                        "content_sha256": chunk.content_sha256,
                        "char_count": chunk.char_count,
                    }
                    for chunk in chunks
                ],
            },
        )
        outcome = row.get("outcome")
        if outcome not in ("ready", "revoked", "not_found"):
            raise KnowledgeUnavailable(
                f"knowledge publication returned unexpected outcome {outcome!r}"
            )
        return PublishResult(outcome=outcome)

    def fail_ingestion(
        self, ingestion_id: UUID, revision_id: UUID, error: str
    ) -> bool:
        value = self._rpc_value(
            "knowledge_fail_ingestion",
            {
                "p_ingestion_id": str(ingestion_id),
                "p_revision_id": str(revision_id),
                "p_error": error,
            },
        )
        if not isinstance(value, bool):
            raise KnowledgeUnavailable(
                "knowledge failure record returned an unexpected shape"
            )
        return value

    def recoverable_ingestions(
        self, *, now: datetime, limit: int = 20
    ) -> list[UUID]:
        try:
            result = (
                self._client()
                .table("document_ingestions")
                .select("id,state,lease_expires_at")
                .in_("state", ["pending", "processing"])
                .order("id")
                .limit(limit)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while listing recoverable ingestions"
            ) from exc
        rows = getattr(result, "data", None) or []
        recoverable: list[UUID] = []
        for row in rows:
            expires = _as_datetime(row.get("lease_expires_at"))
            if row.get("state") == "pending" or expires is None or expires <= now:
                recoverable.append(UUID(str(row["id"])))
        return recoverable

    def eligible_revisions(
        self, *, meeting_id: UUID | None, stack_ids: list[UUID]
    ) -> list[EligibleRevision]:
        rows = self._rpc_rows(
            "knowledge_eligible_revisions",
            {
                "p_meeting_id": str(meeting_id) if meeting_id else None,
                "p_stack_ids": [str(value) for value in stack_ids],
            },
        )
        return _eligible_rows(rows)

    def revalidate_revisions(
        self,
        revision_ids: list[UUID],
        *,
        meeting_id: UUID | None,
        stack_ids: list[UUID],
    ) -> set[UUID]:
        if not revision_ids:
            return set()
        rows = self._rpc_rows(
            "knowledge_revalidate_revisions",
            {
                "p_revision_ids": [str(value) for value in revision_ids],
                "p_meeting_id": str(meeting_id) if meeting_id else None,
                "p_stack_ids": [str(value) for value in stack_ids],
            },
        )
        return {revision.revision_id for revision in _eligible_rows(rows)}

    def record_evidence(self, passages: list[PassageEvidence]) -> None:
        if not passages:
            return
        rows = [
            {
                "meeting_id": str(item.meeting_id) if item.meeting_id else None,
                "participant_id": (
                    str(item.participant_id) if item.participant_id else None
                ),
                "operation_id": (
                    str(item.operation_id) if item.operation_id else None
                ),
                "tool_call_id": item.tool_call_id,
                "message_id": str(item.message_id) if item.message_id else None,
                "document_id": str(item.document_id),
                "revision_id": str(item.revision_id),
                "chunk_id": str(item.chunk_id) if item.chunk_id else None,
                "chunk_sha256": item.chunk_sha256,
                "source_name": item.source_name,
                "raw_passage": item.raw_passage,
                "score": item.score,
            }
            for item in passages
        ]
        try:
            self._client().table("retrieved_passage_evidence").insert(rows).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while recording evidence"
            ) from exc


def _eligible_rows(rows: list[dict[str, Any]]) -> list[EligibleRevision]:
    eligible: list[EligibleRevision] = []
    for row in rows:
        try:
            eligible.append(
                EligibleRevision(
                    document_id=UUID(str(row["document_id"])),
                    revision_id=UUID(str(row["revision_id"])),
                    collection_name=str(row["qdrant_collection"]),
                    file_name=str(row["file_name"]),
                )
            )
        except (KeyError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge eligibility returned an unexpected row shape"
            ) from exc
    return eligible
