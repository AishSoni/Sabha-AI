"""Zero replay-attributable effects (spec-19).

A complete recorded session is served over a real socket while three
independent observers watch the real effects boundary:

* every SQL statement on the replay reader connection (must be a read);
* PostgreSQL tuple counters for all user tables (must not move);
* non-loopback socket connections (must not happen).

The live container is a sentinel, and the asset bucket is held unchanged.
"""

from __future__ import annotations

import json
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
from tests.support.replay import (
    READER_LOGIN,
    FakeStorage,
    login_uri,
    provision_logins,
    publish_placeholder,
)

MEETING_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "66666666-6666-4666-8666-666666666666"
PROVIDER_SENTINEL = "sk-spec19-must-not-leak"


class _LiveGraph:
    def __init__(self) -> None:
        self.calls = []

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


class _RecordingConnection:
    """Delegate to a real reader connection while recording every statement."""

    def __init__(self, connection, statements):
        self._connection = connection
        self._statements = statements

    def execute(self, query, params=None):
        self._statements.append((query, params))
        return self._connection.execute(query, params)

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __enter__(self):
        self._connection.__enter__()
        return self

    def __exit__(self, *exc_info):
        return self._connection.__exit__(*exc_info)


class _RecordingSource(ReplaySource):
    def __init__(self, statements, **kwargs):
        self.statements = statements
        super().__init__(self._connect, **kwargs)

    def _connect(self):
        from app.platform.replay_database import connect_replay_reader

        return _RecordingConnection(connect_replay_reader(), self.statements)


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _tuple_counts(db):
    with db.connect() as conn:
        return conn.execute(
            "SELECT COALESCE(sum(n_tup_ins), 0), COALESCE(sum(n_tup_upd), 0), "
            "COALESCE(sum(n_tup_del), 0) FROM pg_stat_user_tables"
        ).fetchone()


@pytest.fixture()
def effect_server(disposable_db, monkeypatch):
    provision_logins(disposable_db)
    storage = publish_placeholder(disposable_db)
    storage_before = dict(storage.objects)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(disposable_db, READER_LOGIN)
    )
    monkeypatch.setenv("OPENROUTER_API_KEY", PROVIDER_SENTINEL)
    statements: list[tuple] = []
    runtime = ReplayRuntime(
        _RecordingSource(statements),
        package_id="placeholder-analyst",
        limiter=StreamLimiter(max_global=4, max_per_client=2),
    )
    live = _LiveGraph()
    app = create_app(
        Container(prompt_catalog=object(), meeting_reads=live),
        runtime,
        mount_live=False,
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
            "statements": statements,
            "live": live,
            "storage": storage,
            "storage_before": storage_before,
        }
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_complete_replay_session_produces_no_live_effects(
    effect_server, disposable_db, monkeypatch
) -> None:
    base_url = effect_server["base_url"]
    outbound: list[tuple] = []
    original_connect = socket.socket.connect

    def guarded_connect(sock, address):
        if isinstance(address, tuple):
            host = address[0]
            if host not in ("127.0.0.1", "::1", "localhost"):
                outbound.append(address)
        return original_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    before = _tuple_counts(disposable_db)
    bodies: list[str] = []

    with httpx.Client(timeout=20) as client:
        session = client.get(f"{base_url}/api/replay/session")
        assert session.status_code == 200
        bodies.append(session.text)
        session_body = session.json()
        assert session_body["meeting_id"] == MEETING_ID

        for path in (
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
        ):
            response = client.get(
                base_url + path, params={"checkpoint": "checkpoint-active"}
            )
            assert response.status_code == 200, (path, response.status_code, response.text)
            bodies.append(response.text)

        for asset in session_body["assets"]:
            response = client.get(f"{base_url}/api/replay/assets/{asset['asset_id']}")
            assert response.status_code == 200
            bodies.append(response.text)

        with client.stream(
            "GET",
            f"{base_url}/api/replay/meetings/{MEETING_ID}/turns/"
            f"{OPERATION_ID}/events",
            params={"checkpoint": "checkpoint-active", "after": 0},
        ) as response:
            assert response.status_code == 200
            for line in response.iter_lines():
                if line.startswith("data: "):
                    bodies.append(line)

        with client.stream(
            "GET",
            f"{base_url}/api/replay/meetings/{MEETING_ID}/closing/events",
            params={"checkpoint": "checkpoint-closed"},
        ) as response:
            assert response.status_code == 200
            for line in response.iter_lines():
                if line.startswith("data: "):
                    bodies.append(line)

        # A restarted visitor re-reads the same package; still no effects.
        restarted = client.get(f"{base_url}/api/replay/session")
        assert restarted.status_code == 200
        bodies.append(restarted.text)

    after = _tuple_counts(disposable_db)

    assert effect_server["statements"], "the session must exercise the reader"
    for query, _ in effect_server["statements"]:
        normalized = " ".join(str(query).split()).upper()
        assert normalized.startswith(("SELECT", "WITH")), normalized[:120]
    assert before == after, (before, after)
    assert effect_server["live"].calls == []
    assert effect_server["storage"].objects == effect_server["storage_before"]
    assert outbound == []
    for body in bodies:
        assert PROVIDER_SENTINEL not in body
