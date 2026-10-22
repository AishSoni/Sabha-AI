"""Lifecycle guards around closing, archive, and user writes (spec 08).

These tests exercise the database guards directly so the route layer can
stay thin. Archive is represented by ``archived_at``; the lifecycle status
itself is never overwritten by archiving, and unarchive never reopens a
meeting.
"""

from __future__ import annotations

import pytest

from tests.doubles.closing import ENDING_MARKER, ClosingWorld


@pytest.fixture()
def world(disposable_db) -> ClosingWorld:
    return ClosingWorld(disposable_db, lease_seconds=30)


def test_archive_is_blocked_while_closing_owns_the_meeting(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="vote")["closing"]

    blocked = world.archive(meeting_id)
    assert blocked["outcome"] == "closing_in_progress"
    assert world.archived_at(meeting_id) is None

    assert world.abort(close) is True
    archived = world.archive(meeting_id)
    assert archived["outcome"] == "archived"
    assert world.archived_at(meeting_id) is not None
    assert world.meeting_status(meeting_id) == "active"

    repeated = world.archive(meeting_id)
    assert repeated["outcome"] == "archived"


def test_archive_never_reopens_an_ended_meeting(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="force")["closing"]
    world.checkpoint_summary(close, f"{ENDING_MARKER}\n\nDone.")
    assert world.complete(close)["outcome"] == "completed"

    assert world.archive(meeting_id)["outcome"] == "archived"
    assert world.meeting_status(meeting_id) == "ended"
    assert world.archived_at(meeting_id) is not None

    unarchived = world.unarchive(meeting_id)
    assert unarchived["outcome"] == "unarchived"
    assert unarchived["status"] == "ended"
    assert world.archived_at(meeting_id) is None
    assert world.meeting_status(meeting_id) == "ended"


def test_unarchive_restores_active_admission_without_restoring_cancelled_turns(
    world: ClosingWorld,
):
    meeting_id, participant_id = world.seed_active_meeting()
    waiting = world.submit(meeting_id, participant_id, key="waiting")
    close = world.request(meeting_id, mode="vote")["closing"]
    assert world.abort(close) is True
    assert world.archive(meeting_id)["outcome"] == "archived"

    # Admission is guarded by the lifecycle status, which archive does not
    # change; the archived_at admission guard is added with the route slice.
    assert world.unarchive(meeting_id)["status"] == "active"
    assert world.turn_status(waiting["operation"]["id"]) == "cancelled"
    assert world.submit(meeting_id, participant_id, key="allowed")["outcome"] == (
        "created"
    )


def test_user_write_is_accepted_before_close_and_rejected_after(world: ClosingWorld):
    meeting_id, _participant_id = world.seed_active_meeting()

    first = world.append_message(meeting_id, key="note-1", content="Before close")
    assert first["outcome"] == "accepted"

    duplicate = world.append_message(meeting_id, key="note-1", content="Changed")
    assert duplicate["outcome"] == "duplicate"
    assert duplicate["message"]["id"] == first["message"]["id"]
    assert duplicate["message"]["content"] == "Before close"

    world.request(meeting_id, mode="vote")
    rejected = world.append_message(meeting_id, key="note-2", content="During close")
    assert rejected["outcome"] == "meeting_closed"
    assert world.message_count(meeting_id) == 1


def test_user_write_race_with_close_never_slips_through_a_stale_precheck(
    world: ClosingWorld,
):
    meeting_id, _participant_id = world.seed_active_meeting()

    message_result, closing_result = world.run_pair(
        lambda: world.append_message(meeting_id, key="race", content="Racing note"),
        lambda: world.request(meeting_id, mode="vote"),
    )

    assert closing_result["outcome"] == "created"
    assert message_result["outcome"] in {"accepted", "meeting_closed"}

    rows = world.db.query(
        "SELECT content FROM messages WHERE meeting_id = %s AND request_key = %s",
        (meeting_id, "race"),
    )
    if message_result["outcome"] == "accepted":
        assert rows == [("Racing note",)]
    else:
        assert rows == []

    # Once the closing owns the meeting, no new write can be admitted.
    assert world.append_message(meeting_id, key="after", content="After")[
        "outcome"
    ] == "meeting_closed"


def test_user_write_becomes_available_again_after_a_rejected_vote(
    world: ClosingWorld,
):
    meeting_id, _participant_id = world.seed_active_meeting()
    close = world.request(meeting_id, mode="vote")["closing"]
    assert world.append_message(meeting_id, key="during")["outcome"] == "meeting_closed"

    assert world.reject(close) is True
    assert world.append_message(meeting_id, key="after", content="Now")[
        "outcome"
    ] == "accepted"
