"""Integration: the replay reader is a real, isolated Postgres identity.

Spec 12 requires the strict replay runtime to use a dedicated server-side
connection whose effective privileges are tested, not merely SQL-created
roles. This suite provisions the group roles and schema, publishes one
representative object as the provisioner, then logs in as a dedicated LOGIN
role that inherits only ``sabha_replay_reader``.
"""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest

from scripts.replay_roles import (
    PROVISIONER_ROLE,
    READER_ROLE,
    check,
    provision,
)

LOGIN_ROLE = "sabha_replay_login"


def _login_uri(db, role: str) -> str:
    """Rewrite the URL username; pgserver's TCP auth is trust for local tests."""
    parts = urlsplit(db.uri)
    host = parts.hostname or "127.0.0.1"
    port = f":{parts.port}" if parts.port else ""
    return urlunsplit(parts._replace(netloc=f"{role}@{host}{port}"))


@pytest.fixture()
def replay_db(disposable_db):
    with disposable_db.connect() as conn:
        provision(conn, reader_login=LOGIN_ROLE)
    return disposable_db


def _assert_role_contract(db) -> None:
    rows = db.query(
        "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit "
        "FROM pg_roles WHERE rolname IN (%s, %s) ORDER BY rolname",
        (PROVISIONER_ROLE, READER_ROLE),
    )
    assert len(rows) == 2
    for name, is_super, bypass_rls, can_login, inherit in rows:
        assert name in (PROVISIONER_ROLE, READER_ROLE)
        assert is_super is False, name
        assert bypass_rls is False, name
        assert can_login is False, name
        assert inherit is False, name


def test_provisioning_is_idempotent_and_check_passes(replay_db):
    _assert_role_contract(replay_db)

    with replay_db.connect() as conn:
        provision(conn, reader_login=LOGIN_ROLE)
        issues = check(conn, reader_login=LOGIN_ROLE)
    assert issues == []

    assert replay_db.query(
        "SELECT pg_has_role(%s, %s, 'MEMBER')", (LOGIN_ROLE, READER_ROLE)
    ) == [(True,)]
    assert replay_db.query(
        "SELECT pg_has_role(%s, 'service_role', 'MEMBER')", (LOGIN_ROLE,)
    ) == [(False,)]


def test_reader_reads_only_the_published_replay_object(replay_db):
    with replay_db.connect() as conn:
        conn.execute("SET ROLE sabha_replay_provisioner")
        conn.execute(
            "CREATE TABLE replay.package_probe "
            "(id integer PRIMARY KEY, content text NOT NULL)"
        )
        conn.execute(
            "INSERT INTO replay.package_probe (id, content) VALUES (1, 'published')"
        )
        conn.execute(
            "CREATE TABLE replay.unpublished_probe (id integer PRIMARY KEY)"
        )
        conn.execute(
            "GRANT SELECT ON replay.package_probe TO sabha_replay_reader"
        )

    reader = psycopg.connect(_login_uri(replay_db, LOGIN_ROLE), autocommit=True)
    try:
        assert reader.execute("SELECT current_user").fetchone()[0] == LOGIN_ROLE
        assert reader.execute(
            "SELECT has_schema_privilege('replay', 'USAGE')"
        ).fetchone()[0] is True
        assert reader.execute(
            "SELECT has_schema_privilege('public', 'USAGE')"
        ).fetchone()[0] is False

        assert reader.execute(
            "SELECT id, content FROM replay.package_probe"
        ).fetchall() == [(1, "published")]

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            reader.execute("SELECT count(*) FROM replay.unpublished_probe")

        for statement in (
            "INSERT INTO replay.package_probe (id, content) VALUES (2, 'write')",
            "UPDATE replay.package_probe SET content = 'write'",
            "DELETE FROM replay.package_probe",
            "TRUNCATE replay.package_probe",
            "CREATE TABLE replay.reader_created (id integer)",
            "CREATE SCHEMA replay_reader_schema",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                reader.execute(statement)
    finally:
        reader.close()


def test_reader_cannot_reach_live_tables_views_or_rpcs(replay_db):
    reader = psycopg.connect(_login_uri(replay_db, LOGIN_ROLE), autocommit=True)
    try:
        for relation in (
            "public.meetings",
            "public.messages",
            "public.personas",
            "public.documents",
        ):
            with pytest.raises(
                (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
            ):
                reader.execute(f"SELECT count(*) FROM {relation}")
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedFunction)
        ):
            reader.execute("SELECT public.increment_meeting_cost(NULL, 1.0)")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            reader.execute(
                "INSERT INTO public.meetings (name) VALUES ('reader write')"
            )
    finally:
        reader.close()


def test_provisioner_can_publish_but_not_read_live(replay_db):
    provisioner = psycopg.connect(replay_db.uri, autocommit=True)
    try:
        provisioner.execute("SET ROLE sabha_replay_provisioner")
        provisioner.execute(
            "CREATE TABLE replay.provisioner_probe (id integer PRIMARY KEY)"
        )
        provisioner.execute(
            "INSERT INTO replay.provisioner_probe (id) VALUES (1)"
        )
        with pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.UndefinedTable)
        ):
            provisioner.execute("SELECT count(*) FROM public.meetings")
    finally:
        provisioner.close()
