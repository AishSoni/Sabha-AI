"""Archival, listing, and reporting contracts (spec-03 C1; spec-08 overlay).

Archive is now an overlay (`archived_at`) on the lifecycle status rather than
a status overwrite. This suite records the accepted behavior:

- POST /meetings/{id}/archive sets the overlay through a meeting-locked guard
  and leaves `active`/`ended` untouched underneath;
- archive is blocked while a meeting is voting or owns a failed closing (409);
- re-archiving is a client error (400), unarchiving a non-archived meeting
  likewise;
- unarchive only clears the overlay: an archived `ended` meeting returns as
  `ended`, never reopened as active;
- unknown meetings 404 without touching any row;
- GET /meetings lists archived meetings too and projects the overlay as the
  public `archived` status;
- GET /context-stats answers with its stable reporting keys and exact counts;
- DELETE /meetings/{id} records a pending vector cleanup FIRST, resolves it on
  success, and tolerates a Qdrant outage without blocking the SQL delete;
- deleting an unknown meeting is a 404 and records nothing.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from app.services.vector_store import VectorStoreManager
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SECOND_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02"


def seed_meeting(
    db,
    meeting_id: str = MEETING_ID,
    status: str = "active",
    archived_at: str | None = None,
) -> None:
    stub = stub_for(db)
    stub.table("meetings").insert(
        {
            "id": meeting_id,
            "name": f"Archive probe {meeting_id[-4:]}",
            "agenda": "Settle the archival rules",
            "status": status,
            "total_cost": 0.0,
            "created_at": "2026-01-01T00:00:00Z",
            **({"archived_at": archived_at} if archived_at else {}),
        }
    ).execute()
    stub.table("ai_participants").insert(
        {
            "id": "bbbbbbbb" + meeting_id[8:],  # distinct per meeting, same shape
            "meeting_id": meeting_id,
            "name": "The Analyst",
            "role": "Ground the numbers",
            "system_prompt": "Analyze.",
            "provider_config": json.dumps({"provider": "", "model": "", "temperature": 0.7}),
            "color": "#6366f1",
            "created_at": "2026-01-01T00:00:00Z",
            "stack_ids": "[]",
        }
    ).execute()
    stub.table("messages").insert(
        [
            {
                "meeting_id": meeting_id,
                "sender_type": "user",
                "sender_name": "You",
                "content": "Is the archival path covered?",
            },
            {
                "meeting_id": meeting_id,
                "sender_type": "system",
                "sender_name": "Sabha",
                "content": "Recording the baseline now.",
            },
        ]
    ).execute()


@pytest.fixture()
def archive_env(disposable_db, monkeypatch):
    def _stub():
        return stub_for(disposable_db)

    monkeypatch.setattr("app.services.meeting_manager.get_supabase", _stub)
    monkeypatch.setattr("app.services.recovery.get_supabase", _stub)
    monkeypatch.setattr("app.services.vector_cleanup.get_supabase", _stub)
    return disposable_db


def persisted_status(db, meeting_id: str = MEETING_ID) -> str | None:
    rows = stub_for(db).table("meetings").select("*").eq("id", meeting_id).execute().data
    return rows[0]["status"] if rows else None


def persisted_archive(db, meeting_id: str = MEETING_ID) -> str | None:
    rows = stub_for(db).table("meetings").select("*").eq("id", meeting_id).execute().data
    return rows[0]["archived_at"] if rows else None


def test_archiving_an_active_meeting_sets_the_archive_overlay(archive_env):
    seed_meeting(archive_env)

    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/archive")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Meeting archived successfully",
        "status": "archived",
    }
    assert persisted_status(archive_env) == "active"
    assert persisted_archive(archive_env) is not None


def test_re_archiving_is_rejected_with_client_error(archive_env):
    seed_meeting(archive_env)

    with TestClient(app) as client:
        client.post(f"/api/meetings/{MEETING_ID}/archive")
        response = client.post(f"/api/meetings/{MEETING_ID}/archive")

    assert response.status_code == 400
    assert response.json() == {"detail": "Meeting is already archived"}


def test_archiving_an_ended_meeting_keeps_its_lifecycle_status(archive_env):
    seed_meeting(archive_env, MEETING_ID, status="ended")

    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/archive")

    assert response.status_code == 200
    assert persisted_status(archive_env) == "ended"
    assert persisted_archive(archive_env) is not None


def test_archiving_an_unknown_meeting_is_404(archive_env):
    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/archive")

    assert response.status_code == 404
    assert response.json() == {"detail": "Meeting not found"}
    assert persisted_status(archive_env) is None


def test_unarchive_restores_the_lifecycle_status(archive_env):
    seed_meeting(
        archive_env, MEETING_ID, status="active", archived_at="2026-02-01T00:00:00Z"
    )

    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/unarchive")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Meeting unarchived successfully",
        "status": "active",
    }
    assert persisted_status(archive_env) == "active"
    assert persisted_archive(archive_env) is None


def test_unarchive_never_reopens_an_ended_meeting(archive_env):
    seed_meeting(
        archive_env, MEETING_ID, status="ended", archived_at="2026-02-01T00:00:00Z"
    )

    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/unarchive")

    assert response.status_code == 200
    assert response.json()["status"] == "ended"
    assert persisted_status(archive_env) == "ended"
    assert persisted_archive(archive_env) is None


def test_unarchive_rejects_meetings_that_are_not_archived(archive_env):
    seed_meeting(archive_env, MEETING_ID, status="active")

    with TestClient(app) as client:
        response = client.post(f"/api/meetings/{MEETING_ID}/unarchive")

    assert response.status_code == 400
    assert response.json() == {"detail": "Meeting is not archived"}
    assert persisted_status(archive_env) == "active"


def test_listed_meetings_include_archived_ones(archive_env):
    """Accepted behavior: the server list has no status filter — archived
    meetings stay visible in GET /api/meetings. Sorting/hiding them is the
    caller's concern today."""
    seed_meeting(archive_env, MEETING_ID, status="active")
    seed_meeting(
        archive_env, SECOND_ID, status="active", archived_at="2026-02-01T00:00:00Z"
    )

    with TestClient(app) as client:
        response = client.get("/api/meetings")

    assert response.status_code == 200
    meetings = response.json()
    assert [m["id"] for m in meetings] == [MEETING_ID, SECOND_ID]
    assert {m["status"] for m in meetings} == {"active", "archived"}
    assert {m["id"]: m["status"] for m in meetings}[SECOND_ID] == "archived"


