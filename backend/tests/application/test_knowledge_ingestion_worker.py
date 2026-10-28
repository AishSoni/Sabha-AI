"""Restartable worker behavior over real application seams (no DB/network)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.modules.knowledge.application.ingestion import (
    MISSING_SOURCE_MESSAGE,
    IngestionWorker,
)
from app.modules.knowledge.application.ports import (
    IngestionClaim,
    ParsedChunk,
    ParsedDocument,
    PublishResult,
    SourceNotFound,
)
from app.modules.knowledge.domain.models import ChunkIdentity
from app.modules.knowledge.domain.services import chunk_identities


class FakeSourceStore:
    def __init__(self, data: bytes | None) -> None:
        self.data = data
        self.downloads: list[str] = []

    def download(self, key: str, *, max_bytes: int) -> bytes:
        self.downloads.append(key)
        if self.data is None:
            raise SourceNotFound(key)
        return self.data


class FakeParser:
    def __init__(self, texts: list[str] | None = None) -> None:
        self.texts = ["alpha", "beta"] if texts is None else texts
        self.calls = 0

    def parse(self, data: bytes, *, file_name: str, file_type: str):
        self.calls += 1
        return ParsedDocument(
            chunks=[
                ParsedChunk(text=text, chunk_index=index)
                for index, text in enumerate(self.texts)
            ],
            extraction_method="builtin",
            extraction_version="1",
        )


class PageAwareParser(FakeParser):
    def parse(self, data: bytes, *, file_name: str, file_type: str):
        self.calls += 1
        return ParsedDocument(
            chunks=[
                ParsedChunk(text="page one", chunk_index=0, page_number=1),
                ParsedChunk(text="page two", chunk_index=1, page_number=3),
            ],
            extraction_method="pypdf+ocr",
            extraction_version="1",
            page_count=3,
            ocr_page_count=1,
        )


class FakeVectors:
    def __init__(self) -> None:
        self.collections: list[str] = []
        self.upserts: list[dict] = []
        self.deletes: list[tuple[str, UUID]] = []

    async def ensure_collection(self, collection_name: str) -> None:
        self.collections.append(collection_name)

    async def upsert_revision(
        self, collection_name, *, document_id, revision_id, file_name, chunks
    ) -> int:
        self.upserts.append(
            {
                "collection": collection_name,
                "document_id": document_id,
                "revision_id": revision_id,
                "file_name": file_name,
                "chunks": chunks,
            }
        )
        return len(chunks)

    async def delete_revision(self, collection_name, revision_id):
        self.deletes.append((collection_name, revision_id))
        return 1

    async def search(self, *args, **kwargs):  # pragma: no cover - not used
        return []


@dataclass
class FakePersistence:
    claim: IngestionClaim
    publish_outcome: str = "ready"
    started: bool = True
    recoverable: list[UUID] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    published: list[dict] = field(default_factory=list)
    claims: int = 0

    def claim_ingestion(self, ingestion_id, *, lease_owner, now, lease_seconds):
        self.claims += 1
        return self.claim

    def start_indexing(self, ingestion_id, revision_id):
        return self.started

    def publish_revision(
        self,
        ingestion_id,
        revision_id,
        *,
        chunk_count,
        chunks,
        extraction_method=None,
        extraction_version=None,
        page_count=None,
        ocr_page_count=0,
    ):
        self.published.append(
            {
                "ingestion_id": ingestion_id,
                "count": chunk_count,
                "chunks": chunks,
                "extraction_method": extraction_method,
                "extraction_version": extraction_version,
                "page_count": page_count,
                "ocr_page_count": ocr_page_count,
            }
        )
        return PublishResult(outcome=self.publish_outcome)

    def fail_ingestion(self, ingestion_id, revision_id, error):
        self.failures.append(error)
        return True

    def recoverable_ingestions(self, *, now, limit=20):
        return self.recoverable


def _claim(**overrides) -> IngestionClaim:
    values = {
        "outcome": "claimed",
        "document_id": uuid4(),
        "revision_id": uuid4(),
        "file_name": "notes.txt",
        "file_type": "txt",
        "source_key": "sources/meeting/x/notes.txt",
        "source_sha256": "a" * 64,
        "source_size_bytes": 10,
        "collection_name": "meeting_x_shared",
        "embedding_provider": "ollama",
        "embedding_model": "nomic-embed-text",
        "embedding_dimension": 4,
        "attempts": 1,
    }
    values.update(overrides)
    return IngestionClaim(**values)


def _worker(source, parser, vectors, persistence) -> IngestionWorker:
    return IngestionWorker(
        source_store=source,
        persistence=persistence,
        parser=parser,
        vectors=vectors,
        worker_id="worker-1",
        lease_seconds=30,
    )


async def test_worker_indexes_and_publishes_ready():
    claim = _claim()
    persistence = FakePersistence(claim)
    vectors = FakeVectors()
    worker = _worker(
        FakeSourceStore(b"alpha beta"), FakeParser(), vectors, persistence
    )

    await worker.process(uuid4())

    expected = chunk_identities(claim.revision_id, ["alpha", "beta"])
    assert vectors.collections == [claim.collection_name]
    assert vectors.upserts[0]["chunks"] == [
        (expected[0], "alpha"),
        (expected[1], "beta"),
    ]
    assert persistence.published[0]["count"] == 2
    assert persistence.published[0]["extraction_method"] == "builtin"
    assert persistence.published[0]["extraction_version"] == "1"
    assert persistence.failures == []
    assert vectors.deletes == []


async def test_worker_records_honest_missing_source_failure():
    persistence = FakePersistence(_claim())
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(None), FakeParser(), vectors, persistence)

    await worker.process(uuid4())

    assert persistence.failures == [MISSING_SOURCE_MESSAGE]
    assert vectors.upserts == []
    assert persistence.published == []


async def test_worker_never_publishes_an_empty_extraction_as_ready():
    persistence = FakePersistence(_claim())
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"empty"), FakeParser(texts=[]), vectors, persistence)

    await worker.process(uuid4())

    assert persistence.failures == [
        "extraction produced no readable text; the revision was not published"
    ]
    assert vectors.upserts == []
    assert persistence.published == []


async def test_worker_publishes_page_locators_and_extraction_provenance():
    claim = _claim()
    persistence = FakePersistence(claim)
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"pdf"), PageAwareParser(), vectors, persistence)

    await worker.process(uuid4())

    expected = chunk_identities(claim.revision_id, ["page one", "page two"])
    assert vectors.upserts[0]["chunks"][0][0].page_number == 1
    assert vectors.upserts[0]["chunks"][1][0].page_number == 3
    assert vectors.upserts[0]["chunks"][0][0].id == expected[0].id
    assert persistence.published[0]["count"] == 2
    assert persistence.published[0]["extraction_method"] == "pypdf+ocr"
    assert persistence.published[0]["page_count"] == 3
    assert persistence.published[0]["ocr_page_count"] == 1


async def test_worker_discards_vectors_when_publication_loses_to_revocation():
    persistence = FakePersistence(_claim(), publish_outcome="revoked")
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"alpha"), FakeParser(), vectors, persistence)

    await worker.process(uuid4())

    assert len(vectors.upserts) == 1
    assert vectors.deletes == [
        (persistence.claim.collection_name, persistence.claim.revision_id)
    ]
    assert persistence.failures == []


async def test_worker_stops_before_vectors_when_revision_was_revoked():
    persistence = FakePersistence(_claim(), started=False)
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"alpha"), FakeParser(), vectors, persistence)

    await worker.process(uuid4())

    assert vectors.upserts == []
    assert persistence.published == []
    assert persistence.failures == []


async def test_worker_cleans_up_and_records_parser_failure():
    class BrokenParser:
        def parse(self, data, *, file_name, file_type):
            raise ValueError("unsupported layout")

    persistence = FakePersistence(_claim())
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"alpha"), BrokenParser(), vectors, persistence)

    await worker.process(uuid4())

    assert persistence.failures == ["unsupported layout"]
    assert vectors.deletes == [
        (persistence.claim.collection_name, persistence.claim.revision_id)
    ]


async def test_worker_skips_jobs_it_cannot_claim():
    persistence = FakePersistence(_claim(outcome="busy"))
    vectors = FakeVectors()
    worker = _worker(FakeSourceStore(b"alpha"), FakeParser(), vectors, persistence)

    await worker.process(uuid4())

    assert persistence.claims == 1
    assert vectors.upserts == []
    assert persistence.failures == []


async def test_recovery_processes_each_recoverable_job():
    claim = _claim()
    persistence = FakePersistence(claim, recoverable=[uuid4(), uuid4()])
    vectors = FakeVectors()
    worker = _worker(
        FakeSourceStore(b"alpha"), FakeParser(), vectors, persistence
    )

    processed = await worker.recover()

    assert processed == 2
    assert len(vectors.upserts) == 2
