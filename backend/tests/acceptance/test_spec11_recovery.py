"""Spec 11: worker interruption and cleanup failure stay recoverable.

Recovery must not spend money. A crashed worker is recovered purely from
durable queue state, and a failed physical cleanup is retried without another
inference call. Both paths are rehearsed here against a disposable database
with a scripted provider, so the assertions can count calls exactly.
"""

from __future__ import annotations

import asyncio
import hashlib
from uuid import UUID

import pytest

import app.modules.meetings.infrastructure.supabase_meetings as meetings_infra
from app.capabilities.inference.contracts import LLMResponse
from app.capabilities.runtime.runner import TurnRunner
from app.modules.knowledge.application.deletion import CleanupWorker
from app.modules.knowledge.application.ports import StoredSource
from app.modules.knowledge.infrastructure.supabase import SupabaseKnowledgeRepository
from app.modules.meetings.infrastructure.supabase_meetings import (
    build_default_meeting_service,
)
from app.modules.meetings.infrastructure.turns import TurnQueueService
from tests.doubles.durable_queue import DurableQueueWorld
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "f4000000-0000-4000-8000-000000000001"
DOCUMENT_ID = "f4100000-0000-4000-8000-000000000001"
REVISION_ID = "f4200000-0000-4000-8000-000000000001"
EVIDENCE_ID = "f4300000-0000-4000-8000-000000000001"
SOURCE_KEY = (
    f"sources/meeting/{MEETING_ID}/{DOCUMENT_ID}/{REVISION_ID}/memo.txt"
)
SOURCE_BYTES = b"recovery rehearsal memo"
RAW_PASSAGE = "the memo passage that must be redacted"
COLLECTION = f"meeting_{MEETING_ID}_shared"


def _execute(db, sql: str, params: tuple = ()) -> None:
    with db.connect() as conn:
        conn.execute(sql, params)


def _expire_lease(db, operation_id: str) -> None:
    _execute(
        db,
        "UPDATE operations SET lease_expires_at = now() - interval '1 minute' "
        "WHERE id = %s",
        (operation_id,),
    )


def _use_local_provider(db, participant_id: str) -> None:
    """Configure Ollama (no key) while the factory still returns the script."""
    _execute(
        db,
        "UPDATE ai_participants SET provider_config = %s::jsonb WHERE id = %s",
        ('{"provider": "ollama", "model": "llama3.1"}', participant_id),
    )


def _provider() -> ScriptedProvider:
    return ScriptedProvider(
        responses=[
            LLMResponse(content="Recovered answer.", usage={"total_tokens": 3}),
            LLMResponse(content="Second answer.", usage={"total_tokens": 3}),
        ]
    )


@pytest.fixture()
def queue_service(disposable_db, monkeypatch):
    """A real TurnQueueService whose database and provider are controlled."""

    monkeypatch.setattr(
        meetings_infra, "get_supabase", lambda: stub_for(disposable_db)
    )
    provider = _provider()
    service = TurnQueueService(
        build_default_meeting_service(),
        provider_factory=lambda **kwargs: provider,
        max_queued=10,
    )
    return service, DurableQueueWorld(disposable_db), provider


async def test_crashed_worker_requeues_without_any_provider_call(queue_service):
    service, world, provider = queue_service
    meeting_id, participant_id = world.seed_active_meeting()
    _use_local_provider(world.db, participant_id)
    operation = world.submit(meeting_id, participant_id, key="crash-before")[
        "operation"
    ]
    claim = await service.claim("crashed-worker")
    assert claim is not None
    assert claim.operation_id == operation["id"]

    # The worker dies after claiming but before any provider call: no start
    # marker, no attempt. Only the lease lapses.
    _expire_lease(world.db, operation["id"])
    recovered = await service.recover()

    assert recovered["requeued"] == 1
    assert recovered["interrupted"] == 0
    assert provider.call_count == 0, "recovery must never spend a provider call"
    assert world.status(operation["id"]) == "queued"
    assert world.operation(operation["id"])["attempt_count"] == 0

    events = world.db.query(
        "SELECT type, payload FROM operation_events WHERE operation_id = %s "
        "ORDER BY sequence",
        (operation["id"],),
    )
    assert any(
        event_type == "status" and payload.get("reason") == "recovered_before_provider"
        for event_type, payload in events
    )

    resumed = await service.claim("healthy-worker")
    assert resumed is not None
    assert resumed.operation_id == operation["id"]
    assert resumed.fence > claim.fence

    result = await service.execute_claim(resumed)

    assert result.status == "completed"
    assert provider.call_count == 1
    message = world.db.query(
        "SELECT content FROM messages WHERE meeting_id = %s AND sender_type = 'ai'",
        (meeting_id,),
    )
    assert message == [("Recovered answer.",)]


