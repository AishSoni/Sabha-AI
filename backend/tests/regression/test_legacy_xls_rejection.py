"""Regression: legacy .xls files must be rejected honestly at validation.

Approved decision: reject .xls at validation, keep .xlsx fully working. The
rejection happens before any bytes reach the Knowledge source store.
"""

import io
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.modules.knowledge.application.ingestion import PendingReceipt
from app.services.document_processor import DocumentProcessor
from main import app

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DOCUMENT_ID = UUID("00000000-0000-4000-8000-000000000020")
OPERATION_ID = UUID("00000000-0000-4000-8000-000000000021")

# Genuine BIFF8 .xls files begin with the OLE2 compound-document signature.
BIFF_XLS_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"fixture-biff-payload\x00" * 8

VALID_XLSX_BYTES = b"PK\x03\x04-minimal-xlsx-like-payload"


class FakeLifecycle:
    def __init__(self):
        self.uploads = []
        self.processed = []

    async def upload(self, request):
        self.uploads.append(request)
        return PendingReceipt(document_id=DOCUMENT_ID, operation_id=OPERATION_ID)

    async def process_ingestion(self, operation_id):
        self.processed.append(operation_id)


@pytest.fixture()
def upload_env(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        "app.modules.knowledge.public.get_knowledge_lifecycle",
        lambda: lifecycle,
        raising=True,
    )
    return TestClient(app), lifecycle


def test_xls_upload_is_rejected_at_validation(upload_env):
    client, lifecycle = upload_env
    response = client.post(
        "/api/documents/upload",
        files={"file": ("report.xls", io.BytesIO(BIFF_XLS_BYTES), "application/vnd.ms-excel")},
        data={"meeting_id": MEETING_ID},
    )

    assert response.status_code == 400
    assert "xls" in response.json()["detail"].lower()
    assert lifecycle.uploads == []


def test_xlsx_upload_remains_accepted(upload_env):
    client, lifecycle = upload_env
    response = client.post(
        "/api/documents/upload",
        files={
            "file": (
                "report.xlsx",
                io.BytesIO(VALID_XLSX_BYTES),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"meeting_id": MEETING_ID},
    )

    assert response.status_code == 202, response.text
    assert response.json()["state"] == "pending"
    assert len(lifecycle.uploads) == 1
    assert lifecycle.uploads[0].file_name == "report.xlsx"
    assert lifecycle.processed == [OPERATION_ID]


def test_parse_file_rejects_xls_openly():
    processor = DocumentProcessor()
    with pytest.raises(ValueError) as error:
        processor.parse_file(BIFF_XLS_BYTES, "report.xls", "xls")
    message = str(error.value).lower()
    assert "xls" in message and "xlsx" in message


def test_parse_file_still_accepts_xlsx_suffix_dispatch():
    processor = DocumentProcessor()
    # Dispatch-table probe: with valid suffix handling, malformed xlsx content
    # surfaces openpyxl's parse error - NOT the "Unsupported file type"
    # dispatch message (that would mean the xlsx branch was removed).
    with pytest.raises(Exception) as error:
        processor.parse_file(VALID_XLSX_BYTES, "report.xlsx", "xlsx")
    assert "unsupported file type" not in str(error.value).lower()
