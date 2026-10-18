"""Regression: participant role capacity, persona pre-validation, atomic
meeting creation (finding: personas.subtitle VARCHAR(200) silently overflows
ai_participants.role VARCHAR(50)).

Behavior captured here:
- a long persona subtitle becomes the participant role losslessly, on fresh
  AND upgraded databases;
- unknown persona_ids fail BEFORE anything is persisted (today the meeting is
  created with those personas silently skipped);
- a failure while persisting participants rolls back the whole meeting
  creation (today: orphan meeting row).
"""

import json
from pathlib import Path

import pytest
import psycopg
from fastapi.testclient import TestClient

from app.models import MeetingCreate
from app.services.meeting_manager import MeetingManager
from main import app
from tests.doubles.supabase_stub import stub_for

MIGRATION_PATH = Path(__file__).resolve().parents[2] / "migrations" / "006_participant_role_capacity.sql"

LONG_SUBTITLE = "D" + ("x" * 179)  # 180 chars — fits personas.subtitle, overflows role VARCHAR(50)
PERSONA_ID = "33333333-3333-4333-8333-333333333333"
UNKNOWN_ID = "99999999-9999-4999-8999-999999999999"


def seed_persona(db, *, persona_id: str = PERSONA_ID, subtitle: str = LONG_SUBTITLE) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (persona_id, "Open Questioner", subtitle, "#22c55e"),
        )


def patch_manager(monkeypatch, db) -> None:
    stub = stub_for(db)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)


def table_count(db, table: str) -> int:
    return db.query(f"SELECT COUNT(*) FROM {table}")[0][0]


async def test_long_subtitle_becomes_participant_role_on_fresh_schema(disposable_db, monkeypatch):
    seed_persona(disposable_db)
    patch_manager(monkeypatch, disposable_db)

    meeting = await MeetingManager().create_meeting(
        MeetingCreate(name="Capacity probe", persona_ids=[PERSONA_ID])
    )

    assert meeting.participants, "persona should be materialized as a participant"
    assert meeting.participants[0].role == LONG_SUBTITLE
    # Persisted row keeps the full subtitle too (read via direct psycopg).
    row = disposable_db.query(
        "SELECT role FROM ai_participants WHERE meeting_id = %s",
        (meeting.id,),
    )[0]
    assert row[0] == LONG_SUBTITLE


async def test_upgraded_role_column_accepts_full_subtitles(legacy_db, monkeypatch):
    # Pre-existing persona on the legacy schema (role VARCHAR(50)).
    seed_persona(legacy_db)
    legacy_stub = stub_for(legacy_db)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: legacy_stub)

    migration_sql = MIGRATION_PATH.read_text(encoding="utf-8")
    with legacy_db.connect() as conn:
        conn.execute(migration_sql)

    meeting = await MeetingManager().create_meeting(
        MeetingCreate(name="Upgrade probe", persona_ids=[PERSONA_ID])
    )
    assert meeting.participants[0].role == LONG_SUBTITLE
    row = legacy_db.query(
        "SELECT role FROM ai_participants WHERE meeting_id = %s", (meeting.id,)
    )[0]
    assert row[0] == LONG_SUBTITLE


async def test_unknown_persona_ids_fail_before_anything_is_persisted(disposable_db, monkeypatch):
    seed_persona(disposable_db, subtitle="Short subtitle")
    patch_manager(monkeypatch, disposable_db)

    with pytest.raises(ValueError) as error:
        await MeetingManager().create_meeting(
            MeetingCreate(name="Validation probe", persona_ids=[PERSONA_ID, UNKNOWN_ID])
        )
    assert "Unknown personas" in str(error.value)

    # Nothing written: no orphan meeting, no orphan participants.
    assert table_count(disposable_db, "meetings") == 0
    assert table_count(disposable_db, "ai_participants") == 0


def test_api_rejects_unknown_personas_with_client_error(disposable_db, monkeypatch):
    seed_persona(disposable_db, subtitle="Short subtitle")
    patch_manager(monkeypatch, disposable_db)

    with TestClient(app) as client:
        response = client.post(
            "/api/meetings",
            json={"name": "Validation route probe", "persona_ids": [PERSONA_ID, UNKNOWN_ID]},
        )

    assert response.status_code == 422
    assert "Unknown personas" in response.json()["detail"]


def test_rollback_rpc_positive_path_creates_meeting_and_participants(disposable_db):
    """Positive RPC path first: the transactional writer exists and persists
    meeting + participants in one call. Today red = function not implemented."""
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (PERSONA_ID, "Valid persona", "Short subtitle", "#22c55e"),
        )

    valid = {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
        "meeting_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "Valid participant",
        "role": "Short subtitle",
        "system_prompt": "You are a fixture assistant.",
        "provider_config": {"provider": "", "model": "", "temperature": 0.7},
        "color": "#6366f1",
        "persona_id": PERSONA_ID,
        "created_at": "2026-01-01T00:00:00Z",
    }

    stub = stub_for(disposable_db)
    result = stub.rpc(
        "create_meeting_transaction",
        {
            "p_meeting": {
                "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "name": "Atomic probe",
                "agenda": "",
                "status": "active",
                "total_cost": 0.0,
                "created_at": "2026-01-01T00:00:00Z",
            },
            "p_participants": [valid],
        },
    ).execute()

    payload = result.data
    assert payload["meeting"]["name"] == "Atomic probe"
    assert payload["participants"][0]["role"] == "Short subtitle"
    assert payload["participants"][0]["provider_config"]["temperature"] == 0.7
    rows = disposable_db.query(
        "SELECT COUNT(*) FROM meetings UNION ALL SELECT COUNT(*) FROM ai_participants"
    )
    assert [int(r[0]) for r in rows] == [1, 1]


def test_participant_persistence_failure_rolls_back_meeting(disposable_db):
    """Drive a real mid-loop failure (dangling persona FK): the meeting row and
    every prior participant must be undone by the rollback. Today red = the
    stub function doesn't exist yet."""
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (PERSONA_ID, "Valid persona", "Short subtitle", "#22c55e"),
        )

    meeting_payload = {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "Atomicity probe",
        "agenda": "",
        "status": "active",
        "total_cost": 0.0,
        "created_at": "2026-01-01T00:00:00Z",
    }
    participants_payload = [
        {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
            "meeting_id": meeting_payload["id"],
            "name": "Valid participant",
            "role": "Short subtitle",
            "system_prompt": "You are a fixture assistant.",
            "provider_config": {"provider": "", "model": "", "temperature": 0.7},
            "color": "#6366f1",
            "persona_id": PERSONA_ID,
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
            "meeting_id": meeting_payload["id"],
            "name": "Broken participant",
            "role": "Broken",
            "system_prompt": "This persona_id is dangling.",
            "provider_config": {"provider": "", "model": "", "temperature": 0.7},
            "color": "#6366f1",
            "persona_id": UNKNOWN_ID,  # dangling FK — insert of participant #2 fails
            "created_at": "2026-01-01T00:00:00Z",
        },
    ]

    stub = stub_for(disposable_db)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        stub.rpc(
            "create_meeting_transaction",
            {"p_meeting": meeting_payload, "p_participants": participants_payload},
        ).execute()

    assert table_count(disposable_db, "meetings") == 0
    assert table_count(disposable_db, "ai_participants") == 0
