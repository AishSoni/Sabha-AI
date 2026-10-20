"""Route composition contract for the template-catalog cutover (spec 06).

The persona CRUD routes must reach the catalog through the container's
injected ``persona_catalog`` port — the same posture the activation
slice established for prompt selection. Route handlers never build a
client themselves; refusals map to typed HTTP outcomes (404 unknown,
422 validation/unknown stacks, 409 edit conflict) and infrastructure
failures stay behind the safe 503 translation.

Red until ``app.bootstrap.Container`` carries a ``persona_catalog``
field: the composition itself does not exist yet.
"""

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from app.modules.persona_catalog.application.contracts import (
    PersonaEditConflict,
    PromptCatalogUnavailable,
    TemplateNotFound,
    UnknownStacks,
)

PERSONA_ID = "11111111-1111-4111-8111-111111111111"
UNKNOWN_ID = "11111111-1111-4111-8111-111111111199"
VERSION_ID = "11111111-1111-4111-8111-111111111112"

LEAK_FORBIDDEN = ("supabase", "postgrest", "psycopg", "traceback", "sql")


class _MinimalPromptCatalog:
    """Container-shaped stub satisfying the activation slice only."""

    async def activate_prompt_version(self, persona_id, version):
        return True

    async def create_prompt_version(
        self, persona_id, content, *, version_id, created_at
    ):
        raise NotImplementedError


def _template_row(persona_id=PERSONA_ID, name="Contract Advisor"):
    return {
        "id": persona_id,
        "name": name,
        "subtitle": "Prompt Governance Lead",
        "color": "#0ea5e9",
        "avatar_url": None,
        "provider_config": {
            "provider": "openrouter",
            "model": "fixture/model",
            "temperature": 0.7,
            "max_tokens": 2000,
        },
        "is_default": True,
        "user_id": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "stack_ids": ["00000000-0000-4000-8000-00000000a001"],
        "active_prompt": "contract v1",
        "active_prompt_version": 1,
    }


def _version_rows():
    return [
        {
            "id": VERSION_ID,
            "persona_id": PERSONA_ID,
            "version": 2,
            "content": "contract v2",
            "is_active": False,
            "created_at": "2026-01-02T00:00:00Z",
        },
        {
            "id": "11111111-1111-4111-8111-111111111113",
            "persona_id": PERSONA_ID,
            "version": 1,
            "content": "contract v1",
            "is_active": True,
            "created_at": "2026-01-01T00:00:00Z",
        },
    ]


class FakePersonaCatalog:
    """Container-grade catalog double: an in-memory template store."""

    def __init__(self, conflict_name="Lose the race"):
        self.templates: dict[str, dict] = {}
        self.versions: dict[str, list[dict]] = {}
        self.calls: list = []
        self.list_calls: list = []
        self._exception: Exception | None = None
        self._conflict_name = conflict_name

    # -- seeding ------------------------------------------------------------

    def seed(self, row: dict, versions=()) -> None:
        self.templates[row["id"]] = dict(row)
        self.versions[row["id"]] = [dict(v) for v in versions]

    def fail_next_call(self, exception: Exception) -> None:
        self._exception = exception

    def _maybe_fail(self):
        if self._exception is not None:
            raise self._exception

    # -- port surface --------------------------------------------------------

    async def read_creation_snapshot(self, persona_id):
        self._maybe_fail()
        self.calls.append(("read_snapshot", persona_id))
        row = self.templates.get(persona_id)
        return dict(row) if row else None

    async def list_templates(self, user_id=None, include_defaults=True):
        self._maybe_fail()
        self.list_calls.append((user_id, include_defaults))
        return [dict(row) for row in self.templates.values()]

    async def list_prompt_versions(self, persona_id):
        self._maybe_fail()
        self.calls.append(("list_versions", persona_id))
        return [dict(v) for v in self.versions.get(persona_id, [])]

    async def create_persona(
        self, persona_id, name, *, subtitle, color, avatar_url,
        provider_config, is_default, user_id, system_prompt, prompt_id,
        created_at, stack_ids,
    ):
        self._maybe_fail()
        self.calls.append(("create", persona_id, name, tuple(stack_ids)))
        row = {
            "id": persona_id,
            "name": name,
            "subtitle": subtitle,
            "color": color,
            "avatar_url": avatar_url,
            "provider_config": dict(provider_config),
            "is_default": is_default,
            "user_id": user_id,
            "created_at": created_at,
            "updated_at": created_at,
            "stack_ids": list(stack_ids),
            "active_prompt": system_prompt,
            "active_prompt_version": 1 if system_prompt else None,
        }
        self.templates[persona_id] = row
        return dict(row)

    async def update_persona(self, persona_id, fields, expected_updated_at, updated_at):
        self._maybe_fail()
        self.calls.append(
            ("update", persona_id, dict(fields), expected_updated_at)
        )
        row = self.templates.get(persona_id)
        if row is None:
            raise TemplateNotFound(persona_id)
        if fields.get("name") == self._conflict_name:
            raise PersonaEditConflict(persona_id)
        if any(sid == "ghost-stack" for sid in fields.get("stack_ids") or []):
            raise UnknownStacks(["ghost-stack"])
        for key, value in fields.items():
            if value is not None:
                row[key] = value
        row["updated_at"] = updated_at
        return dict(row)

    async def create_prompt_version(
        self, persona_id, content, *, version_id, created_at
    ):
        self._maybe_fail()
        self.calls.append(("create_prompt", persona_id, content))
        if persona_id not in self.templates:
            raise TemplateNotFound(persona_id)
        versions = self.versions.setdefault(persona_id, [])
        for row in versions:
            row["is_active"] = False
        next_version = max((v["version"] for v in versions), default=0) + 1
        row = {
            "id": version_id,
            "persona_id": persona_id,
            "version": next_version,
            "content": content,
            "is_active": True,
            "created_at": created_at,
        }
        versions.append(row)
        self.templates[persona_id]["active_prompt"] = content
        self.templates[persona_id]["active_prompt_version"] = next_version
        return dict(row)

    async def delete_persona(self, persona_id):
        self._maybe_fail()
        self.calls.append(("delete", persona_id))
        return self.templates.pop(persona_id, None) is not None


