"""Regression for the ignored persona stack edits.

PUT /api/personas/{id} accepted a stack_ids field, but PersonaUpdate never
declared it, so every assignment edit was silently dropped: adding a stack,
clearing with [], deduped lists, and rejection of unknown stacks all failed.

Semantics implemented per spec:
- field omitted or JSON null  -> existing assignments unchanged
- stack_ids: []               -> all assignments removed
- stack_ids: ["a","a","b"]    -> deduped to one row per id
- unknown stack id            -> rejected with NO prior assignments lost
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from app.modules.persona_catalog.infrastructure.supabase import (
    SupabasePersonaCatalog,
    SupabasePromptCatalog,
)
from tests.doubles.supabase_stub import stub_for

PERSONA_ID = "11111111-1111-4111-8111-111111111111"
STACK_A = "00000000-0000-4000-8000-00000000000a"
STACK_B = "00000000-0000-4000-8000-00000000000b"
STACK_UNKNOWN = "00000000-0000-4000-8000-00000000dead"


@pytest.fixture()
def persona_env(disposable_db):
    """Throwaway DB with a baseline persona and two knowledge stacks, the
    FastAPI test client wired to it through the supabase stub. The module
    routes are composed over the same adapters production wires; the stub
    supplies the real backend Supabase client for this test app."""
    with disposable_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO personas (id, name, subtitle) VALUES (%s, 'Advisor', 'Skeptical')
            """,
            (PERSONA_ID,),
        )
        for sid, name in ((STACK_A, "Market data"), (STACK_B, "Customer research")):
            conn.execute(
                "INSERT INTO knowledge_stacks (id, name) VALUES (%s, %s)",
                (sid, name),
            )

    stub = stub_for(disposable_db)
    app = create_app(
        Container(
            persona_catalog=SupabasePersonaCatalog(lambda: stub),
            prompt_catalog=SupabasePromptCatalog(lambda: stub),
        )
    )
    client = TestClient(app)
    return client, disposable_db


def _get_persona(client) -> dict:
    response = client.get(f"/api/personas/{PERSONA_ID}")
    assert response.status_code == 200
    return response.json()


def test_persona_update_persists_stack_ids(persona_env):
    client, _ = persona_env
    response = client.put(
        f"/api/personas/{PERSONA_ID}",
        json={"stack_ids": [STACK_A]},
    )
    assert response.status_code == 200, response.text

    saved = _get_persona(client)
    assert sorted(saved["stack_ids"]) == [STACK_A]


def test_persona_update_semantics_omit_clear_and_dedupe(persona_env):
    client, db = persona_env

    # Add baseline assignment, then update WITHOUT the field: unchanged.
    client.put(f"/api/personas/{PERSONA_ID}", json={"stack_ids": [STACK_A, STACK_B]})
    client.put(f"/api/personas/{PERSONA_ID}", json={"subtitle": "Changed"})
    assert sorted(_get_persona(client)["stack_ids"]) == [STACK_A, STACK_B]

    # Explicit null: unchanged.
    client.put(f"/api/personas/{PERSONA_ID}", json={"stack_ids": None})
    assert sorted(_get_persona(client)["stack_ids"]) == [STACK_A, STACK_B]

    # Empty list: clears assignments.
    response = client.put(f"/api/personas/{PERSONA_ID}", json={"stack_ids": []})
    assert response.status_code == 200
    assert _get_persona(client)["stack_ids"] == []

    # Re-set with duplicates: deduped to exactly one row per id.
    response = client.put(
        f"/api/personas/{PERSONA_ID}",
        json={"stack_ids": [STACK_B, STACK_B, STACK_A, STACK_B]},
    )
    assert response.status_code == 200
    saved = _get_persona(client)
    assert sorted(saved["stack_ids"]) == [STACK_A, STACK_B]
    rows = db.query(
        "SELECT COUNT(*) FROM persona_knowledge_stacks WHERE persona_id = %s",
        [PERSONA_ID],
    )
    assert rows[0][0] == 2


def test_persona_update_rejects_unknown_stack_ids_without_losing_existing(persona_env):
    client, db = persona_env

    client.put(f"/api/personas/{PERSONA_ID}", json={"stack_ids": [STACK_A]})
    baseline = _get_persona(client)["stack_ids"]
    assert baseline == [STACK_A]

    response = client.put(
        f"/api/personas/{PERSONA_ID}",
        json={"stack_ids": [STACK_UNKNOWN]},
    )
    assert response.status_code in (400, 422), response.text
    assert "unknown" in response.json()["detail"].lower()

    assert _get_persona(client)["stack_ids"] == [STACK_A]

    rows = db.query(
        "SELECT COUNT(*) FROM persona_knowledge_stacks WHERE persona_id = %s",
        [PERSONA_ID],
    )
    assert rows[0][0] == 1


def test_persona_update_stack_replacement_is_atomic(persona_env):
    """Failure of the replacement must leave the previous assignment intact.

    Validated at the database boundary: replacing with an unknown stack in a
    single call must raise and roll back, keeping prior rows.
    """
    client, db = persona_env
    stub = stub_for(db)

    client.put(f"/api/personas/{PERSONA_ID}", json={"stack_ids": [STACK_A]})

    with pytest.raises(Exception):
        stub.rpc(
            "replace_persona_stacks",
            {"p_persona_id": PERSONA_ID, "p_stack_ids": [STACK_UNKNOWN]},
        ).execute()

    rows = db.query(
        "SELECT COUNT(*) FROM persona_knowledge_stacks WHERE persona_id = %s",
        [PERSONA_ID],
    )
    assert rows[0][0] == 1
    stack_ids = db.query(
        "SELECT stack_id FROM persona_knowledge_stacks WHERE persona_id = %s",
        [PERSONA_ID],
    )
    assert str(stack_ids[0][0]) == STACK_A
