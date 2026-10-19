"""Regression (spec-02 E2): ingestion must not block the event loop.

`_process_and_index_document` runs heavy parsing (pypdf/python-docx/openpyxl
materialize everything) synchronously INSIDE the event loop coroutine. While
one document is being parsed, the loop cannot service anything else. The
locked behavior:

- parsing runs on a bounded worker pool (semaphore-gated to_thread);
- while one document's parser is parked mid-parse, another ingestion on the
  same loop completes (the parked-barrier test);
- a parser failure still surfaces as status 'failed' with the error message;
- the extraction path obeys budgets (see test_extraction_budgets.py).

Parking uses THREAD events on purpose: under the old code the parser runs on
the loop thread itself, so a parked parser must freeze that loop (and the
test then fails via a bounded timeout in the MAIN thread, never a hang);
under the new code the parser runs on a worker thread and the loop stays
responsive.
"""

import asyncio
import concurrent.futures
import threading
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api import documents as documents_module
from app.services import ingestion as ingestion_module
from app.services.document_processor import DocumentChunk
from app.services.ingestion import get_ingestion_registry
from tests.doubles.supabase_stub import stub_for

PARKED_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000011"
QUICK_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000012"
FAILED_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000013"
MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
COLLECTION = f"meeting_{MEETING_ID}_shared"

# The parked parser self-releases after this long so that a red (on-loop)
# codebase cannot wedge a pytest run: the dedicated ingestion loop frees
# itself, the main test thread is never frozen. Under the fixed code the
# release is armed by the test long before the cap matters.
SELF_RELEASE_SECONDS = 3.0


class RecordingVectorStore:
    """Records ingestion outcomes; coroutine surface of VectorStoreManager."""

    def __init__(self):
        self.indexed_order: list[str] = []
        self.deletions: list[tuple[str, str]] = []

    async def index_document(self, collection_name, document_id, chunks):
        self.indexed_order.append(document_id)
        return len(chunks)

    async def delete_document(self, collection_name, document_id):
        self.deletions.append((collection_name, document_id))
        return 1

    async def collection_exists(self, name):
        return True


class ForkedProcessor:
    """`process_file` double: 'parked.md' parks until released (or the cap),
    everything else parses instantly. Records parse exits in global order."""

    def __init__(self):
        self.parked = threading.Event()
        self.release = threading.Event()
        self.parse_exits: list[str] = []
        self.fail_for: set[str] = set()

    def process_file(self, *, file_content, file_name, file_type, additional_metadata):
        if file_name == "parked.md":
            self.parked.set()
            self.release.wait(SELF_RELEASE_SECONDS)
        if file_name in self.fail_for:
            raise ValueError(f"binary junk in {file_name}")
        self.parse_exits.append(file_name)
        return [
            DocumentChunk(text="chunk one", chunk_index=0, metadata={}),
            DocumentChunk(text="chunk two", chunk_index=1, metadata={}),
        ]


def _stub_document(db, doc_id: str, file_name: str, *, seed_meeting: bool):
    stub = stub_for(db)
    if seed_meeting:
        stub.table("meetings").insert({
            "id": MEETING_ID,
            "name": "Off-loop probe",
            "agenda": "",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    stub.table("documents").insert({
        "id": doc_id,
        "file_name": file_name,
        "file_type": "md",
        "file_size_bytes": 42,
        "qdrant_collection": COLLECTION,
        "status": "processing",
        "meeting_id": MEETING_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def document_row(db, doc_id: str):
    rows = db.query("SELECT status, error_message FROM documents WHERE id = %s", (doc_id,))
    return rows[0] if rows else None


@pytest.fixture()
def offloop_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.api.documents.get_supabase", lambda: stub)
    store = RecordingVectorStore()
    monkeypatch.setattr("app.api.documents.get_vector_store", lambda: store)
    monkeypatch.setattr(ingestion_module, "_registry", ingestion_module.IngestionRegistry())
    processor = ForkedProcessor()
    monkeypatch.setattr(documents_module, "DocumentProcessor", lambda: processor)
    return SimpleNamespace(
        db=disposable_db,
        store=store,
        registry=get_ingestion_registry(),
        processor=processor,
    )


class IngestionLoopThread:
    """Dedicated loop+thread running the ingestion coroutine(s).

    The main (pytest) thread never runs the ingestion loop, so a frozen
    loop under the old code fails via bounded future timeouts instead of
    wedging pytest itself.
    """

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, name="ingestion-loop", daemon=True)
        self.thread.start()

    def schedule(self, coro) -> concurrent.futures.Future:
        return asyncio.run_coroutine_threadsafe(coro, self.loop)

    def stop(self):
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=5)
        self.loop.close()


@pytest.fixture()
def ingestion_thread():
    runner = IngestionLoopThread()
    try:
        yield runner
    finally:
        runner.stop()


def _ingest(env, doc_id: str, file_name: str):
    ticket = env.registry.create_ticket(doc_id)
    return documents_module._process_and_index_document(
        document_id=doc_id,
        ticket=ticket,
        file_content=b"brief",
        file_name=file_name,
        file_type="md",
        collection_name=COLLECTION,
    )


def test_second_ingestion_completes_while_a_parser_is_parked(offloop_env, ingestion_thread):
    env = offloop_env
    _stub_document(env.db, PARKED_DOC, "parked.md", seed_meeting=True)
    _stub_document(env.db, QUICK_DOC, "quick.md", seed_meeting=False)
    runner = ingestion_thread

    # The parked parser occupies the loop (or, fixed: a worker thread) first.
    parked = runner.schedule(_ingest(env, PARKED_DOC, "parked.md"))
    if not env.processor.parked.wait(5):
        pytest.fail("parked parser never signaled")

    # Now a second ingestion must finish while the first is still parked.
    quick = runner.schedule(_ingest(env, QUICK_DOC, "quick.md"))
    try:
        quick.result(timeout=2.0)
    except concurrent.futures.TimeoutError:
        pytest.fail(
            "the parked parser starved the event loop: the concurrent "
            "ingestion could not complete while parsing was running"
        )

    # The quick document is fully published BEFORE the parked parser is
    # released — ordering, not just completion.
    assert env.store.indexed_order == [QUICK_DOC]

    env.processor.release.set()
    parked.result(timeout=10)

    assert env.store.indexed_order == [QUICK_DOC, PARKED_DOC]
    assert document_row(env.db, QUICK_DOC)[0] == "indexed"
    assert document_row(env.db, PARKED_DOC)[0] == "indexed"


async def test_parser_failure_still_surfaces_as_failed_document(offloop_env):
    env = offloop_env
    _stub_document(env.db, FAILED_DOC, "broken.md", seed_meeting=True)
    env.processor.fail_for.add("broken.md")

    await asyncio.wait_for(_ingest(env, FAILED_DOC, "broken.md"), timeout=10)

    row = document_row(env.db, FAILED_DOC)
    assert row is not None
    assert row[0] == "failed"
    assert "binary junk" in (row[1] or "")
