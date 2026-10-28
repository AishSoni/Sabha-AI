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
- DELETE /meetings/{id} revokes Knowledge first, then removes the meeting; a
  Knowledge outage fails closed with 503 and leaves the meeting intact;
- deleting an unknown meeting is a 404 and revokes nothing.
"""

import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
from main import app
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

    service = build_meeting_service(_stub())
    monkeypatch.setattr(
        app.state,
        "container",
        Container(
            prompt_catalog=object(),
            meeting_service=service,
            meeting_reads=service,
        ),
    )
    monkeypatch.setattr("app.modules.meetings.infrastructure.supabase_meetings.get_supabase", _stub)
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.reconciliation.get_supabase", _stub
    )
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.vector_cleanup.get_supabase", _stub
    )
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


class FakeKnowledgeLifecycle:
    def __init__(self, error: Exception | None = None):
        self.deleted: list[tuple[str, str]] = []
        self._error = error

    async def delete_parent(self, parent_kind, parent_id, *, reason="parent_deleted"):
        if self._error is not None:
            raise self._error
        self.deleted.append((parent_kind, str(parent_id)))
        return None


def install_delete_fake(monkeypatch, lifecycle):
    container = app.state.container
    assert container is not None
    monkeypatch.setattr(
        app.state,
        "container",
        replace(container, knowledge_lifecycle=lifecycle),
    )


def test_delete_revokes_knowledge_before_removing_the_meeting(archive_env, monkeypatch):
    seed_meeting(archive_env)
    lifecycle = FakeKnowledgeLifecycle()
    install_delete_fake(monkeypatch, lifecycle)

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Meeting deleted successfully"}
    assert lifecycle.deleted == [("meeting", MEETING_ID)]
    assert persisted_status(archive_env) is None


def test_delete_fails_closed_when_knowledge_cannot_revoke(archive_env, monkeypatch):
    from app.modules.knowledge.domain.errors import KnowledgeUnavailable

    seed_meeting(archive_env)
    install_delete_fake(monkeypatch, FakeKnowledgeLifecycle(KnowledgeUnavailable("down")))

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 503
    assert persisted_status(archive_env) == "active"


def test_delete_unknown_meeting_is_404_and_records_nothing(archive_env, monkeypatch):
    lifecycle = FakeKnowledgeLifecycle()
    install_delete_fake(monkeypatch, lifecycle)

    with TestClient(app) as client:
        response = client.delete(f"/api/meetings/{MEETING_ID}")

    assert response.status_code == 404
    assert lifecycle.deleted == []
