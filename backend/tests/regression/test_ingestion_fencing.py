"""Regression (spec-02 B1): in-flight document indexing vs a racing delete.

Today `DELETE /documents/{id}` removes the current vector points and the SQL
row, but a background indexing task started by an earlier upload can publish
(or re-publish) points AFTER that delete finished — leaving orphaned, still
searchable vectors for a document that no longer exists.

Locked behavior (decision: honest fencing at durable boundaries):
- the delete route tombstones the document FIRST (before touching vectors or
  the SQL row), so concurrent ingestion can observe the tombstone;
- ingestion fences before publishing: a tombstoned document never upserts;
- ingestion fences after publishing: a document tombstoned between the
  pre-publish fence and the post-publish check is compensated immediately —
  the just-published points are deleted again;
- sibling documents are never collateral of another document's tombstone;
- a fenced-off or compensated ingestion never flips a status row the delete
  route has already removed (or is about to remove).
"""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from app.api import documents as documents_module
from app.services import ingestion as ingestion_module
from app.services.document_processor import DocumentChunk
from app.services.ingestion import get_ingestion_registry
from tests.doubles.supabase_stub import stub_for

DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000001"
SIBLING = "eeeeeeee-eeee-4eee-8eee-eeee00000002"
MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
COLLECTION = f"meeting_{MEETING_ID}_shared"


class GatedVectorStore:
    """Vector-store double with two deterministic parking windows:

    - ``hold_upsert`` parks inside ``index_document`` BEFORE points go live
      (the delete-behind-publish window); the test releases via ``unhold``.
    - All upserts/deletes are recorded so tests can assert surviving points.
    """

    def __init__(self, chunk_count: int = 3):
        self.upserted: list[tuple[str, str, int]] = []
        self.deletions: list[tuple[str, str]] = []
        self.live_points: dict[tuple[str, str], int] = {}
        self._hold_upsert: asyncio.Event | None = None
        self._upsert_park_reached = asyncio.Event()
        self.chunk_count = chunk_count

    def hold_upsert(self) -> None:
        self._hold_upsert = asyncio.Event()

    def parked_at_upsert(self) -> asyncio.Event:
        return self._upsert_park_reached

    def unhold(self) -> None:
        if self._hold_upsert is not None:
            self._hold_upsert.set()

    async def index_document(self, collection_name, document_id, chunks):
        if self._hold_upsert is not None:
            self._upsert_park_reached.set()
            await self._hold_upsert.wait()
        self.upserted.append((collection_name, document_id, len(chunks)))
        self.live_points[(collection_name, document_id)] = len(chunks)
        return len(chunks)

    async def delete_document(self, collection_name, document_id):
        self.deletions.append((collection_name, document_id))
        self.live_points.pop((collection_name, document_id), None)
        return 1

    # Unused by the ingestion path but part of the manager surface:
    async def collection_exists(self, name):
        return True

    async def search_multiple_collections(self, collection_names, query, limit):
        return []


class SyncProcessor:
    """`DocumentProcessor.process_file` is synchronous; the fence harness
    replaces the class so no real parsing happens."""

    def __init__(self, chunks=None, error: Exception | None = None):
        self.chunks = chunks or [
            DocumentChunk(text="chunk one", chunk_index=0, metadata={}),
            DocumentChunk(text="chunk two", chunk_index=1, metadata={}),
        ]
        self.error = error
        self.calls = 0

    def process_file(self, *, file_content, file_name, file_type, additional_metadata):
        self.calls += 1
        if self.error:
            raise self.error
        return self.chunks


