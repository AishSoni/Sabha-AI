"""Integration tests for the Supabase knowledge persistence adapter.

The PostgREST-shaped stub executes the real migration RPCs against the
disposable Postgres database, so parameter names, casts, and row shapes are
pinned without a hosted Supabase instance.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.knowledge.application.ports import NewUpload
from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    IngestionState,
    KnowledgeOwner,
    RevisionState,
)
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)
from tests.doubles.supabase_stub import stub_for

pytestmark = pytest.mark.integration


def _seed_meeting(db) -> uuid.UUID:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES ('Knowledge repo', 'active') "
            "RETURNING id",
        ).fetchone()
    return uuid.UUID(str(row[0]))


def _upload(owner: KnowledgeOwner) -> NewUpload:
    document_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    return NewUpload(
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=uuid.uuid4(),
        owner=owner,
        file_name="notes.txt",
        file_type="txt",
        file_size_bytes=11,
        collection_name=owner.collection_name,
        source_key=(
            f"sources/{owner.kind}/{owner.id}/{document_id}/{revision_id}/notes.txt"
        ),
        source_sha256="a" * 64,
        embedding_provider="ollama",
        embedding_model="nomic-embed-text",
        embedding_dimension=768,
    )


def test_admission_and_status_read_roundtrip(disposable_db):
    owner = KnowledgeOwner(kind="meeting", id=_seed_meeting(disposable_db))
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _upload(owner)

    admission = repository.admit_upload(upload)

    assert admission.document_id == upload.document_id
    assert admission.revision_id == upload.revision_id
    assert admission.ingestion_id == upload.ingestion_id
    assert admission.state is IngestionState.PENDING

    record = repository.get_ingestion(upload.ingestion_id)

    assert record is not None
    assert record.document_id == upload.document_id
    assert record.revision_id == upload.revision_id
    assert record.state is IngestionState.PENDING
    assert record.revision_state is RevisionState.PENDING
    assert record.document_status == "processing"
    assert record.file_name == "notes.txt"
    assert record.file_type == "txt"
    assert record.collection_name == owner.collection_name


def test_admission_is_idempotent_for_the_same_receipt(disposable_db):
    owner = KnowledgeOwner(kind="meeting", id=_seed_meeting(disposable_db))
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _upload(owner)

    first = repository.admit_upload(upload)
    second = repository.admit_upload(upload)

    assert first == second


def test_missing_ingestion_reads_as_none(disposable_db):
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))

    assert repository.get_ingestion(uuid.uuid4()) is None


def test_claim_publish_and_failure_roundtrip(disposable_db):
    owner = KnowledgeOwner(kind="meeting", id=_seed_meeting(disposable_db))
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _upload(owner)
    repository.admit_upload(upload)
    now = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)

    assert repository.recoverable_ingestions(now=now) == [upload.ingestion_id]

    claim = repository.claim_ingestion(
        upload.ingestion_id, lease_owner="worker-a", now=now, lease_seconds=30
    )
    assert claim.outcome == "claimed"
    assert claim.document_id == upload.document_id
    assert claim.revision_id == upload.revision_id
    assert claim.file_name == "notes.txt"
    assert claim.source_key == upload.source_key
    assert claim.collection_name == owner.collection_name
    assert claim.attempts == 1

    busy = repository.claim_ingestion(
        upload.ingestion_id,
        lease_owner="worker-b",
        now=now + timedelta(seconds=5),
        lease_seconds=30,
    )
    assert busy.outcome == "busy"

    assert repository.start_indexing(upload.ingestion_id, upload.revision_id)
    chunk = ChunkIdentity(
        id=uuid.uuid4(), chunk_index=0, content_sha256="b" * 64, char_count=5
    )
    published = repository.publish_revision(
        upload.ingestion_id,
        upload.revision_id,
        chunk_count=1,
        chunks=[chunk],
    )
    assert published.outcome == "ready"
    record = repository.get_ingestion(upload.ingestion_id)
    assert record is not None
    assert record.state is IngestionState.READY
    assert record.revision_state is RevisionState.READY
    assert record.document_status == "ready"


def test_failure_is_recorded_without_publishing(disposable_db):
    owner = KnowledgeOwner(kind="meeting", id=_seed_meeting(disposable_db))
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _upload(owner)
    repository.admit_upload(upload)
    now = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)
    repository.claim_ingestion(
        upload.ingestion_id, lease_owner="worker-a", now=now, lease_seconds=30
    )

    assert repository.fail_ingestion(
        upload.ingestion_id, upload.revision_id, "parser exploded"
    )

    record = repository.get_ingestion(upload.ingestion_id)
    assert record is not None
    assert record.state is IngestionState.FAILED
    assert record.revision_state is RevisionState.FAILED
    assert record.error_message == "parser exploded"
