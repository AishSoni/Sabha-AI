"""Spec 20 budget: the persona list is three round trips regardless of rows.

The legacy fanout issued one prompt query and one stack query per persona
(1 + 2N). This test replaces the characterisation that pinned that shape.
"""

from __future__ import annotations

import pytest

from app.modules.persona_catalog.infrastructure.supabase import (
    SupabasePersonaCatalog,
)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client: "_CountingClient", table: str) -> None:
        self._client = client
        self._table = table

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        def chain(*args, **kwargs):
            return self

        return chain

    def execute(self):
        self._client.executes += 1
        return _Result(self._client.data.get(self._table, []))


class _CountingClient:
    def __init__(self, data: dict[str, object]) -> None:
        self.data = data
        self.executes = 0

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _catalog(personas: list[dict]) -> tuple[SupabasePersonaCatalog, _CountingClient]:
    client = _CountingClient(
        {
            "personas": personas,
            "prompt_versions": [
                {
                    "persona_id": persona["id"],
                    "content": f"prompt-{persona['id']}",
                    "version": 1,
                }
                for persona in personas
            ],
            "persona_knowledge_stacks": [
                {"persona_id": persona["id"], "stack_id": f"stack-{persona['id']}"}
                for persona in personas
            ],
        }
    )
    return SupabasePersonaCatalog(lambda: client), client


async def test_persona_list_is_three_round_trips_for_nine_rows():
    personas = [
        {"id": f"persona-{index}", "name": f"Persona {index}"}
        for index in range(9)
    ]
    catalog, client = _catalog(personas)

    rows = await catalog.list_templates(user_id="user-1")

    assert len(rows) == 9
    assert client.executes == 3
    assert rows[0]["active_prompt"] == "prompt-persona-0"
    assert rows[0]["stack_ids"] == ["stack-persona-0"]


async def test_persona_list_round_trips_do_not_grow_with_row_count():
    one, one_client = _catalog([{"id": "persona-0", "name": "One"}])
    many, many_client = _catalog(
        [{"id": f"persona-{index}", "name": f"P{index}"} for index in range(25)]
    )

    await one.list_templates(user_id="user-1")
    await many.list_templates(user_id="user-1")

    assert one_client.executes == 3
    assert many_client.executes == 3


async def test_empty_persona_list_skips_the_assignment_queries():
    catalog, client = _catalog([])

    assert await catalog.list_templates(user_id="user-1") == []
    assert client.executes == 1
