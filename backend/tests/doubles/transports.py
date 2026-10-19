"""`split_event_transport` / `scripted_failure` contracts: a scripted SSE
byte-stream fake matching the wire format production emits today
(`data: <json>` lines terminated by a blank line, JSON payloads as in
`app.services.streaming.format_sse_event`).

The stream can be chopped at arbitrary byte boundaries (network-sized
chunks), inject failures mid-script, or end mid-frame — exactly the
conditions the SSE consumer must survive.
"""

import json
from typing import Any, AsyncGenerator, List, Optional, Sequence


class ScriptedTransportFailure(RuntimeError):
    """Raised by the stream when the script injects a transport failure."""


def sse_frame(event: Any) -> bytes:
    """Encode one wire frame exactly like production's SSE formatter."""
    data = event.model_dump(exclude_none=True) if hasattr(event, "model_dump") else event
    if "type" in data and hasattr(data["type"], "value"):
        data = dict(data, type=data["type"].value)
    payload = json.dumps(data)
    return f"data: {payload}\n\n".encode("utf-8")


class ScriptedSseStream:
    """Replays `events` as SSE frames. Configure it, consume `stream()`,
    then `reset()` and re-consume — the script survives any number of
    replays.

    - `chunk_size`: split every frame into wire chunks of at most N bytes
      (None = one chunk per frame).
    - `failure`: exception instance/class raised after `fail_after_chunks`
      frames have been fully emitted.
    - `fail_after_frames`: 1-based frame index that triggers `failure`;
      None = never fail.
    - `truncate_last_frame`: deliver only the first half of the final
      frame's bytes, then end without the terminal (simulates a dropped
      connection mid-event).
    """

    def __init__(
        self,
        events: Sequence[Any] = (),
        chunk_size: Optional[int] = None,
        failure: Optional[BaseException] = None,
        fail_after_frames: Optional[int] = None,
        truncate_last_frame: bool = False,
    ):
        self.script = list(events)
        self.chunk_size = chunk_size
        self.failure = failure if failure is not None else ScriptedTransportFailure(
            "scripted transport failure"
        )
        self.fail_after_frames = fail_after_frames
        self.truncate_last_frame = truncate_last_frame
        self.chunks_sent = 0
        self.frames_sent = 0
        self.failures_raised: List[BaseException] = []

    def frames(self) -> List[bytes]:
        return [sse_frame(event) for event in self.script]

    async def stream(self) -> AsyncGenerator[bytes, None]:
        encoded = self.frames()
        total = len(encoded)
        for index, frame in enumerate(encoded, start=1):
            payload = frame
            if self.truncate_last_frame and index == total:
                payload = frame[: len(frame) // 2]
            chunks = self._chunks(payload, self.chunk_size)
            for chunk in chunks:
                yield chunk
                self.chunks_sent += 1
            self.frames_sent = index
            if self.fail_after_frames is not None and index == self.fail_after_frames:
                self.failures_raised.append(self.failure)
                raise self.failure

    @staticmethod
    def _chunks(payload: bytes, chunk_size: Optional[int]) -> List[bytes]:
        if chunk_size in (None, 0) or len(payload) <= chunk_size:
            return [payload]
        return [payload[i : i + chunk_size] for i in range(0, len(payload), chunk_size)]

    def reset(self) -> None:
        self.chunks_sent = 0
        self.frames_sent = 0
        self.failures_raised = []
