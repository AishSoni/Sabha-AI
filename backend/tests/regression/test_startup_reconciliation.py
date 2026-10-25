"""Regression (spec-02, ingestion_recovery): restart reconciliation recovers
honestly from interrupted document lifecycles.

Policies (documented in app/modules/knowledge/infrastructure/reconciliation.py):
- files whose ingestion was interrupted by a restart are marked failed with an
  actionable re-upload message (no byte retention across restarts, by design);
- deferred vector-collection cleanups are retried through the pending ledger;
- a broken vector store or database never breaks startup (retry next boot);
- the app lifespan runs the pass on startup.
"""

from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
import psycopg
from fastapi.testclient import TestClient

from app.modules.knowledge.infrastructure import (
    reconciliation as recovery_module,
)
from app.modules.knowledge.infrastructure import vector_cleanup as vector_cleanup_module
from app.modules.knowledge.infrastructure.vector_cleanup import VectorCleanupLedger
from main import app
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
ORPHAN_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000001"
INDEXED_DOC = "eeeeeeee-eeee-4eee-8eee-eeee00000002"
ALREADY_FAILED = "eeeeeeee-eeee-4eee-8eee-eeee00000003"
MEETING_COLLECTION = f"meeting_{MEETING_ID}_shared"


class FlakyVectorStore:
    """Vector store double with scriptable delete_collection failures."""

    def __init__(self):
        self.deleted: list[str] = []
        self._fail_with: Exception | None = None

    def fail_deletes_with(self, failure: Exception) -> None:
        self._fail_with = failure

    async def delete_collection(self, collection_name: str) -> bool:
        if self._fail_with is not None:
            raise self._fail_with
        self.deleted.append(collection_name)
        return True

    async def delete_document(self, collection_name, document_id) -> bool:
        return True

    async def collection_exists(self, collection_name) -> bool:
        return True


@pytest.fixture()
def restart_env(monkeypatch, disposable_db):
    stub = stub_for(disposable_db)
    monkeypatch.setattr(recovery_module, "get_supabase", lambda: stub)
    monkeypatch.setattr(vector_cleanup_module, "get_supabase", lambda: stub)
    store = FlakyVectorStore()
    fresh_ledger = VectorCleanupLedger()
    previous_ledger = vector_cleanup_module._keeper
    vector_cleanup_module._keeper = fresh_ledger
    try:
        yield SimpleNamespace(db=disposable_db, stub=stub, ledger=fresh_ledger, store=store)
    finally:
        vector_cleanup_module._keeper = previous_ledger


def seed_meeting_and_docs(env, doc_specs):
    env.stub.table("meetings").insert(
        {
            "id": MEETING_ID,
            "name": "Restart probe",
            "agenda": "",
            "status": "active",
            "total_cost": 0.0,
            "created_at": "2026-01-01T00:00:00Z",
        }
    ).execute()
    for doc_id, status, error in doc_specs:
        env.stub.table("documents").insert(
            {
                "id": doc_id,
                "meeting_id": MEETING_ID,
                "file_name": f"{doc_id[:8]}.pdf",
                "file_type": "pdf",
                "file_size_bytes": 10,
                "chunk_count": 0,
                "status": status,
                "error_message": error,
            }
        ).execute()


def document_rows(db) -> list[dict]:
    rows = db.query("SELECT id, status, error_message FROM documents")
    return [{"id": str(r[0]), "status": r[1], "error_message": r[2]} for r in rows]


def pending_rows(db) -> list[dict]:
    rows = db.query(
        "SELECT collection_name, target_kind, attempts, last_error FROM pending_vector_cleanup "
        "WHERE resolved_at IS NULL"
    )
    return [
        {
            "collection_name": r[0],
            "target_kind": r[1],
            "attempts": r[2],
            "last_error": r[3],
        }
        for r in rows
    ]


