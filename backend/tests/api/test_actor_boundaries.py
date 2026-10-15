"""Phase 04 actor boundaries (CONTRACTS section 1; B-05 core enforcement).

Behavioral, not structural: unauthenticated requests are rejected, cross-owner
lookups behave as not-found, owners retain full access, and list is scoped.
Bodies never establish identity: creating with another owner's id still
assigns the caller.
"""

import pytest

pytestmark = pytest.mark.anyio


class _FakeManager:
    def __init__(self):
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        self._meetings = {
            "m-a": {"id": "m-a", "user_id": "actor-a", "name": "A", "agenda": "",
                    "status": "active", "total_cost": 0.0, "created_at": now},
            "m-b": {"id": "m-b", "user_id": "actor-b", "name": "B", "agenda": "",
                    "status": "active", "total_cost": 0.0, "created_at": now},
            "m-orphan": {"id": "m-orphan", "user_id": None, "name": "O",
                         "agenda": "", "status": "active", "total_cost": 0.0,
                         "created_at": now},
        }

    def _view(self, row):
        from datetime import datetime, timezone

        return {
            **row, "participants": [], "messages": [],
            "created_at": datetime.now(timezone.utc),
        }

    async def create_meeting(self, data, add_default_roster=True):
        from datetime import datetime, timezone

        row = {"id": "m-new", "user_id": data.user_id, "name": data.name,
               "agenda": data.agenda, "status": "active", "total_cost": 0.0}
        self._meetings["m-new"] = row
        return self._view(row) | {"created_at": datetime.now(timezone.utc)}

    async def list_meetings(self, user_id=None):
        from app.models import Meeting

        return [Meeting(**m) for m in self._meetings.values()
                if user_id is None or m["user_id"] == user_id]

    async def get_meeting(self, meeting_id):
        from app.models import MeetingWithParticipants

        row = self._meetings.get(meeting_id)
        if row is None:
            return None
        return MeetingWithParticipants(**self._view(row))


@pytest.fixture
def owned_app(api_app, monkeypatch):
    import app.api.meetings as meetings_api

    fake = _FakeManager()
    monkeypatch.setattr(meetings_api, "get_meeting_manager", lambda: fake)
    monkeypatch.setattr(
        meetings_api, "get_orchestrator",
        lambda: (_ for _ in ()).throw(AssertionError("must not reach engine")),
    )
    return api_app, fake


def _client_for(app):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_unauthenticated_meeting_access_is_rejected(owned_app):
    app, _ = owned_app
    async with _client_for(app) as client:
        response = await client.get("/api/meetings/m-a")
        assert response.status_code == 401


async def test_cross_owner_lookup_behaves_as_not_found(owned_app):
    app, _ = owned_app
    headers = {"X-Test-Actor": "actor-a"}
    async with _client_for(app) as client:
        response = await client.get("/api/meetings/m-b", headers=headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Meeting not found"


async def test_ownerless_meeting_is_quarantined_not_leaked(owned_app):
    app, _ = owned_app
    headers = {"X-Test-Actor": "actor-a"}
    async with _client_for(app) as client:
        response = await client.get("/api/meetings/m-orphan", headers=headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Meeting not found"


async def test_owner_retains_access_and_list_is_scoped(owned_app):
    app, _ = owned_app
    headers = {"X-Test-Actor": "actor-a"}
    async with _client_for(app) as client:
        response = await client.get("/api/meetings/m-a", headers=headers)
        assert response.status_code == 200
        listed = await client.get("/api/meetings", headers=headers)
        assert listed.status_code == 200
        ids = {m["id"] for m in listed.json()}
        assert ids == {"m-a"}


async def test_create_assigns_caller_identity_not_body_user_id(owned_app):
    app, fake = owned_app
    headers = {"X-Test-Actor": "actor-a"}
    async with _client_for(app) as client:
        response = await client.post(
            "/api/meetings", headers=headers,
            json={"name": "N", "agenda": "", "user_id": "actor-b"},
        )
        assert response.status_code in (200, 201)
        assert fake._meetings["m-new"]["user_id"] == "actor-a"
