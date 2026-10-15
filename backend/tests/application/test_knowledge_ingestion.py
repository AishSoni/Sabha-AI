"""Durable ingestion: enqueue persists a replayable job; worker is idempotent."""

import pytest

pytestmark = pytest.mark.anyio


class _Rows:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, db, name):
        self._db = db
        self._name = name
        self._op = None
        self._payload = None
        self._filters = []

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def select(self, *a, **k):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def single(self):
        return self

    def execute(self):
        return self._db._run(self._name, self._op, self._payload, self._filters)


class _DB:
    def __init__(self):
        self.docs = {}
        self.jobs = {}

    def table(self, name):
        return _Table(self, name)

    def _run(self, name, op, payload, filters):
        if name == "documents":
            if op == "insert":
                self.docs[payload["id"]] = dict(payload)
                return _Rows([dict(payload)])
            if op == "update":
                doc_id = dict(filters).get("id")
                if doc_id in self.docs:
                    self.docs[doc_id].update(payload)
                    return _Rows([dict(self.docs[doc_id])])
                # Production inserts the document row before enqueue; the
                # fake upserts to mirror that ordering contract.
                self.docs[doc_id] = {"id": doc_id, **payload}
                return _Rows([dict(self.docs[doc_id])])
            if op == "select":
                doc_id = dict(filters).get("id")
                if doc_id:
                    return _Rows([dict(self.docs[doc_id])] if doc_id in self.docs else [])
                return _Rows(list(self.docs.values()))
        if name == "document_ingestion_jobs":
            if op == "insert":
                self.jobs[payload["document_id"]] = dict(payload)
                return _Rows([dict(payload)])
            if op == "update":
                doc_id = dict(filters).get("document_id")
                if doc_id in self.jobs:
                    self.jobs[doc_id].update(payload)
                    return _Rows([dict(self.jobs[doc_id])])
                return _Rows([])
            if op == "select":
                doc_id = dict(filters).get("document_id")
                if doc_id:
                    return _Rows([dict(self.jobs[doc_id])] if doc_id in self.jobs else [])
                return _Rows(list(self.jobs.values()))
        return _Rows([])


class _Vectors:
    def __init__(self):
        self.indexed = []
        self.collections = set()

    async def ensure_collection(self, name, dimensions=1024):
        self.collections.add(name)

    async def index_document(self, collection_name, document_id, chunks):
        self.indexed.append((collection_name, document_id, list(chunks)))
        return len(chunks)


class _Processor:
    def __init__(self, chunks=None, error=None):
        self._chunks = chunks if chunks is not None else [{"text": "hello", "metadata": {}}]
        self._error = error
        self.calls = 0

    def process_file(self, file_content, file_name, file_type, additional_metadata=None):
        self.calls += 1
        if self._error:
            raise self._error
        return list(self._chunks)


async def test_enqueue_persists_replayable_job():
    from app.modules.knowledge import ingestion as ing

    db = _DB()
    job = await ing.enqueue_ingestion(
        db, document_id="d-1", collection="meeting_m_shared",
        file_name="a.pdf", file_type="pdf",
        storage_path="docs/d-1/a.pdf",
    )
    assert job["document_id"] == "d-1"
    assert job["state"] == "queued"
    assert db.docs["d-1"]["status"] == "processing"
    # Restart replay: same job row is returned, not duplicated.
    again = await ing.enqueue_ingestion(
        db, document_id="d-1", collection="meeting_m_shared",
        file_name="a.pdf", file_type="pdf",
        storage_path="docs/d-1/a.pdf",
    )
    assert again["document_id"] == "d-1"
    assert len(db.jobs) == 1


async def test_worker_success_marks_indexed_idempotently():
    from app.modules.knowledge import ingestion as ing

    db = _DB()
    await ing.enqueue_ingestion(
        db, document_id="d-1", collection="c1",
        file_name="a.pdf", file_type="pdf", storage_path="p",
    )
    vectors = _Vectors()
    outcome = await ing.process_ingestion_job(
        db, vectors, _Processor(), document_id="d-1",
        file_content=b"hello", file_name="a.pdf", file_type="pdf",
    )
    assert outcome["state"] == "indexed"
    assert db.docs["d-1"]["status"] == "indexed"
    # Replay after success is a no-op (idempotent retry).
    outcome2 = await ing.process_ingestion_job(
        db, vectors, _Processor(), document_id="d-1",
        file_content=b"hello", file_name="a.pdf", file_type="pdf",
    )
    assert outcome2["state"] == "indexed"
    assert len(vectors.indexed) == 1


async def test_worker_failure_marks_failed_retryable():
    from app.modules.knowledge import ingestion as ing

    db = _DB()
    await ing.enqueue_ingestion(
        db, document_id="d-9", collection="c1",
        file_name="a.pdf", file_type="pdf", storage_path="p",
    )
    outcome = await ing.process_ingestion_job(
        db, _Vectors(), _Processor(error=ValueError("empty")),
        document_id="d-9", file_content=b"", file_name="a.pdf", file_type="pdf",
    )
    assert outcome["state"] == "failed"
    assert outcome["retryable"] is True
    assert db.docs["d-9"]["status"] == "failed"


async def test_worker_does_not_resurrect_tombstoned_document():
    from app.modules.knowledge import ingestion as ing

    db = _DB()
    await ing.enqueue_ingestion(
        db, document_id="d-5", collection="c1",
        file_name="a.pdf", file_type="pdf", storage_path="p",
    )
    # Delete lands mid-processing: tombstone-first excludes immediately.
    db.docs["d-5"]["status"] = "deleting"
    vectors = _Vectors()
    outcome = await ing.process_ingestion_job(
        db, vectors, _Processor(), document_id="d-5",
        file_content=b"hello", file_name="a.pdf", file_type="pdf",
    )
    assert outcome["state"] == "deleting"
    assert db.docs["d-5"]["status"] == "deleting"
    assert vectors.indexed == []  # no resurrection into the vector index