async def test_crashed_worker_after_provider_start_is_interrupted_and_retryable(
    queue_service,
):
    service, world, provider = queue_service
    meeting_id, participant_id = world.seed_active_meeting()
    _use_local_provider(world.db, participant_id)
    operation = world.submit(meeting_id, participant_id, key="crash-during")[
        "operation"
    ]
    claim = await service.claim("crashed-worker")
    assert claim is not None

    # The worker reached the provider, and its outcome is unknown. Recovery
    # must not guess: it marks the operation interrupted and the attempt
    # unknown instead of replaying it.
    _execute(
        world.db,
        "UPDATE operations SET execution_started_at = now() WHERE id = %s",
        (operation["id"],),
    )
    attempt_id = "f4400000-0000-4000-8000-000000000001"
    _execute(
        world.db,
        """
        INSERT INTO operation_attempts (
            id, operation_id, attempt_number, status, provider, model,
            claimant, fence_version
        ) VALUES (%s, %s, 1, 'started', 'ollama', 'llama3.1', %s, %s)
        """,
        (attempt_id, operation["id"], "crashed-worker", claim.fence),
    )
    _expire_lease(world.db, operation["id"])

    recovered = await service.recover()

    assert recovered["interrupted"] == 1
    assert provider.call_count == 0, "recovery must never replay a paid call"
    assert world.status(operation["id"]) == "interrupted"
    persisted = world.operation(operation["id"])
    assert persisted["error_code"] == "unknown_outcome"
    attempt_status = world.db.query(
        "SELECT status FROM operation_attempts WHERE id = %s", (attempt_id,)
    )
    assert attempt_status == [("unknown",)]
    assert world.db.query(
        "SELECT count(*) FROM operation_attempts WHERE operation_id = %s",
        (operation["id"],),
    ) == [(1,)]
    assert await service.claim("healthy-worker") is None

    # An explicit retry is a new operation; the abandoned one is never re-run.
    retry = world.submit(meeting_id, participant_id, key="retry-after-unknown")[
        "operation"
    ]
    retry_claim = await service.claim("healthy-worker")
    assert retry_claim is not None
    assert retry_claim.operation_id == retry["id"]

    result = await service.execute_claim(retry_claim)

    assert result.status == "completed"
    assert provider.call_count == 1
    assert world.status(operation["id"]) == "interrupted"


async def test_runner_startup_recovers_a_stale_claim_before_work(
    queue_service,
):
    service, world, provider = queue_service
    meeting_id, participant_id = world.seed_active_meeting()
    _use_local_provider(world.db, participant_id)
    stale = world.submit(meeting_id, participant_id, key="stale")["operation"]
    claim = await service.claim("dead-worker")
    assert claim is not None
    _expire_lease(world.db, stale["id"])

    queued = world.submit(meeting_id, participant_id, key="queued")["operation"]

    runner = TurnRunner(
        service,
        concurrency=1,
        poll_seconds=0.01,
        execution_timeout_seconds=30,
        worker_id="spec11-runner",
    )
    await runner.start()
    try:
        for _ in range(5):
            started = await runner.run_once()
            await runner.wait_idle()
            if not started:
                break
    finally:
        await runner.stop(grace_seconds=1.0)

    # Startup recovery handled the stale claim without a provider call; each
    # queued operation then ran exactly once.
    assert provider.call_count == 2
    assert world.status(stale["id"]) == "completed"
    assert world.status(queued["id"]) == "completed"


class _RecordingVectors:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.deleted: list[tuple[str, str]] = []

    async def ensure_collection(self, name):
        return True

    async def upsert_revision(self, collection, *, document_id, revision_id, file_name, chunks):
        return len(chunks)

    async def delete_revision(self, collection, revision_id):
        if self.fail:
            raise RuntimeError("vector store unavailable")
        self.deleted.append((collection, str(revision_id)))
        return 1

    async def delete_collection(self, collection):
        return True


class _MemorySourceStore:
    def __init__(self, objects: dict[str, bytes], *, fail: bool = False) -> None:
        self.objects = objects
        self.fail = fail
        self.deleted: list[str] = []

    def ensure_ready(self) -> None:
        return None

    def put(self, key, stream, *, content_type, max_bytes):
        payload = stream.read(max_bytes + 1)
        self.objects[key] = payload
        return StoredSource(
            key=key, size=len(payload), sha256=hashlib.sha256(payload).hexdigest()
        )

    def move(self, source_key, destination_key):
        self.objects[destination_key] = self.objects.pop(source_key)

    def download(self, key, *, max_bytes):
        return self.objects[key]

    def exists(self, key):
        return key in self.objects

    def delete(self, key):
        if self.fail:
            raise RuntimeError("source store unavailable")
        self.deleted.append(key)
        self.objects.pop(key, None)

    def list_prefix(self, prefix, *, limit=100, recursive=False):
        return [
            StoredSource(key=key, size=len(value))
            for key, value in self.objects.items()
            if key.startswith(prefix)
        ][:limit]


