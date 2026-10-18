"""Deterministic LLM provider / embedding doubles (`provider_script`,
`controlled_failure`, `embedding_transport` fixture contracts).

These fakes record every call (messages, tools, configuration, call count)
and replay scripted responses in order. They never touch the network.
"""

from typing import Any, AsyncGenerator, Dict, List, Optional, Sequence

from app.llm.base import (
    LLMMessage,
    LLMProvider,
    LLMResponse,
    StreamEvent,
    StreamEventType,
    ToolDefinition,
)

DEFAULT_USAGE = {
    "prompt_tokens": 12,
    "completion_tokens": 7,
    "total_tokens": 19,
}


class ScriptedProvider(LLMProvider):
    """`provider_script` contract: fake provider recording calls and replaying
    scripted responses in order.

    Script entries may be:
      - LLMResponse                      -> returned as-is
      - Exception (instance or class)    -> raised (controlled failure)
      - dict (stream events, streaming script only)
    """

    def __init__(self, responses: Sequence[Any] = (), usage: Optional[Dict] = None):
        self.responses: List[Any] = list(responses)
        self.usage = usage if usage is not None else dict(DEFAULT_USAGE)
        self.calls: List[Dict] = []
        self.scripts: List[Dict] = []  # per-call scripts for stream()

    async def complete(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": self._snapshot(messages),
                "tools": tools,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        if not self.responses:
            raise AssertionError("ScriptedProvider exhausted its scripted responses")
        item = self.responses.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item

    @staticmethod
    def _snapshot(messages: List[LLMMessage]) -> List[LLMMessage]:
        # Record a point-in-time copy: the orchestrator keeps appending tool
        # results to the same list after a call, and the recorded history of
        # a completed call must not change afterwards.
        return list(messages)

    async def stream(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[StreamEvent, None]:
        self.calls.append(
            {
                "messages": self._snapshot(messages),
                "tools": tools,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "streamed": True,
            }
        )
        if not self.scripts:
            raise AssertionError("ScriptedProvider exhausted its stream scripts")
        script = self.scripts.pop(0)
        if isinstance(script, BaseException):
            raise script
        for event in script:
            if isinstance(event, BaseException):
                raise event
            yield event

    def estimate_cost(self, usage: Dict) -> float:
        return 0.0  # synthetic provider; deterministic costs are asserted explicitly

    @property
    def call_count(self) -> int:
        return len(self.calls)


class ScriptedEmbedding:
    """`embedding_transport` contract: fake embedding transport recording the
    exact payloads (input_type/model/dimensions) for indexing and querying."""

    def __init__(self, dimensions: int = 4):
        self.dimensions = dimensions
        self.requests: List[Dict] = []

    async def embed(self, texts: List[str], input_type: str) -> List[List[float]]:
        self.requests.append({"texts": list(texts), "input_type": input_type})
        return [[1.0] * self.dimensions for _ in texts]

    @property
    def document_requests(self) -> List[Dict]:
        return [r for r in self.requests if r["input_type"] == "search_document"]

    @property
    def query_requests(self) -> List[Dict]:
        return [r for r in self.requests if r["input_type"] == "search_query"]