def seed_processing_document(db, doc_id=DOC, meeting_id=MEETING_ID, *, seed_meeting=True):
    stub = stub_for(db)
    if seed_meeting:
        stub.table("meetings").insert({
            "id": meeting_id,
            "name": "Fencing probe",
            "agenda": "",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    stub.table("documents").insert({
        "id": doc_id,
        "file_name": "brief.md",
        "file_type": "md",
        "file_size_bytes": 42,
        "qdrant_collection": COLLECTION,
        "status": "processing",
        "meeting_id": meeting_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


@pytest.fixture()
def ingestion_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.api.documents.get_supabase", lambda: stub)
    store = GatedVectorStore()
    monkeypatch.setattr("app.api.documents.get_vector_store", lambda: store)
    # Fresh registry per test (the module-level singleton would leak tickets).
    monkeypatch.setattr(ingestion_module, "_registry", ingestion_module.IngestionRegistry())
    processor = SyncProcessor()
    # Production code does `DocumentProcessor()`; patch with a factory so the
    # same instance (with its injectable .error) is used by every task.
    monkeypatch.setattr(documents_module, "DocumentProcessor", lambda: processor)
    return SimpleNamespace(
        db=disposable_db, store=store, registry=get_ingestion_registry(), processor=processor
    )


def document_row(db, doc_id=DOC):
    rows = db.query("SELECT status, error_message FROM documents WHERE id = %s", (doc_id,))
    return rows[0] if rows else None


async def run_ingestion(task) -> None:
    """Await the background ingestion with a hard ceiling so a fence that
    never releases fails the test instead of hanging the loop."""
    await asyncio.wait_for(task, timeout=10)


async def test_delete_while_parked_before_publish_suppresses_indexing(ingestion_env):
    env = ingestion_env
    seed_processing_document(env.db)
    ticket = env.registry.create_ticket(DOC)
    gate = ticket.block_publish()

    task = asyncio.create_task(
        documents_module._process_and_index_document(
            document_id=DOC,
            ticket=ticket,
            file_content=b"brief",
            file_name="brief.md",
            file_type="md",
            collection_name=COLLECTION,
        )
    )
    # The gate was armed before the task started, so the task is deterministically
    # parked before its publish fence. Run the delete in that window.
    await documents_module.delete_document(DOC)
    gate.set()

    await run_ingestion(task)

    assert env.store.upserted == [], "tombstoned before publish: no points may be upserted"
    assert document_row(env.db) is None, "delete route removed the record row"


async def test_delete_after_publish_is_compensated(ingestion_env):
    env = ingestion_env
    seed_processing_document(env.db)
    ticket = env.registry.create_ticket(DOC)
    env.store.hold_upsert()

    task = asyncio.create_task(
        documents_module._process_and_index_document(
            document_id=DOC,
            ticket=ticket,
            file_content=b"brief",
            file_name="brief.md",
            file_type="md",
            collection_name=COLLECTION,
        )
    )
    # Deterministic interleaving: ingestion is parked right before its points
    # go live; the delete completes in that window.
    await env.store.parked_at_upsert().wait()
    await documents_module.delete_document(DOC)
    env.store.unhold()

    await run_ingestion(task)

    assert len(env.store.upserted) == 1, "points went live before the delete landed"
    assert env.store.live_points.get((COLLECTION, DOC)) is None, (
        "the post-publish fence must remove just-published points of a "
        "tombstoned document"
    )
    assert env.store.deletions, "compensation delete ran after the upsert"


async def test_delete_before_task_start_skips_ingestion_entirely(ingestion_env):
    env = ingestion_env
    seed_processing_document(env.db)
    env.registry.create_ticket(DOC)

    # Delete lands first (route tombs the ticket), then the background task starts.
    await documents_module.delete_document(DOC)
    ticket = env.registry.ticket_for(DOC)
    await documents_module._process_and_index_document(
        document_id=DOC,
        ticket=ticket,
        file_content=b"brief",
        file_name="brief.md",
        file_type="md",
        collection_name=COLLECTION,
    )

    assert env.store.upserted == []
    assert document_row(env.db) is None


async def test_delete_of_sibling_leaves_ingestion_unfenced(ingestion_env):
    env = ingestion_env
    seed_processing_document(env.db, doc_id=DOC)
    seed_processing_document(env.db, doc_id=SIBLING, seed_meeting=False)
    ticket = env.registry.create_ticket(DOC)
    sibling_ticket = env.registry.create_ticket(SIBLING)

    task = asyncio.create_task(
        documents_module._process_and_index_document(
            document_id=DOC,
            ticket=ticket,
            file_content=b"brief",
            file_name="brief.md",
            file_type="md",
            collection_name=COLLECTION,
        )
    )
    await asyncio.gather(
        documents_module.delete_document(SIBLING),
        run_ingestion(task),
    )

    assert env.store.upserted == [(COLLECTION, DOC, 2)]
    assert env.store.live_points.get((COLLECTION, DOC)) == 2
    row = document_row(env.db)
    assert row is not None and row[0] == "indexed"


async def test_failed_ingestion_marks_document_failed(ingestion_env):
    env = ingestion_env
    seed_processing_document(env.db)
    ticket = env.registry.create_ticket(DOC)
    env.processor.error = RuntimeError("parser exploded")

    await documents_module._process_and_index_document(
        document_id=DOC,
        ticket=ticket,
        file_content=b"brief",
        file_name="brief.md",
        file_type="md",
        collection_name=COLLECTION,
    )

    row = document_row(env.db)
    assert row is not None and row[0] == "failed"
    assert "parser exploded" in (row[1] or "")
