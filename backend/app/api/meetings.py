"""
Meetings API routes.
"""

from fastapi import APIRouter, HTTPException
from typing import List

from app.models import (
    Meeting,
    MeetingCreate,
    MeetingWithParticipants,
    Message,
    UserMessageRequest,
    TurnRequest,
    TurnResponse,
    MessageCreate,
    SenderType,
    Disagreement,
    Consensus,
)
from app.services import MeetingManager, Orchestrator

router = APIRouter()


def get_meeting_manager() -> MeetingManager:
    return MeetingManager()


def get_orchestrator() -> Orchestrator:
    return Orchestrator(get_meeting_manager())


@router.post("", response_model=MeetingWithParticipants)
async def create_meeting(data: MeetingCreate):
    """Create a new meeting with default AI participants."""
    manager = get_meeting_manager()
    meeting = await manager.create_meeting(data)
    return meeting


@router.get("", response_model=List[Meeting])
async def list_meetings():
    """List all meetings."""
    manager = get_meeting_manager()
    meetings = await manager.list_meetings()
    return meetings


@router.get("/{meeting_id}", response_model=MeetingWithParticipants)
async def get_meeting(meeting_id: str):
    """Get a meeting with its participants and messages."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    return meeting


@router.post("/{meeting_id}/message", response_model=Message)
async def add_user_message(meeting_id: str, data: UserMessageRequest):
    """Add a user message to the meeting."""
    manager = get_meeting_manager()
    
    # Verify meeting exists
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    # Save user message
    message = await manager.save_message(
        MessageCreate(
            meeting_id=meeting_id,
            content=data.content,
            sender_type=SenderType.USER,
            sender_name="User"
        )
    )
    
    return message


@router.post("/{meeting_id}/turn", response_model=TurnResponse)
async def execute_turn(meeting_id: str, data: TurnRequest):
    """Trigger an AI participant's turn."""
    orchestrator = get_orchestrator()
    
    try:
        response = await orchestrator.execute_turn(meeting_id, data.participant_id)
        return response
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing turn: {str(e)}")


@router.post("/{meeting_id}/turn/stream")
async def execute_turn_stream(meeting_id: str, data: TurnRequest):
    """Stream an AI participant's turn via Server-Sent Events."""
    from sse_starlette.sse import EventSourceResponse
    from app.services.streaming import events_to_sse
    
    orchestrator = get_orchestrator()
    
    async def stream_generator():
        try:
            async for sse_line in events_to_sse(
                orchestrator.execute_turn_streaming(meeting_id, data.participant_id)
            ):
                yield sse_line
        except Exception as e:
            import json
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return EventSourceResponse(stream_generator())


@router.get("/{meeting_id}/disagreements", response_model=List[Disagreement])
async def get_disagreements(meeting_id: str):
    """Get all disagreements for a meeting."""
    manager = get_meeting_manager()
    disagreements = await manager.get_disagreements(meeting_id)
    return disagreements


@router.get("/{meeting_id}/consensus", response_model=List[Consensus])
async def get_consensus(meeting_id: str):
    """Get all consensus entries for a meeting."""
    manager = get_meeting_manager()
    consensus = await manager.get_consensus_list(meeting_id)
    return consensus
