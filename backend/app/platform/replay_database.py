"""The strict replay runtime database boundary (Spec 12).

Replay code must never receive the live service credential and must never fall
back to ``DATABASE_URL`` or the Supabase service key. It connects with a
dedicated PostgreSQL LOGIN role that is a member of ``sabha_replay_reader``
(see ``scripts/replay_roles.py``), then asserts the effective identity before
handing the connection to replay code.

The session is also forced read-only. That is defence in depth: the reader
role should already hold USAGE on ``replay`` plus SELECT on published objects
only.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import psycopg

from app.platform.config import settings

PRIVILEGED_IDENTITIES = {"postgres", "service_role", "supabase_admin"}


class ReplayReaderError(RuntimeError):
    """Base class for replay-reader configuration and identity failures."""


class ReplayReaderNotConfigured(ReplayReaderError):
    """REPLAY_DATABASE_URL is absent or not a PostgreSQL URL."""


class ReplayReaderConnectionError(ReplayReaderError):
    """The configured replay reader could not be reached."""


class ReplayReaderPrivilegeError(ReplayReaderError):
    """The configured connection is not an isolated replay reader."""


def get_replay_database_url() -> str:
    """Return the dedicated reader URL without ever consulting live settings."""
    url = (settings.replay_database_url or "").strip()
    if not url:
        raise ReplayReaderNotConfigured(
            "REPLAY_DATABASE_URL is required for replay access; "
            "the runtime never falls back to DATABASE_URL or SUPABASE_SERVICE_KEY"
        )
    parts = urlsplit(url)
    if parts.scheme not in ("postgresql", "postgres") or not parts.hostname:
        raise ReplayReaderNotConfigured(
            "REPLAY_DATABASE_URL must be a PostgreSQL connection URL"
        )
    return url


def _assert_reader_identity(conn: psycopg.Connection) -> None:
    current_user, is_superuser = conn.execute(
        "SELECT current_user, current_setting('is_superuser')::boolean"
    ).fetchone()
    if is_superuser or current_user in PRIVILEGED_IDENTITIES:
        raise ReplayReaderPrivilegeError(
            "replay reader must not connect as a superuser or live backend role"
        )

    attributes = conn.execute(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
    ).fetchone()
    if attributes and (attributes[0] or attributes[1]):
        raise ReplayReaderPrivilegeError(
            "replay reader must not have SUPERUSER or BYPASSRLS"
        )

    service_role_exists = conn.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')"
    ).fetchone()[0]
    if service_role_exists and conn.execute(
        "SELECT pg_has_role(current_user, 'service_role', 'MEMBER')"
    ).fetchone()[0]:
        raise ReplayReaderPrivilegeError(
            "replay reader must not be a member of service_role"
        )

    if conn.execute(
        "SELECT has_schema_privilege(current_user, 'public', 'USAGE')"
    ).fetchone()[0]:
        raise ReplayReaderPrivilegeError(
            "replay reader still has USAGE on the live public schema"
        )


def connect_replay_reader() -> psycopg.Connection:
    """Open and verify the dedicated read-only replay connection."""
    url = get_replay_database_url()
    try:
        conn = psycopg.connect(url, autocommit=True, connect_timeout=5)
    except psycopg.Error as exc:
        raise ReplayReaderConnectionError(
            "could not connect to the configured replay database"
        ) from exc

    try:
        _assert_reader_identity(conn)
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    except Exception:
        conn.close()
        raise
    return conn
