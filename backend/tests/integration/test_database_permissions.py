"""Integration: the live database is backend-only after migration 030.

Anonymous, authenticated and plain unprivileged roles have no schema USAGE and
no table, sequence or function privileges on ``public``. RLS stays enabled with
no permissive policy, so even an accidental future grant cannot restore reads.
The service role keeps the live backend capability (DML plus RPC execution).

The pre-isolation chain is kept in the suite as evidence of what migrations 009
and 013 actually did: a role with no table grant at all still read every live
row through ``PUBLIC``. Migration 030 closes that inheritance, and the
historical tests stay green against the chain they describe.
"""

from pathlib import Path

import psycopg
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
LEGACY_MIGRATION = BACKEND_ROOT / "migrations" / "009_tighten_rls_to_backend_writes.sql"
ISOLATION_MIGRATION = BACKEND_ROOT / "migrations" / "030_database_read_isolation.sql"

GUARDED_TABLES = ["meetings", "ai_participants", "messages", "disagreements", "consensus"]
LIVE_TABLES = [
    "meetings",
    "ai_participants",
    "messages",
    "disagreements",
    "consensus",
    "personas",
    "prompt_versions",
    "persona_knowledge_stacks",
    "knowledge_stacks",
]
UNTRUSTED_ROLES = ("anon", "authenticated", "sabha_unprivileged")
PROTECTED_FUNCTIONS = [
    "increment_meeting_cost",
    "create_meeting_transaction",
    "publish_operation",
]


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


def _ensure_unprivileged_role(db) -> None:
    """A fresh role with the normal cluster defaults and no Sabha grants."""
    with db.connect() as conn:
        conn.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_unprivileged') THEN "
            "CREATE ROLE sabha_unprivileged NOSUPERUSER NOBYPASSRLS NOLOGIN; "
            "END IF; END $$"
        )


def _seed_live_sentinels(db) -> dict:
    """Live rows the untrusted roles must never see, plus a persona family."""
    with db.connect() as conn:
        meeting_id = conn.execute(
            "INSERT INTO meetings (name, agenda) "
            "VALUES ('Live sentinel meeting', 'restricted agenda') RETURNING id"
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO messages (meeting_id, sender_type, sender_name, content) "
            "VALUES (%s, 'user', 'Director', 'restricted message')",
            (meeting_id,),
        )
        persona_id = conn.execute(
            "INSERT INTO personas (name) VALUES ('Sentinel Persona') RETURNING id"
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO prompt_versions (persona_id, version, content) "
            "VALUES (%s, 1, 'restricted prompt')",
            (persona_id,),
        )
        stack_id = conn.execute(
            "INSERT INTO knowledge_stacks (name) VALUES ('Sentinel Stack') RETURNING id"
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO persona_knowledge_stacks (persona_id, stack_id) "
            "VALUES (%s, %s)",
            (persona_id, stack_id),
        )
    return {"meeting": meeting_id, "persona": persona_id, "stack": stack_id}


def _probe_role(db, role: str) -> psycopg.Connection:
    probe = psycopg.connect(db.uri, autocommit=True)
    probe.execute(f"SET ROLE {role}")
    return probe


def _table_privilege(db, role: str, relation: str, privilege: str) -> bool:
    rows = db.query(
        """
        SELECT has_table_privilege(%s, c.oid, %s)
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = %s
        """,
        (role, privilege, relation),
    )
    assert rows, f"relation public.{relation} not found"
    return rows[0][0]


def _function_privilege(db, role: str, function: str) -> bool:
    rows = db.query(
        """
        SELECT has_function_privilege(%s, p.oid, 'EXECUTE')
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = %s
        """,
        (role, function),
    )
    assert rows, f"function public.{function} not found"
    return rows[0][0]


def _assert_untrusted_role_denied(db, role: str) -> None:
    """No live read, write, DDL, internal read or RPC execution for a role."""
    assert not db.query(
        "SELECT has_schema_privilege(%s, 'public', 'USAGE')", (role,)
    )[0][0]
    assert not db.query(
        "SELECT has_schema_privilege(%s, 'public', 'CREATE')", (role,)
    )[0][0]

    for table in LIVE_TABLES:
        assert not _table_privilege(db, role, table, "SELECT"), table
        assert not _table_privilege(db, role, table, "INSERT,UPDATE,DELETE"), table
    for fn in PROTECTED_FUNCTIONS:
        assert not _function_privilege(db, role, fn), fn

    probe = _probe_role(db, role)
    try:
        for table in LIVE_TABLES:
            with pytest.raises(
                (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
            ):
                probe.execute(f"SELECT count(*) FROM public.{table}")

        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            probe.execute("INSERT INTO public.meetings (name) VALUES ('blocked')")
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            probe.execute("UPDATE public.meetings SET name = 'blocked'")
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            probe.execute("DELETE FROM public.meetings")
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            probe.execute("TRUNCATE public.meetings")

        # Internal table and RPC paths, not just the nine live table families.
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            probe.execute("SELECT count(*) FROM public.documents")
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedFunction)
        ):
            probe.execute("SELECT public.increment_meeting_cost(NULL, 1.0)")

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            probe.execute(
                f"CREATE TABLE public.sabha_denied_{role} (id integer)"
            )
    finally:
        probe.close()


