"""Read-only inventory of who can reach Sabha's database objects.

Spec 12 needs evidence, not just migration intent: every role inherits
``PUBLIC``, so a narrowly granted reader can still hold live reads through a
historical ``GRANT SELECT ... TO PUBLIC``. This script records the effective
state -- catalog ACLs, RLS policies, default privileges and ``has_*_privilege``
answers for the identities that matter -- before and after the isolation
migration, and again on a hosted project.

The connection is forced into a read-only transaction. Nothing is created,
altered or revoked by this script.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Iterable

import psycopg


DEFAULT_SCHEMAS = ("public", "replay", "storage")
DEFAULT_ROLES = (
    "anon",
    "authenticated",
    "service_role",
    "sabha_replay_reader",
    "sabha_replay_provisioner",
)

RELATION_KINDS = {
    "r": "table",
    "p": "partitioned_table",
    "v": "view",
    "m": "matview",
    "S": "sequence",
    "f": "foreign_table",
}


def _json_acl(column: str) -> str:
    """Decode an ACL array into grantee/privilege objects."""
    return (
        "COALESCE(("
        "SELECT jsonb_agg(jsonb_build_object("
        "'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' "
        "ELSE pg_get_userbyid(a.grantee) END,"
        "'privilege', a.privilege_type,"
        "'grantable', a.is_grantable"
        ") ORDER BY a.grantee, a.privilege_type) "
        f"FROM aclexplode({column}) a"
        "), '[]'::jsonb)"
    )


def _existing_schemas(conn: psycopg.Connection, requested: Iterable[str]) -> list[str]:
    rows = conn.execute(
        "SELECT nspname FROM pg_namespace WHERE nspname = ANY(%s) ORDER BY nspname",
        (list(requested),),
    ).fetchall()
    return [row[0] for row in rows]


def _roles(conn: psycopg.Connection, requested: Iterable[str]) -> dict[str, list[str]]:
    """Return requested roles that exist, plus every membership involving them."""
    rows = conn.execute(
        "SELECT rolname FROM pg_roles WHERE rolname = ANY(%s) ORDER BY rolname",
        (list(requested),),
    ).fetchall()
    roles = [row[0] for row in rows]
    memberships = conn.execute(
        """
        SELECT parent.rolname, member.rolname, membership.admin_option
        FROM pg_auth_members membership
        JOIN pg_roles parent ON parent.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE parent.rolname = ANY(%s) OR member.rolname = ANY(%s)
        ORDER BY parent.rolname, member.rolname
        """,
        (roles, roles),
    ).fetchall()
    return {
        "roles": roles,
        "memberships": [
            {"role": row[0], "member": row[1], "admin_option": row[2]}
            for row in memberships
        ],
    }


def collect(
    conn: psycopg.Connection,
    *,
    schemas: Iterable[str] = DEFAULT_SCHEMAS,
    roles: Iterable[str] = DEFAULT_ROLES,
) -> dict[str, Any]:
    """Collect the permission snapshot. The caller owns the connection."""
    existing_schemas = _existing_schemas(conn, schemas)
    role_info = _roles(conn, roles)
    existing_roles = role_info["roles"]

    schema_rows = conn.execute(
        f"""
        SELECT n.nspname,
               pg_get_userbyid(n.nspowner) AS owner,
               {_json_acl('n.nspacl')} AS acl
        FROM pg_namespace n
        WHERE n.nspname = ANY(%s)
        ORDER BY n.nspname
        """,
        (existing_schemas,),
    ).fetchall()

    relation_rows = conn.execute(
        f"""
        SELECT n.nspname,
               c.relname,
               c.relkind,
               c.oid,
               pg_get_userbyid(c.relowner) AS owner,
               c.relrowsecurity,
               c.relforcerowsecurity,
               {_json_acl('c.relacl')} AS acl
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(%s)
          AND c.relkind = ANY(%s)
        ORDER BY n.nspname, c.relname
        """,
        (existing_schemas, list(RELATION_KINDS)),
    ).fetchall()

    function_rows = conn.execute(
        f"""
        SELECT n.nspname,
               p.proname,
               pg_get_function_identity_arguments(p.oid) AS arguments,
               pg_get_userbyid(p.proowner) AS owner,
               p.prosecdef,
               p.proconfig,
               {_json_acl('p.proacl')} AS acl
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY(%s)
          AND p.prokind IN ('f', 'p')
        ORDER BY n.nspname, p.proname, arguments
        """,
        (existing_schemas,),
    ).fetchall()

    policy_rows = conn.execute(
        """
        SELECT schemaname, tablename, policyname, permissive, roles, cmd,
               qual, with_check
        FROM pg_policies
        WHERE schemaname = ANY(%s)
        ORDER BY schemaname, tablename, policyname
        """,
        (existing_schemas,),
    ).fetchall()

    default_acl_rows = conn.execute(
        f"""
        SELECT pg_get_userbyid(d.defaclrole) AS owner,
               n.nspname,
               d.defaclobjtype,
               {_json_acl('d.defaclacl')} AS acl
        FROM pg_default_acl d
        LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = ANY(%s) OR n.nspname IS NULL
        ORDER BY owner, n.nspname NULLS FIRST, d.defaclobjtype
        """,
        (existing_schemas,),
    ).fetchall()

    relations_by_role = []
    for role in existing_roles:
        schema_usage = {
            schema: conn.execute(
                "SELECT has_schema_privilege(%s, %s, 'USAGE')",
                (role, schema),
            ).fetchone()[0]
            for schema in existing_schemas
        }
        readable = []
        writable = []
        sequence_readable = []
        for schema, name, kind, oid, _owner, _rls, _force_rls, _acl in relation_rows:
            qualified = f"{schema}.{name}"
            if kind == "S":
                if conn.execute(
                    "SELECT has_sequence_privilege(%s, %s::oid, 'SELECT')",
                    (role, oid),
                ).fetchone()[0]:
                    sequence_readable.append(qualified)
                continue
            if kind not in ("r", "p", "v", "m", "f"):
                continue
            if conn.execute(
                "SELECT has_table_privilege(%s, %s::oid, 'SELECT')", (role, oid)
            ).fetchone()[0]:
                readable.append(qualified)
            if conn.execute(
                "SELECT has_table_privilege(%s, %s::oid, 'INSERT,UPDATE,DELETE')",
                (role, oid),
            ).fetchone()[0]:
                writable.append(qualified)

        executable = []
        for schema, name, arguments, _owner, _definer, _config, _acl in function_rows:
            oid = conn.execute(
                "SELECT p.oid FROM pg_proc p "
                "JOIN pg_namespace n ON n.oid = p.pronamespace "
                "WHERE n.nspname = %s AND p.proname = %s "
                "AND pg_get_function_identity_arguments(p.oid) = %s",
                (schema, name, arguments),
            ).fetchone()
            if oid and conn.execute(
                "SELECT has_function_privilege(%s, %s::oid, 'EXECUTE')",
                (role, oid[0]),
            ).fetchone()[0]:
                executable.append(f"{schema}.{name}({arguments})")

        relations_by_role.append(
            {
                "role": role,
                "schema_usage": schema_usage,
                "readable_relations": readable,
                "writable_relations": writable,
                "readable_sequences": sequence_readable,
                "executable_functions": executable,
            }
        )

    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "database": conn.execute("SELECT current_database()").fetchone()[0],
        "current_user": conn.execute("SELECT current_user").fetchone()[0],
        "schemas": existing_schemas,
        "roles": role_info,
        "role_attributes": _role_attributes(conn, existing_roles),
        "schema_privileges": [
            {"schema": row[0], "owner": row[1], "acl": row[2]} for row in schema_rows
        ],
        "relations": [
            {
                "schema": row[0],
                "name": row[1],
                "kind": RELATION_KINDS.get(row[2], row[2]),
                "owner": row[4],
                "rls_enabled": row[5],
                "rls_forced": row[6],
                "acl": row[7],
            }
            for row in relation_rows
        ],
        "functions": [
            {
                "schema": row[0],
                "name": row[1],
                "arguments": row[2],
                "owner": row[3],
                "security_definer": row[4],
                "config": row[5],
                "acl": row[6],
            }
            for row in function_rows
        ],
        "policies": [
            {
                "schema": row[0],
                "table": row[1],
                "name": row[2],
                "permissive": row[3],
                "roles": row[4],
                "command": row[5],
                "using": row[6],
                "check": row[7],
            }
            for row in policy_rows
        ],
        "default_privileges": [
            {
                "owner": row[0],
                "schema": row[1],
                "object_type": row[2],
                "acl": row[3],
            }
            for row in default_acl_rows
        ],
        "effective_access": relations_by_role,
    }


def render_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        "# Sabha database permission inventory",
        "",
        f"- Captured: {snapshot['captured_at']}",
        f"- Database: `{snapshot['database']}`",
        f"- Connected as: `{snapshot['current_user']}`",
        f"- Schemas: {', '.join(f'`{s}`' for s in snapshot['schemas']) or '(none)'}",
        "",
        "## Roles and memberships",
        "",
        "| Role | Superuser | Bypass RLS | Login |",
        "| --- | --- | --- | --- |",
    ]
    role_attributes = snapshot.get("role_attributes", {})
    for role in snapshot["roles"]["roles"]:
        attributes = role_attributes.get(role, {})
        lines.append(
            f"| `{role}` | {attributes.get('superuser', '?')} | "
            f"{attributes.get('bypass_rls', '?')} | {attributes.get('login', '?')} |"
        )
    for membership in snapshot["roles"]["memberships"]:
        lines.append(
            f"- `{membership['member']}` is a member of `{membership['role']}`"
            + (" (admin option)" if membership["admin_option"] else "")
        )

    lines += ["", "## Effective access", ""]
    for entry in snapshot["effective_access"]:
        lines.append(f"### `{entry['role']}`")
        lines.append("")
        lines.append(
            "- Schema USAGE: "
            + (
                ", ".join(
                    f"`{schema}`={'yes' if granted else 'no'}"
                    for schema, granted in entry["schema_usage"].items()
                )
                or "(no managed schemas)"
            )
        )
        lines.append(
            "- Reads: "
            + (", ".join(f"`{name}`" for name in entry["readable_relations"]) or "none")
        )
        lines.append(
            "- Writes: "
            + (", ".join(f"`{name}`" for name in entry["writable_relations"]) or "none")
        )
        lines.append(
            "- Sequence reads: "
            + (
                ", ".join(f"`{name}`" for name in entry["readable_sequences"])
                or "none"
            )
        )
        lines.append(
            "- Function EXECUTE: "
            + (
                ", ".join(f"`{name}`" for name in entry["executable_functions"])
                or "none"
            )
        )
        lines.append("")

    lines += ["## RLS policies", ""]
    if snapshot["policies"]:
        lines.append("| Schema | Table | Policy | Command | Roles | Using |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for policy in snapshot["policies"]:
            lines.append(
                f"| {policy['schema']} | {policy['table']} | {policy['name']} | "
                f"{policy['command']} | {policy['roles']} | {policy['using']} |"
            )
    else:
        lines.append("No policies in the managed schemas.")

    lines += ["", "## Default privileges", ""]
    if snapshot["default_privileges"]:
        for entry in snapshot["default_privileges"]:
            schema = entry["schema"] or "(global)"
            lines.append(
                f"- `{entry['owner']}` in {schema} for `{entry['object_type']}`: "
                f"{json.dumps(entry['acl'])}"
            )
    else:
        lines.append("No default privileges are recorded in the managed schemas.")

    return "\n".join(lines) + "\n"


def _role_attributes(conn: psycopg.Connection, roles: Iterable[str]) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
        FROM pg_roles WHERE rolname = ANY(%s) ORDER BY rolname
        """,
        (list(roles),),
    ).fetchall()
    return {
        row[0]: {
            "superuser": row[1],
            "bypass_rls": row[2],
            "login": row[3],
        }
        for row in rows
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="PostgreSQL URL (defaults to DATABASE_URL)",
    )
    parser.add_argument(
        "--schema",
        action="append",
        dest="schemas",
        help="Schema to inventory; repeatable (default: public, replay, storage)",
    )
    parser.add_argument(
        "--role",
        action="append",
        dest="roles",
        help="Role to compute effective access for; repeatable",
    )
    parser.add_argument(
        "--format", choices=("markdown", "json"), default="markdown"
    )
    parser.add_argument("--output", help="Write to a file instead of stdout")
    args = parser.parse_args(argv)

    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    schemas = args.schemas or list(DEFAULT_SCHEMAS)
    roles = args.roles or list(DEFAULT_ROLES)
    with psycopg.connect(args.database_url) as conn:
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        snapshot = collect(conn, schemas=schemas, roles=roles)

    rendered = (
        json.dumps(snapshot, indent=2, sort_keys=True)
        if args.format == "json"
        else render_markdown(snapshot)
    )
    if args.output:
        with open(args.output, "w", encoding="utf-8") as stream:
            stream.write(rendered)
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
