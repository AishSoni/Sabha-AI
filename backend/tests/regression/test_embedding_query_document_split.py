"""Regression: Cohere embeddings must differentiate query vs document modes.

Evidence: app/platform/providers/embeddings.py CohereEmbedding.embed_batch hardcodes
`input_type='search_document'` for BOTH indexing and retrieval calls (embed_text
delegates to embed_batch), so queries are embedded in document mode degrading
retrieval quality. Indexing must use search_document; searching must use
search_query.
"""

import json

import httpx
import pytest

from app.platform.providers.embeddings import CohereEmbedding


def _recording_transport(records):
    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        records.append(payload)
        texts = payload.get("texts", [])
        return httpx.Response(
            200, json={"embeddings": [[1.0] * 1024 for _ in texts]}
        )

    return httpx.MockTransport(handler)


def _provider(records) -> CohereEmbedding:
    return CohereEmbedding(
        model="embed-english-v3.0",
        api_key="fixture-key",
        transport=_recording_transport(records),
    )


async def test_embed_text_uses_query_mode():
    records = []
    vector = await _provider(records).embed_text("what changed in Q3 pricing?")
    assert len(vector) == 1024
    assert len(records) == 1
    assert records[0]["input_type"] == "search_query", (
        "retrieval calls must embed the query in search_query mode"
    )


async def test_embed_batch_uses_document_mode():
    records = []
    vectors = await _provider(records).embed_batch(["pricing doc", "roadmap doc"])
    assert len(vectors) == 2
    assert records[0]["input_type"] == "search_document", (
        "indexing calls must embed documents in search_document mode"
    )


async def test_payload_contract_stays_intact():
    records = []
    await _provider(records).embed_batch(["content"])
    payload = records[0]
    assert payload["model"] == "embed-english-v3.0"
    assert payload["texts"] == ["content"]
    assert payload["truncate"] == "END"


def test_factory_returns_cohere_for_configured_settings(monkeypatch):
    """get_embedding_provider('cohere') must remain reachable."""
    from app.core.config import settings
    from app.platform.providers import embeddings as embedding_module

    monkeypatch.setattr(settings, "cohere_api_key", "fixture-key")
    provider = embedding_module.get_embedding_provider("cohere", "embed-english-v3.0")
    assert isinstance(provider, CohereEmbedding)
