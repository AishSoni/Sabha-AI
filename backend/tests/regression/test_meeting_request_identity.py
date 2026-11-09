"""Spec 36 / T04: meeting creation is admitted once per request key.

A committed creation whose response was lost must be recoverable by replaying
the same key. A different payload under that key is a conflict, not a second
meeting. These tests exercise the service, the HTTP surface, and the SQL
authority directly.
"""

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.domain.errors import MeetingRequestConflict
from app.modules.meetings.domain.models import MeetingCreate
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
from main import app
from tests.doubles.supabase_stub import stub_for

PERSONA_ID = "33333333-3333-4333-8333-333333333333"


def seed_persona(db) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (PERSONA_ID, "Open Questioner", "Short subtitle", "#22c55e"),
        )


def patch_manager(monkeypatch, db) -> MeetingService:
    service = build_meeting_service(stub_for(db))
    monkeypatch.setattr(
        app.state,
        "container",
        Container(
            prompt_catalog=object(),
            meeting_service=service,
            meeting_reads=service,
        ),
    )
    return service


def table_count(db, table: str) -> int:
    return db.query(f"SELECT COUNT(*) FROM {table}")[0][0]


async def test_same_request_key_recovers_the_committed_meeting(disposable_db, monkeypatch):
    seed_persona(disposable_db)
    service = patch_manager(monkeypatch, disposable_db)
    intent = MeetingCreate(
        name="Recovery probe",
        agenda="One meeting",
        persona_ids=[PERSONA_ID],
        request_key="intent-recovery-1",
    )

    first = await service.create_meeting(intent)
    replay = await service.create_meeting(intent)

    assert replay.id == first.id
    assert [p.id for p in replay.participants] == [p.id for p in first.participants]
    assert table_count(disposable_db, "meetings") == 1
    assert table_count(disposable_db, "ai_participants") == len(first.participants)


async def test_replay_does_not_reread_a_deleted_persona(disposable_db, monkeypatch):
    seed_persona(disposable_db)
    service = patch_manager(monkeypatch, disposable_db)
    intent = MeetingCreate(
        name="Late recovery probe",
        persona_ids=[PERSONA_ID],
        request_key="intent-recovery-2",
    )
    first = await service.create_meeting(intent)

    with disposable_db.connect() as conn:
        conn.execute("DELETE FROM personas WHERE id = %s", (PERSONA_ID,))

    replay = await service.create_meeting(intent)

    assert replay.id == first.id
    assert table_count(disposable_db, "meetings") == 1
    assert table_count(disposable_db, "ai_participants") == len(first.participants)
    # The participant snapshot survives even though the template is gone.
    assert replay.participants[0].name == first.participants[0].name


async def test_different_payload_with_the_same_key_conflicts(disposable_db, monkeypatch):
    seed_persona(disposable_db)
    service = patch_manager(monkeypatch, disposable_db)

    first = await service.create_meeting(
        MeetingCreate(
            name="Original intent",
            persona_ids=[PERSONA_ID],
            request_key="intent-conflict-1",
        )
    )

    with pytest.raises(MeetingRequestConflict):
        await service.create_meeting(
            MeetingCreate(
                name="Changed intent",
                persona_ids=[PERSONA_ID],
                request_key="intent-conflict-1",
            )
        )

    assert table_count(disposable_db, "meetings") == 1
    assert first.id


def test_route_replays_and_rejects_a_conflicting_payload(disposable_db, monkeypatch):
    patch_manager(monkeypatch, disposable_db)
    body = {
        "name": "Route recovery probe",
        "agenda": "One route intent",
        "request_key": "route-intent-1",
    }

    with TestClient(app) as client:
        first = client.post("/api/meetings", json=body)
        replay = client.post("/api/meetings", json=body)
        conflict = client.post(
            "/api/meetings", json={**body, "name": "Different route intent"}
        )

    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    assert conflict.status_code == 409
    assert "different meeting" in conflict.json()["detail"].lower()
    assert table_count(disposable_db, "meetings") == 1


def test_create_meeting_transaction_owns_replay_and_conflict(disposable_db):
    stub = stub_for(disposable_db)
    meeting = {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "SQL intent",
        "agenda": "",
        "status": "active",
        "total_cost": 0.0,
        "created_at": "2026-01-01T00:00:00Z",
        "request_key": "sql-intent-1",
        "request_fingerprint": "fingerprint-a",
    }

    created = stub.rpc(
        "create_meeting_transaction",
        {"p_meeting": meeting, "p_participants": []},
    ).execute().data
    replayed = stub.rpc(
        "create_meeting_transaction",
        {"p_meeting": meeting, "p_participants": []},
    ).execute().data
    conflict = stub.rpc(
        "create_meeting_transaction",
        {
            "p_meeting": {
                **meeting,
                "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                "request_fingerprint": "fingerprint-b",
            },
            "p_participants": [],
        },
    ).execute().data

    assert created["outcome"] == "created"
    assert replayed["outcome"] == "existing"
    assert replayed["meeting"]["id"] == meeting["id"]
    assert conflict["outcome"] == "conflict"
    assert table_count(disposable_db, "meetings") == 1
