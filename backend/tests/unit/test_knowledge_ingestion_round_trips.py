"""Ingestion observation is one round trip (spec 20).

The upload receipt is one logical read: ingestion row plus its revision and
document. The repository must not reintroduce the per-row fanout.
"""

from __future__ import annotations

import uuid

import pytest

from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.knowledge.domain.models import IngestionState, RevisionState
from app.modules.knowledge.infrastructure.supabase import (
    SupabaseKnowledgeRepository,
)

INGESTION_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
DOCUMENT_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
REVISION_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")


class _Result:
    def __init__(self, data) -> None:
        self.data = data


class _Rpc:
    def __init__(self, client, name: str) -> None:
        self._client = client
        self._name = name

    def execute(self):
        self._client.calls.append(("rpc", self._name))
        return _Result(self._client.body)


class _Client:
    """Recording double: any table read is a regression, not a fallback."""

    def __init__(self, body) -> None:
        self.body = body
        self.calls: list[tuple[str, str]] = []

    def rpc(self, name: str, params: dict) -> _Rpc:
        assert name == "knowledge_read_ingestion"
        assert params == {"p_ingestion_id": str(INGESTION_ID)}
        return _Rpc(self, name)

    def table(self, name: str):  # pragma: no cover - fail loudly
        raise AssertionError(f"unexpected table read: {name}")


def _body(*, revision=True, document=True) -> dict:
    return {
        "ingestion": {
            "id": str(INGESTION_ID),
            "document_id": str(DOCUMENT_ID),
            "revision_id": str(REVISION_ID),
            "state": "ready",
            "last_error": None,
        },
        "revision": (
            {
                "status": "ready",
                "chunk_count": 4,
                "error_message": None,
                "file_type": "pdf",
                "qdrant_collection": "sabha_chunks",
            }
            if revision
            else None
        ),
        "document": (
            {
                "file_name": "deck.pdf",
                "status": "indexed",
                "chunk_count": 4,
                "error_message": None,
            }
            if document
            else None
        ),
    }


def test_one_read_returns_the_full_receipt():
    client = _Client(_body())
    repository = SupabaseKnowledgeRepository(lambda: client)

    record = repository.get_ingestion(INGESTION_ID)

    assert record is not None
    assert record.ingestion_id == INGESTION_ID
    assert record.document_id == DOCUMENT_ID
    assert record.revision_id == REVISION_ID
    assert record.state is IngestionState.READY
    assert record.revision_state is RevisionState.READY
    assert record.document_status == "indexed"
    assert record.file_name == "deck.pdf"
    assert record.file_type == "pdf"
    assert record.collection_name == "sabha_chunks"
    assert record.chunk_count == 4
    assert client.calls == [("rpc", "knowledge_read_ingestion")]


def test_unknown_ingestion_is_none_without_a_second_read():
    client = _Client(None)
    repository = SupabaseKnowledgeRepository(lambda: client)

    assert repository.get_ingestion(INGESTION_ID) is None
    assert client.calls == [("rpc", "knowledge_read_ingestion")]


def test_a_dangling_reference_is_a_typed_unavailable_error():
    client = _Client(_body(revision=False))
    repository = SupabaseKnowledgeRepository(lambda: client)

    with pytest.raises(KnowledgeUnavailable):
        repository.get_ingestion(INGESTION_ID)
    assert client.calls == [("rpc", "knowledge_read_ingestion")]
