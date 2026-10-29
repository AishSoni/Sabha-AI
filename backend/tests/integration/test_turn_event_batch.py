"""Real-database batched turn-event append (spec 20)."""

from __future__ import annotations

import uuid

from tests.doubles.durable_queue import DurableQueueWorld


def _running_turn(world: DurableQueueWorld) -> dict:
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="batch-turn")
    worker = world.worker("worker-1")
    operation = worker.claim()
    assert operation is not None
    assert worker.start(operation)
    return operation


def _events(*types: str) -> list[dict]:
    return [
        {
            "id": str(uuid.uuid4()),
            "type": event_type,
            "payload": {"content": f"{event_type}-{index}"},
        }
        for index, event_type in enumerate(types)
    ]


def _append(world: DurableQueueWorld, operation: dict, events: list[dict], *, fence=None):
    result = world.stub.rpc(
        "append_turn_events",
        {
            "p_operation_id": operation["id"],
            "p_expected_fence": (
                operation["fence_version"] if fence is None else fence
            ),
            "p_events": events,
            "p_now": world.clock.now(),
        },
    ).execute()
    return result.data


def test_a_batch_is_stored_in_array_order(disposable_db):
    world = DurableQueueWorld(disposable_db)
    operation = _running_turn(world)
    batch = _events("text", "thinking", "tool_call")

    rows = _append(world, operation, batch)

    assert [row["id"] for row in rows] == [event["id"] for event in batch]
    assert [row["type"] for row in rows] == ["text", "thinking", "tool_call"]
    assert [row["payload"] for row in rows] == [event["payload"] for event in batch]
    assert [row["sequence"] for row in rows] == sorted(
        row["sequence"] for row in rows
    )
    stored = [
        row
        for row in world.events(operation["id"], operation["meeting_id"])
        if row["type"] != "status"
    ]
    assert [row["id"] for row in stored] == [event["id"] for event in batch]


def test_a_retried_batch_is_idempotent(disposable_db):
    world = DurableQueueWorld(disposable_db)
    operation = _running_turn(world)
    batch = _events("text", "text")

    first = _append(world, operation, batch)
    second = _append(world, operation, batch)

    assert [row["id"] for row in first] == [event["id"] for event in batch]
    assert [row["sequence"] for row in second] == [row["sequence"] for row in first]
    assert world.db.query(
        "SELECT count(*) FROM operation_events WHERE operation_id = %s AND type <> 'status'",
        (operation["id"],),
    )[0][0] == 2


def test_a_stale_fence_rejects_the_whole_batch(disposable_db):
    world = DurableQueueWorld(disposable_db)
    operation = _running_turn(world)

    rows = _append(
        world,
        operation,
        _events("text", "text"),
        fence=operation["fence_version"] + 1,
    )

    assert rows == []
    assert world.db.query(
        "SELECT count(*) FROM operation_events WHERE operation_id = %s AND type <> 'status'",
        (operation["id"],),
    )[0][0] == 0


def test_a_terminal_operation_rejects_new_events(disposable_db):
    world = DurableQueueWorld(disposable_db)
    operation = _running_turn(world)
    assert world.worker("worker-1").fail(operation)

    assert _append(world, operation, _events("text")) == []


def test_an_empty_batch_is_a_no_op(disposable_db):
    world = DurableQueueWorld(disposable_db)
    operation = _running_turn(world)

    assert _append(world, operation, []) == []
