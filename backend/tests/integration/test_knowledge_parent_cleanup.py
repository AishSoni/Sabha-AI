"""Parent deletion revokes knowledge and leaves retryable collection cleanup."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.modules.knowledge.application.deletion import (
    CleanupWorker,
    DeleteParentKnowledge,
)
from app.modules.knowledge.application.ports import NewUpload
from app.modules.knowledge.domain.models import ChunkIdentity, KnowledgeOwner
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)
from tests.doubles.supabase_stub import stub_for

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def _seed_parent(db, kind: str) -> uuid.UUID:
    with db.connect() as conn:
        if kind == "meeting":
            row = conn.execute(
                "INSERT INTO meetings (name, status) VALUES ('Parent', 'active') "
                "RETURNING id"
            ).fetchone()
        else:
            row = conn.execute(
                "INSERT INTO knowledge_stacks (name) VALUES ('Parent stack') "
                "RETURNING id"
            ).fetchone()
    return uuid.UUID(str(row[0]))


def _make_ready(
    repository: SupabaseKnowledgeRepository, kind: str, parent_id: uuid.UUID
) -> NewUpload:
    document_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    collection = (
        f"meeting_{parent_id}_shared"
        if kind == "meeting"
        else f"stack_{parent_id}_knowledge"
    )
    upload = NewUpload(
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=uuid.uuid4(),
        owner=KnowledgeOwner(kind, parent_id),
        file_name="notes.txt",
        file_type="txt",
        file_size_bytes=11,
        collection_name=collection,
        source_key=(
            f"sources/{kind}/{parent_id}/{document_id}/{revision_id}/notes.txt"
        ),
        source_sha256="a" * 64,
        embedding_provider="ollama",
        embedding_model="nomic-embed-text",
        embedding_dimension=768,
    )
    repository.admit_upload(upload)
    repository.claim_ingestion(
        upload.ingestion_id, lease_owner="worker-a", now=NOW, lease_seconds=30
    )
    repository.start_indexing(upload.ingestion_id, upload.revision_id)
    result = repository.publish_revision(
        upload.ingestion_id,
        upload.revision_id,
        chunk_count=1,
        chunks=[
            ChunkIdentity(
                id=uuid.uuid4(),
                chunk_index=0,
                content_sha256="b" * 64,
                char_count=16,
            )
        ],
    )
    assert result.outcome == "ready"
    return upload


class FakeSourceStore:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete(self, key: str) -> None:
        self.deleted.append(key)


class FakeVectors:
    def __init__(self) -> None:
        self.deleted_revisions: list[tuple[str, uuid.UUID]] = []
        self.deleted_collections: list[str] = []

    async def delete_revision(self, collection, revision_id):
        self.deleted_revisions.append((collection, revision_id))
        return 1

    async def delete_collection(self, collection):
        self.deleted_collections.append(collection)
        return True


async def _delete_parent(disposable_db, kind, parent_id, source, vectors):
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    cleanup = CleanupWorker(
        persistence=repository, source_store=source, vectors=vectors
    )
    delete = DeleteParentKnowledge(persistence=repository, cleanup=cleanup)
    return await delete.execute(kind, parent_id)


async def test_meeting_parent_revokes_documents_and_collection(disposable_db):
    meeting_id = _seed_parent(disposable_db, "meeting")
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _make_ready(repository, "meeting", meeting_id)
    source = FakeSourceStore()
    vectors = FakeVectors()

    result = await _delete_parent(
        disposable_db, "meeting", meeting_id, source, vectors
    )

    assert result.documents == 1
    assert result.collection_name == f"meeting_{meeting_id}_shared"
    assert source.deleted == [upload.source_key]
    assert vectors.deleted_revisions == [
        (upload.collection_name, upload.revision_id)
    ]
    assert vectors.deleted_collections == [result.collection_name]

    with disposable_db.connect() as conn:
        conn.execute("DELETE FROM meetings WHERE id = %s", (str(meeting_id),))
        assert conn.execute(
            "SELECT count(*) FROM documents WHERE id = %s", (str(upload.document_id),)
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT count(*) FROM knowledge_cleanup WHERE resolved_at IS NULL"
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT count(*) FROM knowledge_cleanup "
            "WHERE target_kind = 'vector_collection' AND target_id = %s",
            (str(meeting_id),),
        ).fetchone()[0] == 1


async def test_empty_stack_still_cleans_its_collection(disposable_db):
    stack_id = _seed_parent(disposable_db, "stack")
    source = FakeSourceStore()
    vectors = FakeVectors()

    result = await _delete_parent(disposable_db, "stack", stack_id, source, vectors)

    assert result.documents == 0
    assert vectors.deleted_collections == [f"stack_{stack_id}_knowledge"]
    with disposable_db.connect() as conn:
        assert conn.execute(
            "SELECT count(*) FROM knowledge_cleanup WHERE resolved_at IS NULL"
        ).fetchone()[0] == 0
