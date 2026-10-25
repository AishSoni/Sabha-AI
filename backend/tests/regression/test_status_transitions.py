"""Regression (reference-review finding, spec-02): meeting status updates are
last-writer-wins today (`update_meeting_status` unconditionally overwrites),
so two concurrent end-attempts both "succeed" and a summary can silently
overwrite another participant's transition.

Behavior captured here:
- a guarded CAS transition succeeds only when the meeting's status still
  matches the expected value;
- a transition loses when the meeting already moved on (no overwrite);
- an unknown meeting loses (no such row to update);
- two truly concurrent transitions racing for the same winner state produce
  exactly one winner and one loser (real Postgres serializes the UPDATEs).
"""

import asyncio
import uuid

import pytest

from app.modules.meetings.domain.models import MeetingStatus
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.supabase_meetings import build_default_meeting_service
from tests.doubles.supabase_stub import stub_for

MEETING_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01"
UNKNOWN_MEETING = "99999999-9999-4999-9999-999999999999"


def patch_manager(monkeypatch, disposable_db) -> MeetingService:
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.modules.meetings.infrastructure.supabase_meetings.get_supabase", lambda: stub)
    return build_default_meeting_service()


def seed_meeting(disposable_db, *, meeting_id: str = MEETING_A, status: str = "active") -> None:
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name, agenda, status, total_cost) "
            "VALUES (%s, %s, %s, %s, 0.0)",
            (meeting_id, "CAS probe", "", status),
        )


def persisted_status(disposable_db, meeting_id: str = MEETING_A) -> str:
    return disposable_db.query("SELECT status FROM meetings WHERE id = %s", (meeting_id,))[0][0]


async def test_transition_wins_when_status_matches(disposable_db, monkeypatch):
    seed_meeting(disposable_db, status="active")
    manager = patch_manager(monkeypatch, disposable_db)

    won = await manager.transition_meeting_status(
        MEETING_A, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
    )

    assert won is True
    assert persisted_status(disposable_db) == "voting"


async def test_transition_loses_when_status_moved_on(disposable_db, monkeypatch):
    """Second transition expecting the old status must lose — no overwrite."""
    seed_meeting(disposable_db, status="active")
    manager = patch_manager(monkeypatch, disposable_db)

    first = await manager.transition_meeting_status(
        MEETING_A, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
    )
    second = await manager.transition_meeting_status(
        MEETING_A, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
    )

    assert first is True
    assert second is False, "stale expectation must not clobber the moved-on status"
    assert persisted_status(disposable_db) == "voting"


async def test_transition_loses_for_unknown_meeting(disposable_db, monkeypatch):
    patch_manager(monkeypatch, disposable_db)

    won = await build_default_meeting_service().transition_meeting_status(
        UNKNOWN_MEETING, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
    )

    assert won is False


async def test_concurrent_transitions_produce_exactly_one_winner(disposable_db, monkeypatch):
    """Two genuinely concurrent CAS attempts for the same transition: real
    Postgres serializes them, so exactly one updates the row and the other
    observes zero updated rows."""
    seed_meeting(disposable_db, status="active")
    manager = patch_manager(monkeypatch, disposable_db)

    async def attempt():
        return await manager.transition_meeting_status(
            MEETING_A, expected_from=MeetingStatus.ACTIVE, next_status=MeetingStatus.VOTING
        )

    outcomes = await asyncio.gather(attempt(), attempt())

    assert sorted(outcomes, key=lambda x: (x is True))[-1] is True
    assert sorted(outcomes, key=lambda x: (x is True))[0] is False
    assert persisted_status(disposable_db) == "voting"
