"""Integration: prompt-function execution rights match the spec-04 contract.

The spec-04 audit (recorded with the exit gate) proved that every Sabha RPC
function carries Postgres' default EXECUTE-to-PUBLIC and that the persona
table family (personas, prompt_versions, persona_knowledge_stacks,
knowledge_stacks) has RLS disabled. On a hosted Supabase copy, default table
privileges would then let a browser client write those tables directly,
bypassing backend validation entirely.

Contract under test (migration 013 persona prompt locks + function
permissions, tightened by migration 030 database read isolation):
- with the hosted-shaped roles present, anon/authenticated are denied
  EXECUTE on the prompt RPCs even though the functions exist;
- the same roles are denied table WRITEs on the persona family even when
  table privileges are handed to them (policy-layer denial, mirroring the
  migration-009 contract for the meeting tables);
- anon/authenticated are denied live reads entirely after 030;
- the backend service role (BYPASSRLS on hosted) can read and execute the RPCs.

The migration-013-in-isolation test is historical evidence: applying 013 to
the legacy chain still produces its original read-open behaviour. The current
full chain ends closed because 030 runs after it.
"""

from pathlib import Path

import psycopg
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]

MIGRATION_013 = BACKEND_ROOT / "migrations" / "013_persona_prompt_locks.sql"

# The prompt functions this slice owns; every other RPC gains the same
# execution denial in migration 013, asserted through the shared role sweep.
GUARDED_FUNCTIONS = [
    ("activate_prompt_version", "uuid, integer"),
    ("create_prompt_version", "uuid, text, uuid, timestamptz"),
    ("replace_persona_stacks", "uuid, uuid[]"),
    ("create_meeting_transaction", "jsonb, jsonb"),
    ("commit_meeting_ending", "uuid, text, text"),
    ("record_inference_cost", "uuid, uuid, text, text, text, numeric"),
    ("increment_meeting_cost", "uuid, numeric"),
    ("claim_operation", "text, text"),
    ("publish_operation", "uuid, integer"),
]

PERSONA_TABLES = ["personas", "prompt_versions", "persona_knowledge_stacks", "knowledge_stacks"]


def _apply_migration(db, migration) -> None:
    assert migration.exists(), f"missing migration {migration.name}"
    with db.connect() as conn:
        conn.execute(migration.read_text(encoding="utf-8"))


def _ensure_hosted_roles(conn: psycopg.Connection):
    """Create the hosted-Supabase-shaped roles the revokes target.

    service_role mirrors the hosted backend credential: NOLOGIN, BYPASSRLS.
    anon/authenticated mirror untrusted browser sessions.
    """
    conn.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN "
        "CREATE ROLE anon NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN "
        "CREATE ROLE service_role NOSUPERUSER BYPASSRLS NOLOGIN; END IF; "
        "END $$"
    )
    conn.execute("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role")


def _probe(db, role: str) -> psycopg.Connection:
    """A fresh connection executing as the given (existing) role."""
    probe = psycopg.connect(db.uri, autocommit=True)
    probe.execute(f"SET ROLE {role}")
    return probe


def _assert_execute_denied(probe, role: str) -> None:
    for fn, _sig in GUARDED_FUNCTIONS:
        # Resolve the OID without schema-qualified text: after 030 the role has
        # no USAGE on public, and Postgres refuses to resolve 'public.fn(...)'.
        row = probe.execute(
            """
            SELECT p.oid
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = %s
            """,
            (fn,),
        ).fetchone()
        if row is None:
            # Upgrade chains may predate a function's introducing migration.
            continue
        granted = probe.execute(
            "SELECT has_function_privilege(%s::oid, 'EXECUTE')", (row[0],)
        ).fetchone()[0]
        assert not granted, f"{role} still has EXECUTE on {fn}"


def _assert_table_write_denied(db, probe, role: str) -> None:
    # Hand out schema and table privileges on purpose: the denial must come
    # from the policy layer, not from missing grants (mirrors the 009 probe
    # design). Migration 030 leaves RLS enabled with no policy.
    with db.connect() as conn:
        conn.execute(f"GRANT USAGE ON SCHEMA public TO {role}")
        conn.execute(
            f"GRANT INSERT, UPDATE, DELETE ON {', '.join(PERSONA_TABLES)} TO {role}"
        )

    persona_id = "99999999-9999-9999-9999-999999999999"
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        probe.execute(
            "INSERT INTO personas (id, name) VALUES (%s, 'Probe')", (persona_id,)
        )


def _assert_live_read_denied(probe, role: str) -> None:
    assert not probe.execute(
        "SELECT has_schema_privilege(%s, 'public', 'USAGE')", (role,)
    ).fetchone()[0]
    # Without USAGE the planner reports either a missing relation or a schema
    # privilege failure; both mean the live read is unreachable.
    with pytest.raises(
        (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
    ):
        probe.execute("SELECT COUNT(*) FROM personas")


def _assert_service_role_can_execute(probe) -> None:
    # BYPASSRLS + EXECUTE: the real backend credential signature.
    for fn, sig in GUARDED_FUNCTIONS:
        granted = probe.execute(
            "SELECT has_function_privilege(%s, %s)",
            (f"public.{fn}({sig})", "EXECUTE"),
        ).fetchone()[0]
        assert granted, f"backend service role lost EXECUTE on {fn}"


def test_fresh_schema_denies_anonymous_function_execute(disposable_db):
    for role in ("anon", "authenticated"):
        probe = _probe(disposable_db, role)
        try:
            _assert_execute_denied(probe, role)
        finally:
            probe.close()


def test_fresh_schema_denies_anonymous_reads(disposable_db):
    for role in ("anon", "authenticated"):
        probe = _probe(disposable_db, role)
        try:
            _assert_live_read_denied(probe, role)
        finally:
            probe.close()


def test_fresh_schema_denies_anonymous_table_writes(disposable_db):
    for role in ("anon", "authenticated"):
        probe = _probe(disposable_db, role)
        try:
            _assert_table_write_denied(disposable_db, probe, role)
        finally:
            probe.close()


def test_service_role_execution_survives(disposable_db):
    probe = _probe(disposable_db, "service_role")
    try:
        _assert_service_role_can_execute(probe)
        assert probe.execute("SELECT COUNT(*) FROM personas").fetchone()[0] >= 0
    finally:
        probe.close()


def test_migration_013_in_isolation_kept_historical_reads(legacy_db):
    """What 013 did on its own, before 030 closed the PUBLIC inheritance."""
    _ensure_hosted_roles_hosted_first(legacy_db)
    _apply_migration(legacy_db, MIGRATION_013)

    for role in ("anon", "authenticated"):
        probe = _probe(legacy_db, role)
        try:
            _assert_execute_denied(probe, role)
            _assert_table_write_denied(legacy_db, probe, role)
            assert probe.execute("SELECT COUNT(*) FROM personas").fetchone()[0] >= 0
        finally:
            probe.close()


def _ensure_hosted_roles_hosted_first(db) -> None:
    """Roles and schema usage must exist before the historical migration runs."""
    with db.connect() as conn:
        _ensure_hosted_roles(conn)
