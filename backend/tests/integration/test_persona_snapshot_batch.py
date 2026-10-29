"""The batched persona snapshot must repeat the single-template contract."""

from __future__ import annotations

import pytest

from tests.doubles.supabase_stub import stub_for

PERSONA_A = "11111111-1111-4111-8111-111111111111"
PERSONA_B = "22222222-2222-4222-8222-222222222222"
UNKNOWN = "33333333-3333-4333-8333-333333333333"
STACK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
STACK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _seed(db) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO knowledge_stacks (id, name) VALUES (%s, %s), (%s, %s)",
            (STACK_A, "Filings", STACK_B, "Notes"),
        )
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES"
            " (%s, %s, %s, %s), (%s, %s, %s, %s)",
            (
                PERSONA_A,
                "Open Questioner",
                "analyst",
                "#22c55e",
                PERSONA_B,
                "Quiet Chair",
                "chair",
                "#111111",
            ),
        )
        conn.execute(
            "INSERT INTO prompt_versions (persona_id, version, content, is_active)"
            " VALUES (%s, %s, %s, false), (%s, %s, %s, true)",
            (PERSONA_A, 1, "old prompt", PERSONA_A, 2, "current prompt"),
        )
        conn.execute(
            "INSERT INTO persona_knowledge_stacks (persona_id, stack_id)"
            " VALUES (%s, %s), (%s, %s)",
            (PERSONA_A, STACK_B, PERSONA_A, STACK_A),
        )


def _single(db, persona_id: str):
    return (
        stub_for(db)
        .rpc("read_persona_creation_snapshot", {"p_persona_id": persona_id})
        .execute()
        .data
    )


def _batch(db, persona_ids: list[str]):
    return (
        stub_for(db)
        .rpc(
            "read_persona_creation_snapshots",
            {"p_persona_ids": persona_ids},
        )
        .execute()
        .data
    )


@pytest.mark.asyncio
async def test_batch_matches_the_single_snapshot_shape(disposable_db):
    _seed(disposable_db)

    rows = _batch(disposable_db, [PERSONA_A, PERSONA_B, UNKNOWN])

    assert [str(row["id"]) for row in rows] == [PERSONA_A, PERSONA_B]
    assert rows[0] == _single(disposable_db, PERSONA_A)
    assert rows[1] == _single(disposable_db, PERSONA_B)
    assert rows[0]["active_prompt"] == "current prompt"
    assert rows[0]["active_prompt_version"] == 2
    assert rows[0]["stack_ids"] == [STACK_A, STACK_B]
    assert rows[1]["active_prompt"] is None
    assert rows[1]["stack_ids"] == []


@pytest.mark.asyncio
async def test_empty_batch_is_a_null_safe_empty_list(disposable_db):
    _seed(disposable_db)

    assert _batch(disposable_db, []) == []
    assert _batch(disposable_db, [UNKNOWN]) == []
