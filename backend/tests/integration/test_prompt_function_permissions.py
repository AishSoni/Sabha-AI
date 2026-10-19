"""Integration: prompt-function execution rights match the spec-04 contract.

The spec-04 audit (recorded with the exit gate) proved that every Sabha RPC
function carries Postgres' default EXECUTE-to-PUBLIC and that the persona
table family (personas, prompt_versions, persona_knowledge_stacks,
knowledge_stacks) has RLS disabled. On a hosted Supabase copy, default table
privileges would then let a browser client write those tables directly,
bypassing backend validation entirely.

Contract under test (migration 013 Persona prompt locks + function
permissions):
- with the hosted-shaped roles present, anon/authenticated are denied
  EXECUTE on the prompt RPCs even though the functions exist;
- the same roles are denied table WRITEs on the persona family even when
  table privileges are handed to them (policy-layer denial, mirroring the
  migration-009 contract for the meeting tables);
- reads stay open (the no-sign-in shared workspace is preserved) for both
  fresh and upgraded databases;
- the backend service role (BYPASSRLS on hosted) can execute the RPCs.
"""

from pathlib import Path

import psycopg
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]

MIGRATION_013 = BACKEND_ROOT / "migrations" / "013_persona_prompt_locks.sql"

# The prompt functions this slice owns (value allocation/save stay guarded by
# the same lock protocol but their EXECUTE posture changes identically).
GUARDED_FUNCTIONS = [
    ("activate_prompt_version", "uuid, integer"),
    ("create_prompt_version", "uuid, text, uuid, timestamptz"),
]

PERSONA_TABLES = ["personas", "prompt_versions", "persona_knowledge_stacks", "knowledge_stacks"]


def _apply_migration(db) -> None:
    assert MIGRATION_013.exists(), (
        "migration 013 does not exist yet — write it before this contract "
        "can pass (intended red for the permissions slice)"
    )
    db.execute(MIGRATION_013.read_text(encoding="utf-8"))


def _ensure_hosted_roles(db):
    """Create the hosted-Supabase-shaped roles the revokes target.

    service_role mirrors the hosted backend credential: NOLOGIN, BYPASSRLS.
    anon/authenticated mirror untrusted browser sessions.
    """
    db.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN "
        "CREATE ROLE anon NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN "
        "CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN "
        "CREATE ROLE service_role NOSUPERUSER BYPASSRLS NOLOGIN; END IF; "
        "END $$"
    )
    db.execute("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role")


def _probe(db, role: str) -> psycopg.Connection:
    """A fresh connection executing as the given (existing) role."""
    probe = psycopg.connect(db.info.dsn, autocommit=True)
    probe.execute(f"SET ROLE {role}")
    return probe


def _assert_execute_denied(probe, role: str) -> None:
    for fn, sig in GUARDED_FUNCTIONS:
        granted = probe.execute(
            "SELECT has_function_privilege(%s, %s)",
            (f"public.{fn}({sig})", "EXECUTE"),
        ).fetchone()[0]
        assert not granted, f"{role} still has EXECUTE on {fn}"


def _assert_table_write_denied(probe, role: str) -> None:
    # Hand out table privileges on purpose: the denial must come from the
    # policy layer, not from missing grants (mirrors the 009 probe design).
    with_db = psycopg.connect(db.info.dsn, autocommit=True)
    with_db.execute(
        f"GRANT INSERT, UPDATE, DELETE ON {', '.join(PERSONA_TABLES)} TO {role}"
    )
    with_db.close()

    persona_id = "99999999-9999-9999-9999-999999999999"
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        probe.execute(
            "INSERT INTO personas (id, name) VALUES (%s, 'Probe')", (persona_id,)
        )


def _assert_reads_open(probe) -> None:
    count = probe.execute("SELECT COUNT(*) FROM personas").fetchone()[0]
    assert count >= 0  # SELECT must simply succeed


def _assert_service_role_can_execute(probe) -> None:
    # BYPASSRLS + EXECUTE: the real backend credential signature.
    for fn, sig in GUARDED_FUNCTIONS:
        granted = probe.execute(
            "SELECT has_function_privilege(%s, %s)",
            (f"public.{fn}({sig})", "EXECUTE"),
        ).fetchone()[0]
        assert granted, f"backend service role lost EXECUTE on {fn}"


def test_fresh_schema_denies_anonymous_function_execute(disposable_db):
    _ensure_hosted_roles(disposable_db)
    _apply_migration(disposable_db)
    for role in ("anon", "authenticated"):
        probe = _probe(disposable_db, role)
        try:
            _assert_execute_denied(probe, role)
        finally:
            probe.close()


def test_fresh_schema_denies_anonymous_table_writes(disposable_db):
    _ensure_hosted_roles(disposable_db)
    _apply_migration(disposable_db)
    for role in ("anon", "authenticated"):
        probe = _probe(disposable_db, role)
        try:
            _assert_table_write_denied(probe, role)
            _assert_reads_open(probe)
        finally:
            probe.close()


def test_service_role_execution_survives(disposable_db):
    _ensure_hosted_roles(disposable_db)
    _apply_migration(disposable_db)
    probe = _probe(disposable_db, "service_role")
    try:
        _assert_service_role_can_execute(probe)
        _assert_reads_open(probe)
    finally:
        probe.close()


def test_upgrade_chain_gains_the_same_denials(legacy_db):
    with legacy_db.connect() as conn:
        _ensure_hosted_roles(conn)
        _apply_migration(conn)

    for role in ("anon", "authenticated"):
        probe = _probe(legacy_db, role)
        try:
            _assert_execute_denied(probe, role)
            _assert_table_write_denied(probe, role)
            _assert_reads_open(probe)
        finally:
            probe.close()
