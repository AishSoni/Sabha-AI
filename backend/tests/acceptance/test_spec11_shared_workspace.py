"""Spec 11: two anonymous visitors share one workspace.

The runtime contract is deliberately account-free.  These tests use two
independent ``TestClient`` instances (not two requests on one client) so a
shared record must be visible across visitor sessions, in both writable
runtime modes.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

import app.platform.config as config_module
from main import app
from tests.doubles.supabase_stub import stub_for
from tests.regression.test_knowledge_routes import FakeLifecycle


@pytest.fixture()
def runtime_mode() -> str:
    """Default to the writable local runtime; parametrized tests override it."""
    return "local"


def _assert_anonymous(response) -> None:
    assert response.status_code not in (401, 403), response.text
    assert "www-authenticate" not in {key.lower() for key in response.headers}


@pytest.fixture()
def workspace(disposable_db, monkeypatch, runtime_mode):
    stub = stub_for(disposable_db)

    def _stub():
        return stub

    for target in (
        "app.modules.meetings.infrastructure.supabase_meetings.get_supabase",
        "app.modules.knowledge.infrastructure.reconciliation.get_supabase",
        "app.modules.knowledge.infrastructure.vector_cleanup.get_supabase",
        "app.modules.knowledge.presentation.stacks_http.get_supabase",
        "app.modules.knowledge.public.get_supabase",
    ):
        monkeypatch.setattr(target, _stub)

    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        "app.modules.knowledge.public.get_knowledge_lifecycle",
        lambda: lifecycle,
    )
    monkeypatch.setattr(config_module.settings, "runtime_mode", runtime_mode)

    # The durable turn queue is composed once at startup; rebuild it over the
    # same disposable database so both visitors observe one shared queue.
    from app.bootstrap import Container
    from app.modules.meetings.infrastructure.supabase_meetings import (
        build_default_meeting_service,
    )
    from app.modules.meetings.infrastructure.turns import TurnQueueService

    queue = TurnQueueService(build_default_meeting_service())
    previous_container = app.state.container
    app.state.container = Container(
        prompt_catalog=previous_container.prompt_catalog,
        persona_catalog=previous_container.persona_catalog,
        turn_queue=queue,
        turn_runner=None,
        closing=previous_container.closing,
    )

    try:
        yield {"db": disposable_db, "lifecycle": lifecycle, "queue": queue}
    finally:
        app.state.container = previous_container


def _create_meeting(client: TestClient, name: str) -> str:
    response = client.post(
        "/api/meetings",
        json={"name": name, "agenda": "Shared workspace", "persona_ids": []},
    )
    _assert_anonymous(response)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _add_participant(client: TestClient, meeting_id: str) -> str:
    response = client.post(
        "/api/participants",
        json={
            "meeting_id": meeting_id,
            "name": "The Analyst",
            "role": "Data-focused board member",
            "system_prompt": "Ground every claim in the shared records.",
            "provider_config": {},
            "color": "#3b82f6",
        },
    )
    _assert_anonymous(response)
    assert response.status_code == 200, response.text
    return response.json()["id"]


@pytest.mark.parametrize("runtime_mode", ["local", "hosted"])
def test_two_visitors_share_meeting_conversation_and_upload(workspace):
    db = workspace["db"]
    visitor_a = TestClient(app)
    visitor_b = TestClient(app)
    try:
        meeting_id = _create_meeting(visitor_a, "Shared Council")

        posted = visitor_a.post(
            f"/api/meetings/{meeting_id}/message",
            json={"content": "A note from visitor A"},
        )
        _assert_anonymous(posted)
        assert posted.status_code == 200, posted.text

        listed = visitor_b.get("/api/meetings")
        _assert_anonymous(listed)
        assert meeting_id in [meeting["id"] for meeting in listed.json()]

        detail = visitor_b.get(f"/api/meetings/{meeting_id}")
        _assert_anonymous(detail)
        assert detail.status_code == 200, detail.text
        assert "A note from visitor A" in [
            message["content"] for message in detail.json()["messages"]
        ]

        for path in (
            f"/api/meetings/{meeting_id}/disagreements",
            f"/api/meetings/{meeting_id}/consensus",
        ):
            response = visitor_b.get(path)
            _assert_anonymous(response)
            assert response.status_code == 200, response.text

        uploaded = visitor_a.post(
            "/api/documents/upload",
            files={"file": ("board.pdf", b"%PDF-1.4 shared", "application/pdf")},
            data={"meeting_id": meeting_id},
        )
        _assert_anonymous(uploaded)
        assert uploaded.status_code == 202, uploaded.text
        receipt = uploaded.json()

        status = visitor_b.get(
            f"/api/documents/operations/{receipt['operationId']}"
        )
        _assert_anonymous(status)
        assert status.status_code == 200, status.text
        assert status.json()["operationId"] == receipt["operationId"]

        documents = visitor_b.get(f"/api/documents/meeting/{meeting_id}")
        _assert_anonymous(documents)
        assert documents.status_code == 200, documents.text
        assert documents.json()

        # The fake lifecycle is intentionally shared by both visitors; the
        # meeting/message evidence above is real database state.
        assert len(workspace["lifecycle"].uploads) == 1
        assert db.query("SELECT COUNT(*) FROM meetings WHERE id = %s", (meeting_id,))[0][0] == 1
    finally:
        visitor_a.close()
        visitor_b.close()


def test_visitor_b_observes_visitor_a_turn_status_and_events(workspace):
    db = workspace["db"]
    visitor_a = TestClient(app)
    visitor_b = TestClient(app)
    try:
        meeting_id = _create_meeting(visitor_a, "Observed Council")
        participant_id = _add_participant(visitor_a, meeting_id)

        submitted = visitor_a.post(
            f"/api/meetings/{meeting_id}/turns",
            json={
                "participant_id": participant_id,
                "request_key": f"shared-{uuid.uuid4()}",
            },
        )
        _assert_anonymous(submitted)
        assert submitted.status_code == 202, submitted.text
        operation_id = submitted.json()["operation_id"]

        # No provider call is needed to prove observation sharing: finish the
        # durable operation and append one persisted event as the worker would.
        with db.connect() as conn:
            conn.execute(
                "UPDATE operations SET status = 'done', completed_at = now(), "
                "updated_at = now() WHERE id = %s",
                (operation_id,),
            )
            conn.execute(
                "INSERT INTO operation_events (id, operation_id, meeting_id, type, payload) "
                "VALUES (gen_random_uuid(), %s, %s, 'text', %s::jsonb)",
                (operation_id, meeting_id, json.dumps({"content": "shared stream"})),
            )

        observed = visitor_b.get(f"/api/meetings/{meeting_id}/turns")
        _assert_anonymous(observed)
        assert observed.status_code == 200, observed.text
        assert operation_id in [row["operation_id"] for row in observed.json()]

        status = visitor_b.get(
            f"/api/meetings/{meeting_id}/turns/{operation_id}"
        )
        _assert_anonymous(status)
        assert status.status_code == 200, status.text
        assert status.json()["status"] == "completed"

        events = visitor_b.get(
            f"/api/meetings/{meeting_id}/turns/{operation_id}/events"
        )
        _assert_anonymous(events)
        assert events.status_code == 200, events.text
        assert "shared stream" in events.text
        assert operation_id in events.text
    finally:
        visitor_a.close()
        visitor_b.close()


def test_queue_limit_is_enforced_for_anonymous_visitors(workspace):
    visitor = TestClient(app)
    try:
        meeting_id = _create_meeting(visitor, "Queue Council")
        participant_id = _add_participant(visitor, meeting_id)

        for index in range(10):
            response = visitor.post(
                f"/api/meetings/{meeting_id}/turns",
                json={
                    "participant_id": participant_id,
                    "request_key": f"queue-{index}-{uuid.uuid4()}",
                },
            )
            _assert_anonymous(response)
            assert response.status_code == 202, response.text

        rejected = visitor.post(
            f"/api/meetings/{meeting_id}/turns",
            json={
                "participant_id": participant_id,
                "request_key": f"queue-overflow-{uuid.uuid4()}",
            },
        )
        _assert_anonymous(rejected)
        assert rejected.status_code == 429, rejected.text
    finally:
        visitor.close()


def test_direct_roles_cannot_write_shared_records(workspace):
    db = workspace["db"]

    for role in ("anon", "authenticated"):
        with db.connect() as conn:
            conn.execute(f"SET ROLE {role}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "INSERT INTO meetings (id, name, agenda, status) "
                    "VALUES (gen_random_uuid(), 'forbidden', '', 'active')"
                )


def test_provider_settings_do_not_expose_credentials(workspace, monkeypatch):
    secret = "spec11-super-secret-provider-key"
    monkeypatch.setattr(config_module.settings, "supabase_service_key", secret)
    monkeypatch.setattr(config_module.settings, "openrouter_api_key", secret)
    monkeypatch.setattr(config_module.settings, "gemini_api_key", secret)

    visitor = TestClient(app)
    try:
        response = visitor.get("/api/settings/providers")
        _assert_anonymous(response)
        assert response.status_code == 200, response.text
        assert secret not in response.text
    finally:
        visitor.close()
