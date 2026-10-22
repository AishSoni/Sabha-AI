"""Closing persistence contract (spec 08).

The closing tables, archive overlay, and ledger honesty columns are
schema-level promises shared by every adapter. These tests execute
against a real disposable Postgres, including the upgrade path that
resolves legacy ``archived`` rows and backfills old ledger rows.
"""

from __future__ import annotations

from pathlib import Path

import psycopg
import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2] / "migrations" / "020_meeting_closing_schema.sql"
)

ENDING_MARKER = "📋 **MEETING ENDED**"


def apply_migration(db) -> None:
    with db.connect() as conn:
        conn.execute(MIGRATION_PATH.read_text(encoding="utf-8"))


def seed_meeting(db, status: str = "active", name: str = "Contract meeting") -> str:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES (%s, %s) RETURNING id",
            (name, status),
        ).fetchone()
    return str(row[0])


def seed_system_message(db, meeting_id: str, content: str) -> None:
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO messages (meeting_id, sender_type, sender_name, content)
            VALUES (%s, 'system', 'System', %s)
            """,
            (meeting_id, content),
        )


def seed_participant(db, meeting_id: str, name: str = "The Investor") -> str:
    with db.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO ai_participants (meeting_id, name, role, system_prompt)
            VALUES (%s, %s, 'Investor', 'You are the investor.')
            RETURNING id
            """,
            (meeting_id, name),
        ).fetchone()
    return str(row[0])


def insert_closing(
    db,
    meeting_id: str,
    *,
    stage: str = "summarizing",
    request_key: str = "close-contract",
    mode: str = "vote",
    from_status: str = "active",
) -> str:
    with db.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO meeting_closings
                (meeting_id, request_key, mode, stage, from_status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (meeting_id, request_key, mode, stage, from_status),
        ).fetchone()
    return str(row[0])


def columns(db, table: str) -> set[str]:
    return {
        row[0]
        for row in db.query(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table,),
        )
    }


def test_fresh_schema_carries_closing_columns_and_archive_overlay(disposable_db):
    assert {"archived_at"} <= columns(disposable_db, "meetings")
    assert {
        "id",
        "meeting_id",
        "request_key",
        "mode",
        "stage",
        "failed_from_stage",
        "from_status",
        "summary_settings",
        "summary_attempt_id",
        "summary_attempt_number",
        "summary_attempt_lease_expires_at",
        "summary_text",
        "summary_message_id",
        "error_code",
        "error_message",
        "completed_at",
    } <= columns(disposable_db, "meeting_closings")
    assert {
        "closing_id",
        "participant_id",
        "status",
        "attempt_id",
        "attempt_number",
        "attempt_lease_expires_at",
        "vote",
        "reason",
        "usage",
        "usage_kind",
        "price_kind",
        "estimated_cost",
        "reported_cost",
    } <= columns(disposable_db, "closing_votes")
    assert {"usage_kind", "price_kind", "reported_cost"} <= columns(
        disposable_db, "inference_events"
    )


def test_one_open_and_one_completed_closing_per_meeting(disposable_db):
    meeting_id = seed_meeting(disposable_db)
    insert_closing(disposable_db, meeting_id, stage="draining", request_key="a")

    with pytest.raises(psycopg.errors.UniqueViolation):
        insert_closing(disposable_db, meeting_id, stage="summarizing", request_key="b")

    # Failed is still recoverable, therefore still open.
    with disposable_db.connect() as conn:
        conn.execute(
            "UPDATE meeting_closings SET stage = 'failed' WHERE meeting_id = %s",
            (meeting_id,),
        )
    with pytest.raises(psycopg.errors.UniqueViolation):
        insert_closing(disposable_db, meeting_id, stage="voting", request_key="c")

    # A terminal operation no longer blocks a new attempt...
    with disposable_db.connect() as conn:
        conn.execute(
            "UPDATE meeting_closings SET stage = 'rejected' WHERE meeting_id = %s",
            (meeting_id,),
        )
    insert_closing(disposable_db, meeting_id, stage="voting", request_key="d")

    # ...but only one operation can ever complete the ending.
    with disposable_db.connect() as conn:
        conn.execute(
            "UPDATE meeting_closings SET stage = 'completed' WHERE request_key = 'd'"
        )
    with pytest.raises(psycopg.errors.UniqueViolation):
        with disposable_db.connect() as conn:
            conn.execute(
                "UPDATE meeting_closings SET stage = 'completed' WHERE request_key = 'a'"
            )


