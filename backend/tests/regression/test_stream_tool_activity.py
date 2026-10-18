"""Regression: streamed turns must announce tool activity with a stable,
unique call id BEFORE the work executes, and results must correlate back to
that id — repeated same-name calls must stay distinguishable end-to-end.

Evidence: orchestrator streaming consumed provider TOOL_CALL events and
yielded only TOOL_RESULT (the UI never saw the call start), and the internal
ToolCall reused the tool NAME as its id, so two same-name calls collided in
follow-up model context.
"""

import json

import pytest

from app.llm.base import StreamEvent, StreamEventType

# Re-export the proven streaming fixture namespace (same dir is on sys.path)
# together with the seeded identity constants it uses.
from test_tool_continuation_loop import (  # noqa: F401
    MEETING_ID,
    PARTICIPANT_ID,
    turn_env,
)


def _done(usage):
    return StreamEvent(type=StreamEventType.DONE, usage=usage)


def _usage(total):
    return {"prompt_tokens": total // 3, "completion_tokens": total - total // 3, "total_tokens": total}


async def test_streaming_emits_tool_call_before_result(turn_env):
    turn_env["install_provider"](
        scripts=[
            [
                StreamEvent(
                    type=StreamEventType.TOOL_CALL,
                    tool_name="search_knowledge_base",
                    tool_arguments={"query": "market pricing"},
                ),
                _done(_usage(15)),
            ],
            [
                StreamEvent(type=StreamEventType.TEXT, content="Grounded final answer."),
                _done(_usage(30)),
            ],
        ]
    )

    orchestrator = turn_env["orchestrator"]
    events = [ev async for ev in orchestrator.execute_turn_streaming(MEETING_ID, PARTICIPANT_ID)]

    types = [ev.type for ev in events]
    assert types == ["tool_call", "tool_result", "text", "done"], types


async def test_tool_call_ids_are_unique_for_repeated_same_name_calls(turn_env):
    turn_env["install_provider"](
        scripts=[
            [
                StreamEvent(type=StreamEventType.TOOL_CALL, tool_name="search_knowledge_base", tool_arguments={"query": "q one"}),
                _done(_usage(15)),
            ],
            [
                StreamEvent(type=StreamEventType.TOOL_CALL, tool_name="search_knowledge_base", tool_arguments={"query": "q two"}),
                _done(_usage(15)),
            ],
            [
                StreamEvent(type=StreamEventType.TEXT, content="Synthesis complete."),
                _done(_usage(30)),
            ],
        ]
    )

    orchestrator = turn_env["orchestrator"]
    events = [ev async for ev in orchestrator.execute_turn_streaming(MEETING_ID, PARTICIPANT_ID)]

    call_events = [ev for ev in events if ev.type == "tool_call"]
    result_events = [ev for ev in events if ev.type == "tool_result"]
    assert len(call_events) == 2
    assert len(result_events) == 2

    call_ids = [ev.tool_call_id for ev in call_events]
    assert all(call_ids), "each announced call must carry a stable id"
    assert call_ids[0] != call_ids[1], "repeated same-name calls need distinct ids"
    assert call_ids[0] != "search_knowledge_base", "the bare tool name must not act as the id"
    assert [ev.tool_call_id for ev in result_events] == call_ids, "results must correlate to their call id"


async def test_follow_up_provider_call_sees_unique_tool_ids(turn_env):
    provider = turn_env["install_provider"](
        scripts=[
            [
                StreamEvent(type=StreamEventType.TOOL_CALL, tool_name="search_knowledge_base", tool_arguments={"query": "first"}),
                _done(_usage(15)),
            ],
            [
                StreamEvent(type=StreamEventType.TOOL_CALL, tool_name="search_knowledge_base", tool_arguments={"query": "second"}),
                _done(_usage(15)),
            ],
            [StreamEvent(type=StreamEventType.TEXT, content="Done."), _done(_usage(30))],
        ]
    )

    orchestrator = turn_env["orchestrator"]
    collected = [ev async for ev in orchestrator.execute_turn_streaming(MEETING_ID, PARTICIPANT_ID)]
    call_ids = [ev.tool_call_id for ev in collected if ev.type == "tool_call"]

    second_round_messages = provider.calls[2]["messages"]  # third round sees both tool results
    tool_messages = [m for m in second_round_messages if m.role == "tool"]
    assistant_with_calls = [m for m in second_round_messages if m.tool_calls]

    assert len(tool_messages) == 2
    assert [m.tool_call_id for m in tool_messages] == call_ids, (
        "the model must see the same unique ids that were announced over the stream"
    )
    assert [m.tool_calls[0].id for m in assistant_with_calls] == call_ids
    result_events = [ev for ev in collected if ev.type == "tool_result"]
    assert tool_messages[0].content == json.dumps(result_events[0].tool_result), (
        "exactly what was announced over the stream becomes the tool payload"
    )
