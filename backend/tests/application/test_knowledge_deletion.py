"""Deletion tombstone: immediate denial with pending cleanup (B-10 red).

Correct behavior: recording a tombstone + durable cleanup intent must
exclude content from new retrieval immediately, even when physical vector
cleanup is unavailable. Retry must be idempotent and survive parent
deletion without losing cleanup identifiers.
"""

import pytest

pytestmark = pytest.mark.anyio


async def test_delete_excludes_immediately_with_cleanup_pending():
    from app.modules.knowledge import lifecycle as lifecycle_mod

    store = lifecycle_mod.InMemoryLifecycleStore()
    await store.register_indexed("doc-1", collection="meeting_m-1_shared", points=["doc-1:0"])

    class _FailingVectors:
        async def delete_points(self, collection, point_ids):
            raise RuntimeError("vector backend down")

    outcome = await lifecycle_mod.delete_document(
        store, vectors=_FailingVectors(), document_id="doc-1"
    )
    assert outcome.state == "deleting"
    assert outcome.cleanup_pending is True
    # New retrieval must exclude immediately, before physical cleanup.
    assert await store.is_searchable("doc-1") is False


async def test_retry_cleanup_is_idempotent_and_survives_parent_cascade():
    from app.modules.knowledge import lifecycle as lifecycle_mod

    store = lifecycle_mod.InMemoryLifecycleStore()
    await store.register_indexed("doc-9", collection="stack_s-9_knowledge", points=["doc-9:0"])
    outcome = await lifecycle_mod.delete_document(
        store, vectors=None, document_id="doc-9"
    )
    # Parent cascade must not erase the captured cleanup identifiers.
    await store.cascade_delete_parent("stack-9")
    assert store.cleanup_job_for("doc-9") is not None
    assert store.cleanup_job_for("doc-9").collection == "stack_s-9_knowledge"

    class _Vectors:
        def __init__(self):
            self.calls = 0

        async def delete_points(self, collection, point_ids):
            self.calls += 1

    vectors = _Vectors()
    await lifecycle_mod.run_cleanup(store, vectors=vectors, document_id="doc-9")
    await lifecycle_mod.run_cleanup(store, vectors=vectors, document_id="doc-9")
    assert vectors.calls == 1  # idempotent: second retry is a no-op success
    assert store.cleanup_job_for("doc-9").done is True
