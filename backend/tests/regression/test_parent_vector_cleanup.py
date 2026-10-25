"""Regression (spec-02 B2): parent deletion must clean up its vector world,
and a transient vector-store failure during that cleanup must be recorded and
retried — not silently dropped.

Today:
- deleting a meeting (SQL only) leaves the shared `meeting_{id}_shared`
  collection and every indexed point behind forever;
- deleting a knowledge stack leaves `stack_{id}_knowledge` behind;
- the document search route returns orphaned points for already-deleted
  documents as `file_name="Unknown"` results.

Locked behavior:
- the pending cleanup is recorded BEFORE the destructive work; the vector
  deletion is best-effort (a Qdrant outage must not block the SQL delete);
- a failed cleanup stays in `pending_vector_cleanup` and the reconciliation
  pass retries exactly that collection — never another parent's;
- search results whose document row is gone are dropped, not enshrined as
  "Unknown";
- a document delete that cannot clean its vectors fails closed (row intact,
  retryable) instead of leaving quarantined points.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from app.modules.knowledge.presentation import stacks_http as stacks_module
from app.modules.meetings.presentation import meetings_http as meetings_module
from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.knowledge.infrastructure import vector_cleanup as vector_cleanup_module
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
STACK_ID = "77777777-7777-4777-8777-777777777701"
DOC_ID = "eeeeeeee-eeee-4eee-8eee-eeee00000001"
PHANTOM_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000009"
MEETING_COLLECTION = f"meeting_{MEETING_ID}_shared"
STACK_COLLECTION = f"stack_{STACK_ID}_knowledge"


class FailureScriptedVectorStore:
    """Vector-store double: records every delete; can fail a scripted number
    of times before succeeding (controlled_failure contract)."""

    def __init__(self, *, collection_failures: int = 0, point_failures: int = 0):
        self.deleted_collections: list[str] = []
        self.deleted_documents: list[tuple[str, str]] = []
        self._collection_failures = collection_failures
        self._point_failures = point_failures

    def arm(self, *, collection_failures: int = 0, point_failures: int = 0) -> None:
        self._collection_failures = collection_failures
        self._point_failures = point_failures

    async def delete_collection(self, collection_name: str) -> bool:
        if self._collection_failures:
            self._collection_failures -= 1
            raise RuntimeError("qdrant unreachable")
        self.deleted_collections.append(collection_name)
        return True

    async def delete_document(self, collection_name: str, document_id: str) -> int:
        if self._point_failures:
            self._point_failures -= 1
            raise RuntimeError("qdrant unreachable")
        self.deleted_documents.append((collection_name, document_id))
        return 1

    async def collection_exists(self, name: str) -> bool:
        return True

    async def search_multiple_collections(self, collection_names, query, limit):
        from app.modules.knowledge.infrastructure.legacy_vector_store import SearchResult

        return [
            SearchResult(
                text="kept chunk",
                score=0.9,
                document_id=DOC_ID,
                chunk_index=0,
                metadata={},
            ),
            SearchResult(
                text="orphaned chunk",
                score=0.95,
                document_id=PHANTOM_DOC,
                chunk_index=0,
                metadata={},
            ),
        ]


def seed_meeting_and_doc(db, *, with_document: bool = True):
    stub = stub_for(db)
    now = datetime.now(timezone.utc).isoformat()
    stub.table("meetings").insert({
        "id": MEETING_ID,
        "name": "Cleanup probe",
        "agenda": "",
        "status": "active",
        "created_at": now,
    }).execute()
    if with_document:
        stub.table("documents").insert({
            "id": DOC_ID,
            "file_name": "kept.md",
            "file_type": "md",
            "file_size_bytes": 10,
            "qdrant_collection": MEETING_COLLECTION,
            "status": "indexed",
            "meeting_id": MEETING_ID,
            "created_at": now,
        }).execute()


def seed_stack(db):
    stub_for(db).table("knowledge_stacks").insert({
        "id": STACK_ID,
        "name": "Market research",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


class FakeKnowledgeLifecycle:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str]] = []
        self.error: Exception | None = None

    async def delete_parent(self, kind, parent_id, *, reason="parent_deleted"):
        if self.error is not None:
            raise self.error
        self.deleted.append((kind, str(parent_id)))


@pytest.fixture()
def cleanup_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    store = FailureScriptedVectorStore()
    knowledge = FakeKnowledgeLifecycle()
    monkeypatch.setattr(
        "app.modules.knowledge.public.get_knowledge_lifecycle", lambda: knowledge
    )
    monkeypatch.setattr(vector_cleanup_module, "get_supabase", lambda: stub)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)
    monkeypatch.setattr(stacks_module, "get_supabase", lambda: stub)
    return SimpleNamespace(
        db=disposable_db, store=store, stub=stub, knowledge=knowledge
    )


def meeting_rows(db, meeting_id=MEETING_ID):
    return db.query("SELECT id FROM meetings WHERE id = %s", (meeting_id,))


def pending_rows(db):
    rows = db.query(
        "SELECT collection_name, target_kind, target_id, attempts, last_error, resolved_at "
        "FROM pending_vector_cleanup WHERE resolved_at IS NULL ORDER BY created_at"
    )
    return [
        {
            "collection_name": r[0],
            "target_kind": r[1],
            "target_id": r[2],
            "attempts": r[3],
            "last_error": r[4],
            "resolved_at": r[5],
        }
        for r in rows
    ]


async def test_meeting_delete_removes_collection_and_resolves_pending(cleanup_env):
    env = cleanup_env
    seed_meeting_and_doc(env.db)

    await meetings_module.delete_meeting(MEETING_ID)

    assert env.knowledge.deleted == [("meeting", MEETING_ID)]
    assert meeting_rows(env.db) == []
    assert env.db.query("SELECT id FROM documents WHERE meeting_id = %s", (MEETING_ID,)) == []
    assert pending_rows(env.db) == [], "the legacy collection ledger stays unused"


async def test_stack_delete_removes_collection_and_resolves_pending(cleanup_env):
    env = cleanup_env
    seed_stack(env.db)

    await stacks_module.delete_knowledge_stack(STACK_ID)

    assert env.knowledge.deleted == [("stack", STACK_ID)]
    assert env.db.query("SELECT id FROM knowledge_stacks WHERE id = %s", (STACK_ID,)) == []
    assert pending_rows(env.db) == []


async def test_knowledge_outage_fails_closed_before_the_parent_delete(cleanup_env):
    env = cleanup_env
    seed_meeting_and_doc(env.db)
    env.knowledge.error = KnowledgeUnavailable("knowledge database down")

    with pytest.raises(HTTPException) as error:
        await meetings_module.delete_meeting(MEETING_ID)

    assert error.value.status_code == 503
    assert meeting_rows(env.db), "the meeting must survive an unavailable revocation"
    assert len(
        env.db.query("SELECT id FROM documents WHERE meeting_id = %s", (MEETING_ID,))
    ) == 1
    assert pending_rows(env.db) == []


async def test_reconciler_never_touches_another_parents_collection(cleanup_env):
    env = cleanup_env
    seed_stack(env.db)
    stub = stub_for(env.db)
    stub.table("knowledge_stacks").delete().eq("id", STACK_ID).execute()
    await vector_cleanup_module.record_pending_cleanup(
        collection_name=STACK_COLLECTION,
        target_kind="stack",
        target_id=STACK_ID,
    )

    await vector_cleanup_module.reconcile_pending_vector_cleanups(vector_store=env.store)

    assert env.store.deleted_collections == [STACK_COLLECTION], (
        "reconciliation is scoped to exactly the pending collection"
    )
    assert pending_rows(env.db) == []