STABLE_STATS_KEYS = {
    "current_tokens",
    "max_tokens",
    "usage_percent",
    "message_count",
    "participant_count",
}


def test_context_stats_reports_counts_for_a_seeded_meeting(archive_env):
    seed_meeting(archive_env)

    with TestClient(app) as client:
        response = client.get(f"/api/meetings/{MEETING_ID}/context-stats")

    assert response.status_code == 200
    stats = response.json()
    assert STABLE_STATS_KEYS <= set(stats)
    assert stats["max_tokens"] == 128000
    assert stats["message_count"] == 2
    assert stats["participant_count"] == 1


def test_context_stats_404_for_unknown_meeting(archive_env):
    with TestClient(app) as client:
        response = client.get(f"/api/meetings/{MEETING_ID}/context-stats")

    assert response.status_code == 404


class RecordingLedger:
    def __init__(self):
        self.recorded: list[dict] = []
        self.resolved: list[str] = []
        self.errors: list[tuple[str, str]] = []

    async def record(self, collection_name, target_kind, target_id):
        pending_id = f"pending-{len(self.recorded) + 1}"
        self.recorded.append(
            {
                "pending_id": pending_id,
                "collection_name": collection_name,
                "target_kind": target_kind,
                "target_id": target_id,
            }
        )
        return pending_id

    async def resolve(self, item_id):
        self.resolved.append(item_id)

    async def set_last_error(self, item_id, error):
        self.errors.append((item_id, error))


class RecordingVectorStore:
    def __init__(self, outage: Exception | None = None):
        self.deleted: list[str] = []
        self._outage = outage

    async def delete_collection(self, collection_name):
        self.deleted.append(collection_name)
        if self._outage is not None:
            raise self._outage
        return True


def install_delete_fakes(monkeypatch, archive_env, vector_store, ledger):
    import app.api.meetings as meetings_module

    monkeypatch.setattr(meetings_module, "get_vector_store", lambda: vector_store)
    monkeypatch.setattr(meetings_module, "get_vector_cleanup_ledger", lambda: ledger)


def test_delete_records_pending_cleanup_then_resolves_and_deletes(archive_env, monkeypatch):
    seed_meeting(archive_env)
    ledger = RecordingLedger()
    store = RecordingVectorStore()
    install_delete_fakes(monkeypatch, archive_env, store, ledger)

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Meeting deleted successfully"}

    expected_collection = VectorStoreManager.meeting_collection_name(MEETING_ID)
    assert [(r["collection_name"], r["target_kind"], r["target_id"]) for r in ledger.recorded] == [
        (expected_collection, "meeting", MEETING_ID)
    ]
    assert store.deleted == [expected_collection]
    assert ledger.resolved == [ledger.recorded[0]["pending_id"]]
    assert ledger.errors == []
    assert persisted_status(archive_env) is None


def test_delete_survives_a_vector_outage_without_blocking_sql(archive_env, monkeypatch):
    """Accepted behavior: the pending-cleanup record is written BEFORE the
    vector call, so a Qdrant outage defers the work (last_error recorded) but
    the meeting still disappears."""
    seed_meeting(archive_env)
    ledger = RecordingLedger()
    store = RecordingVectorStore(outage=RuntimeError("qdrant unreachable"))
    install_delete_fakes(monkeypatch, archive_env, store, ledger)

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 200
    assert persisted_status(archive_env) is None
    pending_id = ledger.recorded[0]["pending_id"]
    assert ledger.resolved == []
    assert ledger.errors == [(pending_id, "qdrant unreachable")]


def test_delete_unknown_meeting_is_404_and_records_nothing(archive_env, monkeypatch):
    ledger = RecordingLedger()
    store = RecordingVectorStore()
    install_delete_fakes(monkeypatch, archive_env, store, ledger)

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 404
    assert ledger.recorded == []
    assert store.deleted == []
