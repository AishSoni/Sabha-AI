"""Route contracts for the Knowledge-owned document surface."""

from datetime import datetime, timezone
from dataclasses import replace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

import main
from app.bootstrap import Container
from app.modules.knowledge.application.ingestion import PendingReceipt, ReadyReceipt
from app.modules.knowledge.application.ports import DocumentRecord
from app.modules.knowledge.application.queries import IngestionStatusView
from app.modules.knowledge.domain.errors import (
    DocumentNotFound,
    KnowledgeUnavailable,
    SourceTooLarge,
)
from app.modules.knowledge.domain.models import IngestionState, RevisionState

DOCUMENT_ID = UUID("00000000-0000-4000-8000-000000000010")
OPERATION_ID = UUID("00000000-0000-4000-8000-000000000011")
REVISION_ID = UUID("00000000-0000-4000-8000-000000000012")
MEETING_ID = "00000000-0000-4000-8000-000000000001"
STACK_ID = "00000000-0000-4000-8000-000000000002"
NOW = datetime(2026, 10, 20, tzinfo=timezone.utc)


def _record(**overrides) -> DocumentRecord:
    values = dict(
        document_id=DOCUMENT_ID,
        file_name="roadmap.pdf",
        file_type="pdf",
        file_size_bytes=42,
        status="processing",
        chunk_count=0,
        created_at=NOW,
        qdrant_collection=f"meeting_{MEETING_ID}_shared",
        revision_id=REVISION_ID,
        revision_state=RevisionState.PARSING,
        operation_id=OPERATION_ID,
    )
    values.update(overrides)
    return DocumentRecord(**values)


class FakeLifecycle:
    def __init__(self):
        self.uploads = []
        self.processed = []
        self.retried = []
        self.status = IngestionStatusView(
            operation_id=OPERATION_ID,
            document_id=DOCUMENT_ID,
            revision_id=REVISION_ID,
            state=IngestionState.PROCESSING,
            revision_state=RevisionState.PARSING,
            document_status="processing",
            file_name="roadmap.pdf",
            file_type="pdf",
            chunk_count=0,
            error_message=None,
        )
        self.records = [_record()]
        self.deleted = []
        self.purged = []
        self.upload_error = None
        self.delete_error = None

    async def upload(self, request):
        self.uploads.append(request)
        if self.upload_error is not None:
            raise self.upload_error
        return PendingReceipt(document_id=DOCUMENT_ID, operation_id=OPERATION_ID)

    async def process_ingestion(self, operation_id):
        self.processed.append(operation_id)

    async def retry_ingestion(self, operation_id):
        self.retried.append(operation_id)

    async def ingestion_status(self, operation_id):
        return self.status

    async def list_documents(self, *, owner_kind, owner_id):
        return list(self.records)

    async def get_document(self, document_id):
        return self.records[0] if self.records else None

    async def delete_document(self, document_id, *, reason="user_requested"):
        if self.delete_error is not None:
            raise self.delete_error
        self.deleted.append((document_id, reason))

    async def purge_document_row(self, document_id):
        self.purged.append(document_id)


@pytest.fixture()
def route_env(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        main.app.state,
        "container",
        Container(prompt_catalog=object(), knowledge_lifecycle=lifecycle),
    )
    return TestClient(main.app), lifecycle


def _upload(client, *, name="roadmap.pdf", **data):
    return client.post(
        "/api/documents/upload",
        files={"file": (name, b"%PDF-1.4 synthetic", "application/pdf")},
        data=data,
    )


def test_upload_returns_a_pending_receipt_and_schedules_processing(route_env):
    client, lifecycle = route_env

    response = _upload(client, meeting_id=MEETING_ID)

    assert response.status_code == 202, response.text
    body = response.json()
    assert body["state"] == "pending"
    assert body["documentId"] == str(DOCUMENT_ID)
    assert body["operationId"] == str(OPERATION_ID)
    assert body["id"] == str(DOCUMENT_ID)
    assert body["status"] == "processing"
    assert lifecycle.uploads[0].owner.kind == "meeting"
    assert lifecycle.processed == [OPERATION_ID]


