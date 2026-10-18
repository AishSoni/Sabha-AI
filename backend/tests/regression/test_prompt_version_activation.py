"""Regression: prompt-version activation must stay atomic.

Evidence (finding: prompt selection atomicity): PersonaManager.
activate_prompt_version deactivates every version BEFORE activating the
target, so activating a nonexistent version destroys the previous active
selection instead of being refused. create_prompt_version interleaves
deactivate/insert/update statements without a transaction, so a failure
between statements leaves the persona with no active prompt. The unique
partial index + SQL RPCs make both flows atomic; failed changes preserve
the previous selection.
"""

from datetime import datetime, timezone
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

PERSONA_ID = "88888888-8888-4888-8888-888888888888"
V1_ID = "88888888-8888-4888-8888-888888888811"
V2_ID = "88888888-8888-4888-8888-888888888822"
NEW_VERSION_ID = "88888888-8888-4888-8888-888888888899"

MIGRATION_007 = "007_prompt_version_activation.sql"


@pytest.fixture()
def prompt_env(disposable_db, monkeypatch):
    """Persona with an active v1 prompt and an inactive v2 plus a wired stub."""
    from tests.doubles.supabase_stub import stub_for

    now = datetime.now(timezone.utc).isoformat()
    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO personas (id, name, subtitle, color, is_default)
            VALUES (%s, 'Advisor', 'Technical Architecture Lead', '#f97316', TRUE)
            """,
            (PERSONA_ID,),
        )
        conn.execute(
            """
            INSERT INTO prompt_versions (id, persona_id, version, content, is_active, created_at)
            VALUES (%s, %s, 1, 'old directive', TRUE, %s), (%s, %s, 2, 'new draft', FALSE, %s)
            """,
            (V1_ID, PERSONA_ID, now, V2_ID, PERSONA_ID, now),
        )

    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.services.persona_manager.get_supabase", lambda: stub)

    from main import app
    from app.services.persona_manager import PersonaManager

    return {
        "db": disposable_db,
        "stub": stub,
        "manager": PersonaManager(),
    }


def _active_version(db):
    rows = db.query(
        "SELECT version FROM prompt_versions WHERE is_active AND persona_id = %s",
        (PERSONA_ID,),
    )
    assert len(rows) <= 1, "prompt_versions unique-active invariant violated"
    return rows[0][0] if rows else None


def _active_count(db):
    return db.query(
        "SELECT COUNT(*) FROM prompt_versions WHERE persona_id = %s", (PERSONA_ID,)
    )[0][0]


async def test_failed_activation_preserves_previous_selection(prompt_env):
    assert await prompt_env["manager"].activate_prompt_version(PERSONA_ID, 99) is False
    assert _active_version(prompt_env["db"]) == 1


async def test_successful_activation_replaces_previous_selection(prompt_env):
    assert await prompt_env["manager"].activate_prompt_version(PERSONA_ID, 2) is True
    assert _active_version(prompt_env["db"]) == 2


def test_unique_partial_index_forbids_two_active_versions(prompt_env):
    with pytest.raises(psycopg.errors.UniqueViolation):
        with prompt_env["db"].connect() as conn:
            conn.execute(
                "UPDATE prompt_versions SET is_active = TRUE WHERE persona_id = %s",
                (PERSONA_ID,),
            )


def test_create_prompt_version_failure_keeps_previous_active(prompt_env):
    # Direct RPC failure path (content NULL violates prompt_versions.content
    # NOT NULL): the whole activation must roll back, keeping v1 active.
    with pytest.raises(psycopg.errors.NotNullViolation):
        prompt_env["stub"].rpc(
            "create_prompt_version",
            {
                "p_persona_id": PERSONA_ID,
                "p_content": None,
                "p_version_id": NEW_VERSION_ID,
                "p_created_at": datetime.now(timezone.utc).isoformat(),
            },
        ).execute()
    assert _active_version(prompt_env["db"]) == 1


async def test_create_prompt_version_success_appends_and_replaces_active(prompt_env):
    from app.models import PromptVersionCreate

    created = await prompt_env["manager"].create_prompt_version(
        PERSONA_ID,
        PromptVersionCreate(content="becomes the directive"),
    )
    assert created.version == 3
    assert created.is_active is True
    assert _active_version(prompt_env["db"]) == 3
    assert _active_count(prompt_env["db"]) == 3


def test_upgrade_migration_repairs_duplicates_and_enforces_invariant(legacy_db):
    # Legacy shape: two active versions coexist (no invariant yet).
    now = datetime.now(timezone.utc).isoformat()
    with legacy_db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color, is_default) VALUES (%s, 'Legacy Advisor', 'Critical Research Specialist', '#22c55e', TRUE)",
            (PERSONA_ID,),
        )
        conn.execute(
            """
            INSERT INTO prompt_versions (id, persona_id, version, content, is_active, created_at)
            VALUES (%s, %s, 1, 'legacy v1', TRUE, %s), (%s, %s, 2, 'legacy v2', TRUE, %s)
            """,
            (V1_ID, PERSONA_ID, now, V2_ID, PERSONA_ID, now),
        )

    migration = Path(__file__).resolve().parents[2] / "migrations" / MIGRATION_007
    with legacy_db.connect() as conn:
        conn.execute(migration.read_text(encoding="utf-8"))

    rows = legacy_db.query(
        "SELECT version FROM prompt_versions WHERE is_active AND persona_id = %s",
        (PERSONA_ID,),
    )
    assert [r[0] for r in rows] == [2], "dedupe must keep the highest version active"

    with pytest.raises(psycopg.errors.UniqueViolation):
        with legacy_db.connect() as conn:
            conn.execute(
                "UPDATE prompt_versions SET is_active = TRUE WHERE persona_id = %s",
                (PERSONA_ID,),
            )