async def test_orphaned_processing_documents_marked_failed_with_reupload_message(restart_env):
    env = restart_env
    seed_meeting_and_docs(
        env,
        [
            (ORPHAN_DOC, "processing", None),
            (INDEXED_DOC, "indexed", None),
            (ALREADY_FAILED, "failed", "qdrant rejected the file"),
        ],
    )

    summary = await recovery_module.reconcile_startup_state(vector_store=env.store)

    assert summary["documents_failed"] == 1
    rows = {row["id"]: row for row in document_rows(env.db)}
    assert rows[ORPHAN_DOC]["status"] == "failed"
    assert "re-upload" in rows[ORPHAN_DOC]["error_message"]
    assert rows[ORPHAN_DOC]["error_message"].endswith("please re-upload the file.")
    assert rows[INDEXED_DOC]["status"] == "indexed"
    assert rows[INDEXED_DOC]["error_message"] is None
    assert rows[ALREADY_FAILED]["status"] == "failed"
    assert rows[ALREADY_FAILED]["error_message"] == "qdrant rejected the file"


async def test_pending_vector_cleanup_resolved_at_startup(restart_env):
    env = restart_env
    seed_meeting_and_docs(env, [(ORPHAN_DOC, "processing", None)])
    pending_id = await vector_cleanup_module.record_pending_cleanup(
        collection_name=MEETING_COLLECTION, target_kind="meeting", target_id=MEETING_ID
    )

    env.store.fail_deletes_with(ConnectionError("qdrant unreachable"))
    first = await recovery_module.reconcile_startup_state(vector_store=env.store)
    assert first["cleanups_attempted"] == 1
    assert first["cleanups_resolved"] == 0
    remaining = pending_rows(env.db)
    assert len(remaining) == 1
    assert remaining[0]["attempts"] == 1
    assert "qdrant unreachable" in remaining[0]["last_error"]

    env.store.fail_deletes_with(None)
    second = await recovery_module.reconcile_startup_state(vector_store=env.store)
    assert second["cleanups_resolved"] == 1
    assert env.store.deleted == [MEETING_COLLECTION]
    assert pending_rows(env.db) == []
    # wait — the pending id is resolved, that's it
    resolved = env.db.query("SELECT COUNT(*) FROM pending_vector_cleanup WHERE resolved_at IS NOT NULL")
    assert resolved[0][0] == 1


async def test_startup_pass_survives_vector_store_failure(restart_env):
    env = restart_env
    seed_meeting_and_docs(env, [(ORPHAN_DOC, "processing", None)])
    await vector_cleanup_module.record_pending_cleanup(
        collection_name=MEETING_COLLECTION, target_kind="meeting", target_id=MEETING_ID
    )
    env.store.fail_deletes_with(ConnectionError("qdrant still offline"))

    summary = await recovery_module.reconcile_startup_state(vector_store=env.store)

    assert summary["documents_failed"] == 1, "document reconciliation is independent of the vector store"
    assert summary["cleanups_attempted"] == 1
    assert summary["cleanups_resolved"] == 0
    remaining = pending_rows(env.db)
    assert len(remaining) == 1
    assert "qdrant still offline" in remaining[0]["last_error"]


async def test_second_pass_is_a_no_op(restart_env):
    env = restart_env
    seed_meeting_and_docs(env, [(ORPHAN_DOC, "processing", None)])
    await vector_cleanup_module.record_pending_cleanup(
        collection_name=MEETING_COLLECTION, target_kind="meeting", target_id=MEETING_ID
    )
    env.store.fail_deletes_with(None)
    await recovery_module.reconcile_startup_state(vector_store=env.store)

    second = await recovery_module.reconcile_startup_state(vector_store=env.store)

    assert second["documents_failed"] == 0
    assert second["cleanups_attempted"] == 0
    assert pending_rows(env.db) == []


def test_app_lifespan_runs_reconciliation(monkeypatch, disposable_db):
    env_stub = stub_for(disposable_db)
    monkeypatch.setattr(recovery_module, "get_supabase", lambda: env_stub)
    calls: list[dict] = []

    async def spy(vector_store=None, ledger=None):
        calls.append({"vector_store": vector_store})
        return {"documents_failed": 0, "cleanups_attempted": 0, "cleanups_resolved": 0}

    monkeypatch.setattr(
        "app.modules.knowledge.public.reconcile_startup_state", spy
    )

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert len(calls) == 1, "startup reconciliation runs exactly once per boot"
