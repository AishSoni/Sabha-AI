"""Replay namespace isolation and startup discipline (spec-14).

Replay is a separate request graph. These tests compose a sentinel live
container and a sentinel replay container in the same process and prove that
recorded reads reach only the replay graph, forged meeting selectors fail, and
commands stop at the replay guard before either graph is touched.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from tests.support.access import authorise
from app.modules.meetings.domain.models import MeetingStatus, MeetingWithParticipants
from app.replay.contracts import ReplayCapabilities, ReplayContainer, ReplayNotFound, ReplaySession

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "22222222-2222-4222-8222-222222222222"
NOW = datetime(2026, 10, 28, tzinfo=timezone.utc)


def _meeting() -> MeetingWithParticipants:
    return MeetingWithParticipants(
        id=MEETING_ID,
        name="Recorded board",
        agenda="Recorded agenda",
        status=MeetingStatus.ARCHIVED,
        created_at=NOW,
        participants=[],
        messages=[],
    )


class _Reads:
    def __init__(self):
        self.calls = []

    async def get_meeting(self, meeting_id):
        self.calls.append(("get_meeting", meeting_id))
        return _meeting() if meeting_id == MEETING_ID else None

    async def list_meetings(self):
        self.calls.append(("list_meetings",))
        return [_meeting()]

    async def get_disagreements(self, meeting_id):
        self.calls.append(("get_disagreements", meeting_id))
        return []

    async def get_consensus_list(self, meeting_id):
        self.calls.append(("get_consensus_list", meeting_id))
        return []


class _LiveReads(_Reads):
    """Sentinel live graph; any replay call here is a leak."""


class _Observation:
    def __init__(self):
        self.calls = []

    async def status(self, meeting_id, operation_id):
        self.calls.append(("status", meeting_id, operation_id))
        if operation_id != OPERATION_ID:
            raise ReplayNotFound("Recorded turn not found")
        return {
            "id": OPERATION_ID,
            "meeting_id": MEETING_ID,
            "participant_id": None,
            "request_key": "recorded-turn",
            "status": "done",
            "admission": "admitted",
            "queue_position": None,
            "created_at": NOW,
            "started_at": NOW,
            "completed_at": NOW,
            "final_message_id": None,
            "cancel_requested_at": None,
            "error_code": None,
            "error_message": None,
            "effective_settings": None,
        }

    async def list_operations(self, meeting_id, limit=100):
        self.calls.append(("list_operations", meeting_id, limit))
        return []

    async def events(self, meeting_id, operation_id, after_sequence=0, limit=500):
        self.calls.append(("events", meeting_id, operation_id, after_sequence))
        if after_sequence:
            return []
        return [
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "operation_id": OPERATION_ID,
                "meeting_id": MEETING_ID,
                "sequence": 1,
                "type": "token",
                "payload": {"content": "recorded"},
            }
        ]


def _replay(reads=None, observation=None) -> ReplayContainer:
    return ReplayContainer(
        session=ReplaySession(
            run_id="run-1",
            package_version="2026.10.1",
            meeting_id=MEETING_ID,
            provenance={"source": "recorded", "recording": "test"},
            capabilities=ReplayCapabilities(),
        ),
        reads=reads or _Reads(),
        observation=observation or _Observation(),
    )


def test_unconfigured_replay_is_honest_and_never_falls_back_live(
    monkeypatch: pytest.MonkeyPatch,
):
    # The developer's .env may configure a replay package; this test proves the
    # unconfigured composition, so clear the pin explicitly.
    from app.platform.config import settings

    for name in (
        "replay_database_url",
        "replay_package_id",
        "replay_package_version",
        "replay_package_sha256",
    ):
        monkeypatch.setattr(settings, name, "", raising=False)

    live_reads = _LiveReads()
    app = authorise(
        create_app(Container(prompt_catalog=object(), meeting_reads=live_reads))
    )

    with TestClient(app) as client:
        session = client.get("/api/replay/session")
        meeting = client.get(f"/api/replay/meetings/{MEETING_ID}")
        command = client.post("/api/replay/meetings", json={})

    assert session.status_code == 503
    assert session.json()["detail"] == "replay_not_configured"
    assert meeting.status_code == 503
    assert command.status_code == 403
    assert command.json()["detail"] == "replay_read_only"
    assert live_reads.calls == []


def test_replay_reads_reach_only_the_replay_graph():
    live_reads = _LiveReads()
    replay_reads = _Reads()
    observation = _Observation()
    app = authorise(
        create_app(
            Container(prompt_catalog=object(), meeting_reads=live_reads),
            _replay(replay_reads, observation),
        )
    )

    with TestClient(app) as client:
        session = client.get("/api/replay/session")
        meeting = client.get(f"/api/replay/meetings/{MEETING_ID}")
        disagreement = client.get(f"/api/replay/meetings/{MEETING_ID}/disagreements")
        consensus = client.get(f"/api/replay/meetings/{MEETING_ID}/consensus")
        turn = client.get(f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}")

    assert session.status_code == 200
    assert session.json()["run_id"] == "run-1"
    assert session.json()["capabilities"]["turnObservation"] is True
    assert session.json()["capabilities"]["submitTurn"] is False
    assert meeting.status_code == 200
    assert meeting.json()["id"] == MEETING_ID
    assert disagreement.status_code == 200
    assert consensus.status_code == 200
    assert turn.status_code == 200
    assert turn.json()["status"] == "completed"
    assert live_reads.calls == []
    assert replay_reads.calls == [
        ("get_meeting", MEETING_ID),
        ("get_disagreements", MEETING_ID),
        ("get_consensus_list", MEETING_ID),
    ]


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Runtime-Mode": "live"},
        {"X-Workspace-Id": "live-workspace"},
        {"X-Provider-Key": "forged"},
        {"X-Replay-Mode": "live"},
    ],
)
def test_forged_selectors_cannot_leave_the_recorded_meeting(headers):
    reads = _Reads()
    observation = _Observation()
    app = authorise(
        create_app(
            Container(prompt_catalog=object(), meeting_reads=_LiveReads()),
            _replay(reads, observation),
        )
    )

    with TestClient(app) as client:
        response = client.get(
            "/api/replay/meetings/99999999-9999-4999-8999-999999999999",
            headers=headers,
        )

    assert response.status_code == 404
    assert reads.calls == []
    assert observation.calls == []


def test_replay_commands_are_rejected_before_any_adapter():
    reads = _Reads()
    observation = _Observation()
    app = authorise(
        create_app(
            Container(prompt_catalog=object(), meeting_reads=_LiveReads()),
            _replay(reads, observation),
        )
    )

    with TestClient(app) as client:
        for method, path in (
            ("POST", f"/api/replay/meetings/{MEETING_ID}/message"),
            ("POST", f"/api/replay/meetings/{MEETING_ID}/turns"),
            ("POST", f"/api/replay/meetings/{MEETING_ID}/closing"),
            ("DELETE", f"/api/replay/meetings/{MEETING_ID}"),
        ):
            response = client.request(method, path, json={})
            assert response.status_code == 403
            assert response.json()["detail"] == "replay_read_only"
    assert reads.calls == []
    assert observation.calls == []


def test_replay_turn_events_stream_from_the_recorded_observation():
    observation = _Observation()
    app = authorise(
        create_app(
            Container(prompt_catalog=object()),
            _replay(observation=observation),
        )
    )

    with TestClient(app) as client:
        with client.stream(
            "GET", f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}/events"
        ) as response:
            body = "".join(response.iter_text())

    assert response.status_code == 200
    assert '"type": "token"' in body
    assert '"content": "recorded"' in body
    assert observation.calls[0] == ("status", MEETING_ID, OPERATION_ID)


def test_replay_only_composition_mounts_no_live_routes():
    app = create_app(replay=_replay(), mount_live=False)

    paths = {getattr(route, "path", "") for route in app.routes}
    assert "/api/replay/session" in paths
    assert "/api/meetings" not in paths
    assert app.state.container is None

    with TestClient(app) as client:
        session = client.get("/api/replay/session")
        live = client.get("/api/meetings")

    assert session.status_code == 200
    assert live.status_code == 404


def test_replay_only_startup_never_constructs_the_live_composition(monkeypatch):
    def forbidden():
        raise AssertionError("replay-only startup constructed the live container")

    monkeypatch.setattr(Container, "production", classmethod(lambda cls: forbidden()))

    app = create_app(replay=_replay(), mount_live=False)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/replay/session").status_code == 200


def test_live_worker_refuses_a_replay_only_composition(monkeypatch):
    import asyncio

    import worker

    def forbidden():
        raise AssertionError("worker constructed the live container in replay-only mode")

    monkeypatch.setattr(worker.settings, "replay_only", True)
    monkeypatch.setattr(worker.Container, "production", classmethod(lambda cls: forbidden()))

    with pytest.raises(SystemExit, match="REPLAY_ONLY"):
        asyncio.run(worker._main())
