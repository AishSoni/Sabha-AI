"""Regression for the /api/documents/search scope handling.

DocumentSearchRequest declares `stack_ids: Optional[List[str]] = None`,
so `getattr(request, 'stack_ids', [])` returns None (the attribute exists)
and iterating it crashes with TypeError on ANY search request that does not
send a stack list — including valid meeting-scoped searches.

Spec behavior:
- stack_ids=null or omitted -> treated as []
- missing meeting_id, persona_id AND stack_ids -> 400 'A search scope is required'
- with a scope -> search proceeds against the requested collections
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.api.documents as documents_module
import main
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture()
def search_env(monkeypatch, disposable_db):
    monkeypatch.setattr(
        "app.api.documents.get_supabase", lambda: stub_for(disposable_db), raising=True
    )
    return TestClient(main.app), monkeypatch


class StubVectorStore:
    """Records search_multiple_collections calls; returns no hits."""

    def __init__(self):
        self.calls = []

    async def search_multiple_collections(self, *, collection_names, query, limit):
        self.calls.append(
            {"collection_names": list(collection_names), "query": query, "limit": limit}
        )
        return []


def test_search_with_null_stack_ids_still_reported_when_no_scope(search_env):
    client, _ = search_env
    response = client.post("/api/documents/search", json={"query": "roadmap", "stack_ids": None})
    assert response.status_code == 400
    assert response.json()["detail"] == "A search scope is required"


def test_search_without_any_scope_is_rejected(search_env):
    client, _ = search_env
    response = client.post("/api/documents/search", json={"query": "roadmap"})
    assert response.status_code == 400
    assert response.json()["detail"] == "A search scope is required"


def test_search_with_meeting_scope_runs_and_passes_collections(search_env):
    client, monkeypatch = search_env
    stub = StubVectorStore()
    monkeypatch.setattr(documents_module, "get_vector_store", lambda: stub, raising=True)

    response = client.post(
        "/api/documents/search",
        json={"query": "roadmap", "meeting_id": MEETING_ID, "limit": 3},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total_results"] == 0

    assert len(stub.calls) == 1
    call = stub.calls[0]
    assert call["query"] == "roadmap"
    assert call["limit"] == 3
    # meeting_collection_name(value) is 'meeting_<id>_shared' (VectorStoreManager contract)
    assert call["collection_names"] == [f"meeting_{MEETING_ID}_shared"]
