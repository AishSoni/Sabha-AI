"""Phase 01 (P01-T03) scripted LLM provider double.

Returns a programmed sequence of complete() responses, records exact input
history for later Phase 02 assertions, and exposes failure injection points.
Never asserts the broken production orchestrator is correct.
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


class ScriptedProvider(LLMProvider):
    """Programmed complete()/stream() responses with full history capture."""

    def __init__(self, script: Optional[List[Any]] = None):
        # Each entry: LLMResponse, BaseException, or dict for stream events.
        self._script: List[Any] = list(script or [])
        self.calls: List[Dict[str, Any]] = []
        self.fail_on_call: Optional[int] = None
        self.failure: Optional[BaseException] = None

    @property
    def remaining(self) -> int:
        return len(self._script)

    def add_response(self, response: LLMResponse) -> None:
        self._script.append(response)

    def inject_failure(self, call_index: int, exc: BaseException) -> None:
        """Fail the nth complete()/stream() call (0-based) with exc."""
        self.fail_on_call = call_index
        self.failure = exc

    def _maybe_fail(self) -> None:
        idx = len(self.calls) - 1
        if self.fail_on_call is not None and idx == self.fail_on_call and self.failure:
            raise self.failure

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
        self._maybe_fail()
        if not self._script:
            return LLMResponse(content="script-exhausted", tool_calls=[])
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
