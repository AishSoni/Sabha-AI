"""Authorized scope policy: shared + assigned private only, tombstone-aware.

Correct behavior per CONTRACTS section 7 and Phase 06 P06-T01:
- Search input is query + meeting/participant context, never an arbitrary
  collection name.
- Snapshot assignments intersected with current grants and tombstones.
- Foreign-owner IDs and arbitrary collection names rejected before vectors.
"""

import pytest

pytestmark = pytest.mark.anyio


async def test_scope_resolves_shared_and_assigned_private_only():
    from app.modules.knowledge import policy as policy_mod

    store = policy_mod.InMemoryKnowledgePolicyStore()
    store.add_document("doc-shared", owner={"meeting_id": "m-1"}, state="indexed")
    store.add_document("doc-private-a", owner={"stack_id": "s-a"}, state="indexed")
    store.add_document("doc-private-b", owner={"stack_id": "s-b"}, state="indexed")
    store.grant_stack("persona-a", "s-a")

    scope = await policy_mod.resolve_scope(
        store,
        meeting_id="m-1",
        persona_id="persona-a",
        snapshot_stacks=["s-a", "s-b"],
    )
    assert "doc-shared" in scope.document_ids
    assert "doc-private-a" in scope.document_ids
    assert "doc-private-b" not in scope.document_ids


async def test_tombstone_and_revoked_grant_excluded_immediately():
    from app.modules.knowledge import policy as policy_mod

    store = policy_mod.InMemoryKnowledgePolicyStore()
    store.add_document("doc-1", owner={"meeting_id": "m-1"}, state="indexed")
    store.add_document("doc-2", owner={"stack_id": "s-a"}, state="indexed")
    store.grant_stack("persona-a", "s-a")
    # Revoke + tombstone between job creation and execution.
    store.revoke_stack("persona-a", "s-a")
    store.tombstone("doc-1")

    scope = await policy_mod.resolve_scope(
        store, meeting_id="m-1", persona_id="persona-a", snapshot_stacks=["s-a"]
    )
    assert scope.document_ids == []


async def test_arbitrary_collection_rejected_before_vector_call():
    from app.modules.knowledge import policy as policy_mod

    store = policy_mod.InMemoryKnowledgePolicyStore()
    with pytest.raises(policy_mod.UnauthorizedScope):
        await policy_mod.resolve_collections(
            store,
            meeting_id="m-1",
            persona_id="persona-a",
            requested_collections=["meeting_m-1_shared", "evil_collection"],
        )
