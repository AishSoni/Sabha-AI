"""HTTP/application acceptance tests for the durable turn queue (spec 07).

The real queue RPCs and the real FastAPI routes run against the disposable
Postgres database. A scripted provider replaces the paid transport, so these
tests prove the submit -> claim -> execute -> publish workflow and its public
observation surface without network access.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from app.capabilities.inference.contracts import StreamEvent, StreamEventType
import app.modules.meetings.infrastructure.supabase_meetings as meeting_manager_module
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.supabase_meetings import build_default_meeting_service
from app.modules.meetings.infrastructure.turns import TurnQueueService
from app.capabilities.runtime.runner import TurnRunner
from tests.doubles.durable_queue import DurableQueueWorld
from tests.doubles.providers import ScriptedProvider
from tests.doubles.supabase_stub import stub_for


@pytest.fixture()
def turn_app(disposable_db, monkeypatch):
    monkeypatch.setattr(
        meeting_manager_module, "get_supabase", lambda: stub_for(disposable_db)
    )
    provider = ScriptedProvider()
    service = TurnQueueService(
        build_default_meeting_service(),
        provider_factory=lambda **kwargs: provider,
        max_queued=2,
    )
    container = Container(prompt_catalog=object(), turn_queue=service)
    app = create_app(container)
    world = DurableQueueWorld(disposable_db)
    with TestClient(app) as client:
        yield client, world, provider, service


def _meeting(world: DurableQueueWorld) -> tuple[str, str]:
    meeting_id, participant_id = world.seed_active_meeting()
    world.db.query(
        """
        UPDATE ai_participants
        SET provider_config = %s::jsonb
        WHERE id = %s
        RETURNING id
        """,
        (
            json.dumps({"provider": "ollama", "model": "llama3.1"}),
            participant_id,
        ),
    )
    return meeting_id, participant_id


def _drain(runner: TurnRunner) -> int:
    async def run() -> int:
        started = await runner.run_once()
        await runner.wait_idle()
        return started

    return asyncio.run(run())


def _submit(
    client: TestClient,
    meeting_id: str,
    participant_id: str,
    key: str,
    *,
    provider: dict | None = None,
):
    body = {"participant_id": participant_id, "request_key": key}
    if provider is not None:
        body["provider"] = provider
    return client.post(f"/api/meetings/{meeting_id}/turns", json=body)


def _parse_sse(text: str) -> list[dict]:
    events = []
    for line in text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def test_submit_status_list_and_idempotency(turn_app):
    client, world, _provider, _service = turn_app
    meeting_id, participant_id = _meeting(world)

    response = _submit(client, meeting_id, participant_id, "first")
    assert response.status_code == 202
    receipt = response.json()
    operation_id = receipt["operation_id"]
    assert receipt["status"] == "queued"
    assert receipt["queue_position"] == 1

    repeated = _submit(client, meeting_id, participant_id, "first")
    assert repeated.status_code == 200
    assert repeated.json()["operation_id"] == operation_id

    conflict = _submit(
        client,
        meeting_id,
        participant_id,
        "first",
        provider={"max_tokens": 300},
    )
    assert conflict.status_code == 409

    listed = client.get(f"/api/meetings/{meeting_id}/turns")
    assert listed.status_code == 200
    assert [row["operation_id"] for row in listed.json()] == [operation_id]
    assert listed.json()[0]["status"] == "queued"

    status = client.get(f"/api/meetings/{meeting_id}/turns/{operation_id}")
    assert status.status_code == 200
    assert status.json()["operation_id"] == operation_id


def test_execution_publishes_one_final_message_and_terminal_event(turn_app):
    client, world, provider, service = turn_app
    meeting_id, participant_id = _meeting(world)
    provider.scripts.append(
        [
            StreamEvent(type=StreamEventType.TEXT, content="Hello "),
            StreamEvent(type=StreamEventType.TEXT, content="director."),
            StreamEvent(
                type=StreamEventType.DONE,
                usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
            ),
        ]
    )

    receipt = _submit(client, meeting_id, participant_id, "run").json()
    runner = TurnRunner(service, concurrency=1)
    assert _drain(runner) == 1

    status = client.get(
        f"/api/meetings/{meeting_id}/turns/{receipt['operation_id']}"
    ).json()
    assert status["status"] == "completed"
    assert status["final_message_id"]
    assert status["started_at"] is not None
    assert status["completed_at"] is not None

    messages = world.messages(meeting_id)
    assert len(messages) == 1
    assert messages[0]["content"] == "Hello director."
    assert messages[0]["operation_id"] == receipt["operation_id"]

    events = world.events(receipt["operation_id"], meeting_id)
    assert [event["type"] for event in events] == [
        "status",
        "status",
        "text",
        "text",
        "done",
    ]
    assert events[-1]["payload"]["message_id"] == status["final_message_id"]

    # The same request key never starts a second paid execution.
    repeated = _submit(client, meeting_id, participant_id, "run")
    assert repeated.status_code == 200
    assert repeated.json()["status"] == "completed"
    assert _drain(runner) == 0
    assert provider.call_count == 1


def test_cancel_pending_turn_prevents_execution(turn_app):
    client, world, provider, service = turn_app
    meeting_id, participant_id = _meeting(world)
    provider.scripts.append(
        [StreamEvent(type=StreamEventType.TEXT, content="should not run")]
    )

    receipt = _submit(client, meeting_id, participant_id, "cancel").json()
    cancelled = client.post(
        f"/api/meetings/{meeting_id}/turns/{receipt['operation_id']}/cancel"
    )
    assert cancelled.status_code == 200
    assert cancelled.json() == {"outcome": "cancelled", "status": "cancelled"}

    runner = TurnRunner(service, concurrency=1)
    assert _drain(runner) == 0
    assert provider.call_count == 0
    status = client.get(
        f"/api/meetings/{meeting_id}/turns/{receipt['operation_id']}"
    ).json()
    assert status["status"] == "cancelled"


def test_observation_replays_persisted_events_and_closes(turn_app):
    client, world, provider, service = turn_app
    meeting_id, participant_id = _meeting(world)
    provider.scripts.append(
        [
            StreamEvent(
                type=StreamEventType.TOOL_CALL,
                tool_name="search_knowledge_base",
                tool_arguments={"query": "pricing"},
                tool_call_id="call-1",
            ),
            StreamEvent(
                type=StreamEventType.DONE,
                usage={"prompt_tokens": 1, "completion_tokens": 1},
            ),
        ]
    )
    provider.scripts.append(
        [
            StreamEvent(type=StreamEventType.TEXT, content="No documents found."),
            StreamEvent(
                type=StreamEventType.DONE,
                usage={"prompt_tokens": 2, "completion_tokens": 2},
            ),
        ]
    )
    receipt = _submit(client, meeting_id, participant_id, "observe").json()
    runner = TurnRunner(service, concurrency=1)
    assert _drain(runner) == 1

    with client.stream(
        "GET",
        f"/api/meetings/{meeting_id}/turns/{receipt['operation_id']}/events",
    ) as response:
        assert response.status_code == 200
        text = "".join(response.iter_text())

    events = _parse_sse(text)
    assert [event["type"] for event in events] == [
        "status",
        "status",
        "tool_call",
        "tool_result",
        "text",
        "done",
    ]
    assert events[2]["call_id"] == "call-1"
    assert events[2]["tool_name"] == "search_knowledge_base"
    assert events[3]["call_id"] == "call-1"
    assert events[3]["is_error"] is True
    assert events[-1]["message_id"]


def test_queue_limit_and_closed_meeting_are_visible(turn_app):
    client, world, _provider, _service = turn_app
    meeting_id, participant_id = _meeting(world)

    assert _submit(client, meeting_id, participant_id, "one").status_code == 202
    assert _submit(client, meeting_id, participant_id, "two").status_code == 202
    assert _submit(client, meeting_id, participant_id, "three").status_code == 429

    missing = _submit(
        client,
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
        "missing",
    )
    assert missing.status_code == 404

    world.db.query(
        "UPDATE meetings SET status = 'archived' WHERE id = %s RETURNING id",
        (meeting_id,),
    )
    closed = _submit(client, meeting_id, participant_id, "closed")
    assert closed.status_code == 409


def test_provider_failure_becomes_interrupted_without_a_message(turn_app):
    client, world, provider, service = turn_app
    meeting_id, participant_id = _meeting(world)
    provider.scripts.append(RuntimeError("provider exploded"))

    receipt = _submit(client, meeting_id, participant_id, "failure").json()
    runner = TurnRunner(service, concurrency=1)
    assert _drain(runner) == 1

    status = client.get(
        f"/api/meetings/{meeting_id}/turns/{receipt['operation_id']}"
    ).json()
    assert status["status"] == "interrupted"
    assert status["error"]["code"] == "provider_error"
    assert world.messages(meeting_id) == []
    assert world.inference_count(meeting_id) == 0
