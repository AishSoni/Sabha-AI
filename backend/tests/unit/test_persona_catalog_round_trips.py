"""Spec 20 characterisation: the persona list fanout is 1 + 2N round trips.

This pins the current (pre-consolidation) shape so the regression is visible.
Slice 6 replaces it with a batched read and the budget drops to at most three
round trips regardless of row count.
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


@pytest.mark.asyncio
async def test_persona_list_round_trips_grow_with_row_count():
    personas = [{"id": f"persona-{index}", "name": f"Persona {index}"} for index in range(9)]
    client = _CountingClient(
        {
            "personas": personas,
            "prompt_versions": [{"content": "prompt", "version": 1}],
            "persona_knowledge_stacks": [{"stack_id": "stack-1"}],
        }
    )
    catalog = SupabasePersonaCatalog(lambda: client)

    rows = await catalog.list_templates(user_id="user-1")

    assert len(rows) == 9
    assert client.executes == 1 + 2 * len(personas)
