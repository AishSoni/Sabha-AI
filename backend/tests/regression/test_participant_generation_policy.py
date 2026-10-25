"""Participant generation policy persistence (spec 06).

Meeting participants capture an EXPLICIT-ONLY generation policy at
creation: recorded numbers travel as recorded (zero temperature stays a
recorded zero), inherit markers never freeze into policy content, and
prior decisions stay segregated — legacy participant rows created
before this change keep their provider_config verbatim and gain NO
policy column content (no backfill, no reinterpretation of rows whose
provenance is unknown). The column is additive: policy NULL remains
honest provenance for pre-existing rows.
"""

from pathlib import Path

import psycopg
from psycopg.types.json import Json

from app.modules.meetings.domain.models import MeetingCreate
from app.services.meeting_manager import MeetingManager
from tests.doubles.supabase_stub import stub_for

MIGRATION_DIR = Path(__file__).resolve().parents[2] / "migrations"
# The stack-snapshot upgrade (participant shape today), then the policy
# column under test.
UPGRADE_MIGRATIONS = [
    "008_participant_stack_snapshot.sql",
    "016_participant_generation_policy.sql",
]

MEETING_ID = "22222222-2222-4222-8222-222222222222"
LEGACY_MEETING_ID = "22222222-2222-4222-8222-222222222221"
PARTICIPANT_ID = "11111111-1111-4111-8111-111111111111"
LEGACY_PARTICIPANT_ID = "11111111-1111-4111-8111-111111111112"
PERSONA_ID = "44444444-4444-4444-8444-444444444444"

LEGACY_CARRIER = {
    "provider": "openrouter",
    "model": "fixture/model",
    "temperature": 0.7,
    "max_tokens": 2048,
}


def _participant_payload() -> dict:
    return {
        "id": PARTICIPANT_ID,
        "name": "The Investor",
        "role": "investor",
        "system_prompt": "poke holes",
        "provider_config": dict(LEGACY_CARRIER),
        "color": "#22c55e",
        "persona_id": PERSONA_ID,
        "stack_ids": [],
        "generation_policy": {"temperature": 0.2, "max_tokens": 1500},
        "created_at": "2026-01-01T01:00:00",
    }


def _create_meeting(stub, participants: list[dict]):
    return stub.rpc(
        "create_meeting_transaction",
        {
            "p_meeting": {"id": MEETING_ID, "name": "Policy probe", "user_id": None},
            "p_participants": participants,
        },
    ).execute()


def _participant_row(db, participant_id: str):
    rows = db.query(
        "SELECT provider_config, generation_policy FROM ai_participants WHERE id = %s",
        (participant_id,),
    )
    assert rows, "participant row must exist"
    return rows[0]


def seed_persona(db, *, carrier: dict | None = None) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, provider_config) VALUES (%s, 'Probe Advisor', %s)",
            (PERSONA_ID, Json(carrier if carrier is not None else dict(LEGACY_CARRIER))),
        )


def test_the_meeting_rpc_persists_the_participant_policy(disposable_db):
    seed_persona(disposable_db)
    stub = stub_for(disposable_db)
    _create_meeting(stub, [_participant_payload()])

    carrier, policy = _participant_row(disposable_db, PARTICIPANT_ID)
    assert carrier == LEGACY_CARRIER, "the recorded carrier stays verbatim"
    assert policy == {"temperature": 0.2, "max_tokens": 1500}


def test_a_participant_payload_without_policy_content_writes_null(disposable_db):
    seed_persona(disposable_db)
    stub = stub_for(disposable_db)
    payload = _participant_payload()
    del payload["generation_policy"]
    _create_meeting(stub, [payload])

    carrier, policy = _participant_row(disposable_db, PARTICIPANT_ID)
    assert carrier == LEGACY_CARRIER
    assert policy is None


async def test_created_meeting_participants_carry_a_policy_on_the_fresh_path(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, provider_config) VALUES (%s, 'Probe Advisor', %s)",
            (PERSONA_ID, Json({"provider": "openrouter", "temperature": 0.2})),
        )

    meeting = await MeetingManager().create_meeting(
        MeetingCreate(name="Policy fresh probe", persona_ids=[PERSONA_ID])
    )

    carrier, policy = _participant_row(disposable_db, meeting.participants[0].id)
    assert carrier == {"provider": "openrouter", "temperature": 0.2}
    assert policy == {"provider": "openrouter", "temperature": 0.2}


def test_legacy_participants_keep_their_carrier_and_stay_without_policy_content(legacy_db):
    """Rows created before the policy column gain no content: NULL stays
    legacy provenance, and later assignments keep their snapshot values
    verbatim (no backfill, no reinterpretation)."""
    with legacy_db.connect() as conn:
        conn.execute(
            "INSERT INTO meetings (id, name, agenda, status) VALUES (%s, 'Legacy room', '', 'active')",
            (LEGACY_MEETING_ID,),
        )
        conn.execute(
            """
            INSERT INTO ai_participants
                (id, meeting_id, name, role, system_prompt, provider_config, color, persona_id, created_at)
            VALUES (%s, %s, 'The Investor', 'Investor', 'legacy prompt', %s, '#22c55e', NULL, '2025-01-01T00:00:00')
            """,
            (LEGACY_PARTICIPANT_ID, LEGACY_MEETING_ID, Json(LEGACY_CARRIER)),
        )
        for migration_name in UPGRADE_MIGRATIONS:
            conn.execute((MIGRATION_DIR / migration_name).read_text(encoding="utf-8"))

    carrier, policy = _participant_row(legacy_db, LEGACY_PARTICIPANT_ID)
    assert carrier == LEGACY_CARRIER, "legacy carrier values stay verbatim after upgrade"
    assert policy is None, "legacy rows gain no policy content"