def _client(catalog: FakePersonaCatalog) -> TestClient:
    container = Container(
        prompt_catalog=_MinimalPromptCatalog(), persona_catalog=catalog
    )
    return TestClient(create_app(container))


def test_template_list_reaches_the_injected_port_and_maps_the_view():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row())
    with _client(catalog) as client:
        response = client.get("/api/personas?include_defaults=true")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    view = body["personas"][0]
    assert view["id"] == PERSONA_ID
    assert view["active_prompt"] == "contract v1"
    assert view["stack_ids"] == ["00000000-0000-4000-8000-00000000a001"]
    assert catalog.list_calls == [(None, True)]


def test_template_creation_flows_through_the_port():
    catalog = FakePersonaCatalog()
    with _client(catalog) as client:
        response = client.post(
            "/api/personas",
            json={"name": "New Advisor", "subtitle": "Coaching", "color": "#111111"},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "New Advisor"
    assert body["stack_ids"] == []
    (call,) = [c for c in catalog.calls if c[0] == "create"]
    assert call[2] == "New Advisor"


def test_template_detail_serves_the_coherent_snapshot_view():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row(), versions=_version_rows())
    with _client(catalog) as client:
        response = client.get(f"/api/personas/{PERSONA_ID}")
    assert response.status_code == 200, response.text
    assert response.json()["active_prompt_version"] == 1


def test_unknown_template_reads_update_and_delete_all_answer_404():
    catalog = FakePersonaCatalog()
    with _client(catalog) as client:
        read = client.get(f"/api/personas/{UNKNOWN_ID}")
        update = client.put(f"/api/personas/{UNKNOWN_ID}", json={"name": "x"})
        delete = client.delete(f"/api/personas/{UNKNOWN_ID}")
    for response in (read, update, delete):
        assert response.status_code == 404, response.text
        assert response.json() == {"detail": "Persona not found"}


def test_template_update_routes_fields_through_the_guarded_port():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row())
    with _client(catalog) as client:
        response = client.put(
            f"/api/personas/{PERSONA_ID}",
            json={"name": "Edited Advisor", "stack_ids": ["00000000-0000-4000-8000-00000000a002"]},
        )
    assert response.status_code == 200, response.text
    (call,) = [c for c in catalog.calls if c[0] == "update"]
    assert call[2]["name"] == "Edited Advisor"
    assert call[2]["stack_ids"] == ["00000000-0000-4000-8000-00000000a002"]
    assert call[3] is None, "untouched reads keep the legacy unguarded write"


def test_an_edit_conflict_answers_409_without_leaks():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row())
    with _client(catalog) as client:
        response = client.put(
            f"/api/personas/{PERSONA_ID}", json={"name": "Lose the race"}
        )
    assert response.status_code == 409, response.text
    for leak in LEAK_FORBIDDEN:
        assert leak not in response.text.lower(), response.text


def test_unknown_stacks_answer_422_with_the_legacy_text():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row())
    with _client(catalog) as client:
        response = client.put(
            f"/api/personas/{PERSONA_ID}", json={"stack_ids": ["ghost-stack"]}
        )
    assert response.status_code == 422, response.text
    assert response.json() == {"detail": "Unknown knowledge stacks: ghost-stack"}


def test_template_deletion_answers_204():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row())
    with _client(catalog) as client:
        response = client.delete(f"/api/personas/{PERSONA_ID}")
    assert response.status_code == 204, response.text


def test_prompt_versions_list_through_the_port():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row(), versions=_version_rows())
    with _client(catalog) as client:
        response = client.get(f"/api/personas/{PERSONA_ID}/prompts")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [v["version"] for v in body] == [2, 1]


def test_prompt_creation_routes_through_the_port():
    catalog = FakePersonaCatalog()
    catalog.seed(_template_row(), versions=_version_rows())
    with _client(catalog) as client:
        response = client.post(
            f"/api/personas/{PERSONA_ID}/prompts", json={"content": "directive"}
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["version"] == 3
    assert body["is_active"] is True


def test_prompt_creation_for_an_unknown_template_404s():
    catalog = FakePersonaCatalog()
    with _client(catalog) as client:
        response = client.post(
            f"/api/personas/{UNKNOWN_ID}/prompts", json={"content": "directive"}
        )
    assert response.status_code == 404, response.text
    assert response.json() == {"detail": "Persona not found"}


def test_catalog_infrastructure_failure_maps_to_safe_503():
    catalog = FakePersonaCatalog()
    catalog.fail_next_call(
        PromptCatalogUnavailable("supabase PostgrestAPIError: relation does not exist")
    )
    with _client(catalog) as client:
        response = client.get("/api/personas?include_defaults=true")
    assert response.status_code == 503, response.text
    body = response.text.lower()
    for leak in LEAK_FORBIDDEN:
        assert leak not in body, (leak, body)