def test_upload_reports_ready_without_scheduling(route_env):
    client, lifecycle = route_env

    async def ready(request):
        lifecycle.uploads.append(request)
        return ReadyReceipt(document_id=DOCUMENT_ID, revision_id=REVISION_ID)

    lifecycle.upload = ready

    response = _upload(client, stack_id=STACK_ID)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["state"] == "ready"
    assert body["revisionId"] == str(REVISION_ID)
    assert lifecycle.processed == []


def test_upload_rejects_unsupported_types_before_storage(route_env):
    client, lifecycle = route_env

    response = _upload(client, name="legacy.xls", meeting_id=MEETING_ID)

    assert response.status_code == 400
    assert lifecycle.uploads == []


def test_upload_requires_exactly_one_owner(route_env):
    client, _ = route_env

    assert _upload(client).status_code == 400
    assert _upload(client, meeting_id=MEETING_ID, stack_id=STACK_ID).status_code == 400


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (SourceTooLarge("too big"), 413),
        (KnowledgeUnavailable("down"), 503),
    ],
)
def test_upload_translates_domain_failures(route_env, error, status):
    client, lifecycle = route_env
    lifecycle.upload_error = error

    response = _upload(client, meeting_id=MEETING_ID)

    assert response.status_code == status


def test_operation_status_is_observable(route_env):
    client, _ = route_env

    response = client.get(f"/api/documents/operations/{OPERATION_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["operationId"] == str(OPERATION_ID)
    assert body["state"] == "processing"
    assert body["revisionState"] == "parsing"
    assert body["documentStatus"] == "processing"


def test_operation_status_returns_404_when_unknown(route_env):
    client, lifecycle = route_env
    lifecycle.status = None

    response = client.get(f"/api/documents/operations/{OPERATION_ID}")

    assert response.status_code == 404


def test_retry_keeps_the_same_identity_and_pends(route_env):
    client, lifecycle = route_env

    response = client.post(f"/api/documents/operations/{OPERATION_ID}/retry")

    assert response.status_code == 202, response.text
    body = response.json()
    assert body["state"] == "pending"
    assert body["documentId"] == str(DOCUMENT_ID)
    assert body["operationId"] == str(OPERATION_ID)
    assert lifecycle.retried == [OPERATION_ID]


def test_retry_of_a_ready_operation_returns_ready(route_env):
    client, lifecycle = route_env
    lifecycle.status = replace(
        lifecycle.status,
        state=IngestionState.READY,
        revision_state=RevisionState.READY,
    )

    response = client.post(f"/api/documents/operations/{OPERATION_ID}/retry")

    assert response.status_code == 200
    assert response.json()["state"] == "ready"
    assert response.json()["revisionId"] == str(REVISION_ID)
    assert lifecycle.retried == []


def test_document_lists_map_the_scope(route_env):
    client, _ = route_env

    for path in (
        f"/api/documents/meeting/{MEETING_ID}",
        f"/api/documents/stack/{STACK_ID}",
    ):
        response = client.get(path)
        assert response.status_code == 200, response.text
        assert response.json()[0]["id"] == str(DOCUMENT_ID)
        assert response.json()[0]["revision_id"] == str(REVISION_ID)
        assert response.json()[0]["revision_state"] == "parsing"


def test_document_get_returns_404_when_missing(route_env):
    client, lifecycle = route_env
    lifecycle.records = []

    response = client.get(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 404


def test_delete_revokes_then_purges_the_row(route_env):
    client, lifecycle = route_env

    response = client.delete(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(DOCUMENT_ID)
    assert lifecycle.deleted == [(DOCUMENT_ID, "user_requested")]
    assert lifecycle.purged == [DOCUMENT_ID]


def test_delete_translates_missing_and_unavailable(route_env):
    client, lifecycle = route_env

    lifecycle.delete_error = DocumentNotFound("gone")
    assert client.delete(f"/api/documents/{DOCUMENT_ID}").status_code == 404

    lifecycle.delete_error = KnowledgeUnavailable("down")
    assert client.delete(f"/api/documents/{DOCUMENT_ID}").status_code == 503


def test_search_translates_projection_outage(route_env):
    client, lifecycle = route_env

    async def fail(request):
        raise KnowledgeUnavailable("down")

    lifecycle.search = fail

    response = client.post(
        "/api/documents/search", json={"query": "roadmap", "meeting_id": MEETING_ID}
    )

    assert response.status_code == 503
