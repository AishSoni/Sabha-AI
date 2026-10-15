"""P01-TEST06: scripted provider replays tool-call-then-text with history.

Captures exact input history for Phase 02 assertions. Does not assert the
broken production orchestrator is correct (see B-01 in the regression ledger).
"""

import pytest

from app.llm.base import LLMMessage
from tests.doubles.providers import (
    ScriptedProvider,
    final_text_response,
    tool_call_response,
)
from tests.doubles.runner import ControlledRunner

pytestmark = pytest.mark.anyio


async def test_tool_call_then_final_text_captures_history():
    provider = ScriptedProvider(
        [
            tool_call_response("call-1", "log_consensus", {"topic": "t", "participants": ["a"]}),
            final_text_response("agreed"),
        ]
    )
    runner = ControlledRunner(provider, max_turns=5)
    messages = [LLMMessage(role="user", content="hello")]

    final, history = await runner.run(messages, tools=[])

    assert final.content == "agreed"
    assert len(provider.calls) == 2
    # Second invocation received the tool result with the ORIGINAL call id.
    second_input = provider.calls[1]["messages"]
    tool_msgs = [m for m in second_input if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    assert tool_msgs[0]["tool_call_id"] == "call-1"
    assert provider.calls[0]["temperature"] == pytest.approx(0.7)


async def test_failure_injection_point():
    provider = ScriptedProvider([final_text_response("unused")])
    provider.inject_failure(0, RuntimeError("provider timeout"))
    with pytest.raises(RuntimeError, match="provider timeout"):
        await provider.complete([LLMMessage(role="user", content="hi")])


async def test_exhausted_script_is_explicit():
    provider = ScriptedProvider([])
    response = await provider.complete([LLMMessage(role="user", content="hi")])
    assert response.content == "script-exhausted"
