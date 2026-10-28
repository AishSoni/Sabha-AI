"""Integration: packaged replay runtime, checkpoints, and paced streams."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from app.platform.config import settings
from app.replay.runtime import ReplayRuntime
from app.replay.source import ReplaySource
from tests.support.replay import (
    READER_LOGIN,
    login_uri,
    provision_logins,
    publish_placeholder,
)

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
FINAL_TEXT = (
    "Placeholder recording. The synthetic brief shows coverage of 1.8x and a "
    "12% liquidity buffer. I would verify the underlying cash flow before "
    "relying on either number. This is a research checklist, not a recommendation."
)


class RecordingClock:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)


@pytest.fixture()
def replay_db(disposable_db):
    provision_logins(disposable_db)
    publish_placeholder(disposable_db)
    return disposable_db


def _runtime(monkeypatch, db, **kwargs) -> ReplayRuntime:
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(db, READER_LOGIN)
    )
    return ReplayRuntime(ReplaySource(), package_id="placeholder-analyst", **kwargs)


def _client(runtime: ReplayRuntime) -> TestClient:
    return TestClient(create_app(container=None, replay=runtime, mount_live=False))


def _frames(response) -> list[dict]:
    frames = []
    for line in response.iter_lines():
        if line.startswith("data: "):
            frames.append(json.loads(line[len("data: "):]))
    return frames


def test_session_exposes_the_pinned_package_and_selectors(
    replay_db, monkeypatch
) -> None:
    runtime = _runtime(monkeypatch, replay_db)
    with _client(runtime) as client:
        session = client.get("/api/replay/session").json()
        assert session["package_id"] == "placeholder-analyst"
        assert session["package_version"] == "1"
        assert session["checkpoint_id"] == "checkpoint-initial"
        assert session["initial_checkpoint"] == "checkpoint-initial"
        assert session["checkpoints"] == [
            "checkpoint-initial",
            "checkpoint-active",
            "checkpoint-completed",
            "checkpoint-closed",
        ]
        assert session["capabilities"]["closing"] is True
        assert session["capabilities"]["documents"] is True
        assert session["capabilities"]["sendMessage"] is False
        assert session["tapes"][0]["completed_checkpoint"] == "checkpoint-completed"
        assert session["intents"][0]["kind"] == "start_participant"
        assert session["assets"][0]["public_url"].startswith("https://storage.test/")
        assert session["retired"] is False

        selected = client.get(
            "/api/replay/session", params={"checkpoint": "checkpoint-completed"}
        ).json()
        assert selected["checkpoint_id"] == "checkpoint-completed"

        assert (
            client.get("/api/replay/session", params={"package": "other"}).status_code
            == 400
        )
        assert (
            client.get(
                "/api/replay/session", params={"checkpoint": "missing"}
            ).status_code
            == 400
        )


def test_checkpoint_reads_are_coherent_and_never_early(replay_db, monkeypatch) -> None:
    runtime = _runtime(monkeypatch, replay_db)
    with _client(runtime) as client:
        initial = client.get(f"/api/replay/meetings/{MEETING_ID}").json()
        assert initial["messages"] == []

        completed = client.get(
            f"/api/replay/meetings/{MEETING_ID}",
            params={"checkpoint": "checkpoint-completed"},
        ).json()
        assert len(completed["messages"]) == 2
        assert completed["messages"][-1]["content"] == FINAL_TEXT
        assert completed["messages"][-1]["citations"][0]["source"] == "meeting-document"

        stats = client.get(f"/api/replay/meetings/{MEETING_ID}/context-stats").json()
        assert stats["participant_count"] == 1
        documents = client.get(
            f"/api/replay/meetings/{MEETING_ID}/documents",
            params={"checkpoint": "checkpoint-completed"},
        ).json()
        assert documents[0]["file_name"] == "synthetic-issuer-brief.md"

        active_turn = client.get(
            f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}",
            params={"checkpoint": "checkpoint-active"},
        ).json()
        assert active_turn["status"] == "executing"
        completed_turn = client.get(
            f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}",
            params={"checkpoint": "checkpoint-completed"},
        ).json()
        assert completed_turn["status"] == "completed"
        assert completed_turn["final_message_id"] == completed["messages"][-1]["id"]

        closed = client.get(
            f"/api/replay/meetings/{MEETING_ID}/closing",
            params={"checkpoint": "checkpoint-closed"},
        ).json()
        assert closed["stage"] == "completed"
        assert closed["meeting_status"] == "ended"
        assert closed["votes"][0]["vote"] is True

        turns = client.get(
            f"/api/replay/meetings/{MEETING_ID}/turns",
            params={"checkpoint": "checkpoint-completed"},
        ).json()
        assert turns[0]["operation_id"] == OPERATION_ID


def test_turn_sse_is_paced_incremental_and_resumable(replay_db, monkeypatch) -> None:
    clock = RecordingClock()
    runtime = _runtime(monkeypatch, replay_db, clock=clock)
    with _client(runtime) as client:
        path = (
            f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}/events"
        )
        with client.stream(
            "GET", path, params={"checkpoint": "checkpoint-active", "after": 0}
        ) as response:
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-cache"
            assert response.headers["x-accel-buffering"] == "no"
            frames = _frames(response)

        assert [frame["sequence"] for frame in frames] == list(range(1, 9))
        assert frames[0]["type"] == "tool_call"
        assert frames[1]["type"] == "tool_result"
        assert frames[0]["invocation_id"] == frames[1]["invocation_id"]
        assert frames[0]["call_id"] == frames[1]["call_id"]
        assert frames[2]["type"] == "citation"
        assert sum(1 for frame in frames if frame["type"] == "done") == 1
        assert frames[-1]["type"] == "done"
        assert any(delay > 0 for delay in clock.delays)

        with client.stream(
            "GET", path, params={"checkpoint": "checkpoint-active", "after": 3}
        ) as response:
            resumed = _frames(response)
        assert [frame["sequence"] for frame in resumed] == list(range(4, 9))
        assert all(frame["sequence"] > 3 for frame in resumed)

        with client.stream(
            "GET", path, params={"checkpoint": "checkpoint-active", "after": 8}
        ) as response:
            assert _frames(response) == []


def test_closing_sse_uses_the_typed_recorded_envelope(
    replay_db, monkeypatch
) -> None:
    runtime = _runtime(monkeypatch, replay_db)
    with _client(runtime) as client:
        path = f"/api/replay/meetings/{MEETING_ID}/closing/events"
        with client.stream(
            "GET", path, params={"checkpoint": "checkpoint-closed"}
        ) as response:
            assert response.status_code == 200
            frames = _frames(response)

        assert [frame["sequence"] for frame in frames] == [1, 2, 3, 4]
        ballot = [frame for frame in frames if frame["kind"] == "ballot"]
        summary = [frame for frame in frames if frame["kind"] == "summary"]
        assert ballot[-1]["terminal"] is True
        assert ballot[-1]["result"] == "yes"
        assert ballot[-1]["subject_id"] == "22222222-2222-4222-8222-222222222222"
        assert summary[-1]["terminal"] is True
        assert summary[-1]["result"] == "completed"
        assert all(
            frame["provenance"] == "recorded-stream" for frame in frames
        )


def test_two_visitors_get_independent_ephemeral_runs(replay_db, monkeypatch) -> None:
    runtime = _runtime(monkeypatch, replay_db)
    with _client(runtime) as client:
        first = client.get("/api/replay/session").json()
        second = client.get("/api/replay/session").json()
        assert first["run_id"] != second["run_id"]

        early = client.get(
            f"/api/replay/meetings/{MEETING_ID}", params={"checkpoint": "checkpoint-initial"}
        ).json()
        late = client.get(
            f"/api/replay/meetings/{MEETING_ID}",
            params={"checkpoint": "checkpoint-completed"},
        ).json()
        assert early["messages"] == []
        assert len(late["messages"]) == 2


def test_unavailable_package_never_falls_back_to_live(replay_db, monkeypatch) -> None:
    runtime = _runtime(monkeypatch, replay_db, version="999")
    container = Container(prompt_catalog=None)
    client = TestClient(create_app(container=container, replay=runtime))
    try:
        response = client.get("/api/replay/session")
        assert response.status_code == 503
        assert response.json()["detail"]
        assert client.post(
            f"/api/replay/meetings/{MEETING_ID}/message", json={"content": "x"}
        ).status_code == 403
    finally:
        client.close()
