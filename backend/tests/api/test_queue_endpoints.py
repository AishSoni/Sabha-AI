"""Queue API behavior: submit-or-queue decision, FIFO listing, revision-guarded
edit/remove, and turn/ending/archive barriers (P04 API surface for Phase 07).
"""

import pytest

pytestmark = pytest.mark.anyio


class _FakeManager:
    def __init__(self):
        from datetime import datetime, timezone

        from app.modules.meetings.queue import InMemoryQueue

        now = datetime.now(timezone.utc)
        self._meetings = {
            "m": {"id": "m", "user_id": "actor-a", "name": "M", "agenda": "",
                  "status": "active", "archived_from": None, "total_cost": 0.0,
                  "created_at": now, "participants": [], "messages": []},
        }
        self.queue = InMemoryQueue()
        self.archived: list = []
        self.status_updates: list = []

    async def get_meeting(self, meeting_id):
        from app.models import MeetingWithParticipants

        row = self._meetings.get(meeting_id)
        return MeetingWithParticipants(**row) if row else None

    async def pending_queue_count(self, meeting_id):
        return await self.queue.pending_count(meeting_id)

    async def has_active_work(self, meeting_id):
        return False

    async def save_message(self, data):
        from datetime import datetime, timezone

        from app.models import Message
        import uuid

        return Message(id=str(uuid.uuid4()), meeting_id=data.meeting_id,
                       content=data.content, sender_type=data.sender_type,
                       sender_id=data.sender_id, sender_name=data.sender_name,
                       created_at=datetime.now(timezone.utc))

    async def submit_queue_entry(self, meeting_id, owner_id, content,
                                 idempotency_key=""):
        decision, entry = await self.queue.submit(
            meeting_id, owner_id, content, idempotency_key or None,
            meeting_active=True, has_active_work=True)
        assert decision == "queued"
        return {"entry_id": entry.entry_id, "duplicate": False,
                "revision": entry.revision, "state": entry.state,
                "seq": entry.seq}

    async def list_queue(self, meeting_id):
        return [{"entry_id": e.entry_id, "seq": e.seq, "content": e.content,
                 "revision": e.revision, "state": e.state,
                 "message_id": e.message_id}
                async for e in self._aiter(meeting_id)]

    async def _aiter(self, meeting_id):
        for entry in await self.queue.list_pending(meeting_id):
            yield entry

    async def edit_queue_entry(self, entry_id, owner_id, content, revision):
        entry = await self.queue.edit(entry_id, owner_id, content, revision)
        return {"entry_id": entry.entry_id, "revision": entry.revision}

    async def remove_queue_entry(self, entry_id, owner_id, revision):
        await self.queue.remove(entry_id, owner_id, revision)

    async def archive_meeting(self, meeting_id, prior_state):
        self._meetings[meeting_id]["status"] = "archived"
        self._meetings[meeting_id]["archived_from"] = prior_state
        self.archived.append(prior_state)
        return True

    async def update_meeting_status(self, meeting_id, status):
        self._meetings[meeting_id]["status"] = status
        self.status_updates.append(status)
        return True


@pytest.fixture
def queue_app(api_app, monkeypatch):
    import app.api.meetings as meetings_api

    fake = _FakeManager()
    monkeypatch.setattr(meetings_api, "get_meeting_manager", lambda: fake)
    return api_app, fake


def _client_for(app):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


HEADERS = {"X-Test-Actor": "actor-a"}


async def test_idle_submit_commits_201_while_busy_queues_202(queue_app):
    app, fake = queue_app
    async with _client_for(app) as client:
        first = await client.post("/api/meetings/m/messages", headers=HEADERS,
                                  json={"content": "direct"})
        assert first.status_code == 201
        # Simulate a running turn by pre-filling the queue through the store.
        await fake.queue.submit("m", "actor-a", "held", has_active_work=True)
        second = await client.post("/api/meetings/m/messages", headers=HEADERS,
                                   json={"content": "later"})
        assert second.status_code == 202
        assert second.json()["entry"]["seq"] == 2
        listed = await client.get("/api/meetings/m/queue", headers=HEADERS)
        assert [e["content"] for e in listed.json()["entries"]] == ["held", "later"]


async def test_queue_edit_remove_revision_guards(queue_app):
    app, fake = queue_app
    async with _client_for(app) as client:
        await fake.queue.submit("m", "actor-a", "v1", has_active_work=True)
        entry_id = (await client.get("/api/meetings/m/queue",
                                     headers=HEADERS)).json()["entries"][0]["entry_id"]
        ok = await client.patch(f"/api/meetings/m/queue/{entry_id}",
                                headers=HEADERS,
                                params={"expected_revision": 1},
                                json={"content": "v2"})
        assert ok.status_code == 200
        stale = await client.patch(f"/api/meetings/m/queue/{entry_id}",
                                   headers=HEADERS,
                                   params={"expected_revision": 1},
                                   json={"content": "v3"})
        assert stale.status_code == 409
        removed = await client.delete(f"/api/meetings/m/queue/{entry_id}",
                                      headers=HEADERS,
                                      params={"expected_revision": 2})
        assert removed.status_code == 204
        assert (await client.get("/api/meetings/m/queue",
                                 headers=HEADERS)).json()["entries"] == []


async def test_turn_and_end_blocked_until_queue_drains(queue_app):
    import app.api.meetings as meetings_api

    app, fake = queue_app
    await fake.queue.submit("m", "actor-a", "blocking", has_active_work=True)
    async with _client_for(app) as client:
        turn = await client.post("/api/meetings/m/turn", headers=HEADERS,
                                 json={"participant_id": "p"})
        assert turn.status_code == 409
        assert turn.json()["detail"] == "queue_not_drained"
        end = await client.post("/api/meetings/m/end", headers=HEADERS, json={})
        assert end.status_code == 409


async def test_turn_rejects_foreign_participant_as_not_found(queue_app, monkeypatch):
    import app.api.meetings as meetings_api
    from app.modules.meetings.store import TurnConflict

    async def _boom():
        raise TurnConflict("turn_in_progress")

    class _Orch:
        async def execute_turn(self, meeting_id, participant_id):
            await _boom()

    monkeypatch.setattr(meetings_api, "get_orchestrator", lambda: _Orch())
    app, _ = queue_app
    async with _client_for(app) as client:
        response = await client.post("/api/meetings/m/turn", headers=HEADERS,
                                     json={"participant_id": "p"})
        assert response.status_code == 409


async def test_archive_preserves_prior_and_restores_it(queue_app):
    app, fake = queue_app
    async with _client_for(app) as client:
        archived = await client.post("/api/meetings/m/archive", headers=HEADERS)
        assert archived.status_code == 200
        assert fake.archived == ["active"]
        busy = await client.post("/api/meetings/m/archive", headers=HEADERS)
        assert busy.status_code == 400
        restored = await client.post("/api/meetings/m/unarchive", headers=HEADERS)
        assert restored.status_code == 200
        assert fake.status_updates[-1] == "active"


async def test_unarchive_with_unknown_prior_stays_blocked(queue_app):
    app, fake = queue_app
    fake._meetings["m"]["status"] = "archived"
    fake._meetings["m"]["archived_from"] = None
    async with _client_for(app) as client:
        response = await client.post("/api/meetings/m/unarchive", headers=HEADERS)
        assert response.status_code == 409
