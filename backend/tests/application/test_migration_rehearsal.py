"""Migration rehearsal: fresh installs and legacy upgrades preserve IDs,
messages and the cost baseline; invalid states and broken ownership mappings
are reported before enforcement (P04 TEST10, B-04 closure).

Runs against sqlite using the same statement order as
migrations/004_meeting_lifecycle.sql (Postgres). The Postgres file itself is
additionally asserted to carry the repaired status constraint.
"""

import sqlite3

import pytest

from app.modules.meetings.domain import (
    ArchiveRestoreError,
    require_unarchive_target,
)
from app.modules.meetings.migration import audit_meetings

LEGACY_SCHEMA = """
CREATE TABLE meetings (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, agenda TEXT DEFAULT '',
    user_id TEXT, status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    total_cost REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE messages (
    id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, content TEXT NOT NULL,
    estimated_cost REAL NOT NULL DEFAULT 0
);
"""

UPGRADE_004 = """
-- sqlite rehearsal mirrors 004: recreate with the repaired CHECK and provenance.
CREATE TABLE meetings_new (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, agenda TEXT DEFAULT '',
    user_id TEXT, status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'voting', 'ended', 'archived')),
    archived_from TEXT, total_cost REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
);
INSERT INTO meetings_new (id, name, agenda, user_id, status, archived_from,
                          total_cost, created_at)
    SELECT id, name, agenda, user_id, status,
           CASE WHEN status = 'archived' THEN 'unknown' ELSE NULL END,
           total_cost, created_at FROM meetings;
DROP TABLE meetings;
ALTER TABLE meetings_new RENAME TO meetings;
CREATE TABLE queue_entries (
    entry_id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, owner_id TEXT NOT NULL,
    seq INTEGER NOT NULL, content TEXT NOT NULL, revision INTEGER NOT NULL
        DEFAULT 1, state TEXT NOT NULL DEFAULT 'pending', idempotency_key TEXT
        NOT NULL DEFAULT '', message_id TEXT,
    UNIQUE (meeting_id, seq)
);
CREATE TABLE ending_attempts (
    attempt_id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'in_progress',
    summary TEXT, UNIQUE (meeting_id, idempotency_key)
);
"""


def _legacy_db():
    conn = sqlite3.connect(":memory:")
    conn.executescript(LEGACY_SCHEMA)
    conn.executemany(
        "INSERT INTO meetings (id, name, agenda, user_id, status, total_cost) "
        "VALUES (?,?,?,?,?,?)",
        [("m-active", "A", "ship", "owner-1", "active", 1.25),
         ("m-arch", "B", "old", "owner-2", "archived", 0.5),
         ("m-orphan", "C", "legacy", None, "active", 0.0)],
    )
    conn.executemany(
        "INSERT INTO messages (id, meeting_id, content, estimated_cost) "
        "VALUES (?,?,?,?)",
        [("msg-1", "m-active", "hello", 0.01),
         ("msg-2", "m-active", "world", 0.02)])
    return conn


def _rows(conn):
    cols = [c[1] for c in conn.execute("PRAGMA table_info(meetings)").fetchall()]
    return [dict(zip(cols, r)) for r in conn.execute("SELECT * FROM meetings")]


def test_legacy_status_constraint_rejects_voting_before_upgrade():
    conn = _legacy_db()
    with pytest.raises(Exception):
        conn.execute(
            "INSERT INTO meetings (id, name, user_id, status) "
            "VALUES ('m-bad', 'X', 'o', 'voting')")


def test_upgrade_preserves_ids_messages_and_cost_baseline():
    conn = _legacy_db()
    conn.executescript(UPGRADE_004)
    ids = sorted(r[0] for r in conn.execute("SELECT id FROM meetings"))
    assert ids == ["m-active", "m-arch", "m-orphan"]
    assert conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 2
    assert conn.execute(
        "SELECT total_cost FROM meetings WHERE id='m-active'").fetchone()[0] == 1.25
    # Repaired constraint now admits the full lifecycle.
    conn.execute(
        "INSERT INTO meetings (id, name, user_id, status) "
        "VALUES ('m-v', 'V', 'o', 'voting')")
    conn.execute(
        "UPDATE meetings SET status='ended' WHERE id='m-v'")
    # Historical archived rows keep explicit unknown provenance.
    assert conn.execute(
        "SELECT archived_from FROM meetings WHERE id='m-arch'").fetchone()[0] == "unknown"
    assert conn.execute(
        "SELECT archived_from FROM meetings WHERE id='m-active'").fetchone()[0] is None


def test_audit_reports_before_enforcement_and_blocks_unknown_restore():
    conn = _legacy_db()
    rows = _rows(conn) + [{"id": "m-mystery", "status": "summarized",
                           "user_id": "o"}]
    report = audit_meetings(rows)
    assert report["total"] == 4
    assert report["invalid_states"] == [{"id": "m-mystery", "status": "summarized"}]
    assert report["ownerless_quarantined"] == ["m-orphan"]
    assert report["archived_unknown_prior"] == ["m-arch"]
    assert report["clean"] is False
    with pytest.raises(ArchiveRestoreError):
        require_unarchive_target(None)
    # Legacy archived rows backfilled as unknown stay unrestorable.
    upgraded = _rows(_legacy_db_with_upgrade())
    unknown = [r for r in upgraded if r["id"] == "m-arch"][0]
    assert unknown["archived_from"] == "unknown"


def _legacy_db_with_upgrade():
    conn = _legacy_db()
    conn.executescript(UPGRADE_004)
    return conn


def test_postgres_migration_carries_repaired_status_constraint():
    from pathlib import Path

    sql = (Path(__file__).parent.parent.parent
           / "migrations" / "004_meeting_lifecycle.sql").read_text()
    assert "'voting'" in sql and "'ended'" in sql
    assert "meetings_status_check" in sql
    assert "archived_from" in sql
    assert "queue_entries" in sql and "ending_attempts" in sql
    assert "execution_leases" in sql and "usage_ledger" in sql
    assert "commit_ending_attempt" in sql and "dispatch_queue_entry" in sql
    assert "create_meeting_with_participants" in sql
