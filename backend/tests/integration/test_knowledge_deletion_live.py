"""Deletion revokes eligibility, cleans physical sources, and redacts evidence."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.modules.knowledge.application.deletion import (
    CleanupWorker,
    DeleteDocument,
)
from app.modules.knowledge.application.ports import NewUpload
from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    KnowledgeOwner,
    PassageEvidence,
)
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)
from tests.doubles.supabase_stub import stub_for

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def _seed_meeting(db) -> uuid.UUID:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES ('Deletion', 'active') "
            "RETURNING id"
        ).fetchone()
    return uuid.UUID(str(row[0]))


def _make_ready(
    repository: SupabaseKnowledgeRepository, meeting_id: uuid.UUID
) -> NewUpload:
    document_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    upload = NewUpload(
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=uuid.uuid4(),
        owner=KnowledgeOwner("meeting", meeting_id),
        file_name="notes.txt",
        file_type="txt",
        file_size_bytes=11,
        collection_name=f"meeting_{meeting_id}_shared",
        source_key=(
            f"sources/meeting/{meeting_id}/{document_id}/{revision_id}/notes.txt"
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
    assert repository.start_indexing(upload.ingestion_id, upload.revision_id)
    assert (
        repository.publish_revision(
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
        ).outcome
        == "ready"
    )
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


def test_attach_evidence_message_backfills_the_published_reply(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _make_ready(repository, meeting_id)
    operation_id = uuid.uuid4()
    message_id = uuid.uuid4()
    repository.record_evidence(
        [
            PassageEvidence(
                meeting_id=meeting_id,
                document_id=upload.document_id,
                revision_id=upload.revision_id,
                chunk_id=uuid.uuid4(),
                chunk_sha256="b" * 64,
                raw_passage="late binding",
                operation_id=operation_id,
                tool_call_id="call-9",
            )
        ]
    )
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO messages (id, meeting_id, sender_type, sender_name, content) "
            "VALUES (%s, %s, 'ai', 'Analyst', 'reply')",
            (str(message_id), str(meeting_id)),
        )
        conn.commit()

    attached = repository.attach_evidence_message(
        operation_id, "call-9", message_id
    )

    assert attached == 1
    with disposable_db.connect() as conn:
        row = conn.execute(
            "SELECT message_id FROM retrieved_passage_evidence "
            "WHERE revision_id = %s",
            (str(upload.revision_id),),
        ).fetchone()
    assert uuid.UUID(str(row[0])) == message_id


async def test_delete_revokes_cleans_and_redacts_without_erasing_conversation(
    disposable_db,
):
    meeting_id = _seed_meeting(disposable_db)
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _make_ready(repository, meeting_id)
    message_id = uuid.uuid4()
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO messages "
            "(id, meeting_id, sender_type, sender_name, content, citations, "
            " tool_artifacts) VALUES (%s, %s, 'ai', 'Analyst', %s, %s::jsonb, "
            " %s::jsonb)",
            (
                str(message_id),
                str(meeting_id),
                "The director asked about the sentinel passage.",
                json.dumps(
                    [
                        {
                            "revision_id": str(upload.revision_id),
                            "snippet": "sentinel passage",
                        }
                    ]
                ),
                json.dumps(
                    {
                        "tool_calls": [
                            {
                                "tool": "search_knowledge_base",
                                "call_id": "call-1",
                                "result": "sentinel passage",
                            }
                        ]
                    }
                ),
            ),
        )
        conn.commit()

    repository.record_evidence(
        [
            PassageEvidence(
                meeting_id=meeting_id,
                document_id=upload.document_id,
                revision_id=upload.revision_id,
                chunk_id=uuid.uuid4(),
                chunk_sha256="b" * 64,
                raw_passage="sentinel passage",
                source_name="notes.txt",
                operation_id=uuid.uuid4(),
                tool_call_id="call-1",
                message_id=message_id,
                score=0.9,
            )
        ]
    )

    source = FakeSourceStore()
    vectors = FakeVectors()
    worker = CleanupWorker(
        persistence=repository, source_store=source, vectors=vectors
    )
    result = await DeleteDocument(
        persistence=repository, cleanup=worker
    ).execute(upload.document_id)

    assert result.revisions == 1
    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[]) == []
    assert source.deleted == [upload.source_key]
    assert vectors.deleted_revisions == [
        (upload.collection_name, upload.revision_id)
    ]

    with disposable_db.connect() as conn:
        evidence = conn.execute(
            "SELECT raw_passage, redacted_at FROM retrieved_passage_evidence "
            "WHERE revision_id = %s",
            (str(upload.revision_id),),
        ).fetchone()
        message = conn.execute(
            "SELECT content, citations, tool_artifacts FROM messages WHERE id = %s",
            (str(message_id),),
        ).fetchone()
        unresolved = conn.execute(
            "SELECT COUNT(*) FROM knowledge_cleanup "
            "WHERE document_id = %s AND resolved_at IS NULL",
            (str(upload.document_id),),
        ).fetchone()[0]
        manifest = conn.execute(
            "SELECT COUNT(*) FROM knowledge_deletion_events "
            "WHERE document_id = %s AND event_kind = 'revoked'",
            (str(upload.document_id),),
        ).fetchone()[0]

    assert evidence[0] is None
    assert evidence[1] is not None
    assert message[0] == "The director asked about the sentinel passage."
    assert message[1][0]["snippet"] == "[redacted]"
    assert message[1][0]["redacted"] is True
    assert message[2]["tool_calls"][0]["result"] == "[redacted]"
    assert message[2]["tool_calls"][0]["redacted"] is True
    assert unresolved == 0
    assert manifest == 1
