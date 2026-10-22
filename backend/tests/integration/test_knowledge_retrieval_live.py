"""Live SQL eligibility and evidence retention through the repository adapter."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.modules.knowledge.application.ports import NewUpload, VectorHit
from app.modules.knowledge.application.retrieval import (
    KnowledgeScope,
    RetrievalIdentity,
    RetrievalRequest,
    SearchKnowledge,
)
from app.modules.knowledge.domain.models import ChunkIdentity, KnowledgeOwner
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)
from tests.doubles.supabase_stub import stub_for

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def _seed_meeting(db) -> uuid.UUID:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES ('Retrieval', 'active') "
            "RETURNING id"
        ).fetchone()
    return uuid.UUID(str(row[0]))


def _seed_stack(db, name: str = "Retrieval stack") -> uuid.UUID:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO knowledge_stacks (name) VALUES (%s) RETURNING id", (name,)
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


def _make_ready(repository: SupabaseKnowledgeRepository, owner: KnowledgeOwner) -> NewUpload:
    upload = _upload(owner)
    repository.admit_upload(upload)
    repository.claim_ingestion(
        upload.ingestion_id, lease_owner="worker-a", now=NOW, lease_seconds=30
    )
    assert repository.start_indexing(upload.ingestion_id, upload.revision_id)
    published = repository.publish_revision(
        upload.ingestion_id,
        upload.revision_id,
        chunk_count=1,
        chunks=[
            ChunkIdentity(
                id=uuid.uuid4(),
                chunk_index=0,
                content_sha256="b" * 64,
                char_count=5,
            )
        ],
    )
    assert published.outcome == "ready"
    return upload


class FakeVectors:
    def __init__(self, hits: list[VectorHit]) -> None:
        self.hits = hits
        self.calls: list[tuple[str, list[uuid.UUID]]] = []

    async def search(self, collection, *, revision_ids, query, limit):
        self.calls.append((collection, list(revision_ids)))
        return [hit for hit in self.hits if hit.revision_id in revision_ids]


def test_scope_and_revalidation_exclude_unassigned_pending_and_revoked(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    stack_id = _seed_stack(disposable_db)
    other_stack_id = _seed_stack(disposable_db, "Other")
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))

    shared = _make_ready(repository, KnowledgeOwner("meeting", meeting_id))
    assigned = _make_ready(repository, KnowledgeOwner("stack", stack_id))
    unassigned = _make_ready(repository, KnowledgeOwner("stack", other_stack_id))
    pending = _upload(KnowledgeOwner("meeting", meeting_id))
    repository.admit_upload(pending)

    eligible = repository.eligible_revisions(
        meeting_id=meeting_id, stack_ids=[stack_id]
    )
    eligible_ids = {item.revision_id for item in eligible}
    assert eligible_ids == {shared.revision_id, assigned.revision_id}
    assert unassigned.revision_id not in eligible_ids
    assert pending.revision_id not in eligible_ids

    candidates = [shared.revision_id, assigned.revision_id, unassigned.revision_id]
    assert repository.revalidate_revisions(
        candidates, meeting_id=meeting_id, stack_ids=[stack_id]
    ) == {shared.revision_id, assigned.revision_id}

    with disposable_db.connect() as conn:
        conn.execute(
            "SELECT knowledge_revoke_document(%s, %s)",
            (shared.document_id, "deleted by director"),
        )
        conn.commit()

    eligible = repository.eligible_revisions(
        meeting_id=meeting_id, stack_ids=[stack_id]
    )
    assert {item.revision_id for item in eligible} == {assigned.revision_id}
    assert repository.revalidate_revisions(
        candidates, meeting_id=meeting_id, stack_ids=[stack_id]
    ) == {assigned.revision_id}


async def test_search_records_raw_evidence_and_redaction_clears_it(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    repository = SupabaseKnowledgeRepository(lambda: stub_for(disposable_db))
    upload = _make_ready(repository, KnowledgeOwner("meeting", meeting_id))
    operation_id = uuid.uuid4()
    participant_id = uuid.uuid4()
    vectors = FakeVectors(
        [
            VectorHit(
                text="sentinel passage",
                score=0.87,
                document_id=upload.document_id,
                revision_id=upload.revision_id,
                chunk_id=uuid.uuid4(),
                chunk_index=0,
                content_sha256="b" * 64,
                file_name="notes.txt",
            )
        ]
    )
    search = SearchKnowledge(persistence=repository, vectors=vectors)

    result = await search.execute(
        RetrievalRequest(
            query="sentinel",
            scope=KnowledgeScope(meeting_id, []),
            identity=RetrievalIdentity(
                operation_id=operation_id,
                participant_id=participant_id,
                tool_call_id="call-1",
            ),
        )
    )

    assert [passage.text for passage in result] == ["sentinel passage"]
    with disposable_db.connect() as conn:
        row = conn.execute(
            "SELECT raw_passage, operation_id, participant_id, tool_call_id "
            "FROM retrieved_passage_evidence WHERE revision_id = %s",
            (str(upload.revision_id),),
        ).fetchone()
    assert row is not None
    assert row[0] == "sentinel passage"
    assert uuid.UUID(str(row[1])) == operation_id
    assert uuid.UUID(str(row[2])) == participant_id
    assert row[3] == "call-1"

    with disposable_db.connect() as conn:
        conn.execute(
            "SELECT knowledge_redact_evidence(%s, %s)",
            (str(upload.revision_id), "source deleted"),
        )
        conn.commit()
        row = conn.execute(
            "SELECT raw_passage, redacted_at FROM retrieved_passage_evidence "
            "WHERE revision_id = %s",
            (str(upload.revision_id),),
        ).fetchone()
    assert row[0] is None
    assert row[1] is not None
