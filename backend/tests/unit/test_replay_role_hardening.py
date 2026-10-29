"""Unit: replay role hardening must not require superuser privileges.

Spec 12 provisioning runs with whatever administrator credential the
deployment has. Hosted Postgres (Supabase) grants ``CREATEROLE`` but not
``SUPERUSER``, and PostgreSQL rejects ``NOSUPERUSER``/``NOBYPASSRLS`` unless
the caller is a superuser -- even when the target role is already ordinary.
The local suite always connects as a superuser, so it cannot reproduce that
refusal; these tests pin the emitted statement shape without a server.
"""

from __future__ import annotations

import pytest

from scripts import replay_roles
from scripts.replay_roles import PROVISIONER_ROLE, READER_ROLE, ReplayRoleError

GROUP = READER_ROLE


class _Cursor:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeConn:
    """Answers the ``pg_roles`` probes and records every other statement."""

    def __init__(
        self,
        *,
        exists: bool = True,
        superuser: bool = False,
        bypass_rls: bool = False,
        createdb: bool = False,
        createrole: bool = False,
        can_login: bool = False,
        inherit: bool = True,
        current_user: str = "postgres",
        member: bool = False,
    ) -> None:
        self._exists = exists
        self._attributes = (
            superuser,
            bypass_rls,
            createdb,
            createrole,
            can_login,
            inherit,
        )
        self._current_user = current_user
        self._member = member
        self.statements: list[str] = []

    def execute(self, statement, params=()):
        text = statement if isinstance(statement, str) else statement.as_string()
        if "SELECT 1 FROM pg_roles" in text:
            return _Cursor((1,) if self._exists else None)
        if "SELECT rolsuper" in text:
            return _Cursor(self._attributes)
        if "SELECT current_user" in text:
            return _Cursor((self._current_user,))
        if "SELECT pg_has_role" in text:
            return _Cursor((self._member,))
        self.statements.append(text)
        return _Cursor(None)

    def alters(self) -> list[str]:
        return [item for item in self.statements if item.startswith("ALTER ROLE")]


def test_fresh_group_role_only_loses_inheritance() -> None:
    """The default group role must not need a privileged attribute change."""
    conn = _FakeConn(can_login=False, inherit=True)

    replay_roles._ensure_group_role(conn, GROUP)

    assert conn.alters() == ['ALTER ROLE "sabha_replay_reader" NOINHERIT']
    assert "SUPERUSER" not in conn.alters()[0]
    assert "BYPASSRLS" not in conn.alters()[0]


def test_fresh_login_role_is_not_altered_at_all() -> None:
    """CREATE ROLE already gives the login role the contract attributes."""
    conn = _FakeConn(can_login=True, inherit=True)

    replay_roles._ensure_login_role(conn, "sabha_replay_login")

    assert conn.alters() == []
    assert (
        'GRANT "sabha_replay_reader" TO "sabha_replay_login"' in conn.statements
    )


def test_hand_edited_group_role_is_repaired() -> None:
    """A role edited by hand still loses LOGIN, CREATEDB and inheritance."""
    conn = _FakeConn(can_login=True, inherit=True, createdb=True)

    replay_roles._ensure_group_role(conn, GROUP)

    assert conn.alters() == [
        'ALTER ROLE "sabha_replay_reader" NOLOGIN NOINHERIT NOCREATEDB'
    ]


def test_privileged_role_is_refused_before_any_alter() -> None:
    """A superuser role cannot be repaired by a CREATEROLE administrator."""
    conn = _FakeConn(superuser=True)

    with pytest.raises(ReplayRoleError, match="SUPERUSER"):
        replay_roles._ensure_group_role(conn, GROUP)

    assert conn.alters() == []


def test_default_privileges_grant_membership_first() -> None:
    """ALTER DEFAULT PRIVILEGES FOR ROLE needs membership, not just CREATEROLE."""
    conn = _FakeConn(current_user="postgres", member=False)

    replay_roles._ensure_can_alter_defaults(conn, PROVISIONER_ROLE)

    assert conn.statements == [
        f'GRANT "{PROVISIONER_ROLE}" TO "postgres"',
    ]


def test_membership_already_present_is_not_granted_again() -> None:
    """A superuser or group admin already satisfies the requirement."""
    conn = _FakeConn(current_user="postgres", member=True)

    replay_roles._ensure_can_alter_defaults(conn, PROVISIONER_ROLE)

    assert conn.statements == []


def test_owning_role_needs_no_membership() -> None:
    """Altering a role's own defaults is always allowed."""
    conn = _FakeConn(current_user="postgres", member=False)

    replay_roles._ensure_can_alter_defaults(conn, "postgres")

    assert conn.statements == []
