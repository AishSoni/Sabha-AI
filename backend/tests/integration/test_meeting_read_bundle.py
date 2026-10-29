"""The consolidated meeting bundle must preserve the old read shape exactly."""

from __future__ import annotations

import pytest

from app.modules.meetings.domain.models import (
    MeetingCreate,
    MessageCreate,
    SenderType,
)
from app.modules.meetings.infrastructure.supabase_meetings import (
    build_meeting_service,
)
from tests.doubles.supabase_stub import stub_for

PERSONA_ID = "11111111-1111-4111-8111-111111111111"


def _seed_persona(db) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (PERSONA_ID, "Open Questioner", "analyst", "#22c55e"),
        )


@pytest.mark.asyncio
async def test_bundle_returns_participants_and_messages_in_sequence_order(disposable_db):
    _seed_persona(disposable_db)
    service = build_meeting_service(stub_for(disposable_db))

    meeting = await service.create_meeting(
        MeetingCreate(name="Bundle probe", persona_ids=[PERSONA_ID])
    )
    await service.save_message(
        MessageCreate(
            meeting_id=meeting.id,
            content="First",
            sender_type=SenderType.USER,
            sender_name="Director",
        )
    )
    await service.save_message(
        MessageCreate(
            meeting_id=meeting.id,
            content="Second",
            sender_type=SenderType.AI,
            sender_name="Open Questioner",
        )
    )

    loaded = await service.get_meeting(meeting.id)

    assert loaded is not None
    assert [participant.name for participant in loaded.participants] == [
        "Open Questioner"
    ]
    assert [message.content for message in loaded.messages] == ["First", "Second"]
    sequences = [message.sequence for message in loaded.messages]
    assert sequences == sorted(sequences)


@pytest.mark.asyncio
async def test_bundle_projects_archived_at_as_archived_status(disposable_db):
    _seed_persona(disposable_db)
    service = build_meeting_service(stub_for(disposable_db))
    meeting = await service.create_meeting(
        MeetingCreate(name="Archive probe", persona_ids=[PERSONA_ID])
    )
    with disposable_db.connect() as conn:
        conn.execute(
            "UPDATE meetings SET archived_at = now() WHERE id = %s", (meeting.id,)
        )

    loaded = await service.get_meeting(meeting.id)

    assert loaded is not None
    assert loaded.status.value == "archived"


@pytest.mark.asyncio
async def test_bundle_returns_none_for_an_unknown_meeting(disposable_db):
    service = build_meeting_service(stub_for(disposable_db))

    assert (
        await service.get_meeting("11111111-2222-4333-8444-555555555555") is None
    )
