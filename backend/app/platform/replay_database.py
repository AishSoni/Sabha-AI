"""The strict replay runtime database boundary (Spec 12, pooled in Spec 20).

Replay code must never receive the live service credential and must never fall
back to ``DATABASE_URL`` or the Supabase service key. It connects with a
dedicated PostgreSQL LOGIN role that is a member of ``sabha_replay_reader``
(see ``scripts/replay_roles.py``), then asserts the effective identity before
handing the connection to replay code.

The session is also forced read-only. That is defence in depth: the reader
role should already hold USAGE on ``replay`` plus SELECT on published objects
only.

Opening a TLS/SCRAM session costs about eleven round trips, so Spec 20 keeps a
process-wide pool behind the same ``connect_replay_reader`` seam. The identity
assertion and the read-only session characteristic run in the pool's
``configure`` hook exactly once per physical connection. Connections returned
with ``close()`` go back to the pool instead of reconnecting.

Only direct/session-mode PostgreSQL URLs are supported. A transaction-mode
pooler cannot preserve a session-scoped read-only characteristic or the role
identity this module asserts.
"""

from __future__ import annotations

import logging
import threading
from urllib.parse import urlsplit

import psycopg
from psycopg_pool import ConnectionPool, PoolClosed, PoolTimeout

from app.platform.config import settings

logger = logging.getLogger(__name__)

PRIVILEGED_IDENTITIES = {"postgres", "service_role", "supabase_admin"}
READ_ONLY_SESSION = "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"


class ReplayReaderError(RuntimeError):
    """Base class for replay-reader configuration and identity failures."""


class ReplayReaderNotConfigured(ReplayReaderError):
    """REPLAY_DATABASE_URL is absent or not a PostgreSQL URL."""


class ReplayReaderConnectionError(ReplayReaderError):
    """The configured replay reader could not be reached."""


class ReplayReaderPrivilegeError(ReplayReaderError):
    """The configured connection is not an isolated replay reader."""


# The pool is process-wide. It is keyed by URL so tests (and a deliberate
# settings change) never inherit connections to a different database. The
# separate open lock keeps pool construction serial without deadlocking the
# pool's configure callback, which records failures under `_error_lock`.
_pool: ConnectionPool | None = None
_pool_url: str | None = None
_pool_lock = threading.Lock()
_open_lock = threading.Lock()
_error_lock = threading.Lock()
# The pool treats a raising ``configure`` callback as a connection failure and
# retries in the background. Remember the concrete failure so callers get the
# real diagnosis instead of a generic pool timeout.
_configure_error: BaseException | None = None


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


def _configure_connection(conn: psycopg.Connection) -> None:
    """Verify identity and pin read-only once per physical connection."""
    global _configure_error
    try:
        _assert_reader_identity(conn)
        conn.execute(READ_ONLY_SESSION)
    except BaseException as exc:  # noqa: BLE001 - pool must discard the connection
        with _error_lock:
            if _configure_error is None:
                _configure_error = exc
        raise


def _failure(_cause: BaseException) -> ReplayReaderError:
    """Translate a pool failure into the stable replay reader error surface."""
    with _error_lock:
        error = _configure_error
    if isinstance(error, ReplayReaderPrivilegeError):
        return error
    if isinstance(error, ReplayReaderNotConfigured):
        return error
    return ReplayReaderConnectionError(
        "could not connect to the configured replay database"
    )


def _open_pool(url: str) -> ConnectionPool:
    global _configure_error
    with _error_lock:
        _configure_error = None

    pool = ConnectionPool(
        url,
        min_size=settings.replay_pool_min_size,
        max_size=settings.replay_pool_max_size,
        kwargs={"autocommit": True, "connect_timeout": 5},
        configure=_configure_connection,
        open=False,
        name="sabha-replay-reader",
        timeout=settings.replay_pool_timeout_seconds,
        reconnect_timeout=settings.replay_pool_reconnect_seconds,
        close_returns=True,
    )
    try:
        pool.open(wait=True, timeout=settings.replay_pool_timeout_seconds)
    except PoolTimeout as exc:
        pool.close()
        raise _failure(exc) from exc
    except psycopg.Error as exc:
        pool.close()
        raise ReplayReaderConnectionError(
            "could not connect to the configured replay database"
        ) from exc
    return pool


def _pool_for(url: str) -> ConnectionPool:
    global _pool, _pool_url
    with _open_lock:
        with _pool_lock:
            current = (
                _pool
                if _pool is not None and _pool_url == url and not _pool.closed
                else None
            )
        if current is not None:
            return current

        with _pool_lock:
            stale, _pool, _pool_url = _pool, None, None
        if stale is not None:
            stale.close()

        pool = _open_pool(url)
        with _pool_lock:
            _pool = pool
            _pool_url = url
    logger.info(
        "replay.pool opened min_size=%s max_size=%s",
        pool.min_size,
        pool.max_size,
    )
    return pool


def connect_replay_reader() -> psycopg.Connection:
    """Borrow a verified, read-only connection from the process-wide pool.

    The returned connection is a normal psycopg connection whose ``close()``
    returns it to the pool. Callers must close it; ``ReplaySource`` does so in
    a ``finally`` block.
    """
    url = get_replay_database_url()
    pool = _pool_for(url)
    try:
        return pool.getconn(timeout=settings.replay_pool_timeout_seconds)
    except (PoolTimeout, PoolClosed) as exc:
        raise _failure(exc) from exc


def close_replay_pool() -> None:
    """Close the process-wide pool; safe to call when it was never opened."""
    global _pool, _pool_url
    with _pool_lock:
        pool, _pool, _pool_url = _pool, None, None
    if pool is not None:
        pool.close()
        logger.info("replay.pool closed")


def replay_pool_stats() -> dict[str, int] | None:
    """Expose pool counters for instrumentation/tests without leaking state."""
    with _pool_lock:
        pool = _pool
    if pool is None:
        return None
    return dict(pool.get_stats())
