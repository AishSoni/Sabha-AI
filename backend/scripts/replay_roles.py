"""Provision the isolated replay reader and offline provisioner roles.

Spec 12 separates the live backend credential from the strict replay runtime.
This script owns the cluster-level part that a database migration cannot own
safely: creating NOLOGIN group roles, the replay schema, and the default
privileges that keep future replay objects closed to browser-facing roles.

It is deliberately idempotent and operator-run. It does not publish packages,
create replay tables, or grant SELECT on any object: Spec 17's publication
tooling grants the reader SELECT only on approved, version-pinned objects.

The runtime reads through a dedicated LOGIN role that is a member of
``sabha_replay_reader``; its URL is supplied separately as
``REPLAY_DATABASE_URL``. The provisioner is NOLOGIN and is used only by the
offline publish tool.

Run with an administrator connection (``DATABASE_URL``):
    python -m scripts.replay_roles
    python -m scripts.replay_roles --reader-login sabha_replay_login
    python -m scripts.replay_roles --check

Re-running is safe. Existing reader grants on published replay objects are
preserved; only browser-facing roles and PUBLIC are revoked.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import psycopg
from psycopg import sql

READER_ROLE = "sabha_replay_reader"
PROVISIONER_ROLE = "sabha_replay_provisioner"
DEFAULT_REPLAY_SCHEMA = "replay"
DEFAULT_READER_LOGIN = ""  # explicit opt-in; no login role is created by default

PRIVILEGED_GROUPS = (
    "service_role",
    "authenticator",
    "anon",
    "authenticated",
    "postgres",
    "supabase_admin",
)


class ReplayRoleError(RuntimeError):
    """The replay role contract could not be established safely."""


def _role_exists(conn: psycopg.Connection, role: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)
    ).fetchone() is not None


def _harden_role(
    conn: psycopg.Connection, role: str, *, login: bool, inherit: bool
) -> None:
    """Apply only the attribute changes this role still needs.

    PostgreSQL lets only a superuser touch ``SUPERUSER`` or ``BYPASSRLS`` --
    even to remove them -- and hosted Postgres (Supabase) grants ``CREATEROLE``
    without ``SUPERUSER``. Emitting those clauses unconditionally therefore
    fails there while demoting an ordinary role. Naming an attribute only when
    it is still set keeps provisioning working there, and turns a genuinely
    privileged role into an explicit error instead of a permission failure.
    """
    row = conn.execute(
        "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, "
        "rolcanlogin, rolinherit FROM pg_roles WHERE rolname = %s",
        (role,),
    ).fetchone()
    superuser, bypass_rls, createdb, createrole, can_login, has_inherit = row
    if superuser or bypass_rls:
        raise ReplayRoleError(
            f"{role} still has SUPERUSER or BYPASSRLS; only a superuser can "
            "revoke those attributes, so repair the role before provisioning"
        )
    clauses: list[str] = []
    if bool(can_login) != login:
        clauses.append("LOGIN" if login else "NOLOGIN")
    if bool(has_inherit) != inherit:
        clauses.append("INHERIT" if inherit else "NOINHERIT")
    if createdb:
        clauses.append("NOCREATEDB")
    if createrole:
        clauses.append("NOCREATEROLE")
    if clauses:
        conn.execute(
            sql.SQL("ALTER ROLE {} " + " ".join(clauses)).format(
                sql.Identifier(role)
            )
        )


def _ensure_group_role(conn: psycopg.Connection, role: str) -> None:
    if not _role_exists(conn, role):
        conn.execute(
            sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role))
        )
    # Re-assert the attributes on every run. A role that was edited by hand
    # must not keep LOGIN or inherited group privileges.
    _harden_role(conn, role, login=False, inherit=False)


def _ensure_login_role(conn: psycopg.Connection, role: str, group: str = READER_ROLE) -> None:
    if not role:
        return
    if not _role_exists(conn, role):
        conn.execute(
            sql.SQL("CREATE ROLE {} LOGIN").format(sql.Identifier(role))
        )
    _harden_role(conn, role, login=True, inherit=True)
    conn.execute(
        sql.SQL("GRANT {} TO {}").format(
            sql.Identifier(group), sql.Identifier(role)
        )
    )


def _assert_not_privileged_member(
    conn: psycopg.Connection, role: str, *, privileges: tuple[str, ...] = PRIVILEGED_GROUPS
) -> None:
    for group in privileges:
        if not _role_exists(conn, group):
            continue
        if conn.execute(
            "SELECT pg_has_role(%s, %s, 'MEMBER')", (role, group)
        ).fetchone()[0]:
            raise ReplayRoleError(
                f"{role} is a member of privileged role {group}; "
                "remove the membership before provisioning replay access"
            )


def _revoke_public_and_browser_roles(
    conn: psycopg.Connection, schema: str
) -> None:
    ident = sql.Identifier(schema)
    conn.execute(sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(ident))
    for role in ("anon", "authenticated", "service_role"):
        if _role_exists(conn, role):
            conn.execute(
                sql.SQL("REVOKE ALL ON SCHEMA {} FROM {}").format(
                    ident, sql.Identifier(role)
                )
            )
            conn.execute(
                sql.SQL(
                    "REVOKE ALL ON ALL TABLES IN SCHEMA {} FROM {}"
                ).format(ident, sql.Identifier(role))
            )
            conn.execute(
                sql.SQL(
                    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA {} FROM {}"
                ).format(ident, sql.Identifier(role))
            )
            conn.execute(
                sql.SQL(
                    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA {} FROM {}"
                ).format(ident, sql.Identifier(role))
            )


def _close_default_privileges(conn: psycopg.Connection, owner: str, schema: str) -> None:
    """Keep future objects in the replay schema closed by default.

    The reader is intentionally omitted: publication grants SELECT on the
    specific approved objects, never on every table the provisioner creates.
    """
    owner_ident = sql.Identifier(owner)
    schema_ident = sql.Identifier(schema)
    for object_type in ("TABLES", "SEQUENCES", "FUNCTIONS"):
        conn.execute(
            sql.SQL(
                "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
                "REVOKE ALL ON {} FROM PUBLIC"
            ).format(owner_ident, schema_ident, sql.SQL(object_type))
        )
        for role in ("anon", "authenticated", "service_role"):
            if _role_exists(conn, role):
                conn.execute(
                    sql.SQL(
                        "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
                        "REVOKE ALL ON {} FROM {}"
                    ).format(
                        owner_ident,
                        schema_ident,
                        sql.SQL(object_type),
                        sql.Identifier(role),
                    )
                )

    # Schema defaults are additive to global function defaults on Supabase.
    conn.execute(
        sql.SQL(
            "ALTER DEFAULT PRIVILEGES FOR ROLE {} "
            "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"
        ).format(owner_ident)
    )

    # The offline provisioner may create or replace replay objects even when
    # the DDL owner is the migration administrator.
    conn.execute(
        sql.SQL(
            "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
            "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}"
        ).format(owner_ident, schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )
    conn.execute(
        sql.SQL(
            "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
            "GRANT USAGE, SELECT ON SEQUENCES TO {}"
        ).format(owner_ident, schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )
    conn.execute(
        sql.SQL(
            "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
            "GRANT EXECUTE ON FUNCTIONS TO {}"
        ).format(owner_ident, schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )


def _deny_live_access(conn: psycopg.Connection, role: str) -> None:
    """Defence in depth: these roles never read or write the live schema."""
    conn.execute(
        sql.SQL("REVOKE ALL ON SCHEMA public FROM {}").format(sql.Identifier(role))
    )
    for object_type in ("TABLES", "SEQUENCES", "FUNCTIONS"):
        conn.execute(
            sql.SQL(
                "REVOKE ALL ON ALL {} IN SCHEMA public FROM {}"
            ).format(sql.SQL(object_type), sql.Identifier(role))
        )


def provision(
    conn: psycopg.Connection,
    *,
    reader_login: str | None = DEFAULT_READER_LOGIN,
    provisioner_login: str | None = None,
    replay_schema: str = DEFAULT_REPLAY_SCHEMA,
) -> dict[str, Any]:
    """Create or repair the replay role/schema contract. Idempotent."""
    if not replay_schema or not replay_schema.replace("_", "").isalnum():
        raise ReplayRoleError(f"invalid replay schema name: {replay_schema!r}")

    _ensure_group_role(conn, READER_ROLE)
    _ensure_group_role(conn, PROVISIONER_ROLE)
    if reader_login:
        if not reader_login.replace("_", "").isalnum():
            raise ReplayRoleError(f"invalid reader login name: {reader_login!r}")
        _ensure_login_role(conn, reader_login, READER_ROLE)
    if provisioner_login:
        if not provisioner_login.replace("_", "").isalnum():
            raise ReplayRoleError(
                f"invalid provisioner login name: {provisioner_login!r}"
            )
        if provisioner_login == reader_login:
            raise ReplayRoleError("reader and provisioner logins must be separate")
        _ensure_login_role(conn, provisioner_login, PROVISIONER_ROLE)

    _assert_not_privileged_member(conn, READER_ROLE)
    _assert_not_privileged_member(conn, PROVISIONER_ROLE)
    if reader_login:
        _assert_not_privileged_member(conn, reader_login, privileges=("service_role", "authenticator", "postgres", "supabase_admin"))
    if provisioner_login:
        _assert_not_privileged_member(
            conn,
            provisioner_login,
            privileges=("service_role", "authenticator", "postgres", "supabase_admin"),
        )

    schema_ident = sql.Identifier(replay_schema)
    conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(schema_ident))
    _revoke_public_and_browser_roles(conn, replay_schema)
    conn.execute(
        sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
            schema_ident, sql.Identifier(READER_ROLE)
        )
    )
    conn.execute(
        sql.SQL("GRANT USAGE, CREATE ON SCHEMA {} TO {}").format(
            schema_ident, sql.Identifier(PROVISIONER_ROLE)
        )
    )

    # Existing replay objects: provisioner may publish/repair; browser roles
    # stay closed. Reader grants on published objects are deliberately kept.
    conn.execute(
        sql.SQL(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {} TO {}"
        ).format(schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )
    conn.execute(
        sql.SQL(
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {} TO {}"
        ).format(schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )
    conn.execute(
        sql.SQL(
            "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA {} TO {}"
        ).format(schema_ident, sql.Identifier(PROVISIONER_ROLE))
    )

    owner = conn.execute("SELECT current_user").fetchone()[0]
    _close_default_privileges(conn, owner, replay_schema)
    _close_default_privileges(conn, PROVISIONER_ROLE, replay_schema)

    for role in (READER_ROLE, PROVISIONER_ROLE):
        _deny_live_access(conn, role)
    if reader_login:
        _deny_live_access(conn, reader_login)
    if provisioner_login:
        _deny_live_access(conn, provisioner_login)

    return {
        "reader_role": READER_ROLE,
        "provisioner_role": PROVISIONER_ROLE,
        "reader_login": reader_login or None,
        "provisioner_login": provisioner_login or None,
        "replay_schema": replay_schema,
        "owner": owner,
    }


def check(
    conn: psycopg.Connection,
    *,
    reader_login: str | None = DEFAULT_READER_LOGIN,
    provisioner_login: str | None = None,
    replay_schema: str = DEFAULT_REPLAY_SCHEMA,
) -> list[str]:
    """Return contract violations without changing anything."""
    issues: list[str] = []
    for role in (READER_ROLE, PROVISIONER_ROLE):
        if not _role_exists(conn, role):
            issues.append(f"missing role {role}")
            continue
        row = conn.execute(
            "SELECT rolsuper, rolbypassrls, rolcanlogin, rolinherit "
            "FROM pg_roles WHERE rolname = %s",
            (role,),
        ).fetchone()
        if row[0]:
            issues.append(f"{role} has SUPERUSER")
        if row[1]:
            issues.append(f"{role} has BYPASSRLS")
        if row[2]:
            issues.append(f"{role} is LOGIN (provisioner/reader groups must be NOLOGIN)")
        if row[3]:
            issues.append(f"{role} has INHERIT (group role should be NOINHERIT)")
        if conn.execute(
            "SELECT has_schema_privilege(%s, 'public', 'USAGE')", (role,)
        ).fetchone()[0]:
            issues.append(f"{role} can use schema public")

    if not conn.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = %s)",
        (replay_schema,),
    ).fetchone()[0]:
        issues.append(f"missing schema {replay_schema}")
    else:
        if not conn.execute(
            "SELECT has_schema_privilege(%s, %s, 'USAGE')",
            (READER_ROLE, replay_schema),
        ).fetchone()[0]:
            issues.append(f"{READER_ROLE} cannot use schema {replay_schema}")
        if conn.execute(
            "SELECT has_schema_privilege(%s, %s, 'CREATE')",
            (READER_ROLE, replay_schema),
        ).fetchone()[0]:
            issues.append(f"{READER_ROLE} can create objects in {replay_schema}")
        if not conn.execute(
            "SELECT has_schema_privilege(%s, %s, 'CREATE')",
            (PROVISIONER_ROLE, replay_schema),
        ).fetchone()[0]:
            issues.append(f"{PROVISIONER_ROLE} cannot create objects in {replay_schema}")

    if reader_login:
        if not _role_exists(conn, reader_login):
            issues.append(f"missing reader login role {reader_login}")
        else:
            if not conn.execute(
                "SELECT pg_has_role(%s, %s, 'MEMBER')",
                (reader_login, READER_ROLE),
            ).fetchone()[0]:
                issues.append(f"{reader_login} is not a member of {READER_ROLE}")
            for group in ("service_role", "authenticator"):
                if _role_exists(conn, group) and conn.execute(
                    "SELECT pg_has_role(%s, %s, 'MEMBER')", (reader_login, group)
                ).fetchone()[0]:
                    issues.append(f"{reader_login} is a member of {group}")

    if provisioner_login:
        if not _role_exists(conn, provisioner_login):
            issues.append(f"missing provisioner login role {provisioner_login}")
        else:
            if not conn.execute(
                "SELECT pg_has_role(%s, %s, 'MEMBER')",
                (provisioner_login, PROVISIONER_ROLE),
            ).fetchone()[0]:
                issues.append(f"{provisioner_login} is not a member of {PROVISIONER_ROLE}")
            if reader_login and conn.execute(
                "SELECT pg_has_role(%s, %s, 'MEMBER')",
                (provisioner_login, READER_ROLE),
            ).fetchone()[0]:
                issues.append(
                    f"{provisioner_login} must not inherit the reader group"
                )
            for group in ("service_role", "authenticator"):
                if _role_exists(conn, group) and conn.execute(
                    "SELECT pg_has_role(%s, %s, 'MEMBER')",
                    (provisioner_login, group),
                ).fetchone()[0]:
                    issues.append(f"{provisioner_login} is a member of {group}")
    return issues


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="administrator connection URL (defaults to DATABASE_URL)",
    )
    parser.add_argument(
        "--reader-login",
        default=DEFAULT_READER_LOGIN,
        help="optional LOGIN role to create and add to the reader group",
    )
    parser.add_argument(
        "--provisioner-login",
        default="",
        help="optional LOGIN role to create and add to the provisioner group",
    )
    parser.add_argument(
        "--replay-schema",
        default=DEFAULT_REPLAY_SCHEMA,
        help="replay schema name (default: replay)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report contract violations without changing anything",
    )
    args = parser.parse_args(argv)

    if not args.database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 2

    try:
        with psycopg.connect(args.database_url) as conn:
            if args.check:
                issues = check(
                    conn,
                    reader_login=args.reader_login,
                    provisioner_login=args.provisioner_login or None,
                    replay_schema=args.replay_schema,
                )
                print(json.dumps({"ok": not issues, "issues": issues}, indent=2))
                return 0 if not issues else 1
            summary = provision(
                conn,
                reader_login=args.reader_login,
                provisioner_login=args.provisioner_login or None,
                replay_schema=args.replay_schema,
            )
            print(json.dumps({"ok": True, **summary}, indent=2))
            return 0
    except (psycopg.Error, ReplayRoleError) as exc:
        print(f"replay role provisioning failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
