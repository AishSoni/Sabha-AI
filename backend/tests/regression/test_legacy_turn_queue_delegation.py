"""Spec-07 compatibility: the legacy turn routes are queue adapters.

The synchronous and streaming entry points must submit the same durable
operation, let the same worker execute it, and never call the old
Orchestrator execution paths directly.
"""

import json

from fastapi.testclient import TestClient

import app.modules.meetings.infrastructure.orchestrator as orchestrator_module
from app.capabilities.inference.contracts import LLMResponse, StreamEvent, StreamEventType
from main import app

from test_tool_continuation_loop import (  # noqa: F401  (fixture re-export)
    MEETING_ID,
    PARTICIPANT_ID,
    turn_env,
)


def _operations(db) -> list[tuple]:
    return db.query(
        "SELECT request_key, status, final_message_id FROM operations "
        "WHERE meeting_id = %s ORDER BY admission",
        (MEETING_ID,),
    )


def _forbid_direct_execution(monkeypatch):
    async def fail(*args, **kwargs):
        raise AssertionError("legacy route executed outside the durable queue")

    monkeypatch.setattr(orchestrator_module.Orchestrator, "execute_turn", fail)
    monkeypatch.setattr(
        orchestrator_module.Orchestrator, "execute_turn_streaming", fail
    )


def test_turn_route_uses_one_durable_operation(turn_env, monkeypatch):
    _forbid_direct_execution(monkeypatch)
    provider = turn_env["install_provider"](
        responses=[LLMResponse(content="Queue-backed answer.", usage={"total_tokens": 3})]
    )
    client = TestClient(app)
    response = client.post(
        f"/api/meetings/{MEETING_ID}/turn",
        json={"participant_id": PARTICIPANT_ID},
    )

    assert response.status_code == 200, response.text
    assert response.json()["message"]["content"] == "Queue-backed answer."
    assert provider.call_count == 1

    operations = _operations(turn_env["db"])
    assert len(operations) == 1
    request_key, status, final_message_id = operations[0]
    assert request_key.startswith("legacy-turn-")
    assert status == "done"
    assert str(final_message_id) == response.json()["message"]["id"]
    assert response.json()["message"]["operation_id"] is not None


def test_stream_turn_route_uses_one_durable_operation(turn_env, monkeypatch):
    _forbid_direct_execution(monkeypatch)
    provider = turn_env["install_provider"](
        scripts=[
            [
                StreamEvent(type=StreamEventType.TEXT, content="Streamed answer."),
                StreamEvent(
                    type=StreamEventType.DONE,
                    usage={"prompt_tokens": 2, "completion_tokens": 2},
                ),
            ]
        ]
    )
    client = TestClient(app)
    with client.stream(
        "POST",
        f"/api/meetings/{MEETING_ID}/turn/stream",
        json={"participant_id": PARTICIPANT_ID},
    ) as response:
        assert response.status_code == 200
        payload = "".join(response.iter_text())

    events = [
        json.loads(line[len("data: "):])
        for line in payload.splitlines()
        if line.startswith("data: ")
    ]
    assert [event["type"] for event in events] == ["text", "done"]
    assert events[0]["content"] == "Streamed answer."
    assert events[-1]["message_id"]
    assert provider.call_count == 1

    operations = _operations(turn_env["db"])
    assert len(operations) == 1
    assert operations[0][1] == "done"
    assert str(operations[0][2]) == events[-1]["message_id"]
