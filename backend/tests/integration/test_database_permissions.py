"""Integration: direct database permissions are tightened to backend-only
writes. Public/anon clients get no live access (the API stays no-auth), but the
previous FOR ALL USING (true) RLS policies must not exist anymore: even a role
WITH granted table privileges must be denied mutations at the policy layer, on
both fresh and upgraded databases.

The pre-isolation chain is kept in the suite as evidence of what migrations 009
and 013 actually did: a role with no table grant at all still read every live
row through ``PUBLIC``. Migration 030 closes that inheritance; the historical
test must stay green against the pre-030 chain.
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


def _make_probe_role(db, *, grant_tables: bool = True):
    """Create a non-owner, non-superuser probe role and connect as it."""
    with db.connect() as conn:
        conn.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_probe') THEN "
            "CREATE ROLE sabha_probe NOSUPERUSER NOBYPASSRLS NOLOGIN; "
            "END IF; END $$"
        )
        conn.execute("GRANT USAGE ON SCHEMA public TO sabha_probe")
        if grant_tables:
            # Over-provision on purpose: if RLS still allowed writes, this grant
            # would make them succeed. Post-fix, policy-layer denial wins.
            conn.execute(
                f"GRANT INSERT, SELECT ON {', '.join(GUARDED_TABLES)} TO sabha_probe"
            )

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


def test_public_grant_exposes_live_rows_before_isolation(pre_isolation_db):
    """Spec 12 starting evidence: zero table grants, full live reads.

    The probe role holds only schema USAGE. Its SELECT succeeds because every
    role inherits ``PUBLIC`` and migration 009 granted SELECT to ``PUBLIC`` on
    the live tables.
    """
    with pre_isolation_db.connect() as conn:
        meeting_id = conn.execute(
            "INSERT INTO meetings (name) VALUES ('Exposed sentinel') RETURNING id"
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO documents "
            "(meeting_id, file_name, file_type, file_size_bytes) "
            "VALUES (%s, 'internal.txt', 'text/plain', 6)",
            (meeting_id,),
        )

    probe = _make_probe_role(pre_isolation_db, grant_tables=False)
    try:
        explicit = pre_isolation_db.query(
            "SELECT table_name FROM information_schema.role_table_grants "
            "WHERE grantee = 'sabha_probe' AND table_schema = 'public'"
        )
        assert explicit == [], "probe must hold no explicit table grant"

        rows = probe.execute("SELECT name FROM meetings").fetchall()
        assert ("Exposed sentinel",) in rows
        assert probe.execute(
            "SELECT has_table_privilege('sabha_probe', 'public.meetings', 'SELECT')"
        ).fetchone()[0] is True

        # Migration 029 already closed internal tables, so the leak is specific
        # to the families that 009/013 granted to PUBLIC.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            probe.execute("SELECT file_name FROM documents")
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


INTERNAL_TABLES = ["documents", "inference_events", "pending_vector_cleanup"]


def test_every_public_table_enables_rls(disposable_db) -> None:
    """The advisor lint 'RLS disabled in public' must stay at zero.

    Migration 029 backfills the four tables that predated the internal-table
    convention; this sweep fails on any future table that skips the block.
    """
    unprotected = disposable_db.query(
        "SELECT c.relname FROM pg_class c "
        "JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND c.relkind = 'r' "
        "AND NOT c.relrowsecurity ORDER BY c.relname"
    )
    assert unprotected == [], f"public tables without RLS: {unprotected}"


def test_internal_tables_deny_rows_and_writes_behind_a_grant(
    disposable_db,
) -> None:
    """RLS with no policy is deny-all even for a role holding table privileges.

    The anonymous key is the credential the security advisor models, so the
    probe role is over-provisioned on purpose: the policy layer must still win.
    """
    with disposable_db.connect() as conn:
        conn.execute(
            "INSERT INTO pending_vector_cleanup (collection_name, target_kind) "
            "VALUES ('probe_collection', 'stack')"
        )
        conn.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_probe') THEN "
            "CREATE ROLE sabha_probe NOSUPERUSER NOBYPASSRLS NOLOGIN; "
            "END IF; END $$"
        )
        conn.execute("GRANT USAGE ON SCHEMA public TO sabha_probe")
        conn.execute(f"GRANT ALL ON {', '.join(INTERNAL_TABLES)} TO sabha_probe")

    probe = psycopg.connect(disposable_db.uri, autocommit=True)
    probe.execute("SET ROLE sabha_probe")
    try:
        # No policy means default-deny: the row exists but stays invisible.
        visible = probe.execute(
            "SELECT count(*) FROM pending_vector_cleanup"
        ).fetchone()[0]
        assert visible == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            probe.execute(
                "INSERT INTO pending_vector_cleanup (collection_name, target_kind) "
                "VALUES ('planted_collection', 'stack')"
            )
    finally:
        probe.close()
