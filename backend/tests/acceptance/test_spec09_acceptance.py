"""Spec-09 acceptance: durable knowledge, deletion, redaction, recovery."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone

import pytest

from app.modules.knowledge.application.deletion import CleanupWorker, DeleteDocument
from app.modules.knowledge.application.ingestion import (
    MISSING_SOURCE_MESSAGE,
    EmbeddingProfile,
    IngestionWorker,
    PendingReceipt,
    UploadDocument,
    UploadRequest,
)
from app.modules.knowledge.application.ports import (
    SourceNotFound,
    StoredSource,
    VectorHit,
)
from app.modules.knowledge.application.retrieval import (
    KnowledgeScope,
    RetrievalIdentity,
    RetrievalRequest,
    SearchKnowledge,
)
from app.modules.knowledge.domain.models import (
    ChunkIdentity,
    KnowledgeOwner,
    PassageEvidence,
)
from app.modules.knowledge.infrastructure.parsers import LocalDocumentParser
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)
from app.modules.knowledge.public import KnowledgeLifecycle
from tests.doubles.supabase_stub import stub_for

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
EMBEDDING = EmbeddingProfile("ollama", "nomic-embed-text", 768)


def _seed_meeting(db) -> uuid.UUID:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES ('Acceptance', 'active') "
            "RETURNING id"
        ).fetchone()
    return uuid.UUID(str(row[0]))


class MemorySourceStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def ensure_ready(self) -> None:
        return None

    def put(self, key, stream, *, content_type, max_bytes):
        payload = stream.read(max_bytes + 1)
        if len(payload) > max_bytes:
            raise AssertionError("test payload exceeded budget")
        self.objects[key] = payload
        return StoredSource(
            key=key,
            size=len(payload),
            sha256=hashlib.sha256(payload).hexdigest(),
        )

    def move(self, source_key, destination_key):
        if source_key not in self.objects:
            if destination_key in self.objects:
                return
            raise SourceNotFound(source_key)
        self.objects[destination_key] = self.objects.pop(source_key)

    def download(self, key, *, max_bytes):
        if key not in self.objects:
            raise SourceNotFound(key)
        return self.objects[key]

    def exists(self, key):
        return key in self.objects

    def delete(self, key):
        self.objects.pop(key, None)

    def list_prefix(self, prefix, *, limit=100, recursive=False):
        return [
            StoredSource(key=key, size=len(value))
            for key, value in self.objects.items()
            if key.startswith(prefix)
        ][:limit]


class RecordingVectors:
    def __init__(self) -> None:
        self.upserts: list[tuple[str, uuid.UUID, int]] = []
        self.deleted: list[tuple[str, uuid.UUID]] = []

    async def ensure_collection(self, name):
        return True

    async def upsert_revision(self, collection, *, document_id, revision_id, file_name, chunks):
        self.upserts.append((collection, revision_id, len(chunks)))
        return len(chunks)

    async def delete_revision(self, collection, revision_id):
        self.deleted.append((collection, revision_id))
        return 1

    async def delete_collection(self, collection):
        return True


class BarrierVectors(RecordingVectors):
    def __init__(self) -> None:
        super().__init__()
        self.upsert_started = asyncio.Event()
        self.release_upsert = asyncio.Event()

    async def upsert_revision(self, collection, *, document_id, revision_id, file_name, chunks):
        self.upsert_started.set()
        await self.release_upsert.wait()
        return await super().upsert_revision(
            collection,
            document_id=document_id,
            revision_id=revision_id,
            file_name=file_name,
            chunks=chunks,
        )


class QueryBarrierVectors(RecordingVectors):
    def __init__(self, hit: VectorHit) -> None:
        super().__init__()
        self.hit = hit
        self.search_started = asyncio.Event()
        self.release_search = asyncio.Event()

    async def search(self, collection, *, revision_ids, query, limit):
        self.search_started.set()
        await self.release_search.wait()
        return [self.hit]


def _repository(db) -> SupabaseKnowledgeRepository:
    return SupabaseKnowledgeRepository(lambda: stub_for(db))


async def _upload(repository, store, meeting_id, payload=b"sentinel passage"):
    receipt = await UploadDocument(
        source_store=store, persistence=repository, embedding=EMBEDDING
    ).execute(
        UploadRequest(
            file_name="notes.txt",
            size_bytes=len(payload),
            stream=io.BytesIO(payload),
            owner=KnowledgeOwner("meeting", meeting_id),
        )
    )
    assert isinstance(receipt, PendingReceipt)
    return receipt


def _worker(repository, store, vectors) -> IngestionWorker:
    return IngestionWorker(
        source_store=store,
        persistence=repository,
        parser=LocalDocumentParser(),
        vectors=vectors,
        worker_id="acceptance-worker",
    )


def _make_ready(repository, meeting_id) -> uuid.UUID:
    document_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    from app.modules.knowledge.application.ports import NewUpload

    upload = NewUpload(
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=uuid.uuid4(),
        owner=KnowledgeOwner("meeting", meeting_id),
        file_name="notes.txt",
        file_type="txt",
        file_size_bytes=16,
        collection_name=f"meeting_{meeting_id}_shared",
        source_key=f"sources/meeting/{meeting_id}/{document_id}/{revision_id}/notes.txt",
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
    )
    return upload.document_id


async def test_acknowledgement_survives_restart_and_recovers(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    store = MemorySourceStore()
    repository = _repository(disposable_db)
    receipt = await _upload(repository, store, meeting_id)

    # A new process sees the durable job, not the in-memory upload call.
    restarted = _repository(disposable_db)
    vectors = RecordingVectors()
    processed = await _worker(restarted, store, vectors).recover()

    status = restarted.get_ingestion(receipt.operation_id)
    assert processed == 1
    assert status is not None
    assert status.state.value == "ready"
    assert status.chunk_count == 1
    assert restarted.eligible_revisions(meeting_id=meeting_id, stack_ids=[])
    assert vectors.upserts and vectors.upserts[0][2] == 1
    assert store.objects


async def test_missing_source_is_an_honest_failure(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    store = MemorySourceStore()
    repository = _repository(disposable_db)
    receipt = await _upload(repository, store, meeting_id)
    store.objects.clear()

    await _worker(repository, store, RecordingVectors()).process(receipt.operation_id)

    status = repository.get_ingestion(receipt.operation_id)
    assert status is not None
    assert status.state.value == "failed"
    assert status.error_message == MISSING_SOURCE_MESSAGE
    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[]) == []


async def test_startup_sweep_removes_orphan_staging_objects():
    store = MemorySourceStore()
    store.objects["staging/doc-1/rev-1"] = b"leftover"
    lifecycle = KnowledgeLifecycle(
        persistence=object(),
        source_store=store,
        vectors=object(),
        parser=object(),
        embedding=EMBEDDING,
    )

    removed = await lifecycle.sweep_staging()

    assert removed == 1
    assert store.objects == {}


async def test_delete_during_indexing_cannot_publish_late(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    store = MemorySourceStore()
    repository = _repository(disposable_db)
    receipt = await _upload(repository, store, meeting_id)
    vectors = BarrierVectors()
    worker = _worker(repository, store, vectors)

    task = asyncio.create_task(worker.process(receipt.operation_id))
    await asyncio.wait_for(vectors.upsert_started.wait(), timeout=5)

    deleted = await DeleteDocument(
        persistence=repository,
        cleanup=CleanupWorker(
            persistence=repository, source_store=store, vectors=vectors
        ),
    ).execute(receipt.document_id)

    vectors.release_upsert.set()
    await asyncio.wait_for(task, timeout=5)

    status = repository.get_ingestion(receipt.operation_id)
    assert deleted.revisions == 1
    assert status is not None
    assert status.state.value == "revoked"
    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[]) == []


async def test_delete_during_query_drops_stale_passage(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    repository = _repository(disposable_db)
    document_id = _make_ready(repository, meeting_id)
    revision_id = repository.eligible_revisions(
        meeting_id=meeting_id, stack_ids=[]
    )[0].revision_id
    hit = VectorHit(
        text="sentinel passage",
        score=0.9,
        document_id=document_id,
        revision_id=revision_id,
        chunk_id=uuid.uuid4(),
        chunk_index=0,
        content_sha256="b" * 64,
        file_name="notes.txt",
    )
    vectors = QueryBarrierVectors(hit)
    search = SearchKnowledge(persistence=repository, vectors=vectors)
    task = asyncio.create_task(
        search.execute(
            RetrievalRequest(
                query="sentinel",
                scope=KnowledgeScope(meeting_id=meeting_id, stack_ids=[]),
                identity=RetrievalIdentity(
                    operation_id=uuid.uuid4(), tool_call_id="call-1"
                ),
            )
        )
    )
    await asyncio.wait_for(vectors.search_started.wait(), timeout=5)
    repository.revoke_document(document_id, reason="deleted_during_query")
    vectors.release_search.set()

    assert await asyncio.wait_for(task, timeout=5) == []
    with disposable_db.connect() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM retrieved_passage_evidence WHERE revision_id = %s",
            (str(revision_id),),
        ).fetchone()[0]
    assert count == 0


async def test_delete_redacts_evidence_not_conversation(
    disposable_db, live_knowledge_and_redaction
):
    meeting_id, repository, document_id, revision_id, message_id, source = (
        live_knowledge_and_redaction
    )

    await DeleteDocument(
        persistence=repository,
        cleanup=CleanupWorker(
            persistence=repository,
            source_store=source,
            vectors=RecordingVectors(),
        ),
    ).execute(document_id)

    with disposable_db.connect() as conn:
        evidence = conn.execute(
            "SELECT raw_passage FROM retrieved_passage_evidence WHERE revision_id = %s",
            (str(revision_id),),
        ).fetchone()
        message = conn.execute(
            "SELECT content, citations, tool_artifacts FROM messages WHERE id = %s",
            (str(message_id),),
        ).fetchone()
    assert evidence[0] is None
    assert message[0] == "The director asked about the sentinel passage."
    assert message[1][0]["snippet"] == "[redacted]"
    assert message[2]["tool_calls"][0]["result"] == "[redacted]"
    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[]) == []


@pytest.fixture
def live_knowledge_and_redaction(disposable_db):
    meeting_id = _seed_meeting(disposable_db)
    repository = _repository(disposable_db)
    document_id = _make_ready(repository, meeting_id)
    revision_id = repository.eligible_revisions(
        meeting_id=meeting_id, stack_ids=[]
    )[0].revision_id
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
                json.dumps([{"revision_id": str(revision_id), "snippet": "sentinel"}]),
                json.dumps(
                    {
                        "tool_calls": [
                            {
                                "tool": "search_knowledge_base",
                                "call_id": "call-1",
                                "result": "sentinel",
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
                document_id=document_id,
                revision_id=revision_id,
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
    source = MemorySourceStore()
    source.objects[
        f"sources/meeting/{meeting_id}/{document_id}/{revision_id}/notes.txt"
    ] = b"sentinel passage"
    return meeting_id, repository, document_id, revision_id, message_id, source


async def test_restored_backup_replays_newer_deletions_before_retrieval(disposable_db):
    """Rehearse SQL + source-byte restore, then reconcile the deletion manifest.

    The backup predates the deletion. Restoring it makes a revoked revision look
    ready and brings the raw passage back. Retrieval may only resume after the
    newer append-only manifest is replayed and cleanup drains the intents.
    """
    meeting_id = _seed_meeting(disposable_db)
    repository = _repository(disposable_db)
    document_id = _make_ready(repository, meeting_id)
    revision_id = repository.eligible_revisions(
        meeting_id=meeting_id, stack_ids=[]
    )[0].revision_id
    with disposable_db.connect() as conn:
        source_key = conn.execute(
            "SELECT source_key FROM document_revisions WHERE id = %s",
            (str(revision_id),),
        ).fetchone()[0]
    store = MemorySourceStore()
    store.objects[source_key] = b"sentinel passage"
    repository.record_evidence(
        [
            PassageEvidence(
                meeting_id=meeting_id,
                document_id=document_id,
                revision_id=revision_id,
                chunk_id=uuid.uuid4(),
                chunk_sha256="b" * 64,
                raw_passage="sentinel passage",
                source_name="notes.txt",
            )
        ]
    )
    since = datetime.now(timezone.utc)

    tables = (
        "documents",
        "document_revisions",
        "document_ingestions",
        "document_chunks",
        "retrieved_passage_evidence",
        "knowledge_cleanup",
    )
    with disposable_db.connect() as conn:
        for table in tables:
            conn.execute(f"DROP TABLE IF EXISTS {table}_spec09_backup")
            conn.execute(
                f"CREATE TABLE {table}_spec09_backup AS SELECT * FROM {table}"
            )
    backup_objects = dict(store.objects)

    repository.revoke_document(document_id, reason="user_requested")

    # Restore the older SQL snapshot and its source bytes. The append-only
    # deletion manifest stays in place, as it would in a coordinated backup.
    with disposable_db.connect() as conn:
        conn.execute("TRUNCATE TABLE documents CASCADE")
        conn.execute("TRUNCATE TABLE retrieved_passage_evidence")
        conn.execute("TRUNCATE TABLE knowledge_cleanup")
        for table in tables:
            conn.execute(
                f"INSERT INTO {table} SELECT * FROM {table}_spec09_backup"
            )
    store.objects.clear()
    store.objects.update(backup_objects)

    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[])
    with disposable_db.connect() as conn:
        raw = conn.execute(
            "SELECT raw_passage FROM retrieved_passage_evidence WHERE revision_id = %s",
            (str(revision_id),),
        ).fetchone()[0]
    assert raw == "sentinel passage"

    with disposable_db.connect() as conn:
        replay = conn.execute(
            "SELECT knowledge_replay_deletion_events(%s)", (since.isoformat(),)
        ).fetchone()[0]
        row = conn.execute(
            "SELECT status, revoked_at FROM document_revisions WHERE id = %s",
            (str(revision_id),),
        ).fetchone()

    assert replay["revoked_events"] >= 1
    assert row[0] == "revoked"
    assert row[1] is not None

    # Startup reconciliation drains the replayed redaction intent before the
    # restored system serves retrieval again.
    await CleanupWorker(
        persistence=repository,
        source_store=store,
        vectors=RecordingVectors(),
    ).run()
    with disposable_db.connect() as conn:
        raw = conn.execute(
            "SELECT raw_passage FROM retrieved_passage_evidence WHERE revision_id = %s",
            (str(revision_id),),
        ).fetchone()[0]
    assert raw is None
    assert source_key not in store.objects
    assert repository.eligible_revisions(meeting_id=meeting_id, stack_ids=[]) == []
