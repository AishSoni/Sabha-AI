"""Smoke tests for the disposable-database fixture machinery itself.

Proves that the embedded Postgres cluster builds, applies Sabha's auth stub +
full schema chain (supabase_schema.sql, migrations 002, 003), and is dropped
again afterwards. Real schema behavior is exercised in the dedicated
integration tests per finding.
"""

import psycopg


def test_full_schema_chain_applies(disposable_db):
    tables = disposable_db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
    )
    names = {row[0] for row in tables}
    expected = {
        "meetings",
        "ai_participants",
        "messages",
        "disagreements",
        "consensus",
        "documents",
        "personas",
        "prompt_versions",
        "knowledge_stacks",
        "persona_knowledge_stacks",
    }
    missing = expected - names
    assert not missing, f"schema did not create: {missing}"


def test_disposable_databases_are_isolated(pg_server, disposable_db):
    # Creating a second DB must not see the first one's data.
    import uuid
    from urllib.parse import urlsplit, urlunsplit

    base_uri = pg_server.get_uri()
    other_name = "sabha_t_" + uuid.uuid4().hex[:10]
    admin = psycopg.connect(base_uri, autocommit=True)
    admin.execute(f'CREATE DATABASE "{other_name}"')
    admin.close()
    other_uri = urlunsplit(urlsplit(base_uri)._replace(path=f"/{other_name}"))
    other = disposable_db.__class__(other_uri, other_name)
    try:
        # A second freshly created database shares nothing with the first:
        # no tables migrated, no data visible.
        first_tables = {
            row[0] for row in disposable_db.query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
        }
        other_tables = {
            row[0] for row in other.query(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
        }
        assert "documents" in first_tables
        assert not other_tables, f"fresh DB leaked tables: {other_tables}"
    finally:
        cleanup = psycopg.connect(base_uri, autocommit=True)
        cleanup.execute(f'DROP DATABASE IF EXISTS "{other_name}"')
        cleanup.close()
