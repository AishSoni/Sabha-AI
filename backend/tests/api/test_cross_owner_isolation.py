"""Cross-owner isolation at the HTTP boundary (B-02/B-05, TEST02).

Fakes the Supabase gateway (no DB in this environment) to verify the
route-level ownership composition: cross-owner direct-ID reads behave as
404, list endpoints scope to the caller, shared defaults stay visible, and
parentless documents quarantine. Each test asserts both sides (owner 200 +
stranger 404) so a stubbed-always-deny fake cannot pass.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table, rows):
        self._db = db
        self._table = table
        self._rows = [dict(r) for r in rows]
        self._filters = []
        self._single = False
        self._op = "select"
        self._payload = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def single(self):
        self._single = True
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload)
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _matched(self):
        rows = self._rows
        for column, value in self._filters:
            rows = [r for r in rows if r.get(column) == value]
        return rows

    def execute(self):
        if self._op == "insert":
            self._db.tables[self._table].append(dict(self._payload))
            return FakeResult([self._payload])
        matched = self._matched()
        if self._op == "update":
            for row in self._db.tables[self._table]:
                if row in matched or all(
                    row.get(c) == v for c, v in self._filters
                ):
                    row.update(self._payload)
            return FakeResult(matched)
        if self._op == "delete":
            remaining = [
                r
                for r in self._db.tables[self._table]
                if not all(r.get(c) == v for c, v in self._filters)
            ]
            removed = [
                r
                for r in self._db.tables[self._table]
                if all(r.get(c) == v for c, v in self._filters)
            ]
            self._db.tables[self._table] = remaining
            return FakeResult(removed)
        if self._single:
            return FakeResult(matched[0] if matched else None)
        return FakeResult(matched)


class FakeSupabase:
    def __init__(self, tables):
        self.tables = {name: list(rows) for name, rows in tables.items()}

    def table(self, name):
        return FakeQuery(self, name, self.tables.get(name, []))


def _client_for(app):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _stack_row(stack_id="s1", owner="actor-a"):
    return {
        "id": stack_id,
        "name": "Stack",
        "description": None,
        "user_id": owner,
        "created_at": NOW.isoformat(),
        "updated_at": NOW.isoformat(),
    }


async def test_cross_owner_stack_read_is_404_owner_reads_200(api_app, monkeypatch):
    import app.api.knowledge_stacks as stacks_route

    fake = FakeSupabase({"knowledge_stacks": [_stack_row()]})
    monkeypatch.setattr(stacks_route, "get_supabase", lambda: fake)
    async with _client_for(api_app) as client:
        stranger = await client.get(
            "/api/knowledge_stacks/s1", headers={"X-Test-Actor": "actor-b"}
        )
        assert stranger.status_code == 404
        owner = await client.get(
            "/api/knowledge_stacks/s1", headers={"X-Test-Actor": "actor-a"}
        )
        assert owner.status_code == 200


async def test_stack_list_scopes_to_caller(api_app, monkeypatch):
    import app.api.knowledge_stacks as stacks_route

    fake = FakeSupabase(
        {"knowledge_stacks": [_stack_row("s1", "actor-a"), _stack_row("s2", "actor-b")]}
    )
    monkeypatch.setattr(stacks_route, "get_supabase", lambda: fake)
    async with _client_for(api_app) as client:
        response = await client.get(
            "/api/knowledge_stacks", headers={"X-Test-Actor": "actor-a"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["stacks"][0]["user_id"] == "actor-a"


def _persona_namespace(persona_id="p1", owner="actor-a", default=False):
    return SimpleNamespace(
        id=persona_id,
        name="Persona",
        user_id=owner,
        is_default=default,
        created_at=NOW,
        updated_at=NOW,
        active_prompt="prompt",
        active_prompt_version=1,
    )


async def test_cross_owner_persona_is_404_shared_default_visible(
    api_app, monkeypatch
):
    import app.api.personas as personas_route

    owned = _persona_namespace("p1", "actor-a", default=False)
    shared = _persona_namespace("p0", "someone-else", default=True)

    class FakeManager:
        async def get_persona(self, persona_id):
            return {"p1": owned, "p0": shared}.get(persona_id)

    monkeypatch.setattr(personas_route, "PersonaManager", FakeManager)
    async with _client_for(api_app) as client:
        stranger = await client.get(
            "/api/personas/p1", headers={"X-Test-Actor": "actor-b"}
        )
        assert stranger.status_code == 404
        owner = await client.get(
            "/api/personas/p1", headers={"X-Test-Actor": "actor-a"}
        )
        assert owner.status_code == 200
        guest = await client.get(
            "/api/personas/p0", headers={"X-Test-Actor": "actor-b"}
        )
        assert guest.status_code == 200


def _doc_row(doc_id="d1", meeting_id="m-a"):
    return {
        "id": doc_id,
        "file_name": "notes.txt",
        "file_type": "txt",
        "file_size_bytes": 12,
        "meeting_id": meeting_id,
        "persona_id": None,
        "stack_id": None,
        "created_at": NOW.isoformat(),
    }


async def test_cross_owner_document_via_parent_is_404(api_app, monkeypatch):
    import app.api.documents as documents_route

    fake = FakeSupabase(
        {
            "documents": [_doc_row()],
            "meetings": [{"id": "m-a", "user_id": "actor-a"}],
        }
    )
    monkeypatch.setattr(documents_route, "get_supabase", lambda: fake)
    async with _client_for(api_app) as client:
        stranger = await client.get(
            "/api/documents/d1", headers={"X-Test-Actor": "actor-b"}
        )
        assert stranger.status_code == 404
        owner = await client.get(
            "/api/documents/d1", headers={"X-Test-Actor": "actor-a"}
        )
        assert owner.status_code == 200


async def test_parentless_document_quarantines_to_404(api_app, monkeypatch):
    import app.api.documents as documents_route

    fake = FakeSupabase(
        {"documents": [_doc_row("d0", meeting_id=None)], "meetings": []}
    )
    monkeypatch.setattr(documents_route, "get_supabase", lambda: fake)
    async with _client_for(api_app) as client:
        response = await client.get(
            "/api/documents/d0", headers={"X-Test-Actor": "actor-a"}
        )
        assert response.status_code == 404
