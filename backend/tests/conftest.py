"""Shared fixtures and environment setup for the Sabha backend test suite.

Spec 01 prerequisite contracts (specs/reference-review-evidence-and-fixtures.md):
- reproducible local setup with synthetic credentials only (never live services)
- disposable Postgres instances for fresh/upgrade schema tests
- deterministic provider/embedding transports (see tests/doubles)
- no paid inference is ever required

Test runners were configured after verifying the checkout contains no real
test sources (only stale __pycache__ bytecode); this conftest is part of the
rebuilt-from-source suite.
"""

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

# --- Synthetic credential environment (must run before any app import) ----
# pydantic-settings gives environment variables higher precedence than any
# developer-local `.env` file, so seeded values keep tests deterministic and
# guaranteed not to reach live services or real operator keys.
_SYNTHETIC_ENV = {
    "SUPABASE_URL": "http://127.0.0.1:54321",  # never contacted unless a test explicitly does
    "SUPABASE_KEY": "fixture-anon-key",
    "SUPABASE_SERVICE_KEY": "fixture-service-key",
    # Spec-22 operator admission. Test suites run with the gate installed;
    # denial suites opt out with ``pytest.mark.real_access``.
    "OPERATOR_USER_ID": "11111111-1111-4111-8111-111111111111",
    "SUPABASE_AUTH_PUBLISHABLE_KEY": "fixture-publishable-key",
    "OPENROUTER_API_KEY": "",
    "GEMINI_API_KEY": "",
    "OPENAI_API_KEY": "",
    "COHERE_API_KEY": "",
    "QDRANT_API_KEY": "",
    "DEFAULT_LLM_PROVIDER": "ollama",
    # Background turn claims are opt-in in tests; route/runner tests start a
    # runner explicitly so claim/observation assertions stay deterministic.
    "TURN_RUNNER_ENABLED": "false",
    # Spec-20 warm-up would otherwise reach the replay database configured in
    # a developer's `.env` during every embedded-app test.
    "REPLAY_CACHE_WARM_ENABLED": "false",
}
for _key, _value in _SYNTHETIC_ENV.items():
    os.environ.setdefault(_key, _value)

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# --- Database schema files (fresh-application order) -----------------------
SCHEMA_FILES = [
    BACKEND_ROOT / "supabase_schema.sql",
    BACKEND_ROOT / "migrations" / "002_personas.sql",
    BACKEND_ROOT / "migrations" / "003_knowledge_stacks.sql",
    BACKEND_ROOT / "migrations" / "004_meeting_status_states.sql",
    BACKEND_ROOT / "migrations" / "005_persona_stack_replacement.sql",
    BACKEND_ROOT / "migrations" / "006_participant_role_capacity.sql",
    BACKEND_ROOT / "migrations" / "007_prompt_version_activation.sql",
    BACKEND_ROOT / "migrations" / "008_participant_stack_snapshot.sql",
    BACKEND_ROOT / "migrations" / "009_tighten_rls_to_backend_writes.sql",
    BACKEND_ROOT / "migrations" / "010_atomic_meeting_close.sql",
    BACKEND_ROOT / "migrations" / "011_inference_accounting.sql",
    BACKEND_ROOT / "migrations" / "012_pending_vector_cleanup.sql",
    BACKEND_ROOT / "migrations" / "013_persona_prompt_locks.sql",
    BACKEND_ROOT / "migrations" / "014_operations_primitive.sql",
    BACKEND_ROOT / "migrations" / "015_persona_catalog_transactions.sql",
    BACKEND_ROOT / "migrations" / "016_participant_generation_policy.sql",
    BACKEND_ROOT / "migrations" / "017_message_effective_generation.sql",
    BACKEND_ROOT / "migrations" / "018_turn_queue_schema.sql",
    BACKEND_ROOT / "migrations" / "019_turn_queue_rpcs.sql",
    BACKEND_ROOT / "migrations" / "020_meeting_closing_schema.sql",
    BACKEND_ROOT / "migrations" / "021_closing_lifecycle_rpcs.sql",
    BACKEND_ROOT / "migrations" / "022_closing_vote_checkpoints.sql",
    BACKEND_ROOT / "migrations" / "023_closing_summary_checkpoints.sql",
    BACKEND_ROOT / "migrations" / "024_archive_turn_guards.sql",
    BACKEND_ROOT / "migrations" / "025_durable_knowledge.sql",
    BACKEND_ROOT / "migrations" / "026_knowledge_cleanup_rpcs.sql",
    BACKEND_ROOT / "migrations" / "027_parent_knowledge_cleanup.sql",
    BACKEND_ROOT / "migrations" / "028_system_ai_settings.sql",
    BACKEND_ROOT / "migrations" / "029_internal_table_rls.sql",
    BACKEND_ROOT / "migrations" / "030_database_read_isolation.sql",
    BACKEND_ROOT / "migrations" / "031_pdf_extraction_provenance.sql",
    BACKEND_ROOT / "migrations" / "032_replay_package.sql",
    BACKEND_ROOT / "migrations" / "033_meeting_read_bundle.sql",
    BACKEND_ROOT / "migrations" / "034_persona_snapshot_batch.sql",
    BACKEND_ROOT / "migrations" / "035_knowledge_ingestion_read.sql",
    BACKEND_ROOT / "migrations" / "036_batched_turn_events.sql",
    BACKEND_ROOT / "migrations" / "037_turn_queue_active_window.sql",
    BACKEND_ROOT / "migrations" / "038_message_request_key_conflict.sql",
]

