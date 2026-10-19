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
    "OPENROUTER_API_KEY": "",
    "GEMINI_API_KEY": "",
    "OPENAI_API_KEY": "",
    "COHERE_API_KEY": "",
    "QDRANT_API_KEY": "",
    "DEFAULT_LLM_PROVIDER": "ollama",
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
"""


def _pg_home() -> str:
    """Workspace dir for the embedded Postgres cluster (outside the repo).

    Defaults under C:/conda_tmp per the environment guidance; override with
    SABHA_TEST_PG_HOME when needed.
    """
    return os.environ.get("SABHA_TEST_PG_HOME", r"C:\conda_tmp\opencode\sabha-test-pg")


def _default_pg_dir() -> str:
    return os.environ.get("SABHA_TEST_PG_DEFAULT_DB", r"C:\conda_tmp\opencode\sabha-test-pg-data")


import psycopg  # noqa: E402  (safe here: import side-effect free)
import pgserver  # noqa: E402
import pytest  # noqa: E402


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
    server = pgserver.get_server(_pg_home())
    yield server


@pytest.fixture()
def disposable_db(pg_server):
    """Create a throwaway database, apply auth stub + full current schema, drop it after."""
    name = "sabha_t_" + __import__("uuid").uuid4().hex[:10]
    base_uri = pg_server.get_uri()  # postgresql://postgres:@host:port/postgres
    admin = psycopg.connect(base_uri, autocommit=True)
    admin.execute(f'CREATE DATABASE "{name}"')
    admin.close()

    db = DisposableDb(_uri_for_database(base_uri, name), name)
    with db.connect() as conn:
        for sql in (AUTH_STUB_SQL, *[p.read_text(encoding="utf-8") for p in SCHEMA_FILES]):
            conn.execute(sql)

    try:
        yield db
    finally:
        cleanup = psycopg.connect(base_uri, autocommit=True)
        cleanup.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        cleanup.close()


def _make_schema_db(pg_server, schema_files):
    """Create a throwaway database from an explicit schema file list."""
    import uuid

    name = "sabha_t_" + uuid.uuid4().hex[:10]
    base_uri = pg_server.get_uri()
    admin = psycopg.connect(base_uri, autocommit=True)
    admin.execute(f'CREATE DATABASE "{name}"')
    admin.close()

    db = DisposableDb(_uri_for_database(base_uri, name), name)
    with db.connect() as conn:
        for sql in (AUTH_STUB_SQL, *[p.read_text(encoding="utf-8") for p in schema_files]):
            conn.execute(sql)
    return db, base_uri


@pytest.fixture()
def legacy_db(pg_server):
    """Disposable database holding the pre-fix (legacy) schema chain."""
    db, base_uri = _make_schema_db(pg_server, LEGACY_SCHEMA_FILES)
    try:
        yield db
    finally:
        cleanup = psycopg.connect(base_uri, autocommit=True)
        cleanup.execute(f'DROP DATABASE IF EXISTS "{db.name}" WITH (FORCE)')
        cleanup.close()
