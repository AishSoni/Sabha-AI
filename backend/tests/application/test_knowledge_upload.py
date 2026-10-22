"""Application tests for durable upload admission and receipt semantics."""

from __future__ import annotations

import hashlib
import io
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from app.modules.knowledge.application.ingestion import (
    EmbeddingProfile,
    PendingReceipt,
    ReadyReceipt,
    UploadDocument,
    UploadRequest,
)
from app.modules.knowledge.application.ports import (
    IngestionRecord,
    NewUpload,
    StoredSource,
)
from app.modules.knowledge.application.queries import GetIngestionStatus
from app.modules.knowledge.domain.errors import (
    KnowledgeUnavailable,
    SourceTooLarge,
    UnsupportedFileType,
)
from app.modules.knowledge.domain.models import (
    IngestionState,
    KnowledgeOwner,
    RevisionState,
    UploadAdmission,
)

PROFILE = EmbeddingProfile(provider="ollama", model="nomic-embed-text", dimension=4)


class MemorySourceStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.calls: list[tuple] = []
        self.fail_put = False

    def ensure_ready(self) -> None:
        self.calls.append(("ensure_ready",))

    def put(self, key, stream, *, content_type, max_bytes):
        self.calls.append(("put", key, content_type, max_bytes))
        if self.fail_put:
            raise KnowledgeUnavailable("storage down")
        data = stream.read()
        if len(data) > max_bytes:
            raise SourceTooLarge("too large")
        self.objects[key] = data
        return StoredSource(
            key=key,
            size=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
        )

    def move(self, source_key, destination_key):
        self.calls.append(("move", source_key, destination_key))
        self.objects[destination_key] = self.objects.pop(source_key)

    def download(self, key, *, max_bytes):
        return self.objects[key]

    def exists(self, key):
        return key in self.objects

    def delete(self, key):
        self.calls.append(("delete", key))
        self.objects.pop(key, None)

    def list_prefix(self, prefix, *, limit=100):
        return [
            StoredSource(key=key, size=len(value))
            for key, value in self.objects.items()
            if key.startswith(prefix.rstrip("/") + "/")
        ][:limit]


class RecordingPersistence:
    def __init__(self, *, state: IngestionState = IngestionState.PENDING) -> None:
        self.uploads: list[NewUpload] = []
        self.records: dict[UUID, IngestionRecord] = {}
        self.state = state
        self.fail = False

    def admit_upload(self, upload: NewUpload) -> UploadAdmission:
        if self.fail:
            raise KnowledgeUnavailable("admission failed")
        self.uploads.append(upload)
        return UploadAdmission(
            document_id=upload.document_id,
            revision_id=upload.revision_id,
            ingestion_id=upload.ingestion_id,
            state=self.state,
        )

    def get_ingestion(self, ingestion_id: UUID) -> IngestionRecord | None:
        return self.records.get(ingestion_id)


def _request(*, name="Plan.md", payload=b"# plan", owner=None) -> UploadRequest:
    return UploadRequest(
        file_name=name,
        size_bytes=len(payload),
        stream=io.BytesIO(payload),
        owner=owner or KnowledgeOwner(kind="stack", id=uuid4()),
        content_type="text/markdown",
    )


@pytest.mark.asyncio
async def test_upload_stages_finalizes_then_admits_and_returns_pending_receipt():
    store = MemorySourceStore()
    persistence = RecordingPersistence()
    use_case = UploadDocument(
        source_store=store, persistence=persistence, embedding=PROFILE
    )
    request = _request()

    receipt = await use_case.execute(request)

    assert isinstance(receipt, PendingReceipt)
    assert receipt.state == "pending"
    assert receipt.operation_id in persistence.records or persistence.uploads

    upload = persistence.uploads[0]
    assert receipt.document_id == upload.document_id
    assert receipt.operation_id == upload.ingestion_id
    assert upload.source_key.startswith(
        f"sources/stack/{request.owner.id}/{upload.document_id}/{upload.revision_id}/"
    )
    assert upload.source_key.endswith("Plan.md")
    assert upload.source_sha256 == hashlib.sha256(b"# plan").hexdigest()
    assert upload.collection_name == f"stack_{request.owner.id}_knowledge"
    assert (upload.embedding_provider, upload.embedding_model, upload.embedding_dimension) == (
        "ollama",
        "nomic-embed-text",
        4,
    )
    assert [call[0] for call in store.calls] == [
        "ensure_ready",
        "put",
        "move",
    ]
    assert upload.source_key in store.objects


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_extension_before_touching_storage():
    store = MemorySourceStore()
    use_case = UploadDocument(
        source_store=store, persistence=RecordingPersistence(), embedding=PROFILE
    )

    with pytest.raises(UnsupportedFileType):
        await use_case.execute(_request(name="legacy.xls"))

    assert store.calls == []


@pytest.mark.asyncio
async def test_upload_rejects_declared_oversize_before_touching_storage():
    store = MemorySourceStore()
    use_case = UploadDocument(
        source_store=store, persistence=RecordingPersistence(), embedding=PROFILE
    )
    request = _request()
    request = replace(request, size_bytes=50 * 1024 * 1024 + 1)

    with pytest.raises(SourceTooLarge):
        await use_case.execute(request)

    assert store.calls == []


@pytest.mark.asyncio
async def test_failed_admission_deletes_the_finalized_object():
    store = MemorySourceStore()
    persistence = RecordingPersistence()
    persistence.fail = True
    use_case = UploadDocument(
        source_store=store, persistence=persistence, embedding=PROFILE
    )

    with pytest.raises(KnowledgeUnavailable):
        await use_case.execute(_request())

    assert store.objects == {}
    assert any(call[0] == "delete" for call in store.calls)


@pytest.mark.asyncio
async def test_ready_admission_returns_a_ready_receipt():
    store = MemorySourceStore()
    persistence = RecordingPersistence(state=IngestionState.READY)
    use_case = UploadDocument(
        source_store=store, persistence=persistence, embedding=PROFILE
    )

    receipt = await use_case.execute(_request())

    assert isinstance(receipt, ReadyReceipt)
    assert receipt.document_id == persistence.uploads[0].document_id
    assert receipt.revision_id == persistence.uploads[0].revision_id


@pytest.mark.asyncio
async def test_status_query_maps_the_durable_ingestion_row():
    persistence = RecordingPersistence()
    operation_id = uuid4()
    persistence.records[operation_id] = IngestionRecord(
        ingestion_id=operation_id,
        document_id=uuid4(),
        revision_id=uuid4(),
        state=IngestionState.FAILED,
        revision_state=RevisionState.FAILED,
        document_status="failed",
        file_name="notes.txt",
        file_type="txt",
        collection_name="stack_x_knowledge",
        chunk_count=0,
        error_message="parse failed",
    )
    query = GetIngestionStatus(persistence)

    view = await query.execute(operation_id)

    assert view is not None
    assert view.operation_id == operation_id
    assert view.state is IngestionState.FAILED
    assert view.error_message == "parse failed"
    assert await query.execute(uuid4()) is None
