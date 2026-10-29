"""Persona list cache: single load, scoped keys, write invalidation (spec 20)."""

from __future__ import annotations

from app.modules.persona_catalog.infrastructure.supabase import (
    SupabasePersonaCatalog,
    SupabasePromptCatalog,
)
from app.platform.cache import TTLCache


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client: "_Client", kind: str, name: str) -> None:
        self._client = client
        self._kind = kind
        self._name = name

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        def chain(*args, **kwargs):
            return self

        return chain

    def execute(self):
        self._client.executes += 1
        if self._kind == "rpc":
            return _Result(
                {
                    "id": "persona-created",
                    "name": "Created",
                    "subtitle": None,
                    "color": None,
                    "avatar_url": None,
                    "provider_config": {},
                    "is_default": False,
                    "user_id": "user-1",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                    "active_prompt": "prompt",
                    "active_prompt_version": 1,
                    "stack_ids": [],
                }
            )
        return _Result(self._client.data.get(self._name, []))


class _Client:
    def __init__(self, data: dict[str, object] | None = None) -> None:
        self.data = data or {}
        self.executes = 0

    def table(self, name: str) -> _Query:
        return _Query(self, "table", name)

    def rpc(self, name: str, params: dict | None = None) -> _Query:
        return _Query(self, "rpc", name)


def _personas(count: int) -> list[dict]:
    return [
        {"id": f"persona-{index}", "name": f"Persona {index}"}
        for index in range(count)
    ]


def _client(personas: list[dict]) -> _Client:
    return _Client(
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
            "persona_knowledge_stacks": [],
        }
    )


async def test_the_list_is_served_from_cache_without_a_round_trip():
    client = _client(_personas(3))
    cache = TTLCache(ttl_seconds=60, clock=FakeClock())
    catalog = SupabasePersonaCatalog(lambda: client, list_cache=cache)

    first = await catalog.list_templates(user_id="user-1")
    second = await catalog.list_templates(user_id="user-1")

    assert first == second
    assert client.executes == 3
    assert cache.stats()["hits"] == 1


async def test_each_scope_has_its_own_entry():
    client = _client(_personas(2))
    cache = TTLCache(ttl_seconds=60, clock=FakeClock())
    catalog = SupabasePersonaCatalog(lambda: client, list_cache=cache)

    await catalog.list_templates(user_id="user-1")
    await catalog.list_templates(user_id="user-2")
    await catalog.list_templates(user_id="user-1", include_defaults=False)

    assert client.executes == 9


async def test_a_catalog_write_invalidates_the_list():
    client = _client(_personas(2))
    cache = TTLCache(ttl_seconds=60, clock=FakeClock())
    catalog = SupabasePersonaCatalog(lambda: client, list_cache=cache)

    await catalog.list_templates(user_id="user-1")
    await catalog.create_persona(
        "persona-new",
        "New",
        subtitle=None,
        color=None,
        avatar_url=None,
        provider_config={},
        is_default=False,
        user_id="user-1",
        system_prompt="prompt",
        prompt_id="prompt-1",
        created_at="2026-01-01T00:00:00+00:00",
        stack_ids=[],
    )
    await catalog.list_templates(user_id="user-1")

    assert client.executes == 7


async def test_prompt_activation_through_the_shared_cache_invalidates():
    client = _client(_personas(2))
    cache = TTLCache(ttl_seconds=60, clock=FakeClock())
    persona_catalog = SupabasePersonaCatalog(lambda: client, list_cache=cache)
    prompt_catalog = SupabasePromptCatalog(lambda: client, list_cache=cache)

    await persona_catalog.list_templates(user_id="user-1")
    await prompt_catalog.activate_prompt_version("persona-0", 2)
    await persona_catalog.list_templates(user_id="user-1")

    assert client.executes == 7


async def test_entries_expire_after_the_ttl():
    clock = FakeClock()
    client = _client(_personas(2))
    cache = TTLCache(ttl_seconds=30, clock=clock)
    catalog = SupabasePersonaCatalog(lambda: client, list_cache=cache)

    await catalog.list_templates(user_id="user-1")
    clock.now = 31.0
    await catalog.list_templates(user_id="user-1")

    assert client.executes == 6
