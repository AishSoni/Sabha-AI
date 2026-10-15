"""Adapter normalization: native IDs survive complete/stream paths."""

import json

from app.llm.base import LLMMessage, StreamEventType
from app.llm.gemini import GeminiProvider
from app.llm.ollama import OllamaProvider
from app.llm.openrouter import OpenRouterProvider


async def test_gemini_complete_synthesizes_distinct_ids_for_same_name_calls(monkeypatch):
    provider = GeminiProvider()
    payload = {
        "candidates": [{
            "content": {"parts": [
                {"functionCall": {"name": "web_search", "args": {"query": "a"}}},
                {"functionCall": {"name": "web_search", "args": {"query": "b"}}},
            ]},
            "finishReason": "STOP",
        }],
        "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
    }

    class FakeResponse:
        status_code = 200

        def json(self):
            return payload

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())

    response = await provider.complete([LLMMessage(role="user", content="hi")])
    ids = [tc.id for tc in response.tool_calls]
    assert len(ids) == 2
    assert ids[0] != ids[1]
    assert all(ids)
    assert not any(i == "web_search" for i in ids)


def test_gemini_tool_message_uses_tool_name_not_call_id():
    provider = GeminiProvider()
    messages = [
        LLMMessage(role="user", content="hi"),
        LLMMessage(role="tool", content="result", tool_call_id="gen-call-0", tool_name="web_search"),
    ]
    _, contents = provider._convert_messages(messages)
    fn = contents[-1]["parts"][0]["functionResponse"]
    assert fn["name"] == "web_search"


async def test_openrouter_stream_preserves_native_tool_ids_and_done_signal(monkeypatch):
    provider = OpenRouterProvider()

    class FakeStream:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def raise_for_status(self):
            return None

        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"web_search","arguments":""}}]}}]}'
            yield 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\":\\"x\\"}"}}]}}]}'
            yield 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}'
            yield "data: [DONE]"

    class FakeClient:
        def stream(self, *args, **kwargs):
            return FakeStream()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())

    events = [e async for e in provider.stream([LLMMessage(role="user", content="hi")])]
    tool_events = [e for e in events if e.type == StreamEventType.TOOL_CALL]
    assert tool_events and tool_events[0].tool_call_id == "call_abc"
    done = [e for e in events if e.type == StreamEventType.DONE]
    assert done and done[-1].invocation_finished is True


async def test_ollama_stream_preserves_ids_and_done_signal(monkeypatch):
    provider = OllamaProvider()

    class FakeResp:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def aiter_lines(self):
            yield json.dumps({
                "message": {"role": "assistant", "tool_calls": [
                    {"id": "ol_1", "function": {"name": "web_search", "arguments": {"query": "x"}}},
                    {"id": "ol_2", "function": {"name": "web_search", "arguments": {"query": "y"}}},
                ]},
                "done": False,
            })
            yield json.dumps({"message": {"role": "assistant", "content": ""}, "done": True})

    class FakeClient:
        def stream(self, *args, **kwargs):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())

    events = [e async for e in provider.stream([LLMMessage(role="user", content="hi")])]
    tool_events = [e for e in events if e.type == StreamEventType.TOOL_CALL]
    assert [e.tool_call_id for e in tool_events] == ["ol_1", "ol_2"]