# The chain immediately before Spec 12's isolation migration. Tests use this
# to reproduce the inherited-PUBLIC leak that the forward migration closes,
# independently of the current full history.
PRE_ISOLATION_SCHEMA_FILES = [
    path
    for path in SCHEMA_FILES
    if path.name == "supabase_schema.sql" or path.name < "030_"
]

# Phase 1 shipped before migration tracking existed. The baseline plus
# 002..013 is the exact schema of an untracked Phase 1 deployment; spec-11
# adoption tests build this state and then adopt the remaining history.
PHASE_ONE_SCHEMA_FILES = [
    BACKEND_ROOT / "supabase_schema.sql",
    *[
        BACKEND_ROOT / "migrations" / name
        for name in (
            "002_personas.sql",
            "003_knowledge_stacks.sql",
            "004_meeting_status_states.sql",
            "005_persona_stack_replacement.sql",
            "006_participant_role_capacity.sql",
            "007_prompt_version_activation.sql",
            "008_participant_stack_snapshot.sql",
            "009_tighten_rls_to_backend_writes.sql",
            "010_atomic_meeting_close.sql",
            "011_inference_accounting.sql",
            "012_pending_vector_cleanup.sql",
            "013_persona_prompt_locks.sql",
        )
    ],
]

# Schema as it existed before the lifecycle-constraint fix. Upgrade-path tests
# build this state, seed pre-existing rows against it, then apply the new
# migration — proving upgraded deployments behave like fresh ones.
LEGACY_SCHEMA_FILES = [
    BACKEND_ROOT / "tests" / "fixtures" / "schema" / "supabase_schema_legacy.sql",
    BACKEND_ROOT / "migrations" / "002_personas.sql",
    BACKEND_ROOT / "migrations" / "003_knowledge_stacks.sql",
]

# Real deployment targets (Supabase) provide the auth schema; embedded test
# Postgres needs a minimal stub so the schema's FK reference resolves.
AUTH_STUB_SQL = """
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOSUPERUSER NOBYPASSRLS NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOSUPERUSER BYPASSRLS NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
"""


def _pg_home() -> str:
    """Parent directory for embedded Postgres clusters (outside the repo).

    Defaults under C:/conda_tmp per the environment guidance; override with
    SABHA_TEST_PG_HOME when needed. Each session/worker gets its own ephemeral
    cluster beneath this directory so parallel workers never share a server.
    """
    return os.environ.get("SABHA_TEST_PG_HOME", r"C:\conda_tmp\opencode\sabha-test-pg")


def _pg_run_dir() -> str:
    """Return a fresh pgdata directory for this process.

    ``pytest-xdist`` workers run in separate processes, so deriving the path
    from ``PYTEST_XDIST_WORKER`` keeps their clusters isolated. A random suffix
    also prevents a stale directory from a crashed run from being reused.
    """
    base = Path(_pg_home())
    base.mkdir(parents=True, exist_ok=True)
    worker = os.environ.get("PYTEST_XDIST_WORKER", "main")
    return str(base / f"run-{worker}-{os.getpid()}-{uuid.uuid4().hex[:6]}")


def _default_pg_dir() -> str:
    return os.environ.get("SABHA_TEST_PG_DEFAULT_DB", r"C:\conda_tmp\opencode\sabha-test-pg-data")


import psycopg  # noqa: E402  (safe here: import side-effect free)
import pgserver  # noqa: E402
import pytest  # noqa: E402

SYNTHETIC_OPERATOR_ID = os.environ["OPERATOR_USER_ID"]


@pytest.fixture(autouse=True)
def synthetic_operator_access(request):
    """Admit the synthetic operator for general regression suites.

    Spec-22 denial/security suites must exercise the real dependency and
    adapter protocol, so they opt out with ``@pytest.mark.real_access``. This
    fixture never touches an app that a test has not already imported.
    """

    if request.node.get_closest_marker("real_access"):
        yield
        return

    node_path = str(getattr(request.node, "path", "")).replace("\\", "/")
    if "/tests/access/" in node_path:
        yield
        return

    import sys

    main = sys.modules.get("main")
    if main is None:
        yield
        return

    from app.modules.access.application.contracts import VerifiedIdentity
    from app.modules.access.presentation.http import require_operator_access

    main.app.dependency_overrides[require_operator_access] = lambda: VerifiedIdentity(
        user_id=SYNTHETIC_OPERATOR_ID
    )
    try:
        yield
    finally:
        main.app.dependency_overrides.pop(require_operator_access, None)