def test_votes_are_unique_per_participant_and_closing(disposable_db):
    meeting_id = seed_meeting(disposable_db)
    closing_id = insert_closing(disposable_db, meeting_id)
    participant_id = seed_participant(disposable_db, meeting_id)

    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO closing_votes (closing_id, participant_id)
            VALUES (%s, %s)
            """,
            (closing_id, participant_id),
        )

    with pytest.raises(psycopg.errors.UniqueViolation):
        with disposable_db.connect() as conn:
            conn.execute(
                """
                INSERT INTO closing_votes (closing_id, participant_id)
                VALUES (%s, %s)
                """,
                (closing_id, participant_id),
            )


def test_upgrade_resolves_legacy_archived_rows(disposable_db):
    ended_id = seed_meeting(disposable_db, "archived", "Archived after ending")
    seed_system_message(disposable_db, ended_id, f"{ENDING_MARKER}\n\nDone.")
    open_id = seed_meeting(disposable_db, "archived", "Archived while open")
    active_id = seed_meeting(disposable_db, "active", "Untouched")

    apply_migration(disposable_db)

    rows = dict(
        disposable_db.query("SELECT id::text, status FROM meetings")
    )
    archived = {
        row[0]
        for row in disposable_db.query(
            "SELECT id::text FROM meetings WHERE archived_at IS NOT NULL"
        )
    }
    assert rows[ended_id] == "ended"
    assert rows[open_id] == "active"
    assert rows[active_id] == "active"
    assert archived == {ended_id, open_id}


def test_upgrade_backfills_ledger_honesty(disposable_db):
    meeting_id = seed_meeting(disposable_db)

    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO inference_events (id, meeting_id, purpose, provider, model, estimated_cost)
            VALUES
                (gen_random_uuid(), %(m)s, 'vote', 'openrouter', 'm', 0.0),
                (gen_random_uuid(), %(m)s, 'vote', 'ollama', 'm', 0.0),
                (gen_random_uuid(), %(m)s, 'vote', 'openrouter', 'm', 0.25)
            """,
            {"m": meeting_id},
        )

    apply_migration(disposable_db)

    rows = disposable_db.query(
        "SELECT usage_kind, price_kind FROM inference_events ORDER BY provider, estimated_cost"
    )
    # Unknown usage is never silently presented as a measured amount.
    assert rows[0] == ("unknown", "zero_local")
    assert rows[1] == ("unknown", "unpriced")
    assert rows[2] == ("unknown", "metered")

    # A known usage payload is reported, not estimated.
    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO inference_events
                (id, meeting_id, purpose, provider, model, usage, usage_kind, estimated_cost, price_kind)
            VALUES (gen_random_uuid(), %s, 'vote', 'openrouter', 'm', '{"prompt_tokens": 1}', NULL, 0.0, NULL)
            """,
            (meeting_id,),
        )
    apply_migration(disposable_db)
    assert disposable_db.query(
        "SELECT usage_kind FROM inference_events WHERE usage IS NOT NULL"
    ) == [("reported",)]


def test_migration_is_idempotent(disposable_db):
    meeting_id = seed_meeting(disposable_db)
    insert_closing(disposable_db, meeting_id, stage="failed")

    apply_migration(disposable_db)
    apply_migration(disposable_db)

    assert disposable_db.query("SELECT COUNT(*) FROM meeting_closings")[0][0] == 1
