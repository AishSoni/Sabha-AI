"""Replay HTTP boundary over a real socket (spec-19).

``test_replay_surface.py`` proves route isolation through an in-process ASGI
client. Release acceptance requires the same boundary to hold over an actual
HTTP connection: forged headers, live-looking IDs, unsupported methods and deep
links must be rejected before any adapter runs, and the live graph mounted in
the same process must stay untouched.
"""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.bootstrap import Container, create_app
from tests.support.access import authorise
from app.platform.config import settings
from app.replay.runtime import ReplayRuntime
from app.replay.source import ReplaySource
from app.replay.streaming import StreamLimiter
from tests.support.replay import READER_LOGIN, login_uri, provision_logins, publish_placeholder

MEETING_ID = "11111111-1111-4111-8111-111111111111"
UNKNOWN_MEETING_ID = "99999999-9999-4999-8999-999999999999"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"


class _LiveReads:
    """Sentinel live graph: every call here is a replay leak."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def list_meetings(self):
        self.calls.append(("list_meetings",))
        return []

    async def get_meeting(self, meeting_id):
        self.calls.append(("get_meeting", meeting_id))
        return None

    async def get_disagreements(self, meeting_id):
        self.calls.append(("get_disagreements", meeting_id))
        return []

    async def get_consensus_list(self, meeting_id):
        self.calls.append(("get_consensus_list", meeting_id))
        return []


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _serve(app) -> tuple[str, uvicorn.Server, threading.Thread]:
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
    return f"http://127.0.0.1:{port}", server, thread


@pytest.fixture()
def shared_server(disposable_db, monkeypatch):
    """A real HTTP app with live routes and the recorded replay graph mounted."""

    provision_logins(disposable_db)
    publish_placeholder(disposable_db)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(disposable_db, READER_LOGIN)
    )
    runtime = ReplayRuntime(
        ReplaySource(),
        package_id="placeholder-analyst",
        limiter=StreamLimiter(max_global=4, max_per_client=2),
    )
    live_reads = _LiveReads()
    app = authorise(
        create_app(
            Container(prompt_catalog=object(), meeting_reads=live_reads),
            runtime,
            mount_live=True,
        )
    )
    base_url, server, thread = _serve(app)
    try:
        yield base_url, live_reads
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_live_routes_are_mounted_and_replay_reads_never_reach_them(shared_server):
    base_url, live_reads = shared_server
    with httpx.Client(timeout=15) as client:
        live = client.get(f"{base_url}/api/meetings")
        assert live.status_code == 200
        assert live_reads.calls == [("list_meetings",)]

        live_reads.calls.clear()
        replay_requests = (
            "/api/replay/session",
            "/api/replay/meetings",
            f"/api/replay/meetings/{MEETING_ID}",
            f"/api/replay/meetings/{MEETING_ID}/disagreements",
            f"/api/replay/meetings/{MEETING_ID}/consensus",
            f"/api/replay/meetings/{MEETING_ID}/context-stats",
            f"/api/replay/meetings/{MEETING_ID}/documents",
            f"/api/replay/meetings/{MEETING_ID}/safe-config",
            f"/api/replay/meetings/{MEETING_ID}/closing",
            f"/api/replay/meetings/{MEETING_ID}/turns",
            f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}",
        )
        for path in replay_requests:
            response = client.get(base_url + path, params={"checkpoint": "checkpoint-active"})
            assert response.status_code == 200, (path, response.status_code, response.text)

    assert live_reads.calls == []


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Runtime-Mode": "live"},
        {"X-Workspace-Id": "live-workspace"},
        {"X-Provider-Key": "forged"},
        {"X-Replay-Mode": "live"},
    ],
)
def test_forged_selectors_cannot_leave_the_recorded_meeting(shared_server, headers):
    base_url, live_reads = shared_server
    with httpx.Client(timeout=15) as client:
        response = client.get(
            f"{base_url}/api/replay/meetings/{UNKNOWN_MEETING_ID}",
            params={"checkpoint": "checkpoint-active"},
            headers=headers,
        )

    assert response.status_code == 404
    assert live_reads.calls == []


def test_unsupported_methods_and_deep_links_fail_closed(shared_server):
    base_url, live_reads = shared_server
    with httpx.Client(timeout=15) as client:
        for method, path in (
            ("POST", f"/api/replay/meetings/{MEETING_ID}/message"),
            ("POST", f"/api/replay/meetings/{MEETING_ID}/turns"),
            ("POST", f"/api/replay/meetings/{MEETING_ID}/closing"),
            ("DELETE", f"/api/replay/meetings/{MEETING_ID}"),
            ("PUT", f"/api/replay/meetings/{MEETING_ID}"),
            ("PATCH", f"/api/replay/meetings/{MEETING_ID}"),
        ):
            response = client.request(method, base_url + path, json={})
            assert response.status_code == 403, (method, path, response.status_code)
            assert response.json()["detail"] == "replay_read_only"

        unknown_turn = client.get(
            f"{base_url}/api/replay/meetings/{MEETING_ID}/turns/"
            "99999999-9999-4999-8999-999999999999"
        )
        bad_checkpoint = client.get(
            f"{base_url}/api/replay/meetings/{MEETING_ID}",
            params={"checkpoint": "checkpoint-does-not-exist"},
        )

    assert unknown_turn.status_code == 404
    assert bad_checkpoint.status_code == 400
    assert live_reads.calls == []


def test_unconfigured_replay_answers_503_without_live_fallback(disposable_db, monkeypatch):
    monkeypatch.setattr(settings, "replay_database_url", "")
    monkeypatch.setattr(settings, "replay_package_id", "")
    live_reads = _LiveReads()
    app = authorise(
        create_app(
            Container(prompt_catalog=object(), meeting_reads=live_reads),
            None,
            mount_live=True,
        )
    )
    base_url, server, thread = _serve(app)
    try:
        with httpx.Client(timeout=15) as client:
            session = client.get(f"{base_url}/api/replay/session")
            listing = client.get(f"{base_url}/api/replay/meetings")
            command = client.post(f"{base_url}/api/replay/meetings", json={})
    finally:
        server.should_exit = True
        thread.join(timeout=5)

    assert session.status_code == 503
    assert session.json()["detail"] == "replay_not_configured"
    assert listing.status_code == 503
    assert command.status_code == 403
    assert live_reads.calls == []
