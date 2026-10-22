"""Durable turn queue acceptance tests (spec 07).

Every test uses the real queue RPCs against a disposable Postgres database.
The world exposes independent worker identities and a fake clock, so the
tests can prove admission, FIFO claiming, global limits, cancellation races,
leases, fencing, durable events and effect dedupe without invoking a provider.
"""

from __future__ import annotations

import pytest

from tests.doubles.durable_queue import DurableQueueWorld


@pytest.fixture()
def queue(disposable_db) -> DurableQueueWorld:
    return DurableQueueWorld(disposable_db, lease_seconds=30)


def test_admission_is_fifo_and_idempotent(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    first = queue.submit(meeting_id, participant_id, key="first")
    second = queue.submit(meeting_id, participant_id, key="second")

    assert first["outcome"] == "created"
    assert second["outcome"] == "created"
    assert first["queue_position"] == 1
    assert second["queue_position"] == 2
    assert first["operation"]["admission"] < second["operation"]["admission"]

    repeated = queue.submit(meeting_id, participant_id, key="first")
    assert repeated["outcome"] == "existing"
    assert repeated["operation"]["id"] == first["operation"]["id"]

    conflict = queue.submit(
        meeting_id,
        participant_id,
        key="first",
        settings={"temperature": 0.1},
    )
    assert conflict["outcome"] == "conflict"


def test_two_workers_claim_only_one_same_meeting(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    first = queue.submit(meeting_id, participant_id, key="first")["operation"]
    second = queue.submit(meeting_id, participant_id, key="second")["operation"]

    claims = queue.run_pair(
        queue.worker("worker-a").claim,
        queue.worker("worker-b").claim,
    )
    claimed = [claim for claim in claims if claim is not None]

    assert len(claimed) == 1
    assert claimed[0]["id"] == first["id"]
    assert queue.status(second["id"]) == "queued"

    winner = queue.worker(claimed[0]["claimant"])
    published = winner.publish(claimed[0])
    assert published["outcome"] == "published"

    next_claim = queue.worker("worker-c").claim(meeting_id)
    assert next_claim is not None
    assert next_claim["id"] == second["id"]


def test_different_meetings_share_a_global_concurrency_limit(queue: DurableQueueWorld):
    meeting_a, participant_a = queue.seed_active_meeting(name="A")
    meeting_b, participant_b = queue.seed_active_meeting(name="B")
    first = queue.submit(meeting_a, participant_a, key="a")["operation"]
    second = queue.submit(meeting_b, participant_b, key="b")["operation"]

    worker = queue.worker("worker-a")
    claimed = worker.claim(global_limit=1)
    assert claimed is not None
    assert claimed["id"] == first["id"]
    assert worker.claim(global_limit=1) is None

    worker.publish(claimed)
    next_claim = worker.claim(global_limit=1)
    assert next_claim is not None
    assert next_claim["id"] == second["id"]


def test_cancel_and_claim_are_serialized(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="race")["operation"]

    cancel_result, claim_result = queue.run_pair(
        lambda: queue.worker("canceller").cancel(operation),
        lambda: queue.worker("claimer").claim(meeting_id),
    )

    if claim_result is not None:
        assert claim_result["id"] == operation["id"]
        assert cancel_result["outcome"] == "cancel_requested"
    else:
        assert cancel_result["outcome"] == "cancelled"
        assert queue.status(operation["id"]) == "cancelled"


def test_pending_cancellation_prevents_execution(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="cancel-me")["operation"]
    result = queue.worker("canceller").cancel(operation)

    assert result["outcome"] == "cancelled"
    assert queue.status(operation["id"]) == "cancelled"
    assert queue.worker("worker-a").claim(meeting_id) is None


def test_archived_meeting_rejects_admission_and_claim(queue: DurableQueueWorld):
    """Archive is an overlay, so the queue must read `archived_at` explicitly.

    The lifecycle status stays `active` underneath; both the admit guard and
    the claim's post-lock recheck must refuse the meeting anyway.
    """
    meeting_id, participant_id = queue.seed_active_meeting()
    waiting = queue.submit(meeting_id, participant_id, key="before-archive")["operation"]

    with queue.db.connect() as conn:
        conn.execute(
            "UPDATE meetings SET archived_at = now() WHERE id = %s", (meeting_id,)
        )

    rejected = queue.submit(meeting_id, participant_id, key="after-archive")
    assert rejected["outcome"] == "meeting_closed"
    assert queue.worker("worker-a").claim(meeting_id) is None
    assert queue.status(waiting["id"]) == "queued"


def test_unarchiving_restores_admission_and_claim(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    waiting = queue.submit(meeting_id, participant_id, key="before-archive")["operation"]

    with queue.db.connect() as conn:
        conn.execute(
            "UPDATE meetings SET archived_at = now() WHERE id = %s", (meeting_id,)
        )
    with queue.db.connect() as conn:
        conn.execute(
            "UPDATE meetings SET archived_at = NULL WHERE id = %s", (meeting_id,)
        )

    accepted = queue.submit(meeting_id, participant_id, key="after-unarchive")
    assert accepted["outcome"] == "created"
    claimed = queue.worker("worker-a").claim(meeting_id)
    assert claimed is not None
    assert claimed["id"] == waiting["id"]


def test_recovery_requeues_a_claim_that_never_reached_a_provider(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="recover")["operation"]
    claimed = queue.worker("worker-a").claim(meeting_id)
    assert claimed is not None
    assert claimed["execution_started_at"] is None

    queue.clock.advance(31)
    result = queue.recover()

    assert result["requeued"] == 1
    assert queue.status(operation["id"]) == "queued"
    reclaimed = queue.worker("worker-b").claim(meeting_id)
    assert reclaimed is not None
    assert reclaimed["id"] == operation["id"]
    assert reclaimed["fence_version"] > claimed["fence_version"]


def test_recovery_interrupts_a_claim_after_a_provider_attempt_started(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="interrupt")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None
    attempt_id = "11111111-1111-1111-1111-111111111111"
    assert worker.begin_attempt(claimed, attempt_id=attempt_id) == 1

    queue.clock.advance(31)
    result = queue.recover()

    assert result["interrupted"] == 1
    assert queue.status(operation["id"]) == "interrupted"
    assert queue.worker("worker-b").claim(meeting_id) is None

    persisted = queue.operation(operation["id"])
    assert persisted["attempt_count"] == 1
    assert persisted["error_code"] == "unknown_outcome"
    attempt = queue.db.query(
        "SELECT status FROM operation_attempts WHERE id = %s", (attempt_id,)
    )[0][0]
    assert attempt == "unknown"


def test_stale_publication_is_rejected_but_incurred_usage_is_kept(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="stale")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None
    attempt_id = "22222222-2222-2222-2222-222222222222"
    assert worker.begin_attempt(claimed, attempt_id=attempt_id) == 1

    # The lease expires and a recovered worker records the paid attempt.
    queue.clock.advance(31)
    queue.recover()
    assert worker.complete_attempt(attempt_id, cost=0.25) is True
    assert queue.worker("worker-b").claim(meeting_id) is None

    stale = worker.publish(claimed)
    assert stale["outcome"] == "stale"
    assert queue.messages(meeting_id) == []
    assert queue.inference_count(meeting_id) == 1
    assert queue.total_cost(meeting_id) == pytest.approx(0.25)
    assert queue.worker("worker-a").complete_attempt(attempt_id, cost=0.25) is False
    assert queue.inference_count(meeting_id) == 1


def test_publication_is_at_most_once_and_retry_returns_the_same_message(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="publish")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None

    first = worker.publish(claimed)
    second = worker.publish(claimed)

    assert first["outcome"] == "published"
    assert second["outcome"] == "already_published"
    assert second["message_id"] == first["message"]["id"]
    assert len(queue.messages(meeting_id)) == 1
    done_events = [e for e in queue.events(operation["id"], meeting_id) if e["type"] == "done"]
    assert len(done_events) == 1


def test_effect_dedupe_uses_operation_invocation_and_call_identity(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="effects")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None

    first = worker.disagreement(claimed, invocation_id="inv-1", call_id="call-1")
    repeated = worker.disagreement(claimed, invocation_id="inv-1", call_id="call-1")
    distinct = worker.disagreement(claimed, invocation_id="inv-1", call_id="call-2")

    assert first["id"] == repeated["id"]
    assert first["id"] != distinct["id"]
    assert len(queue.disagreement_rows(meeting_id)) == 2

    consensus = worker.consensus(claimed, invocation_id="inv-1", call_id="call-3")
    repeated_consensus = worker.consensus(claimed, invocation_id="inv-1", call_id="call-3")
    assert consensus["id"] == repeated_consensus["id"]
    assert len(queue.consensus_rows(meeting_id)) == 1


def test_stale_fence_cannot_record_effects(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="stale-effect")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None

    queue.clock.advance(31)
    queue.recover()
    assert worker.disagreement(claimed) is None
    assert queue.disagreement_rows(meeting_id) == []


def test_message_boundary_moves_forward_between_turns(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    queue.insert_message(meeting_id, "before A")
    operation_a = queue.submit(meeting_id, participant_id, key="a")["operation"]
    claimed_a = queue.worker("worker-a").claim(meeting_id)
    assert claimed_a is not None

    queue.insert_message(meeting_id, "during A")
    boundary_a = queue.operation(operation_a["id"])["context_boundary"]
    queue.worker("worker-a").publish(claimed_a)

    operation_b = queue.submit(meeting_id, participant_id, key="b")["operation"]
    claimed_b = queue.worker("worker-b").claim(meeting_id)
    assert claimed_b is not None
    boundary_b = queue.operation(operation_b["id"])["context_boundary"]

    assert boundary_b > boundary_a
    assert queue.operation(operation_b["id"])["context_boundary"] == boundary_b


def test_cancelling_a_meeting_cancels_queued_work(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="archive")["operation"]

    cancelled = queue.cancel_for_meeting(meeting_id, reason="archived")
    assert cancelled == 1
    assert queue.status(operation["id"]) == "cancelled"
    assert queue.worker("worker-a").claim(meeting_id) is None


def test_participant_removal_cancels_pending_work(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="removed")["operation"]
    queue.db.query("DELETE FROM ai_participants WHERE id = %s RETURNING id", (participant_id,))

    result = queue.recover()
    assert result["cancelled"] == 1
    assert queue.status(operation["id"]) == "cancelled"
    assert queue.operation(operation["id"])["error_code"] == "participant_removed"


def test_events_persist_and_replay_by_sequence(queue: DurableQueueWorld):
    meeting_id, participant_id = queue.seed_active_meeting()
    operation = queue.submit(meeting_id, participant_id, key="events")["operation"]
    worker = queue.worker("worker-a")
    claimed = worker.claim(meeting_id)
    assert claimed is not None

    event_id = "33333333-3333-3333-3333-333333333333"
    first = worker.append_event(claimed, "text", {"content": "hello"}, event_id=event_id)
    repeated = worker.append_event(claimed, "text", {"content": "hello"}, event_id=event_id)
    second = worker.append_event(claimed, "tool_call", {"tool_name": "search"})

    assert first["id"] == repeated["id"]
    events = queue.events(operation["id"], meeting_id)
    assert [e["type"] for e in events] == [
        "status", "status", "text", "tool_call",
    ]
    replayed = queue.events(operation["id"], meeting_id, after=second["sequence"])
    assert replayed == []


def test_not_found_and_closed_meeting_outcomes(queue: DurableQueueWorld):
    missing = queue.submit(
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
        key="missing",
    )
    assert missing["outcome"] == "not_found"

    meeting_id, participant_id = queue.seed_active_meeting()
    queue.db.query("UPDATE meetings SET status = 'archived' WHERE id = %s RETURNING id", (meeting_id,))
    closed = queue.submit(meeting_id, participant_id, key="closed")
    assert closed["outcome"] == "meeting_closed"
