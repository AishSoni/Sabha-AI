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
    BACKEND,
    READER_LOGIN,
    FakeStorage,
    login_uri,
    provision_logins,
    publish_dir,
    publish_placeholder,
)

PLACEHOLDER_MEETING_ID = "11111111-1111-4111-8111-111111111111"
PLACEHOLDER_OPERATION_ID = "66666666-6666-4666-8666-666666666666"
EXPANDED = BACKEND / "replay_packages" / "hdfc-ine001a07rw5"
EXPANDED_MEETING_ID = "a0000000-0000-4000-8000-000000000001"
EXPANDED_OPERATION_ID = "a0000000-0000-4000-8000-000000000301"
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


@pytest.fixture(params=["placeholder", "expanded"])
def effect_server(request, disposable_db, monkeypatch):
    provision_logins(disposable_db)
    if request.param == "expanded":
        storage = publish_dir(disposable_db, EXPANDED)
        package_id = "hdfc-ine001a07rw5"
        meeting_id = EXPANDED_MEETING_ID
        operation_id = EXPANDED_OPERATION_ID
        checkpoint = "checkpoint-created"
        closing_checkpoint = "checkpoint-closed"
    else:
        storage = publish_placeholder(disposable_db)
        package_id = "placeholder-analyst"
        meeting_id = PLACEHOLDER_MEETING_ID
        operation_id = PLACEHOLDER_OPERATION_ID
        checkpoint = "checkpoint-active"
        closing_checkpoint = "checkpoint-closed"
    storage_before = dict(storage.objects)
    monkeypatch.setattr(
        settings, "replay_database_url", login_uri(disposable_db, READER_LOGIN)
    )
    monkeypatch.setenv("OPENROUTER_API_KEY", PROVIDER_SENTINEL)
    statements: list[tuple] = []
    runtime = ReplayRuntime(
        _RecordingSource(statements),
        package_id=package_id,
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
            "package_id": package_id,
            "meeting_id": meeting_id,
            "operation_id": operation_id,
            "checkpoint": checkpoint,
            "closing_checkpoint": closing_checkpoint,
        }
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_complete_replay_session_produces_no_live_effects(
    effect_server, disposable_db, monkeypatch
) -> None:
    base_url = effect_server["base_url"]
    meeting_id = effect_server["meeting_id"]
    operation_id = effect_server["operation_id"]
    checkpoint = effect_server["checkpoint"]
    closing_checkpoint = effect_server["closing_checkpoint"]
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
        assert session_body["meeting_id"] == meeting_id
        assert session_body["package_id"] == effect_server["package_id"]

        seed = client.get(f"{base_url}/api/replay/workspace-seed")
        if effect_server["package_id"] == "hdfc-ine001a07rw5":
            assert seed.status_code == 200, (seed.status_code, seed.text)
            bodies.append(seed.text)
        else:
            assert seed.status_code == 404

        for path in (
            "/api/replay/meetings",
            f"/api/replay/meetings/{meeting_id}",
            f"/api/replay/meetings/{meeting_id}/disagreements",
            f"/api/replay/meetings/{meeting_id}/consensus",
            f"/api/replay/meetings/{meeting_id}/context-stats",
            f"/api/replay/meetings/{meeting_id}/documents",
            f"/api/replay/meetings/{meeting_id}/safe-config",
            f"/api/replay/meetings/{meeting_id}/closing",
            f"/api/replay/meetings/{meeting_id}/turns",
            f"/api/replay/meetings/{meeting_id}/turns/{operation_id}",
        ):
            response = client.get(base_url + path, params={"checkpoint": checkpoint})
            assert response.status_code == 200, (path, response.status_code, response.text)
            bodies.append(response.text)

        for asset in session_body["assets"]:
            response = client.get(f"{base_url}/api/replay/assets/{asset['asset_id']}")
            assert response.status_code == 200
            bodies.append(response.text)

        with client.stream(
            "GET",
            f"{base_url}/api/replay/meetings/{meeting_id}/turns/"
            f"{operation_id}/events",
            params={"checkpoint": checkpoint, "after": 0, "speed": 2},
        ) as response:
            assert response.status_code == 200
            for line in response.iter_lines():
                if line.startswith("data: "):
                    bodies.append(line)

        with client.stream(
            "GET",
            f"{base_url}/api/replay/meetings/{meeting_id}/closing/events",
            params={"checkpoint": closing_checkpoint, "speed": 1},
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
