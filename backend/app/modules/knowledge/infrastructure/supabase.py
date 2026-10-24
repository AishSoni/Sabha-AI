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
    DocumentRecord,
    IngestionClaim,
    IngestionRecord,
    NewUpload,
    ParentRevocationResult,
    PublishResult,
    RevocationResult,
)
from app.modules.knowledge.domain.errors import (
    DocumentNotFound,
    KnowledgeUnavailable,
)
from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    CleanupIntent,
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


    def revoke_parent(
        self, parent_kind: str, parent_id: UUID, *, reason: str
    ) -> ParentRevocationResult:
        result = self._rpc(
            "knowledge_revoke_parent",
            {
                "p_parent_kind": parent_kind,
                "p_parent_id": str(parent_id),
                "p_reason": reason,
            },
        )
        if result.get("outcome") != "revoked":
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected parent revocation outcome"
            )
        try:
            return ParentRevocationResult(
                parent_kind=parent_kind,
                parent_id=parent_id,
                documents=int(result.get("documents", 0)),
                collection_name=str(result["collection_name"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected parent revocation shape"
            ) from exc

    def revoke_document(
        self, document_id: UUID, *, reason: str
    ) -> RevocationResult:
        result = self._rpc(
            "knowledge_revoke_document",
            {"p_document_id": str(document_id), "p_reason": reason},
        )
        outcome = result.get("outcome")
        if outcome == "not_found":
            raise DocumentNotFound("knowledge document was not found")
        if outcome != "revoked":
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected revocation outcome"
            )
        try:
            return RevocationResult(
                document_id=UUID(str(result["document_id"])),
                revisions=int(result.get("revisions", 0)),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected revocation shape"
            ) from exc

    def list_cleanup_intents(self, *, limit: int = 50) -> list[CleanupIntent]:
        try:
            result = (
                self._client()
                .table("knowledge_cleanup")
                .select(
                    "id,target_kind,target_id,document_id,revision_id,"
                    "collection_name,source_key,reason,attempts,resolved_at"
                )
                .order("created_at")
                .limit(max(limit * 4, limit))
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while listing cleanup intents"
            ) from exc
        rows = getattr(result, "data", None) or []
        intents: list[CleanupIntent] = []
        for row in rows:
            if not isinstance(row, dict) or row.get("resolved_at") is not None:
                continue
            try:
                intents.append(
                    CleanupIntent(
                        intent_id=UUID(str(row["id"])),
                        kind=str(row["target_kind"]),
                        target_id=UUID(str(row["target_id"])),
                        document_id=(
                            UUID(str(row["document_id"]))
                            if row.get("document_id")
                            else None
                        ),
                        revision_id=(
                            UUID(str(row["revision_id"]))
                            if row.get("revision_id")
                            else None
                        ),
                        collection_name=row.get("collection_name"),
                        source_key=row.get("source_key"),
                        reason=row.get("reason"),
                        attempts=int(row.get("attempts") or 0),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise KnowledgeUnavailable(
                    "knowledge cleanup returned an unexpected row shape"
                ) from exc
            if len(intents) >= limit:
                break
        return intents

    def resolve_cleanup(self, intent_id: UUID) -> bool:
        value = self._rpc_value(
            "knowledge_resolve_cleanup", {"p_id": str(intent_id)}
        )
        return bool(value)

    def note_cleanup_failure(self, intent_id: UUID, error: str) -> bool:
        value = self._rpc_value(
            "knowledge_note_cleanup_failure",
            {"p_id": str(intent_id), "p_error": error[:500]},
        )
        return bool(value)

    def redact_evidence(self, revision_id: UUID, *, reason: str) -> int:
        value = self._rpc_value(
            "knowledge_redact_evidence",
            {"p_revision_id": str(revision_id), "p_reason": reason},
        )
        if not isinstance(value, int):
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected redaction count"
            )
        return value

    def attach_evidence_message(
        self, operation_id: UUID, tool_call_id: str, message_id: UUID
    ) -> int:
        value = self._rpc_value(
            "knowledge_attach_evidence_message",
            {
                "p_operation_id": str(operation_id),
                "p_tool_call_id": tool_call_id,
                "p_message_id": str(message_id),
            },
        )
        if not isinstance(value, int):
            raise KnowledgeUnavailable(
                "knowledge persistence returned an unexpected attach count"
            )
        return value

    def redact_message_artifacts(
        self, revision_id: UUID, *, reason: str
    ) -> int:
        try:
            evidence_result = (
                self._client()
                .table("retrieved_passage_evidence")
                .select("message_id,tool_call_id,revision_id,document_id")
                .eq("revision_id", str(revision_id))
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while reading evidence artifacts"
            ) from exc

        targets: dict[UUID, set[str]] = {}
        for row in getattr(evidence_result, "data", None) or []:
            if not isinstance(row, dict) or not row.get("message_id"):
                continue
            message_id = UUID(str(row["message_id"]))
            targets.setdefault(message_id, set())
            if row.get("tool_call_id"):
                targets[message_id].add(str(row["tool_call_id"]))
        if not targets:
            return 0

        updated = 0
        for message_id, call_ids in targets.items():
            try:
                result = (
                    self._client()
                    .table("messages")
                    .select("id,citations,tool_artifacts")
                    .eq("id", str(message_id))
                    .limit(1)
                    .execute()
                )
            except (APIError, httpx.HTTPError) as exc:
                raise KnowledgeUnavailable(
                    "knowledge persistence failed while reading message artifacts"
                ) from exc
            rows = getattr(result, "data", None) or []
            if not rows:
                continue
            message = rows[0]
            changed = False

            artifacts = message.get("tool_artifacts")
            if isinstance(artifacts, dict):
                calls = artifacts.get("tool_calls")
                if isinstance(calls, list):
                    for call in calls:
                        if not isinstance(call, dict):
                            continue
                        if str(call.get("call_id")) in call_ids:
                            call["result"] = "[redacted]"
                            call["redacted"] = True
                            changed = True

            citations = message.get("citations")
            if isinstance(citations, list):
                for citation in citations:
                    if not isinstance(citation, dict):
                        continue
                    linked = str(citation.get("revision_id")) == str(revision_id)
                    if not linked:
                        continue
                    for field in ("snippet", "text", "excerpt", "content"):
                        if field in citation:
                            citation[field] = "[redacted]"
                            citation["redacted"] = True
                            changed = True

            if not changed:
                continue
            try:
                (
                    self._client()
                    .table("messages")
                    .update(
                        {
                            "citations": citations,
                            "tool_artifacts": artifacts,
                        }
                    )
                    .eq("id", str(message_id))
                    .execute()
                )
            except (APIError, httpx.HTTPError) as exc:
                raise KnowledgeUnavailable(
                    "knowledge persistence failed while redacting message artifacts"
                ) from exc
            updated += 1
        return updated

    def list_documents(
        self, *, owner_kind: str, owner_id: UUID
    ) -> list[DocumentRecord]:
        column = {
            "meeting": "meeting_id",
            "persona": "persona_id",
            "stack": "stack_id",
        }.get(owner_kind)
        if column is None:
            raise ValueError(f"unsupported knowledge owner {owner_kind!r}")
        try:
            result = (
                self._client()
                .table("documents")
                .select("*")
                .eq(column, str(owner_id))
                .order("created_at", desc=True)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while listing documents"
            ) from exc
        rows = [row for row in (getattr(result, "data", None) or []) if isinstance(row, dict)]
        return self._document_records(rows)

    def get_document(self, document_id: UUID) -> DocumentRecord | None:
        try:
            result = (
                self._client()
                .table("documents")
                .select("*")
                .eq("id", str(document_id))
                .limit(1)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while reading a document"
            ) from exc
        rows = [row for row in (getattr(result, "data", None) or []) if isinstance(row, dict)]
        records = self._document_records(rows)
        return records[0] if records else None

    def _document_records(
        self, rows: list[dict[str, Any]]
    ) -> list[DocumentRecord]:
        if not rows:
            return []
        document_ids = [str(row["id"]) for row in rows]
        try:
            revision_result = (
                self._client()
                .table("document_revisions")
                .select("id,document_id,revision_number,status,error_message")
                .in_("document_id", document_ids)
                .order("revision_number", desc=True)
                .execute()
            )
            ingestion_result = (
                self._client()
                .table("document_ingestions")
                .select("id,document_id,revision_id,state,last_error")
                .in_("document_id", document_ids)
                .order("created_at", desc=True)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while reading document state"
            ) from exc

        revisions: dict[str, dict[str, Any]] = {}
        for row in getattr(revision_result, "data", None) or []:
            if isinstance(row, dict):
                revisions.setdefault(str(row["document_id"]), row)
        ingestions: dict[str, dict[str, Any]] = {}
        for row in getattr(ingestion_result, "data", None) or []:
            if isinstance(row, dict):
                ingestions.setdefault(str(row["document_id"]), row)

        records: list[DocumentRecord] = []
        for row in rows:
            document_id = str(row["id"])
            revision = revisions.get(document_id)
            ingestion = ingestions.get(document_id)
            try:
                records.append(
                    DocumentRecord(
                        document_id=UUID(document_id),
                        file_name=str(row["file_name"]),
                        file_type=str(row["file_type"]),
                        file_size_bytes=int(row["file_size_bytes"]),
                        status=str(row.get("status") or "pending"),
                        chunk_count=int(row.get("chunk_count") or 0),
                        created_at=_as_datetime(row.get("created_at")),
                        qdrant_collection=row.get("qdrant_collection"),
                        error_message=(
                            row.get("error_message")
                            or (revision or {}).get("error_message")
                            or (ingestion or {}).get("last_error")
                        ),
                        revision_id=(
                            UUID(str(revision["id"])) if revision else None
                        ),
                        revision_state=(
                            RevisionState(str(revision["status"]))
                            if revision
                            else None
                        ),
                        operation_id=(
                            UUID(str(ingestion["id"])) if ingestion else None
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise KnowledgeUnavailable(
                    "knowledge documents returned an unexpected row shape"
                ) from exc
        return records

    def delete_document_row(self, document_id: UUID) -> bool:
        try:
            result = (
                self._client()
                .table("documents")
                .delete()
                .eq("id", str(document_id))
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise KnowledgeUnavailable(
                "knowledge persistence failed while removing a document row"
            ) from exc
        return bool(getattr(result, "data", None))


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
