"""Regression (spec-02 E2, spec-09): parsing never blocks the event loop.

The durable Knowledge worker must run parsing on a bounded worker pool. While
one parser is parked, another ingestion on the same loop must still complete.
Parking uses thread events so a regression to on-loop parsing fails through a
bounded timeout instead of wedging the test run.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import threading
from dataclasses import dataclass, field
from uuid import UUID, uuid4

import pytest

from app.modules.knowledge.application.ingestion import IngestionWorker
from app.modules.knowledge.application.ports import (
    IngestionClaim,
    ParsedChunk,
    PublishResult,
)

SELF_RELEASE_SECONDS = 3.0


class SharedSourceStore:
    def download(self, key: str, *, max_bytes: int) -> bytes:
        return b"brief"


class ParkedParser:
    """Parks on 'parked.md' until released; other files parse instantly."""

    def __init__(self):
        self.parked = threading.Event()
        self.release = threading.Event()
        self.thread_names: list[str] = []

    def parse(self, data: bytes, *, file_name: str, file_type: str):
        self.thread_names.append(threading.current_thread().name)
        if file_name == "parked.md":
            self.parked.set()
            self.release.wait(SELF_RELEASE_SECONDS)
        return [ParsedChunk(text="chunk", chunk_index=0)]


class RecordingVectors:
    def __init__(self):
        self.published_documents: list[UUID] = []

    async def ensure_collection(self, collection_name: str) -> None:
        return None

    async def upsert_revision(
        self, collection_name, *, document_id, revision_id, file_name, chunks
    ) -> int:
        self.published_documents.append(document_id)
        return len(chunks)

    async def delete_revision(self, collection_name, revision_id):
        return 0

    async def search(self, *args, **kwargs):  # pragma: no cover - unused
        return []


@dataclass
class IdentityPersistence:
    """Claims by ingestion id so concurrent jobs stay independent."""

    identity: dict[UUID, tuple[UUID, str]]
    published: list[UUID] = field(default_factory=list)
    failures: list[tuple[UUID, str]] = field(default_factory=list)

    def claim_ingestion(self, ingestion_id, *, lease_owner, now, lease_seconds):
        document_id, file_name = self.identity[ingestion_id]
        return IngestionClaim(
            outcome="claimed",
            document_id=document_id,
            revision_id=uuid4(),
            file_name=file_name,
            file_type="md",
            source_key=f"sources/{document_id}/{file_name}",
            source_sha256="a" * 64,
            source_size_bytes=5,
            collection_name="meeting_probe_shared",
            embedding_provider="ollama",
            embedding_model="nomic-embed-text",
            embedding_dimension=4,
            attempts=1,
        )

    def start_indexing(self, ingestion_id, revision_id):
        return True

    def publish_revision(self, ingestion_id, revision_id, *, chunk_count, chunks):
        self.published.append(self.identity[ingestion_id][0])
        return PublishResult(outcome="ready")

    def fail_ingestion(self, ingestion_id, revision_id, error):
        self.failures.append((ingestion_id, error))
        return True

    def recoverable_ingestions(self, *, now, limit=20):
        return []


class IngestionLoopThread:
    """Dedicated loop+thread so a frozen loop cannot wedge pytest itself."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(
            target=self.loop.run_forever, name="ingestion-loop", daemon=True
        )
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


def _worker(persistence, parser) -> IngestionWorker:
    return IngestionWorker(
        source_store=SharedSourceStore(),
        persistence=persistence,
        parser=parser,
        vectors=RecordingVectors(),
        parse_slots=2,
    )


def test_second_ingestion_completes_while_a_parser_is_parked(ingestion_thread):
    parked_id, quick_id = uuid4(), uuid4()
    parked_doc, quick_doc = uuid4(), uuid4()
    persistence = IdentityPersistence(
        {parked_id: (parked_doc, "parked.md"), quick_id: (quick_doc, "quick.md")}
    )
    parser = ParkedParser()
    worker = _worker(persistence, parser)

    parked = ingestion_thread.schedule(worker.process(parked_id))
    if not parser.parked.wait(5):
        pytest.fail("parked parser never signaled")

    quick = ingestion_thread.schedule(worker.process(quick_id))
    try:
        quick.result(timeout=2.0)
    except concurrent.futures.TimeoutError:
        pytest.fail(
            "the parked parser starved the event loop: the concurrent "
            "ingestion could not complete while parsing was running"
        )

    # Quick is published while the parked parser is still blocked.
    assert persistence.published == [quick_doc]
    assert all(name != "ingestion-loop" for name in parser.thread_names)

    parser.release.set()
    parked.result(timeout=10)

    assert persistence.published == [quick_doc, parked_doc]


def test_parser_failure_surfaces_as_a_failed_ingestion(ingestion_thread):
    ingestion_id = uuid4()
    document_id = uuid4()

    class BrokenParser:
        def parse(self, data, *, file_name, file_type):
            raise ValueError("binary junk in broken.md")

    persistence = IdentityPersistence({ingestion_id: (document_id, "broken.md")})
    worker = _worker(persistence, BrokenParser())

    ingestion_thread.schedule(worker.process(ingestion_id)).result(timeout=10)

    assert persistence.failures
    assert "binary junk" in persistence.failures[0][1]
