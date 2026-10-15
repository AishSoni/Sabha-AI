"""Editable queue behavior: FIFO order, edit/remove until dispatch, drain on
terminalization without starting AI turns (P04 TEST03/TEST05 core)."""

import pytest

from app.modules.meetings.queue import (
    InMemoryQueue,
    QueueCapacity,
    QueueConflict,
    QueueValidation,
)

pytestmark = pytest.mark.anyio


async def test_enqueue_edit_remove_then_drain_fifo_without_ai_turn():
    queue = InMemoryQueue()
    _, a = await queue.submit("m", "u", "A", has_active_work=True)
    _, b = await queue.submit("m", "u", "B", has_active_work=True)
    _, c = await queue.submit("m", "u", "C", has_active_work=True)

    await queue.edit(b.entry_id, "u", "B-edited", expected_revision=1)
    await queue.remove(c.entry_id, "u", expected_revision=1)

    # Terminal drain: oldest pending first, exactly the survivors.
    drained = []
    for entry in await queue.list_pending("m"):
        saved = await queue.mark_dispatched(entry.entry_id, f"msg-{entry.seq}")
        drained.append((entry.content, saved.message_id))
    assert [content for content, _ in drained] == ["A", "B-edited"]
    assert await queue.pending_count("m") == 0


async def test_edit_after_dispatch_conflicts_and_stale_revision_conflicts():
    queue = InMemoryQueue()
    _, entry = await queue.submit("m", "u", "hello", has_active_work=True)
    with pytest.raises(QueueConflict):
        await queue.edit(entry.entry_id, "u", "other", expected_revision=99)
    await queue.mark_dispatched(entry.entry_id, "msg-1")
    with pytest.raises(QueueConflict) as exc:
        await queue.edit(entry.entry_id, "u", "rewrite", expected_revision=1)
    assert exc.value.code == "already_dispatched"


async def test_idle_submit_commits_immediately_queued_needs_active_turn():
    queue = InMemoryQueue()
    decision, _ = await queue.submit("m", "u", "direct", has_active_work=False)
    assert decision == "committed"
    decision, _ = await queue.submit("m", "u", "held", has_active_work=True)
    assert decision == "queued"


async def test_queue_rejects_empty_oversized_over_capacity_and_wrong_owner():
    from app.modules.meetings.domain import MAX_QUEUE_PENDING

    queue = InMemoryQueue()
    with pytest.raises(QueueValidation):
        await queue.submit("m", "u", "   ", has_active_work=True)
    with pytest.raises(QueueValidation):
        await queue.submit("m", "u", "x" * 4001, has_active_work=True)
    with pytest.raises(QueueValidation):
        await queue.submit("m", "u", "ok", has_active_work=True,
                           meeting_active=False)
    for i in range(MAX_QUEUE_PENDING):
        await queue.submit("m", "u", f"msg-{i}", has_active_work=True)
    with pytest.raises(QueueCapacity):
        await queue.submit("m", "u", "one-too-many", has_active_work=True)
    _, other = await queue.submit("m2", "intruder", "hi", has_active_work=True)
    with pytest.raises(QueueConflict):
        await queue.edit(other.entry_id, "u", "hijack", expected_revision=1)


async def test_idempotent_submit_returns_original_on_retry():
    queue = InMemoryQueue()
    _, first = await queue.submit("m", "u", "same", idempotency_key="k",
                                  has_active_work=True)
    decision, second = await queue.submit("m", "u", "same", idempotency_key="k",
                                          has_active_work=True)
    assert decision == "queued"
    assert second.entry_id == first.entry_id
    with pytest.raises(QueueConflict):
        await queue.submit("m", "u", "different", idempotency_key="k",
                           has_active_work=True)