def test_fresh_schema_has_no_permissive_policies(disposable_db):
    """Migration 030 removes the SELECT-true policies, not just the grants.

    RLS stays enabled on every live table, so a future accidental table grant
    still cannot restore all-row reads.
    """
    allow_all = _fetch_policies(disposable_db, action="ALL")
    assert allow_all == [], f"allow-all policies remain: {allow_all}"

    read_policies = _fetch_policies(disposable_db, action="SELECT")
    assert read_policies == [], f"permissive read policies remain: {read_policies}"


def test_writes_denied_even_with_table_privileges_fresh(disposable_db):
    probe = _make_probe_role(disposable_db)
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _insert_meeting(probe)
    finally:
        probe.close()


def test_full_chain_denies_every_untrusted_live_path(disposable_db):
    """Spec 12 matrix: anon, authenticated and a plain role are all outside."""
    _ensure_unprivileged_role(disposable_db)
    _seed_live_sentinels(disposable_db)
    for role in UNTRUSTED_ROLES:
        _assert_untrusted_role_denied(disposable_db, role)


def test_service_role_keeps_live_backend_capability(disposable_db):
    ids = _seed_live_sentinels(disposable_db)
    probe = _probe_role(disposable_db, "service_role")
    try:
        assert probe.execute(
            "SELECT count(*) FROM public.meetings"
        ).fetchone()[0] == 1
        assert probe.execute(
            "SELECT count(*) FROM public.persona_knowledge_stacks"
        ).fetchone()[0] == 1

        probe.execute(
            "UPDATE public.meetings SET agenda = 'backend update' WHERE id = %s",
            (ids["meeting"],),
        )
        probe.execute(
            "SELECT public.increment_meeting_cost(%s, 1.25)", (ids["meeting"],)
        )
        total = probe.execute(
            "SELECT total_cost FROM public.meetings WHERE id = %s",
            (ids["meeting"],),
        ).fetchone()[0]
        assert float(total) == pytest.approx(1.25)
    finally:
        probe.close()


def test_future_owner_objects_follow_safe_defaults(disposable_db):
    """Objects created after 030 stay closed unless explicitly granted."""
    _ensure_unprivileged_role(disposable_db)
    with disposable_db.connect() as conn:
        conn.execute(
            "CREATE TABLE public.spec12_future_probe "
            "(id integer PRIMARY KEY, name text NOT NULL)"
        )
        conn.execute(
            "INSERT INTO public.spec12_future_probe (id, name) VALUES (1, 'future')"
        )
        conn.execute(
            "CREATE VIEW public.spec12_future_probe_view AS "
            "SELECT id, name FROM public.spec12_future_probe"
        )
        conn.execute(
            "CREATE SEQUENCE public.spec12_future_probe_seq"
        )
        conn.execute(
            "CREATE FUNCTION public.spec12_future_probe_fn() RETURNS integer "
            "LANGUAGE sql AS 'SELECT 42'"
        )

    for role in UNTRUSTED_ROLES:
        assert not _table_privilege(
            disposable_db, role, "spec12_future_probe", "SELECT"
        )
        assert not _table_privilege(
            disposable_db, role, "spec12_future_probe_view", "SELECT"
        )
        assert not _function_privilege(
            disposable_db, role, "spec12_future_probe_fn"
        )
        probe = _probe_role(disposable_db, role)
        try:
            for relation in ("spec12_future_probe", "spec12_future_probe_view"):
                with pytest.raises(
                    (
                        psycopg.errors.InsufficientPrivilege,
                        psycopg.errors.UndefinedTable,
                    )
                ):
                    probe.execute(f"SELECT count(*) FROM public.{relation}")
            with pytest.raises(
                (
                    psycopg.errors.InsufficientPrivilege,
                    psycopg.errors.UndefinedFunction,
                )
            ):
                probe.execute("SELECT public.spec12_future_probe_fn()")
            with pytest.raises(
                (
                    psycopg.errors.InsufficientPrivilege,
                    psycopg.errors.UndefinedTable,
                )
            ):
                probe.execute("SELECT nextval('public.spec12_future_probe_seq')")
        finally:
            probe.close()

    service = _probe_role(disposable_db, "service_role")
    try:
        assert service.execute(
            "SELECT count(*) FROM public.spec12_future_probe_view"
        ).fetchone()[0] == 1
        service.execute(
            "INSERT INTO public.spec12_future_probe (id, name) VALUES (2, 'backend')"
        )
        assert service.execute(
            "SELECT public.spec12_future_probe_fn()"
        ).fetchone()[0] == 42
        assert service.execute(
            "SELECT nextval('public.spec12_future_probe_seq')"
        ).fetchone()[0] == 1
    finally:
        service.close()


def test_isolation_upgrade_preserves_live_data(pre_isolation_db):
    """Pre-030 data and IDs survive; the public read path does not."""
    ids = _seed_live_sentinels(pre_isolation_db)
    with pre_isolation_db.connect() as conn:
        conn.execute(ISOLATION_MIGRATION.read_text(encoding="utf-8"))

    assert pre_isolation_db.query(
        "SELECT name, agenda FROM meetings WHERE id = %s", (ids["meeting"],)
    ) == [("Live sentinel meeting", "restricted agenda")]
    assert pre_isolation_db.query(
        "SELECT name FROM personas WHERE id = %s", (ids["persona"],)
    ) == [("Sentinel Persona",)]
    assert pre_isolation_db.query(
        "SELECT content FROM prompt_versions WHERE persona_id = %s",
        (ids["persona"],),
    ) == [("restricted prompt",)]

    _ensure_unprivileged_role(pre_isolation_db)
    for role in UNTRUSTED_ROLES:
        _assert_untrusted_role_denied(pre_isolation_db, role)


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
