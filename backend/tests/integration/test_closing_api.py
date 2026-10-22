"""HTTP acceptance tests for the coordinated closing routes (spec 08).

The real FastAPI surface, the real closing RPCs, and the real repository
adapter run against disposable Postgres. Only the paid provider transport is
scripted, so the tests prove admission, observation, retry, and abort without
network access.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from datetime import timezone

from app.bootstrap import Container, create_app
from app.modules.meetings.application.closing import ClosingService
from app.modules.meetings.application.contracts import ProviderOutput
from app.modules.meetings.infrastructure.supabase_closing import (
    SupabaseClosingRepository,
)
from app.services import meeting_manager as meeting_manager_module
from app.services.meeting_manager import MeetingManager
from tests.doubles.closing import ClosingWorld
from tests.doubles.supabase_stub import stub_for


class _FakeInvoker:
    def __init__(self, text: str, *, provider: str = "ollama") -> None:
        self.provider = provider
        self.model = "scripted"
        self.settings = {"provider": provider, "model": "scripted"}
        self.output = ProviderOutput(
            text=text,
            usage={"prompt_tokens": 4, "completion_tokens": 2},
            estimated_cost=0.0,
        )
        self.error: Exception | None = None
        self.calls = 0
        self.prompts: list[str] = []

    async def complete(self, prompt: str) -> ProviderOutput:
        self.calls += 1
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return self.output


class _FakeInvocations:
    def __init__(self) -> None:
        self.vote = _FakeInvoker('{"vote": true, "reason": "ship it"}')
        self.summary = _FakeInvoker("A concise executive summary.")

    async def participant(self, policy):
        return self.vote

    async def system(self, settings):
        return self.summary


@pytest.fixture()
def closing_app(disposable_db, monkeypatch):
    monkeypatch.setattr(
        meeting_manager_module, "get_supabase", lambda: stub_for(disposable_db)
    )
    world = ClosingWorld(disposable_db)
    invocations = _FakeInvocations()
    service = ClosingService(
        SupabaseClosingRepository(MeetingManager()),
        invocations,
        lease_seconds=30,
        drain_timeout_seconds=300,
        now=lambda: world.clock.now().replace(tzinfo=timezone.utc),
    )
    container = Container(prompt_catalog=object(), closing=service)
    app = create_app(container)
    with TestClient(app) as client:
        yield client, world, invocations, service


def _request(client: TestClient, meeting_id: str, *, mode: str = "force", key: str = "close-1"):
    return client.post(
        f"/api/meetings/{meeting_id}/closing",
        json={"mode": mode, "request_key": key},
    )


def test_request_runs_to_a_committed_ending_and_get_is_read_only(closing_app):
    client, world, invocations, _service = closing_app
    meeting_id, _participant_id = world.seed_active_meeting()

    response = _request(client, meeting_id)
    assert response.status_code == 202
    receipt = response.json()
    assert receipt["meeting_id"] == meeting_id
    assert receipt["stage"] == "completed"
    assert receipt["meeting_status"] == "ended"

    reading = client.get(f"/api/meetings/{meeting_id}/closing")
    assert reading.status_code == 200
    body = reading.json()
    assert body["stage"] == "completed"
    assert body["meeting_status"] == "ended"
    assert body["summary"].endswith("A concise executive summary.")
    assert body["summary_message_id"]
    assert body["retryable"] is False
    assert body["abortable"] is False

    calls = invocations.summary.calls
    again = client.get(f"/api/meetings/{meeting_id}/closing")
    assert again.json()["summary"] == body["summary"]
    assert invocations.summary.calls == calls


def test_reading_an_active_meeting_without_a_close_is_empty(closing_app):
    client, world, _invocations, _service = closing_app
    meeting_id, _participant_id = world.seed_active_meeting()

    response = client.get(f"/api/meetings/{meeting_id}/closing")
    assert response.status_code == 200
    body = response.json()
    assert body["meeting_status"] == "active"
    assert body["closing_id"] is None
    assert body["stage"] is None
    assert body["votes"] == []


def test_summary_failure_is_retryable_through_the_api(closing_app):
    client, world, invocations, _service = closing_app
    meeting_id, _participant_id = world.seed_active_meeting()
    invocations.summary.error = RuntimeError("provider down")

    failed = _request(client, meeting_id)
    assert failed.status_code == 202
    assert failed.json()["stage"] == "failed"

    snapshot = client.get(f"/api/meetings/{meeting_id}/closing").json()
    assert snapshot["retryable"] is True
    assert snapshot["error"]["code"] == "summary_generation_failed"
    assert snapshot["meeting_status"] == "voting"

    invocations.summary.error = None
    retried = client.post(f"/api/meetings/{meeting_id}/closing/retry")
    assert retried.status_code == 202
    body = retried.json()
    assert body["stage"] == "completed"
    assert body["meeting_status"] == "ended"
    assert body["summary"].endswith("A concise executive summary.")


def test_archiving_during_closing_is_rejected(closing_app):
    client, world, _invocations, _service = closing_app
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)

    requested = _request(client, meeting_id, mode="vote")
    assert requested.status_code == 202
    assert requested.json()["stage"] == "draining"

    archived = client.post(f"/api/meetings/{meeting_id}/archive")
    assert archived.status_code == 409
    assert "closing" in archived.json()["detail"].lower()

    with world.db.connect() as conn:
        archived_at = conn.execute(
            "SELECT archived_at FROM meetings WHERE id = %s", (meeting_id,)
        ).fetchone()[0]
    assert archived_at is None


def test_abort_returns_the_meeting_to_active_admission(closing_app):
    client, world, _invocations, _service = closing_app
    meeting_id, participant_id = world.seed_active_meeting()
    world.submit(meeting_id, participant_id, key="turn-1")
    world.claim_running(meeting_id)

    requested = _request(client, meeting_id, mode="vote")
    assert requested.status_code == 202
    assert requested.json()["stage"] == "draining"

    aborted = client.post(f"/api/meetings/{meeting_id}/closing/abort")
    assert aborted.status_code == 200
    body = aborted.json()
    assert body["stage"] == "aborted"
    assert body["meeting_status"] == "active"
    assert body["abortable"] is False


def test_conflicting_commands_and_unknown_meetings_use_http_codes(closing_app):
    client, world, _invocations, _service = closing_app
    meeting_id, _participant_id = world.seed_active_meeting()

    requested = _request(client, meeting_id)
    assert requested.status_code == 202

    completed_retry = client.post(f"/api/meetings/{meeting_id}/closing/retry")
    assert completed_retry.status_code == 409

    completed_abort = client.post(f"/api/meetings/{meeting_id}/closing/abort")
    assert completed_abort.status_code == 409

    missing = client.get(
        "/api/meetings/00000000-0000-0000-0000-000000000000/closing"
    )
    assert missing.status_code == 404

    invalid = client.post(
        f"/api/meetings/{meeting_id}/closing",
        json={"mode": "shrug", "request_key": "x"},
    )
    assert invalid.status_code == 422
