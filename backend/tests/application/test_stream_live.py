"""Stage A (A2): live incremental turn streaming.

The stream must yield v2 journal envelopes WHILE the turn is still executing
(no post-hoc replay), segment-identify interim and final text, and end with
exactly one terminal event. Legacy error shape is preserved for failures
that occur before reservation.
"""

import asyncio
import json

import pytest

from tests.doubles.providers import ScriptedProvider, final_text_response
from tests.doubles.repositories import FakeMeetingRepo

pytestmark = pytest.mark.anyio


def _repo(meeting_id="m-stream", participant_id="p1"):
    from datetime import datetime, timezone

    from app.models import AIParticipant

    repo = FakeMeetingRepo()
    participant = AIParticipant(
        id=participant_id,
        meeting_id=meeting_id,
        name="AI One",
        role="analyst",
        system_prompt="Answer briefly.",
        created_at=datetime.now(timezone.utc),
    )
    repo.add_meeting(meeting_id, participants=[participant], user_id="actor-a")
    return repo


class _GatedProvider(ScriptedProvider):
    """Blocks every provider call until the test releases the gate."""

    def __init__(self, script, gate):
        super().__init__(script)
        self.gate = gate

    async def complete(self, *args, **kwargs):
        await self.gate.wait()
        return await super().complete(*args, **kwargs)


async def _drain(gen, limit=200):
    frames = []
    for _ in range(limit):
        try:
            frames.append(await asyncio.wait_for(gen.__anext__(), timeout=5))
        except StopAsyncIteration:
            return frames
    raise AssertionError("stream did not terminate")


async def test_stream_yields_live_v2_events_while_provider_blocked(monkeypatch):
    """First frames must be observable while the provider is still blocked:
    the stream subscribes to the journal, it does not replay after the fact."""
    import app.services.orchestrator as orch_mod
    from app.services.orchestrator import Orchestrator

    gate = asyncio.Event()
    provider = _GatedProvider([final_text_response("final answer")], gate)
    monkeypatch.setattr(orch_mod, "get_provider", lambda *a, **k: provider)
    repo = _repo()

    orch = Orchestrator(meeting_manager=repo)
    gen = orch.execute_turn_streaming("m-stream", "p1")

    first = await asyncio.wait_for(gen.__anext__(), timeout=3)
    # Provider is still blocked: this frame proves live subscription.
    assert first["version"] == 2
    assert first["type"] == "turn_started"
    assert first["meeting_id"] == "m-stream"
    assert first["event_id"].startswith(first["turn_id"])

    gate.set()
    frames = [first]
    frames.extend(await _drain(gen))

    sequences = [f["sequence"] for f in frames]
    assert sequences == sorted(sequences), "envelope sequences must be monotonic"
    assert sequences[0] == 1 and sequences == list(range(1, len(sequences) + 1))

    terminal = [f for f in frames if f["type"] in ("turn_completed", "turn_failed", "turn_cancelled")]
    assert len(terminal) == 1, "exactly one terminal event per turn"
    assert terminal[0]["type"] == "turn_completed"

    final_deltas = [
        f for f in frames
        if f["type"] == "text_delta"
        and str(f["data"].get("segment_id", "")).startswith(f"{terminal[0]['turn_id']}:final:")
    ]
    assert final_deltas, "final answer must stream as a :final segment"
    assert "".join(d["data"]["content"] for d in final_deltas) == "final answer"
    assert frames.index(final_deltas[0]) < frames.index(terminal[0]), (
        "final text_delta must precede the terminal event"
    )

    turn_id = terminal[0]["turn_id"]
    for f in frames:
        assert f["turn_id"] == turn_id
        assert f["event_id"] == f"{turn_id}:{f['sequence']}"


async def test_stream_yields_legacy_error_when_reservation_fails(monkeypatch):
    import app.services.orchestrator as orch_mod
    from app.services.orchestrator import Orchestrator

    provider = ScriptedProvider([final_text_response("never")])
    monkeypatch.setattr(orch_mod, "get_provider", lambda *a, **k: provider)
    repo = FakeMeetingRepo()  # no meetings at all

    orch = Orchestrator(meeting_manager=repo)
    frames = await _drain(orch.execute_turn_streaming("missing-meeting", "p1"))
    assert len(frames) == 1
    assert frames[0]["type"] == "error"
    assert "not_found" in frames[0]["content"]


async def test_events_to_sse_frames_id_event_data():
    from app.services.streaming import events_to_sse

    async def source():
        yield {
            "version": 2,
            "event_id": "t-1:1",
            "sequence": 1,
            "meeting_id": "m",
            "turn_id": "t-1",
            "session_generation": None,
            "type": "text_delta",
            "data": {"content": "x"},
        }
        yield {"type": "error", "content": "boom"}

    out = []
    async for item in events_to_sse(source()):
        out.append(item)

    assert out[0]["id"] == "t-1:1"
    assert out[0]["event"] == "text_delta"
    payload = json.loads(out[0]["data"])
    assert payload["version"] == 2 and payload["data"]["content"] == "x"
    # Legacy error dicts stay data-only frames (still parseable clientside).
    assert "event" not in out[1]
    assert json.loads(out[1]["data"])["type"] == "error"
