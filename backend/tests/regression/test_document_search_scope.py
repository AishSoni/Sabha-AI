"""Regression for the /api/documents/search scope handling.

Spec behavior:
- stack_ids=null or omitted -> treated as []
- missing meeting_id AND stack_ids -> 400 'A search scope is required'
- with a scope -> the Knowledge lifecycle receives that scope unchanged
"""

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

import main
from app.bootstrap import Container
from app.modules.knowledge.application.retrieval import RetrievedPassage

MEETING_ID = "00000000-0000-4000-8000-000000000001"
STACK_ID = "00000000-0000-4000-8000-000000000002"


class FakeLifecycle:
    def __init__(self):
        self.searches = []

    async def search(self, request):
        self.searches.append(request)
        return []


@pytest.fixture()
def search_env(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        main.app.state,
        "container",
        Container(prompt_catalog=object(), knowledge_lifecycle=lifecycle),
    )
    return TestClient(main.app), lifecycle


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
    client, lifecycle = search_env

    response = client.post(
        "/api/documents/search",
        json={"query": "roadmap", "meeting_id": MEETING_ID, "limit": 3},
    )
    assert response.status_code == 200, response.text
    assert response.json()["total_results"] == 0

    assert len(lifecycle.searches) == 1
    request = lifecycle.searches[0]
    assert request.query == "roadmap"
    assert request.limit == 3
    assert str(request.scope.meeting_id) == MEETING_ID
    assert request.scope.stack_ids == []


def test_search_with_stack_scope_passes_each_stack(search_env):
    client, lifecycle = search_env

    response = client.post(
        "/api/documents/search",
        json={"query": "pricing", "stack_ids": [STACK_ID]},
    )
    assert response.status_code == 200, response.text

    request = lifecycle.searches[0]
    assert request.scope.meeting_id is None
    assert [str(value) for value in request.scope.stack_ids] == [STACK_ID]


def test_search_returns_the_extracted_page_locator(search_env):
    client, lifecycle = search_env

    async def search(request):
        lifecycle.searches.append(request)
        return [
            RetrievedPassage(
                text="Final maturity: 18 July 2022",
                score=0.91,
                document_id=UUID("00000000-0000-4000-8000-000000000010"),
                revision_id=UUID("00000000-0000-4000-8000-000000000011"),
                chunk_id=UUID("00000000-0000-4000-8000-000000000012"),
                chunk_index=3,
                content_sha256="a" * 64,
                file_name="term-sheet.pdf",
                page_number=2,
            )
        ]

    lifecycle.search = search
    response = client.post(
        "/api/documents/search",
        json={"query": "maturity", "meeting_id": MEETING_ID},
    )

    assert response.status_code == 200, response.text
    assert response.json()["results"][0]["page_number"] == 2
    assert response.json()["results"][0]["file_name"] == "term-sheet.pdf"
