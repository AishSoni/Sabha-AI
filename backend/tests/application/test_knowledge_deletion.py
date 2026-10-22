"""Deletion revokes first and retries physical cleanup independently."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from app.modules.knowledge.application.deletion import (
    CleanupWorker,
    DeleteDocument,
    DeleteParentKnowledge,
)
from app.modules.knowledge.application.ports import (
    ParentRevocationResult,
    RevocationResult,
)
from app.modules.knowledge.domain.errors import DocumentNotFound
from app.modules.knowledge.domain.models import CleanupIntent


class FakeSourceStore:
    def __init__(self, failing: bool = False) -> None:
        self.deleted: list[str] = []
        self.failing = failing

    def delete(self, key: str) -> None:
        if self.failing:
            raise OSError("storage unavailable")
        self.deleted.append(key)


class FakeVectors:
    def __init__(self) -> None:
        self.deleted_revisions: list[tuple[str, UUID]] = []
        self.deleted_collections: list[str] = []

    async def delete_revision(self, collection: str, revision_id: UUID) -> int:
        self.deleted_revisions.append((collection, revision_id))
        return 1

    async def delete_collection(self, collection: str) -> bool:
        self.deleted_collections.append(collection)
        return True


class FakePersistence:
    def __init__(self, intents: list[CleanupIntent]) -> None:
        self.intents = intents
        self.resolved: list[UUID] = []
        self.failures: list[tuple[UUID, str]] = []
        self.redacted_revisions: list[UUID] = []
        self.artifact_redactions: list[UUID] = []
        self.events: list[str] = []

    def revoke_document(self, document_id, *, reason):
        self.events.append("revoke")
        return RevocationResult(document_id=document_id, revisions=1)

    def revoke_parent(self, parent_kind, parent_id, *, reason):
        self.events.append("revoke_parent")
        return ParentRevocationResult(
            parent_kind=parent_kind,
            parent_id=parent_id,
            documents=2,
            collection_name="meeting_m_shared",
        )

    def list_cleanup_intents(self, *, limit=50):
        self.events.append("list")
        return list(self.intents)

    def resolve_cleanup(self, intent_id):
        self.resolved.append(intent_id)
        return True

    def note_cleanup_failure(self, intent_id, error):
        self.failures.append((intent_id, error))
        return True

    def redact_evidence(self, revision_id, *, reason):
        self.redacted_revisions.append(revision_id)
        return 2

    def redact_message_artifacts(self, revision_id, *, reason):
        self.artifact_redactions.append(revision_id)
        return 1


def _intent(kind: str, **overrides) -> CleanupIntent:
    revision_id = overrides.pop("revision_id", uuid4())
    values = {
        "intent_id": uuid4(),
        "kind": kind,
        "target_id": revision_id,
        "document_id": uuid4(),
        "revision_id": revision_id,
        "collection_name": "meeting_m_shared",
        "source_key": "sources/meeting/m/doc/rev/file.txt",
        "reason": "user_requested",
        "attempts": 0,
    }
    values.update(overrides)
    return CleanupIntent(**values)


async def test_delete_revokes_before_listing_cleanup():
    persistence = FakePersistence([])
    worker = CleanupWorker(
        persistence=persistence,
        source_store=FakeSourceStore(),
        vectors=FakeVectors(),
    )
    delete = DeleteDocument(persistence=persistence, cleanup=worker)

    result = await delete.execute(uuid4())

    assert result.revisions == 1
    assert persistence.events == ["revoke", "list"]


async def test_cleanup_resolves_every_intent_kind():
    intents = [
        _intent("source_object"),
        _intent("vector_revision"),
        _intent("vector_collection", collection_name="meeting_m_shared"),
        _intent("evidence_redaction"),
    ]
    persistence = FakePersistence(intents)
    source = FakeSourceStore()
    vectors = FakeVectors()
    worker = CleanupWorker(
        persistence=persistence, source_store=source, vectors=vectors
    )

    report = await worker.run()

    assert report.attempted == 4
    assert report.resolved == 4
    assert report.failed == 0
    assert len(source.deleted) == 1
    assert len(vectors.deleted_revisions) == 1
    assert vectors.deleted_collections == ["meeting_m_shared"]
    assert persistence.redacted_revisions == [intents[3].revision_id]
    assert persistence.artifact_redactions == [intents[3].revision_id]
    assert set(persistence.resolved) == {item.intent_id for item in intents}
    assert persistence.failures == []


async def test_source_failure_stays_visible_and_retry_resolves_it():
    failed_intent = _intent("source_object")
    persistence = FakePersistence([failed_intent])
    source = FakeSourceStore(failing=True)
    worker = CleanupWorker(
        persistence=persistence, source_store=source, vectors=FakeVectors()
    )

    first = await worker.run()

    assert first.resolved == 0
    assert first.failed == 1
    assert persistence.resolved == []
    assert persistence.failures[0][0] == failed_intent.intent_id
    assert "OSError" in persistence.failures[0][1]

    source.failing = False
    second = await worker.run()

    assert second.resolved == 1
    assert persistence.resolved == [failed_intent.intent_id]
    assert source.deleted == [failed_intent.source_key]


async def test_missing_document_fails_without_running_cleanup():
    class MissingPersistence(FakePersistence):
        def revoke_document(self, document_id, *, reason):
            raise DocumentNotFound("gone")

    persistence = MissingPersistence([_intent("source_object")])
    worker = CleanupWorker(
        persistence=persistence,
        source_store=FakeSourceStore(),
        vectors=FakeVectors(),
    )
    delete = DeleteDocument(persistence=persistence, cleanup=worker)

    with pytest.raises(DocumentNotFound):
        await delete.execute(uuid4())

    assert persistence.events == []


async def test_parent_deletion_revokes_before_cleanup():
    persistence = FakePersistence([])
    worker = CleanupWorker(
        persistence=persistence,
        source_store=FakeSourceStore(),
        vectors=FakeVectors(),
    )
    delete = DeleteParentKnowledge(persistence=persistence, cleanup=worker)
    parent_id = uuid4()

    result = await delete.execute("meeting", parent_id)

    assert result.documents == 2
    assert result.collection_name == "meeting_m_shared"
    assert persistence.events == ["revoke_parent", "list"]