class DisposableDb:
    """A one-test Postgres database with Sabha's full schema applied."""

    def __init__(self, uri: str, name: str):
        self.uri = uri
        self.name = name

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self.uri, autocommit=True)

    def query(self, sql: str, params=None):
        with self.connect() as conn:
            return conn.execute(sql, params).fetchall()


def _uri_for_database(base_uri: str, name: str) -> str:
    """Rewrite only the URL path (database) of a Postgres URI.

    A plain str.replace would also rewrite the username inside
    `postgresql://postgres:@…` because `//postgres@` contains `/postgres`.
    """
    parts = urlsplit(base_uri)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture(scope="session")
def pg_server():
    server = pgserver.get_server(_pg_run_dir(), cleanup_mode="delete")
    # This cluster is disposable. Durability settings only slow Windows down
    # (a shutdown checkpoint can otherwise take tens of seconds), so relax them
    # for the lifetime of the test session. These are cluster-wide settings and
    # do not alter application behavior.
    with psycopg.connect(server.get_uri(), autocommit=True) as conn:
        conn.execute("ALTER SYSTEM SET fsync = off")
        conn.execute("ALTER SYSTEM SET synchronous_commit = off")
        conn.execute("ALTER SYSTEM SET full_page_writes = off")
        conn.execute("SELECT pg_reload_conf()")
    try:
        yield server
    finally:
        # Stopping and deleting the ephemeral cluster also removes every test
        # database at once, avoiding hundreds of individual DROP DATABASE calls.
        server.cleanup()


def _provision_replay_roles(conn) -> None:
    """Cluster roles must exist before migration 032 applies.

    Roles are cluster-level, so provisioning is idempotent across the
    disposable databases; the replay schema itself is per-database.
    """
    from scripts.replay_roles import provision

    provision(conn)


def _apply_schema(conn, schema_files) -> None:
    conn.execute(AUTH_STUB_SQL)
    _provision_replay_roles(conn)
    for path in schema_files:
        conn.execute(path.read_text(encoding="utf-8"))


@pytest.fixture()
def disposable_db(pg_server, pg_templates):
    """Create a throwaway database by cloning the full-schema template."""
    return _clone_schema_db(pg_server, pg_templates, "full")


_TEMPLATE_SCHEMA = {
    "full": SCHEMA_FILES,
    "empty": [],
    "pre_isolation": PRE_ISOLATION_SCHEMA_FILES,
    "phase_one": PHASE_ONE_SCHEMA_FILES,
    "legacy": LEGACY_SCHEMA_FILES,
}


class _TemplateDatabases:
    """Lazily build one database per schema variant for this session."""

    def __init__(self, pg_server):
        self.pg_server = pg_server
        self.base_uri = pg_server.get_uri()
        self.admin = psycopg.connect(self.base_uri, autocommit=True)
        self.names: dict[str, str] = {}

    def get(self, key: str) -> str:
        if key not in self.names:
            name = f"sabha_tpl_{key}"
            self.admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            self.admin.execute(f'CREATE DATABASE "{name}"')
            with DisposableDb(
                _uri_for_database(self.base_uri, name), name
            ).connect() as conn:
                _apply_schema(conn, _TEMPLATE_SCHEMA[key])
            self.names[key] = name
        return self.names[key]

    def close(self) -> None:
        for name in self.names.values():
            self.admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        self.admin.close()


@pytest.fixture(scope="session")
def pg_templates(pg_server):
    """Provide schema templates, built on first use.

    Replaying the migration chain for every database is the dominant cost of
    the database suite. PostgreSQL can copy a prepared database with
    ``CREATE DATABASE ... TEMPLATE`` in a fraction of that time.
    """
    templates = _TemplateDatabases(pg_server)
    try:
        yield templates
    finally:
        templates.close()


def _clone_schema_db(pg_server, pg_templates, template_key: str) -> DisposableDb:
    """Create a test database as a copy of a session-scoped template."""
    name = "sabha_t_" + uuid.uuid4().hex[:10]
    base_uri = pg_server.get_uri()
    admin = psycopg.connect(base_uri, autocommit=True)
    try:
        admin.execute(
            f'CREATE DATABASE "{name}" TEMPLATE "{pg_templates.get(template_key)}"'
        )
    finally:
        admin.close()
    return DisposableDb(_uri_for_database(base_uri, name), name)


@pytest.fixture()
def empty_db(pg_server, pg_templates):
    """Disposable database with only the Supabase auth stub (no Sabha schema)."""
    return _clone_schema_db(pg_server, pg_templates, "empty")


@pytest.fixture()
def pre_isolation_db(pg_server, pg_templates):
    """Disposable database holding the history just before read isolation."""
    return _clone_schema_db(pg_server, pg_templates, "pre_isolation")


@pytest.fixture()
def phase_one_db(pg_server, pg_templates):
    """Disposable database holding the complete untracked Phase 1 schema."""
    return _clone_schema_db(pg_server, pg_templates, "phase_one")


@pytest.fixture()
def legacy_db(pg_server, pg_templates):
    """Disposable database holding the pre-fix (legacy) schema chain."""
    return _clone_schema_db(pg_server, pg_templates, "legacy")
