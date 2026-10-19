"""Regression (spec-02 E1): uploads are read under a byte budget.

Previously the route read the ENTIRE body into memory before the size
check, so an oversized upload was fully materialized before rejection.
The route must:
- abort the read as soon as the byte budget is exceeded (never fully
  materialize an oversized body);
- reject BEFORE any documents row is inserted;
- use the declared Content-Length header as a cheap precheck while the
  bounded read remains the real guard for missing/lying headers.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.api.documents as documents_module
import app.services.ingestion as ingestion_module
import app.services.recovery as recovery_module
import app.services.vector_cleanup as vector_cleanup_module
from app.api.documents import (
    UPLOAD_CHUNK_SIZE,
    UploadTooLargeError,
    parse_declared_size,
    read_bounded,
)
from main import app
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"


class CountingUploadFake:
    """UploadFile double: read(n) yields up to n bytes; reads are counted."""

    def __init__(self, payload: bytes):
        self._data = payload
        self._offset = 0
        self.read_calls: list[int] = []
        self.closed = False

    async def read(self, n: int) -> bytes:
        self.read_calls.append(n)
        chunk = self._data[self._offset:self._offset + n]
        self._offset += len(chunk)
        return chunk

    async def close(self) -> None:
        self.closed = True


# --- pure helper contract ---------------------------------------------------

async def test_read_bounded_returns_payload_within_limit():
    upload = CountingUploadFake(b"small payload")
    assert await read_bounded(upload, 100) == b"small payload"
    assert upload.closed is False


async def test_read_bounded_allows_the_exact_boundary():
    upload = CountingUploadFake(b"x" * 16)
    assert await read_bounded(upload, 16) == b"x" * 16
    assert upload.closed is False


async def test_read_bounded_aborts_after_budget_exceeded(monkeypatch):
    # Small chunk size so the budget is crossed across reads deterministically.
    monkeypatch.setattr(documents_module, "UPLOAD_CHUNK_SIZE", 16)
    upload = CountingUploadFake(b"x" * 17)

    with pytest.raises(UploadTooLargeError) as error:
        await read_bounded(upload, 16)

    assert "upload limit" in str(error.value)
    assert upload.closed is True
    # Exactly one chunk beyond the limit was read — not the whole body.
    assert upload.read_calls == [16, 16]


def test_parse_declared_size_handles_missing_and_malformed_headers():
    assert parse_declared_size(None) is None
    assert parse_declared_size("") is None
    assert parse_declared_size("not-a-number") is None
    assert parse_declared_size("42") == 42
    assert parse_declared_size(" 42 ") == 42


# --- route-level contract ---------------------------------------------------

@pytest.fixture()
def upload_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name) VALUES (%s, 'Upload probe')",
            (MEETING_ID,),
        )
    monkeypatch.setattr(documents_module, "get_supabase", lambda: stub)
    monkeypatch.setattr(recovery_module, "get_supabase", lambda: stub)
    monkeypatch.setattr(vector_cleanup_module, "get_supabase", lambda: stub)

    registry = ingestion_module.IngestionRegistry()
    monkeypatch.setattr(ingestion_module, "_registry", registry)

    # 16-byte budget so tests stay byte-sized.
    monkeypatch.setattr(documents_module, "MAX_FILE_SIZE", 16)
    monkeypatch.setattr(documents_module, "UPLOAD_CHUNK_SIZE", 16)

    ingested: list[dict] = []

    async def spy_ingestion(**kwargs):
        ingested.append(kwargs)

    monkeypatch.setattr(documents_module, "_process_and_index_document", spy_ingestion)
    return SimpleNamespace(db=disposable_db, stub=stub, ingested=ingested)


def post_upload(client: TestClient, payload: bytes, name: str = "probe.txt"):
    return client.post(
        "/api/documents/upload",
        files={"file": (name, payload, "text/plain")},
        data={"meeting_id": MEETING_ID},
    )


def test_oversized_upload_rejected_before_anything_is_persisted(upload_env):
    with TestClient(app) as client:
        response = post_upload(client, b"x" * 17)

    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]
    assert upload_env.db.query("SELECT COUNT(*) FROM documents")[0][0] == 0
    assert upload_env.ingested == []


def test_declared_grossly_oversized_content_length_rejected_before_reading(upload_env):
    # The declared precheck allows multipart overhead on top of the 16-byte
    # budget, so this declares far beyond both to trip the precheck itself.
    with TestClient(app) as client:
        response = client.post(
            "/api/documents/upload",
            headers={"content-length": str(5_000_000)},
            files={"file": ("probe.txt", b"tiny", "text/plain")},
            data={"meeting_id": MEETING_ID},
        )

    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]
    assert upload_env.db.query("SELECT COUNT(*) FROM documents")[0][0] == 0
    assert upload_env.ingested == []


def test_boundary_size_upload_is_accepted_and_ingested(upload_env):
    with TestClient(app) as client:
        response = post_upload(client, b"x" * 16)

    assert response.status_code == 200
    assert len(upload_env.ingested) == 1
    assert upload_env.ingested[0]["file_content"] == b"x" * 16
    row = upload_env.db.query("SELECT status, file_size_bytes FROM documents")[0]
    assert row[0] == "processing"
    assert row[1] == 16
