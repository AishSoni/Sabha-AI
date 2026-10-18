"""Regression: legacy .xls files must be rejected honestly at validation.

Evidence: backend/app/api/documents.py ALLOWED_EXTENSIONS admitted .xls and
document_processor.parse_file mapped 'xls' onto openpyxl's xlsx parser, which
cannot read BIFF files — the upload was accepted, a document row was created
with status 'processing', and the background indexing task then crashed with
an opaque openpyxl error. Approved decision: reject .xls at validation, keep
.xlsx fully working.
"""

import io

import pytest
from fastapi.testclient import TestClient

from app.services.document_processor import DocumentProcessor
from main import app

# Genuine BIFF8 .xls files begin with the OLE2 compound-document signature.
BIFF_XLS_BYTES = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"fixture-biff-payload\x00" * 8

VALID_XLSX_BYTES = b"PK\x03\x04-minimal-xlsx-like-payload"


@pytest.fixture()
def upload_env(disposable_db, monkeypatch):
    from tests.doubles.supabase_stub import stub_for

    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name) VALUES (%s, %s)",
            ("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Fixture meeting"),
        )

    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.api.documents.get_supabase", lambda: stub)
    recorded_calls: list = []
    monkeypatch.setattr(
        "app.api.documents._process_and_index_document",
        lambda *a, **kw: recorded_calls.append((a, kw)),
    )
    client = TestClient(app)
    return client, disposable_db, recorded_calls


def test_xls_upload_is_rejected_at_validation(upload_env):
    client, db, recorded = upload_env
    response = client.post(
        "/api/documents/upload",
        files={"file": ("report.xls", io.BytesIO(BIFF_XLS_BYTES), "application/vnd.ms-excel")},
        data={"meeting_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
    )

    assert response.status_code == 400
    assert "xls" in response.json()["detail"].lower()
    # No phantom processing record.
    assert db.query("SELECT COUNT(*) FROM documents")[0][0] == 0
    assert recorded == []


def test_xlsx_upload_remains_accepted(upload_env):
    client, db, recorded = upload_env
    response = client.post(
        "/api/documents/upload",
        files={
            "file": (
                "report.xlsx",
                io.BytesIO(VALID_XLSX_BYTES),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"meeting_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
    )

    assert response.status_code == 200
    assert db.query("SELECT COUNT(*) FROM documents")[0][0] == 1
    assert len(recorded) == 1


def test_parse_file_rejects_xls_openly():
    processor = DocumentProcessor()
    with pytest.raises(ValueError) as error:
        processor.parse_file(BIFF_XLS_BYTES, "report.xls", "xls")
    message = str(error.value).lower()
    assert "xls" in message and "xlsx" in message


def test_parse_file_still_accepts_xlsx_suffix_dispatch():
    processor = DocumentProcessor()
    # Dispatch-table probe: with valid suffix handling, malformed xlsx content
    # surfaces openpyxl's parse error — NOT the "Unsupported file type"
    # dispatch message (that would mean the xlsx branch was removed).
    with pytest.raises(Exception) as error:
        processor.parse_file(VALID_XLSX_BYTES, "report.xlsx", "xlsx")
    assert "unsupported file type" not in str(error.value).lower()
