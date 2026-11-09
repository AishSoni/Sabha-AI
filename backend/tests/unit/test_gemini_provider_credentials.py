"""Gemini credentials never ride in a URL (spec-37)."""

from __future__ import annotations

import pytest

from app.capabilities.inference.contracts import LLMMessage
from app.platform.providers.gemini import GeminiProvider


class _Response:
    status_code = 200
    text = ""

    def json(self):
        return {
            "candidates": [
                {"content": {"parts": [{"text": "ok"}]}, "finishReason": "stop"}
            ],
            "usageMetadata": {},
        }

    async def aread(self):
        return b""

    async def aiter_lines(self):
        if False:
            yield ""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class _Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, *, headers=None, json=None, timeout=None):
        self.calls.append((url, headers or {}))
        return _Response()

    def stream(self, method, url, *, headers=None, json=None, timeout=None):
        self.calls.append((url, headers or {}))
        return _Response()


@pytest.mark.asyncio
async def test_complete_and_stream_send_the_key_in_a_header_not_the_url(monkeypatch):
    client = _Client()
    monkeypatch.setattr(
        "app.platform.providers.gemini.httpx.AsyncClient", lambda: client
    )
    provider = GeminiProvider(model="gemini-2.0-flash", api_key="sk-synthetic")

    await provider.complete([LLMMessage(role="user", content="hi")])
    async for _event in provider.stream([LLMMessage(role="user", content="hi")]):
        pass

    assert len(client.calls) == 2
    for url, headers in client.calls:
        assert "sk-synthetic" not in url
        assert "key=" not in url
        assert headers["x-goog-api-key"] == "sk-synthetic"
