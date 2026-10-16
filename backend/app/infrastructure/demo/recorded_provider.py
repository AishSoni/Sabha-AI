"""Production recorded provider for the offline demo runtime.

Offline, deterministic, and honestly labeled as recorded analysis. Implements
the real LLMProvider interface without importing test doubles. Yields the
approved scripted tool calls then the reviewed final text. No live inference,
no embeddings, no market-data calls. Single-worker safe (no shared state).
"""

from typing import Any, Dict, List, Optional

from app.llm.base import (
    LLMMessage,
    LLMProvider,
    LLMResponse,
    StreamEvent,
    StreamEventType,
    ToolCall,
    ToolDefinition,
)


class RecordedProvider(LLMProvider):
    """Plays a fixed recorded script: tool calls then final text."""

    def __init__(self, script: Optional[List[LLMResponse]] = None) -> None:
        self._script: List[Any] = list(script or [])
        self.calls: List[Dict[str, Any]] = []

    @property
    def remaining(self) -> int:
        return len(self._script)

    async def complete(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": [m.model_dump() for m in messages],
                "tools": [t.model_dump() for t in (tools or [])],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        if not self._script:
            return LLMResponse(content="recorded-script-exhausted", tool_calls=[])
        item = self._script.pop(0)
        if isinstance(item, BaseException):
            raise item
        assert isinstance(item, LLMResponse), f"script item must be LLMResponse, got {type(item)}"
        return item

    async def stream(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        response = await self.complete(messages, tools, temperature, max_tokens)
        if response.content:
            yield StreamEvent(type=StreamEventType.TEXT, content=response.content)
        for tc in response.tool_calls:
            assert isinstance(tc, ToolCall)
            yield StreamEvent(
                type=StreamEventType.TOOL_CALL,
                tool_name=tc.name,
                tool_arguments=tc.arguments,
            )
        yield StreamEvent(type=StreamEventType.DONE, usage=response.usage)

    def estimate_cost(self, usage: dict) -> float:
        return 0.0


def tool_call_response(call_id: str, name: str, arguments: Optional[dict] = None) -> LLMResponse:
    return LLMResponse(
        content=None,
        tool_calls=[ToolCall(id=call_id, name=name, arguments=arguments or {})],
        finish_reason="tool_calls",
        usage={},
    )


def final_text_response(text: str) -> LLMResponse:
    return LLMResponse(content=text, tool_calls=[], finish_reason="stop", usage={})
