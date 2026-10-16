"""
Streaming service - SSE streaming for AI responses.

Frames follow CONTRACTS §10: SSE `id` = event_id, `event` = event type,
`data` = full JSON envelope. v2 journal envelopes are passed through intact;
legacy dict events (pre-envelope error shapes) and provider StreamEvent
objects keep data-only framing.
"""

import json
from typing import Any, AsyncGenerator, Union

from app.llm.base import StreamEvent


def format_sse_event(event: StreamEvent) -> dict:
    """Format a StreamEvent for SSE - returns dict for EventSourceResponse."""
    data = event.model_dump(exclude_none=True)
    # Ensure type is serialized as string value, not enum object
    if 'type' in data and hasattr(data['type'], 'value'):
        data['type'] = data['type'].value
    print(f"[SSE] Event: {data.get('type')} - {str(data.get('content', ''))[:50]}")
    return {"data": json.dumps(data)}


def format_sse_dict(event: dict) -> dict:
    """Frame a dict event: v2 envelopes get id/event lines, others data-only."""
    if isinstance(event.get("version"), int) and event.get("event_id") and event.get("type"):
        return {
            "id": str(event["event_id"]),
            "event": str(event["type"]),
            "data": json.dumps(event),
        }
    return {"data": json.dumps(event)}


async def events_to_sse(
    events: AsyncGenerator[Union[dict, StreamEvent], None]
) -> AsyncGenerator[dict, None]:
    """Convert a stream of events to SSE format for EventSourceResponse."""
    async for event in events:
        if isinstance(event, StreamEvent):
            yield format_sse_event(event)
        elif isinstance(event, dict):
            yield format_sse_dict(event)
        else:  # unknown payload: serialize as data-only frame
            yield {"data": json.dumps(event, default=str)}
