"""Spec 20 round-trip budgets for the hot read endpoints.

Each assertion is a round-trip count, not a wall-clock threshold: the budget
must hold on a co-located deployment and on a cross-region one alike. A
handler that reintroduces a fanout fails here even when the local database is
fast enough to hide it.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.modules.meetings.infrastructure.supabase_meetings as meeting_manager_module
from app.bootstrap import Container, create_app
from app.modules.meetings.application.closing import ClosingService
from app.modules.meetings.infrastructure.supabase_closing import (
    SupabaseClosingRepository,
)
from app.modules.meetings.infrastructure.supabase_meetings import (
    build_default_meeting_service,
)
from tests.doubles.closing import ClosingWorld
from tests.doubles.supabase_stub import counting_stub_for


@pytest.fixture()
def budget(disposable_db, monkeypatch):
    counter = counting_stub_for(disposable_db)
    monkeypatch.setattr(
        meeting_manager_module, "get_supabase", lambda: counter
    )
    service = build_default_meeting_service()
    closing = ClosingService(
        SupabaseClosingRepository(service),
        object(),
        lease_seconds=30,
        drain_timeout_seconds=300,
    )
    container = Container(
        prompt_catalog=object(),
        meeting_service=service,
        meeting_reads=service,
        closing=closing,
    )

    world = ClosingWorld(disposable_db)
    meeting_id, _ = world.seed_active_meeting()
    world.add_participant(meeting_id, "The Investor", role="investor")
    world.append_message(meeting_id, key="message-1")

    app = create_app(container)
    with TestClient(app) as client:
        counter.reset()
        yield client, counter, meeting_id


def test_meeting_detail_is_one_round_trip(budget):
    client, counter, meeting_id = budget

    response = client.get(f"/api/meetings/{meeting_id}")

    assert response.status_code == 200
    assert response.json()["id"] == meeting_id
    assert counter.calls == [("rpc", "read_meeting_bundle")]


def test_context_stats_reuses_the_meeting_bundle(budget):
    client, counter, meeting_id = budget

    response = client.get(f"/api/meetings/{meeting_id}/context-stats")

    assert response.status_code == 200
    assert counter.calls == [("rpc", "read_meeting_bundle")]


def test_closing_read_is_one_round_trip(budget):
    client, counter, meeting_id = budget

    response = client.get(f"/api/meetings/{meeting_id}/closing")

    assert response.status_code == 200
    assert counter.calls == [("rpc", "read_meeting_closing")]
