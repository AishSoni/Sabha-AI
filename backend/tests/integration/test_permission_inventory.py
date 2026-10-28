"""Integration: the permission inventory records inherited PUBLIC reads.

Spec 12's starting evidence is a contradiction: a role granted nothing still
reads every live meeting because migrations 009 and 013 granted SELECT to
``PUBLIC``. The inventory must show that effective privilege (not just the
explicit grants) before the forward migration removes it.
"""

import psycopg

from scripts.inventory_permissions import collect, render_markdown


def _create_ungranted_role(db, name: str = "sabha_probe") -> None:
    with db.connect() as conn:
        conn.execute(
            "DO $$ BEGIN "
            f"IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{name}') THEN "
            f"CREATE ROLE {name} NOSUPERUSER NOBYPASSRLS NOLOGIN; "
            "END IF; END $$"
        )


def _entry(snapshot: dict, role: str) -> dict:
    return next(
        entry for entry in snapshot["effective_access"] if entry["role"] == role
    )


def test_inventory_reports_live_reads_through_public(pre_isolation_db):
    with pre_isolation_db.connect() as conn:
        conn.execute("INSERT INTO meetings (name) VALUES ('Live sentinel')")
    _create_ungranted_role(pre_isolation_db)

    with pre_isolation_db.connect() as conn:
        snapshot = collect(
            conn,
            schemas=["public"],
            roles=["anon", "authenticated", "service_role", "sabha_probe"],
        )

    for role in ("anon", "authenticated", "sabha_probe"):
        entry = _entry(snapshot, role)
        assert "public.meetings" in entry["readable_relations"], (
            f"{role} should inherit PUBLIC SELECT before isolation"
        )
        assert "public.meetings" not in entry["writable_relations"]

    # Migration 029 already closed the internal tables; isolation must not be
    # mistaken for a blanket leak.
    anon = _entry(snapshot, "anon")
    assert "public.documents" not in anon["readable_relations"]

    meetings = next(
        relation
        for relation in snapshot["relations"]
        if relation["schema"] == "public" and relation["name"] == "meetings"
    )
    assert any(
        grant["grantee"] == "PUBLIC" and grant["privilege"] == "SELECT"
        for grant in meetings["acl"]
    )

    rendered = render_markdown(snapshot)
    assert "public.meetings" in rendered
    assert "Effective access" in rendered


def test_inventory_entry_point_actually_reads_live_rows(pre_isolation_db):
    """Effective privilege means a real session can read, not just a catalog bit."""
    with pre_isolation_db.connect() as conn:
        conn.execute("INSERT INTO meetings (name) VALUES ('Readable sentinel')")
    _create_ungranted_role(pre_isolation_db)

    probe = psycopg.connect(pre_isolation_db.uri, autocommit=True)
    probe.execute("SET ROLE sabha_probe")
    try:
        names = probe.execute("SELECT name FROM meetings").fetchall()
        assert ("Readable sentinel",) in names
    finally:
        probe.close()
