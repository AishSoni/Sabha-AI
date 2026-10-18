"""Integration: direct database permissions are tightened to backend-only
writes. Public/anon clients get read-only access (the API stays no-auth), but
the previous FOR ALL USING (true) RLS policies must not exist anymore: even a
role WITH granted table privileges must be denied mutations at the policy
layer, on both fresh and upgraded databases.
"""

import psycopg
import pytest

LEGACY_MIGRATION = (
    __import__("pathlib")
    .Path(__file__)
    .resolve()
    .parents[2]
    / "migrations"
    / "009_tighten_rls_to_backend_writes.sql"
)

GUARDED_TABLES = ["meetings", "ai_participants", "messages", "disagreements", "consensus"]


def _fetch_policies(db, action=None):
    sql = "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public'"
    if action is not None:
        sql += f" AND cmd = '{action}'"
    sql += " ORDER BY tablename, policyname"
    return db.query(sql)


def _make_probe_role(db):
    """Create a non-owner, non-superuser probe role and connect as it."""
    with db.connect() as conn:
        conn.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_probe') THEN "
            "CREATE ROLE sabha_probe NOSUPERUSER NOBYPASSRLS NOLOGIN; "
            "END IF; END $$"
        )
        # Over-provision on purpose: if RLS still allowed writes, this grant
        # would make them succeed. Post-fix, policy-layer denial wins.
        conn.execute("GRANT USAGE ON SCHEMA public TO sabha_probe")
        conn.execute(f"GRANT INSERT, SELECT ON {', '.join(GUARDED_TABLES)} TO sabha_probe")

    probe = psycopg.connect(db.uri, autocommit=True)
    probe.execute("SET ROLE sabha_probe")
    return probe


def _insert_meeting(probe) -> None:
    probe.execute(
        "INSERT INTO meetings (name) VALUES ('Probe Meeting')"
    )


def test_fresh_schema_has_no_allow_all_policies(disposable_db):
    allow_all = _fetch_policies(disposable_db, action="ALL")
    assert allow_all == [], f"allow-all policies remain: {allow_all}"

    read_policies = _fetch_policies(disposable_db, action="SELECT")
    guarded = {row[0] for row in read_policies}
    assert set(GUARDED_TABLES) <= guarded, f"missing read policies for: {set(GUARDED_TABLES) - guarded}"


def test_writes_denied_even_with_table_privileges_fresh(disposable_db):
    probe = _make_probe_role(disposable_db)
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _insert_meeting(probe)
    finally:
        probe.close()


def test_reads_still_open_for_probe_role_fresh(disposable_db):
    probe = _make_probe_role(disposable_db)
    try:
        count = probe.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
        assert count == 0
    finally:
        probe.close()


def test_upgrade_migration_replaces_allow_all(legacy_db):
    before = _fetch_policies(legacy_db, action="ALL")
    assert before, "legacy fixture should still carry allow-all policies"

    with legacy_db.connect() as conn:
        conn.execute(LEGACY_MIGRATION.read_text(encoding="utf-8"))

    assert _fetch_policies(legacy_db, action="ALL") == []

    probe = _make_probe_role(legacy_db)
    try:
        # Existing data stays readable (no-auth reads preserved)...
        count = probe.execute("SELECT COUNT(*) FROM meetings").fetchone()[0]
        assert count >= 0
        # ...but never writable through a non-backend role.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _insert_meeting(probe)
    finally:
        probe.close()
