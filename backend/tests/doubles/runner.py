"""Phase 01 (P01-T03) controllable turn runner.

Drives a scripted provider through tool continuation explicitly so Phase 02
can assert multi-invocation loops without rewriting the harness. This runner
is the CORRECT reference loop; production orchestrator gaps are B-01.
"""

from typing import Any, Dict, List


class ControlledRunner:
    """Feed tool results back to the provider up to max_turns."""

    def __init__(self, provider, max_turns: int = 5):
        self.provider = provider
        self.max_turns = max_turns
        self.tool_results: List[Dict[str, Any]] = []

    async def run(self, messages, tools=None, temperature: float = 0.7):
        from app.llm.base import LLMMessage

        history: List[Any] = list(messages)
        for _ in range(self.max_turns):
            response = await self.provider.complete(
                messages=history, tools=tools, temperature=temperature
            )
            if not response.tool_calls:
                return response, history
            for tc in response.tool_calls:
                result = {"tool_call_id": tc.id, "name": tc.name, "result": f"ok:{tc.name}"}
                self.tool_results.append(result)
                history = history + [
                    LLMMessage(role="assistant", content=None, tool_calls=[tc]),
                    LLMMessage(role="tool", content=result["result"], tool_call_id=tc.id),
                ]
        last = await self.provider.complete(messages=history, tools=tools, temperature=temperature)
        return last, history
