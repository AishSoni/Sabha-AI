"""
Streaming service - SSE streaming for AI responses.
"""

import json
from typing import AsyncGenerator
from app.llm.base import StreamEvent, StreamEventType


def format_sse_event(event: StreamEvent) -> dict:
    """Format a StreamEvent for SSE - returns dict for EventSourceResponse."""
    data = event.model_dump(exclude_none=True)
    # Ensure type is serialized as string value, not enum object
    if 'type' in data and hasattr(data['type'], 'value'):
        data['type'] = data['type'].value
    print(f"[SSE] Event: {data.get('type')} - {str(data.get('content', ''))[:50]}")
    return {"data": json.dumps(data)}


async def events_to_sse(
    events: AsyncGenerator[StreamEvent, None]
) -> AsyncGenerator[dict, None]:
    """Convert a stream of events to SSE format for EventSourceResponse."""
    async for event in events:
        yield format_sse_event(event)

