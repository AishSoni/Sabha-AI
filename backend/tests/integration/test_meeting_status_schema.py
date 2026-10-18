"""Regression: the meetings.status CHECK constraint must accept the full
application lifecycle (`active`, `voting`, `ended`, `archived`) on both fresh
and upgraded databases, and must keep rejecting unknown states.

Evidence: backend/supabase_schema.sql (original `status IN ('active',
'archived')`) rejects normal ending; models define all four states. Fix adds
an upgrade migration plus fresh-schema alignment; editing only CREATE
statements would not upgrade existing tables.
"""

import psycopg
import pytest
from pathlib import Path

MIGRATION_PATH = Path(__file__).resolve().parents[2] / "migrations" / "004_meeting_status_states.sql"

DECLARED_STATES = ["active", "voting", "ended", "archived"]


def _insert_status(db, status: str):
    with db.connect() as conn:
        return conn.execute(
            "INSERT INTO meetings (name, status) VALUES (%s, %s) RETURNING id, status",
            ("Status probe", status),
        ).fetchone()


def _count_meetings(db) -> int:
    return db.query("SELECT COUNT(*) FROM meetings")[0][0]


def apply_sql(db, sql: str):
    with db.connect() as conn:
        conn.execute(sql)


def test_fresh_schema_accepts_all_declared_states(disposable_db):
    for status in DECLARED_STATES:
        row = _insert_status(disposable_db, status)
        assert row[1] == status


def test_fresh_schema_still_rejects_unknown_states(disposable_db):
    with pytest.raises(psycopg.errors.CheckViolation):
        _insert_status(disposable_db, "deleted")


def test_upgrade_migration_expands_states_and_preserves_rows(legacy_db):
    # Seed real pre-existing data BEFORE the migration, exactly like a long
    # lived deployment would have.
    seeded_active = _insert_status(legacy_db, "active")
    seeded_archived = _insert_status(legacy_db, "archived")

    apply_sql(legacy_db, MIGRATION_PATH.read_text(encoding="utf-8"))

    # Pre-existing data survives the migration.
    assert _count_meetings(legacy_db) == 2
    states = {r[0] for r in legacy_db.query("SELECT status FROM meetings")}
    assert states == {"active", "archived"}
    assert seeded_active[1] == "active" and seeded_archived[1] == "archived"

    # Newly permitted lifecycle states now insert cleanly.
    for status in ["voting", "ended"]:
        assert _insert_status(legacy_db, status)[1] == status


def test_upgrade_migration_is_idempotent(legacy_db):
    apply_sql(legacy_db, MIGRATION_PATH.read_text(encoding="utf-8"))
    _insert_status(legacy_db, "voting")

    # Re-running the migration must not corrupt the constraint or error.
    apply_sql(legacy_db, MIGRATION_PATH.read_text(encoding="utf-8"))
    assert _insert_status(legacy_db, "ended")[1] == "ended"
    with pytest.raises(psycopg.errors.CheckViolation):
        _insert_status(legacy_db, "deleted")
