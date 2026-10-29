"""Integration: packaged replay runtime, checkpoints, and paced streams."""

from __future__ import annotations

import json
from pathlib import Path

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
    publish_dir,
    publish_placeholder,
)
from scripts.replay_package import activate_package

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
APPROVED_ID = "hdfc-ine001a07rw5"
APPROVED_SHA256 = "5fb2a800c907f4de3be69c4b4b1262e32b1570b0abe03f8819ed783baac9bc82"
GUIDED_ROOT = (
    Path(__file__).resolve().parents[2] / "replay_packages" / APPROVED_ID
)
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
        assert session["title"] == "Recorded placeholder: synthetic credit review"
        assert session["as_of"] == "2026-01-15"
        assert session["disclosure"] == ""
        assert session["stack_labels"] == {}
        assert session["beats"][0]["beat_id"] == "meet-the-board"
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
        assert session["claims"] == []
        assert session["preview"] == {"available": True, "asset_ids": ["brief"]}
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


def test_approved_session_exposes_claims_and_preview_assets(
    replay_db, monkeypatch
) -> None:
    publish_dir(replay_db, GUIDED_ROOT)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(replay_db, READER_LOGIN)
    )
    runtime = ReplayRuntime(ReplaySource(), package_id=APPROVED_ID)
    with _client(runtime) as client:
        session = client.get("/api/replay/session").json()

    assert session["package_id"] == APPROVED_ID
    assert session["content_sha256"] == APPROVED_SHA256
    assert session["checkpoint_id"] == "checkpoint-initial"
    assert len(session["claims"]) == 13
    assert {claim["claim_id"] for claim in session["claims"]} == {
        f"C{index}" for index in range(1, 14)
    }
    assert all(
        claim["evidence_asset_id"] in session["preview"]["asset_ids"]
        for claim in session["claims"]
    )
    assert session["preview"]["available"] is True
    assert len(session["preview"]["asset_ids"]) == 7
    assert {asset["asset_id"] for asset in session["assets"]} == set(
        session["preview"]["asset_ids"]
    )
    assert all(asset["media_type"] == "text/markdown" for asset in session["assets"])


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
        config = client.get(
            f"/api/replay/meetings/{MEETING_ID}/safe-config"
        ).json()
        assert config["participants"][0]["provider"] == "recorded"
        assert "api_key" not in config

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


def test_corrupt_checkpoint_is_unavailable(replay_db, monkeypatch) -> None:
    with replay_db.connect() as admin:
        admin.execute(
            """
            UPDATE replay.checkpoint
            SET bundle = jsonb_set(bundle, '{reads,meeting,name}', '"tampered"')
            WHERE checkpoint_id = 'checkpoint-initial'
            """
        )
    runtime = _runtime(monkeypatch, replay_db)
    with _client(runtime) as client:
        response = client.get("/api/replay/session")
        assert response.status_code == 503
        assert response.json()["detail"] == "a checkpoint failed its hash check"


def test_pinned_version_keeps_serving_after_the_registry_moves(
    disposable_db, monkeypatch
) -> None:
    provision_logins(disposable_db)
    fixtures = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "replay"
    publish_dir(disposable_db, fixtures / "fixture-minimal")
    publish_dir(disposable_db, fixtures / "fixture-minimal-v2")
    import psycopg

    with psycopg.connect(login_uri(disposable_db, "sabha_replay_test_publisher")) as conn:
        activate_package(conn, "fixture-minimal", "2")

    pinned = ReplayRuntime(
        ReplaySource(),
        package_id="fixture-minimal",
        version="1",
    )
    monkeypatch.setattr(
        settings,
        "replay_database_url",
        login_uri(disposable_db, READER_LOGIN),
    )
    with _client(pinned) as client:
        assert client.get("/api/replay/session").json()["package_version"] == "1"

    latest = ReplayRuntime(ReplaySource(), package_id="fixture-minimal")
    with _client(latest) as client:
        assert client.get("/api/replay/session").json()["package_version"] == "2"
