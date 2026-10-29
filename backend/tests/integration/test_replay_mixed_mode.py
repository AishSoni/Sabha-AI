"""Mixed live and replay graphs in one process (spec-19).

A live turn and the recorded replay coexist in the same app. The live graph is
represented by recording ports so the test can observe every touch; the replay
graph is the real package runtime over disposable PostgreSQL. Switching to the
recording, streaming a turn, closing, and restarting must detach only replay
observation: the live operation, its cache, its vault, and its provider
credential stay untouched.

This is API-level coexistence. It does not claim a full browser mixed-mode
journey, which the release record keeps unexecuted.
"""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.bootstrap import Container, create_app
from app.platform.config import settings
from app.replay.runtime import ReplayRuntime
from app.replay.source import ReplaySource
from app.replay.streaming import StreamLimiter
from tests.support.replay import READER_LOGIN, login_uri, provision_logins, publish_placeholder

REPLAY_MEETING = "11111111-1111-4111-8111-111111111111"
REPLAY_OPERATION = "66666666-6666-4666-8666-666666666666"
LIVE_MEETING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
LIVE_OPERATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROVIDER_SENTINEL = "sk-spec19-live-key"


class _LiveTurnObservation:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.cache = {"warm": True, "cooldown_until": "not-now"}
        self.operation = {
            "id": LIVE_OPERATION,
            "meeting_id": LIVE_MEETING,
            "participant_id": None,
            "request_key": "live-turn",
            "status": "executing",
            "admission": 1,
            "queue_position": 0,
            "created_at": "2026-10-29T00:00:00Z",
            "started_at": "2026-10-29T00:00:00Z",
            "completed_at": None,
            "final_message_id": None,
            "cancel_requested_at": None,
            "error_code": None,
            "error_message": None,
            "effective_settings": None,
        }

    async def list_operations(self, meeting_id, limit=100):
        self.calls.append(("list_operations", meeting_id, limit))
        return [self.operation]

    async def status(self, meeting_id, operation_id):
        self.calls.append(("status", meeting_id, operation_id))
        return self.operation

    async def cancel(self, meeting_id, operation_id):
        self.calls.append(("cancel", meeting_id, operation_id))
        raise AssertionError("replay must never cancel a live turn")


class _LiveVault:
    def __init__(self) -> None:
        self.reads: list[str] = []

    def read(self, name):
        self.reads.append(name)
        raise AssertionError("replay must never read the live vault")


class _LiveReads:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def list_meetings(self):
        self.calls.append(("list_meetings",))
        return []

    async def get_meeting(self, meeting_id):
        self.calls.append(("get_meeting", meeting_id))
        return None


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture()
def mixed_server(disposable_db, monkeypatch):
    provision_logins(disposable_db)
    publish_placeholder(disposable_db)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(disposable_db, READER_LOGIN)
    )
    monkeypatch.setenv("OPENROUTER_API_KEY", PROVIDER_SENTINEL)
    observation = _LiveTurnObservation()
    vault = _LiveVault()
    reads = _LiveReads()
    runtime = ReplayRuntime(
        ReplaySource(),
        package_id="placeholder-analyst",
        limiter=StreamLimiter(max_global=4, max_per_client=2),
    )
    app = create_app(
        Container(
            prompt_catalog=object(),
            meeting_reads=reads,
            turn_observation=observation,
            knowledge_lifecycle=vault,
        ),
        runtime,
        mount_live=True,
    )
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="error",
            lifespan="off",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    if not server.started:
        raise RuntimeError("uvicorn did not start")
    try:
        yield {
            "base_url": f"http://127.0.0.1:{port}",
            "observation": observation,
            "vault": vault,
            "reads": reads,
        }
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def _live_turn(base_url: str) -> dict:
    response = httpx.get(
        f"{base_url}/api/meetings/{LIVE_MEETING}/turns/{LIVE_OPERATION}",
        timeout=10,
    )
    assert response.status_code == 200
    return response.json()


def _read_replay_session(base_url: str, client: httpx.Client) -> str:
    session = client.get(f"{base_url}/api/replay/session")
    assert session.status_code == 200
    meeting = session.json()["meeting_id"]

    for suffix in ("", "/safe-config", "/turns", f"/turns/{REPLAY_OPERATION}"):
        response = client.get(
            f"{base_url}/api/replay/meetings/{meeting}{suffix}",
            params={"checkpoint": "checkpoint-active"},
        )
        assert response.status_code == 200, (suffix, response.status_code, response.text)

    with client.stream(
        "GET",
        f"{base_url}/api/replay/meetings/{meeting}/turns/"
        f"{REPLAY_OPERATION}/events",
        params={"checkpoint": "checkpoint-active"},
    ) as response:
        assert response.status_code == 200
        for _ in response.iter_lines():
            pass

    with client.stream(
        "GET",
        f"{base_url}/api/replay/meetings/{meeting}/closing/events",
        params={"checkpoint": "checkpoint-closed"},
    ) as response:
        assert response.status_code == 200
        for _ in response.iter_lines():
            pass

    return meeting


def test_replay_detaches_without_touching_the_live_turn_or_vault(mixed_server):
    base_url = mixed_server["base_url"]
    observation = mixed_server["observation"]
    vault = mixed_server["vault"]

    before = _live_turn(base_url)
    assert before["status"] == "executing"
    assert observation.calls == [
        ("status", LIVE_MEETING, LIVE_OPERATION),
    ]

    with httpx.Client(timeout=20) as client:
        replay_meeting = _read_replay_session(base_url, client)
        # Restarting the visitor fetches a fresh ephemeral session and the
        # same recorded package; the live operation remains executing.
        restarted = client.get(f"{base_url}/api/replay/session")
        assert restarted.status_code == 200
        assert restarted.json()["meeting_id"] == replay_meeting
        assert restarted.json()["run_id"] != client.get(
            f"{base_url}/api/replay/session"
        ).json()["run_id"]

    after = _live_turn(base_url)
    assert after["status"] == "executing"
    assert observation.calls[-1] == ("status", LIVE_MEETING, LIVE_OPERATION)
    assert [call[0] for call in observation.calls].count("list_operations") == 0
    assert observation.cache == {"warm": True, "cooldown_until": "not-now"}
    assert vault.reads == []
    assert mixed_server["reads"].calls == []
    assert PROVIDER_SENTINEL not in str(after)
