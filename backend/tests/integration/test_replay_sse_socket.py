"""Real-socket SSE verification (spec-17).

The iterator-spy tests in the route suite cannot prove that a proxy/serializer
does not coalesce the whole tape. This test runs uvicorn on an ephemeral port,
observes frames while the stream is still open, and checks incremental arrival,
resume, headers, and disconnect cleanup.
"""

from __future__ import annotations

import json
import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.bootstrap import create_app
from app.platform.config import settings
from app.replay.runtime import ReplayRuntime
from app.replay.source import ReplaySource
from app.replay.streaming import StreamLimiter
from tests.support.replay import READER_LOGIN, login_uri, provision_logins, publish_placeholder

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
BASE = f"/api/replay/meetings/{MEETING_ID}/turns/{OPERATION_ID}/events"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture()
def live_server(disposable_db, monkeypatch):
    provision_logins(disposable_db)
    publish_placeholder(disposable_db)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(disposable_db, READER_LOGIN)
    )
    runtime = ReplayRuntime(
        ReplaySource(),
        package_id="placeholder-analyst",
        limiter=StreamLimiter(max_global=4, max_per_client=1),
    )
    app = create_app(container=None, replay=runtime, mount_live=False)
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
        yield f"http://127.0.0.1:{port}", runtime
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def _read_events(response):
    events = []
    stamps = []
    for line in response.iter_lines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
            stamps.append(time.monotonic())
    return events, stamps


def test_sse_frames_arrive_incrementally_over_a_real_socket(live_server) -> None:
    base_url, _ = live_server
    with httpx.Client(timeout=15) as client:
        with client.stream(
            "GET",
            base_url + BASE,
            params={"checkpoint": "checkpoint-active", "after": 0},
        ) as response:
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-cache"
            assert response.headers["x-accel-buffering"] == "no"
            events, stamps = _read_events(response)

    assert [event["sequence"] for event in events] == list(range(1, 9))
    assert events[-1]["type"] == "done"
    # The tape carries ~700ms of intended pacing; a serialized/coalesced
    # response would deliver every frame at once.
    assert stamps[-1] - stamps[0] >= 0.3


def test_resume_and_disconnect_release_the_client_slot(live_server) -> None:
    base_url, runtime = live_server
    with httpx.Client(timeout=15) as client:
        with client.stream(
            "GET",
            base_url + BASE,
            params={"checkpoint": "checkpoint-active", "after": 5},
        ) as response:
            events, _ = _read_events(response)
        assert [event["sequence"] for event in events] == [6, 7, 8]

        deadline = time.monotonic() + 3
        while runtime.limiter.active("127.0.0.1") and time.monotonic() < deadline:
            time.sleep(0.02)
        assert runtime.limiter.active("127.0.0.1") == 0

        with client.stream(
            "GET",
            base_url + BASE,
            params={"checkpoint": "checkpoint-active", "after": 8},
        ) as response:
            assert response.status_code == 200
            assert _read_events(response)[0] == []


def test_concurrent_stream_limit_is_enforced_over_the_wire(live_server) -> None:
    base_url, runtime = live_server
    with httpx.Client(timeout=15) as client:
        with client.stream(
            "GET", base_url + BASE, params={"checkpoint": "checkpoint-active"}
        ) as first:
            assert first.status_code == 200
            lines = first.iter_lines()
            next(lines)
            time.sleep(0.05)
            assert runtime.limiter.active("127.0.0.1") == 1
            second = client.get(
                base_url + BASE, params={"checkpoint": "checkpoint-active"}
            )
            assert second.status_code == 429


def test_closing_stream_preserves_unicode_and_typed_envelope(live_server) -> None:
    base_url, _ = live_server
    with httpx.Client(timeout=15) as client:
        with client.stream(
            "GET",
            f"{base_url}/api/replay/meetings/{MEETING_ID}/closing/events",
            params={"checkpoint": "checkpoint-closed"},
        ) as response:
            assert response.status_code == 200
            frames, _ = _read_events(response)

    assert frames[1]["text"].startswith("Yes —")
    assert frames[1]["provenance"] == "recorded-stream"
    assert frames[3]["terminal"] is True