def _seed_revocable_document(db) -> None:
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO meetings (id, name, agenda, status)
            VALUES (%s, 'Recovery meeting', 'Recover', 'active')
            """,
            (MEETING_ID,),
        )
        conn.execute(
            """
            INSERT INTO documents (
                id, meeting_id, file_name, file_type, file_size_bytes,
                status, chunk_count
            ) VALUES (%s, %s, 'memo.txt', 'text/plain', %s, 'ready', 1)
            """,
            (DOCUMENT_ID, MEETING_ID, len(SOURCE_BYTES)),
        )
        conn.execute(
            """
            INSERT INTO document_revisions (
                id, document_id, revision_number, status, source_key,
                source_sha256, source_size_bytes, file_type,
                qdrant_collection, chunk_count, published_at
            ) VALUES (%s, %s, 1, 'ready', %s, %s, %s, 'text/plain', %s, 1, NOW())
            """,
            (
                REVISION_ID,
                DOCUMENT_ID,
                SOURCE_KEY,
                hashlib.sha256(SOURCE_BYTES).hexdigest(),
                len(SOURCE_BYTES),
                COLLECTION,
            ),
        )
        conn.execute(
            """
            INSERT INTO retrieved_passage_evidence (
                id, meeting_id, document_id, revision_id, source_name,
                raw_passage, score
            ) VALUES (%s, %s, %s, %s, 'memo.txt', %s, 0.9)
            """,
            (EVIDENCE_ID, MEETING_ID, DOCUMENT_ID, REVISION_ID, RAW_PASSAGE),
        )
        conn.execute(
            "SELECT public.knowledge_revoke_document(%s, 'spec11 recovery')",
            (DOCUMENT_ID,),
        )


def _cleanup_worker(db, store, vectors) -> CleanupWorker:
    return CleanupWorker(
        persistence=SupabaseKnowledgeRepository(lambda: stub_for(db)),
        source_store=store,
        vectors=vectors,
    )


async def test_cleanup_failure_stays_visible_and_retryable(disposable_db):
    _seed_revocable_document(disposable_db)
    objects = {SOURCE_KEY: SOURCE_BYTES}
    failing_source = _MemorySourceStore(objects, fail=True)
    failing_vectors = _RecordingVectors(fail=True)

    # Eligibility closes at revocation, before any physical removal.
    assert disposable_db.query(
        "SELECT status FROM documents WHERE id = %s", (DOCUMENT_ID,)
    ) == [("revoked",)]
    assert disposable_db.query(
        "SELECT status FROM document_revisions WHERE id = %s", (REVISION_ID,)
    ) == [("revoked",)]

    failed_report = await _cleanup_worker(
        disposable_db, failing_source, failing_vectors
    ).run(limit=50)

    assert failed_report.attempted == 3
    assert failed_report.resolved == 1
    assert failed_report.failed == 2
    assert objects == {SOURCE_KEY: SOURCE_BYTES}
    unresolved = disposable_db.query(
        """
        SELECT target_kind, attempts, last_error
        FROM knowledge_cleanup
        WHERE resolved_at IS NULL
        ORDER BY target_kind
        """
    )
    assert [row[0] for row in unresolved] == ["source_object", "vector_revision"]
    assert all(row[1] == 1 for row in unresolved)
    assert all(row[2] for row in unresolved)
    # Evidence redaction does not depend on storage, so the retained passage is
    # already gone even though the physical removals are still pending.
    assert disposable_db.query(
        "SELECT raw_passage, redacted_at FROM retrieved_passage_evidence WHERE id = %s",
        (EVIDENCE_ID,),
    )[0][0] is None

    healthy_source = _MemorySourceStore(objects)
    healthy_vectors = _RecordingVectors()
    retried = await _cleanup_worker(
        disposable_db, healthy_source, healthy_vectors
    ).run(limit=50)

    assert retried.resolved == 2
    assert retried.failed == 0
    assert objects == {}
    assert healthy_source.deleted == [SOURCE_KEY]
    assert healthy_vectors.deleted == [(COLLECTION, REVISION_ID)]
    assert disposable_db.query(
        "SELECT count(*) FROM knowledge_cleanup WHERE resolved_at IS NULL"
    ) == [(0,)]
    # Cleanup is physical removal only: no inference event was ever recorded.
    assert disposable_db.query("SELECT count(*) FROM inference_events") == [(0,)]
