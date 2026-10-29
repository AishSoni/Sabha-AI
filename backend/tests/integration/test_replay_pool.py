"""Integration: the replay reader is a real pool, not one TLS session per read.

Spec 20 replaces the per-operation connection with a small process-wide pool.
The seam still returns a normal read-only connection, but each physical
connection must be identity-checked exactly once, and borrowing repeatedly must
reuse connections instead of reconnecting.
"""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

import pytest

import app.platform.replay_database as replay_database
from scripts.replay_roles import provision

LOGIN_ROLE = "sabha_replay_login"


def _login_uri(db, role: str) -> str:
    """Rewrite the URL username; pgserver's TCP auth is trust for local tests."""
    parts = urlsplit(db.uri)
    host = parts.hostname or "127.0.0.1"
    port = f":{parts.port}" if parts.port else ""
    return urlunsplit(parts._replace(netloc=f"{role}@{host}{port}"))


@pytest.fixture()
def replay_pool_db(disposable_db, monkeypatch: pytest.MonkeyPatch):
    with disposable_db.connect() as conn:
        provision(conn, reader_login=LOGIN_ROLE)
    monkeypatch.setattr(
        replay_database.settings,
        "replay_database_url",
        _login_uri(disposable_db, LOGIN_ROLE),
        raising=False,
    )
    monkeypatch.setattr(replay_database.settings, "replay_pool_min_size", 2, raising=False)
    monkeypatch.setattr(replay_database.settings, "replay_pool_max_size", 4, raising=False)
    monkeypatch.setattr(
        replay_database.settings, "replay_pool_timeout_seconds", 5.0, raising=False
    )
    try:
        yield disposable_db
    finally:
        replay_database.close_replay_pool()


@pytest.fixture()
def identity_checks(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record each physical connection's identity assertion."""
    seen: list[str] = []
    original = replay_database._assert_reader_identity

    def counting(conn):
        seen.append(conn.execute("SELECT current_user").fetchone()[0])
        return original(conn)

    monkeypatch.setattr(replay_database, "_assert_reader_identity", counting)
    return seen


def test_pool_configures_each_physical_connection_once(
    replay_pool_db, identity_checks: list[str]
) -> None:
    for _ in range(6):
        conn = replay_database.connect_replay_reader()
        try:
            assert conn.execute("SHOW transaction_read_only").fetchone()[0] == "on"
        finally:
            conn.close()

    stats = replay_database.replay_pool_stats()
    assert stats is not None
    assert stats["pool_size"] == 2
    assert stats["requests_num"] == 6
    # Two physical connections, two identity assertions: never per borrow.
    assert len(identity_checks) == 2
    assert set(identity_checks) == {LOGIN_ROLE}


def test_a_closed_borrow_returns_to_the_pool(replay_pool_db) -> None:
    first = replay_database.connect_replay_reader()
    try:
        assert first.execute("SHOW transaction_read_only").fetchone()[0] == "on"
    finally:
        first.close()

    stats = replay_database.replay_pool_stats()
    assert stats is not None
    assert stats["pool_size"] == 2
    assert stats["pool_available"] >= 1

    second = replay_database.connect_replay_reader()
    try:
        assert second.execute("SHOW transaction_read_only").fetchone()[0] == "on"
    finally:
        second.close()

    # Borrowing never opens a third physical connection.
    assert replay_database.replay_pool_stats()["pool_size"] == 2
