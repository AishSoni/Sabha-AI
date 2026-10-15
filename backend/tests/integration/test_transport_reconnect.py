"""Transport validation on a real local server: a subscriber disconnects
mid-stream, the turn continues server-side, reconnect-with-cursor replays
exactly the persisted journal, and status reports the terminal outcome
(P04 TEST06 runtime evidence, not mocked subscribers)."""

import http.client
import json
import threading
import time

import pytest

pytestmark = pytest.mark.integration

HOST, PORT = "127.0.0.1", 18765


def _slow_provider():
    from app.llm.base import LLMResponse

    class _Gated:
        def __init__(self):
            self.calls = 0

        async def complete(self, messages, tools=None, temperature=0.7,
                           max_tokens=2048):
            import asyncio

            self.calls += 1
            if self.calls == 1:
                await asyncio.sleep(2.0)  # window to disconnect mid-stream
                return LLMResponse(content="interim", tool_calls=[],
                                   usage={"prompt_tokens": 1,
                                          "completion_tokens": 1,
                                          "total_tokens": 2})
            return LLMResponse(content="final answer", tool_calls=[],
                               usage={"prompt_tokens": 1, "completion_tokens": 1,
                                      "total_tokens": 2})

        def estimate_cost(self, usage):
            return 0.0

    return _Gated()


def _build_app():
    import uuid

    from fastapi import FastAPI
    from fastapi.responses import JSONResponse, StreamingResponse

    from tests.application.test_turn_engine import (
        FakeKnowledge,
        FakeMeetings,
        _engine,
        _meeting,
    )

    meeting = _meeting()
    provider = _slow_provider()
    engine, store = _engine(meeting, provider, FakeKnowledge())

    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.post("/demo-turns")
    async def start_turn():
        import asyncio

        key = str(uuid.uuid4())
        participant = next(p for p in meeting.participants if p.id == "p1")
        snapshot = {
            "agenda": meeting.agenda,
            "message_ids": [m.id for m in meeting.messages],
            "system_prompt": participant.system_prompt,
            "provider": participant.provider_config.provider,
            "model": participant.provider_config.model,
            "temperature": participant.provider_config.temperature,
        }
        record = await store.reserve("m1", "p1", key, snapshot)
        await store.mark_running(record.turn_id)
        task_id = record.turn_id

        async def _run():
            try:
                await engine.run("m1", "p1", idempotency_key=key)
            except Exception:
                pass

        asyncio.create_task(_run())
        void = await store.get(task_id)
        return JSONResponse({"turn_id": void.turn_id})

    @app.get("/demo-turns/{turn_id}")
    async def turn_status(turn_id: str):
        record = await store.get(turn_id)
        return JSONResponse({"turn_id": turn_id, "state": record.state,
                             "result_message_id": record.result_message_id})

    @app.get("/demo-turns/{turn_id}/events")
    async def turn_events(turn_id: str, after: int = 0):
        seen = after

        async def _stream():
            nonlocal seen
            for _ in range(200):  # ~20s live follow, then close
                events = await store.list_events(turn_id, seen)
                for event in events:
                    seen = event["sequence"]
                    yield (f"id: {event['event_id']}\nevent: {event['type']}\n"
                           f"data: {json.dumps(event['data'])}\n\n")
                record = await store.get(turn_id)
                if record.state in ("completed", "failed", "cancelled"):
                    return
                import asyncio

                await asyncio.sleep(0.1)

        return StreamingResponse(_stream(), media_type="text/event-stream")

    return app


def _wait_healthy():
    for _ in range(100):
        try:
            conn = http.client.HTTPConnection(HOST, PORT, timeout=2)
            conn.request("GET", "/health")
            if conn.getresponse().status == 200:
                conn.close()
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("test server never became healthy")


def _read_events(path, max_events=1, timeout=10):
    """Read up to max_events SSE events, then abandon the connection
    (simulates a navigation/disconnect mid-stream)."""
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    conn.request("GET", path, headers={"Accept": "text/event-stream"})
    response = conn.getresponse()
    assert response.status == 200
    events = []
    buffer = ""
    sock = response.fp
    deadline = time.time() + timeout
    while len(events) < max_events and time.time() < deadline:
        chunk = sock.read1(64) if hasattr(sock, "read1") else sock.read(64)
        if not chunk:
            break
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n\n" in buffer and len(events) < max_events:
            block, buffer = buffer.split("\n\n", 1)
            data = [line[6:] for line in block.splitlines()
                    if line.startswith("data: ")]
            if data:
                events.append(json.loads(data[0]))
    conn.close()  # abrupt disconnect; server work must continue
    return events


def _read_all(path, timeout=30):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    conn.request("GET", path, headers={"Accept": "text/event-stream"})
    response = conn.getresponse()
    assert response.status == 200
    raw = response.read().decode("utf-8", errors="replace")
    conn.close()
    events = []
    for block in raw.split("\n\n"):
        data = [line[6:] for line in block.splitlines()
                if line.startswith("data: ")]
        if data:
            events.append(json.loads(data[0]))
    return events


def _status(turn_id):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
    conn.request("GET", f"/demo-turns/{turn_id}")
    body = json.loads(conn.getresponse().read().decode())
    conn.close()
    return body


def test_disconnect_then_reconnect_replays_journal_to_terminal():
    import uvicorn

    server = uvicorn.Server(uvicorn.Config(
        _build_app(), host=HOST, port=PORT, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        _wait_healthy()
        conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
        conn.request("POST", "/demo-turns")
        turn_id = json.loads(conn.getresponse().read().decode())["turn_id"]
        conn.close()

        first = _read_events(f"/demo-turns/{turn_id}/events?after=0",
                             max_events=1)
        assert len(first) == 1  # observed live, then gone

        for _ in range(100):  # terminal state recoverable by query
            if _status(turn_id)["state"] == "completed":
                break
            time.sleep(0.1)
        assert _status(turn_id)["state"] == "completed"
        assert _status(turn_id)["result_message_id"]

        replayed = _read_all(f"/demo-turns/{turn_id}/events?after=0")
        assert [e["message_id"] for e in replayed
                if "message_id" in e].count(
                    _status(turn_id)["result_message_id"]) == 1
        assert replayed[0] == first[0]  # prefix matches live observation

        tail = _read_all(f"/demo-turns/{turn_id}/events?after=1")
        assert len(tail) == len(replayed) - 1  # cursor resumes, no repeats
    finally:
        server.should_exit = True
        thread.join(timeout=10)
