"""
Meetings API routes.
"""

from fastapi import APIRouter, HTTPException, Request
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
    EndMeetingRequest,
    EndMeetingResponse,
    EndMeetingVote,
    MeetingStatus,
)
from app.services import MeetingManager, Orchestrator
from app.services.orchestrator import MissingProviderKeyError, MeetingClosedError
from app.services.meeting_closer import (
    EndAttemptIncomplete,
    MeetingCloser,
    MeetingClosedConflict,
    MeetingNotFoundError,
)
from app.llm import get_provider, LLMMessage

router = APIRouter()


def get_meeting_manager() -> MeetingManager:
    return MeetingManager()


def get_meeting_closer() -> MeetingCloser:
    return MeetingCloser(get_meeting_manager())


def get_orchestrator() -> Orchestrator:
    return Orchestrator(get_meeting_manager())


@router.post("", response_model=MeetingWithParticipants)
async def create_meeting(data: MeetingCreate):
    """Create a new meeting with default AI participants."""
    manager = get_meeting_manager()
    try:
        meeting = await manager.create_meeting(data)
    except ValueError as exc:
        # Validation happens before any write (e.g. unknown personas).
        raise HTTPException(status_code=422, detail=str(exc))
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

    # Closed meetings reject writes at the door: entry guard before any
    # persistence (voting = ending in progress; ended/archived = read only).
    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Meeting is {meeting.status.value}; messages can only be sent "
                "to an active meeting"
            ),
        )

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
async def execute_turn(meeting_id: str, data: TurnRequest, request: Request):
    """Trigger an AI participant's turn.

    `data.provider` may carry browser generation settings (model, temperature,
    max_tokens, base_url) and the BYOK key rides the X-Provider-Key header.
    """
    orchestrator = get_orchestrator()

    try:
        response = await orchestrator.execute_turn(
            meeting_id,
            data.participant_id,
            provider_settings=data.provider,
            provider_api_key=request.headers.get("X-Provider-Key"),
        )
        return response
    except MeetingClosedError as e:
        # Entry-time guard: closed meetings reject turns with a conflict.
        raise HTTPException(status_code=409, detail=str(e))
    except MissingProviderKeyError as e:
        # The turn cannot authenticate: browser key missing and no server key.
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing turn: {str(e)}")


@router.post("/{meeting_id}/turn/stream")
async def execute_turn_stream(meeting_id: str, data: TurnRequest, request: Request):
    """Stream an AI participant's turn via Server-Sent Events."""
    from sse_starlette.sse import EventSourceResponse
    from app.services.streaming import events_to_sse

    orchestrator = get_orchestrator()
    provider_api_key = request.headers.get("X-Provider-Key")

    async def stream_generator():
        try:
            async for sse_line in events_to_sse(
                orchestrator.execute_turn_streaming(
                    meeting_id,
                    data.participant_id,
                    provider_settings=data.provider,
                    provider_api_key=provider_api_key,
                )
            ):
                yield sse_line
        except Exception as e:
            import json
            yield {"data": json.dumps({"type": "error", "content": str(e)})}
    
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


@router.get("/{meeting_id}/context-stats")
async def get_context_stats(meeting_id: str):
    """Get context/token usage statistics for a meeting."""
    import tiktoken
    
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    # Use cl100k_base encoding (used by Claude, GPT-4, etc.)
    try:
        enc = tiktoken.get_encoding("cl100k_base")
    except Exception:
        # Fallback: rough estimate of 4 chars per token
        total_chars = 0
        for msg in meeting.messages:
            total_chars += len(msg.content)
            if msg.thinking_content:
                total_chars += len(msg.thinking_content)
        for participant in meeting.participants:
            total_chars += len(participant.system_prompt)
        
        estimated_tokens = total_chars // 4
        max_tokens = 128000  # Claude's context window
        
        return {
            "current_tokens": estimated_tokens,
            "max_tokens": max_tokens,
            "usage_percent": round((estimated_tokens / max_tokens) * 100, 1),
            "message_count": len(meeting.messages),
            "participant_count": len(meeting.participants),
        }
    
    # Count tokens in all messages
    message_tokens = 0
    for msg in meeting.messages:
        message_tokens += len(enc.encode(msg.content))
        if msg.thinking_content:
            message_tokens += len(enc.encode(msg.thinking_content))
    
    # Count tokens in system prompts
    system_tokens = 0
    for participant in meeting.participants:
        system_tokens += len(enc.encode(participant.system_prompt))
    
    # Count agenda tokens
    agenda_tokens = len(enc.encode(meeting.agenda)) if meeting.agenda else 0
    
    total_tokens = message_tokens + system_tokens + agenda_tokens
    max_tokens = 128000  # Claude's context window (can be made configurable)
    
    return {
        "current_tokens": total_tokens,
        "max_tokens": max_tokens,
        "usage_percent": round((total_tokens / max_tokens) * 100, 1),
        "message_tokens": message_tokens,
        "system_tokens": system_tokens,
        "agenda_tokens": agenda_tokens,
        "message_count": len(meeting.messages),
        "participant_count": len(meeting.participants),
    }


@router.post("/{meeting_id}/end", response_model=EndMeetingResponse)
async def end_meeting(meeting_id: str, data: EndMeetingRequest):
    """End a meeting, optionally collecting votes from AI participants.

    Delegates to the recoverable closing flow: entry serialization, vote
    phase, summary generation, and an atomic commit (ending message + status
    flip in one transaction). Retrying a failed ending resumes at the summary
    phase instead of re-collecting votes.
    """
    closer = get_meeting_closer()

    try:
        return await closer.end_meeting(meeting_id, force_end=data.force_end)
    except MeetingNotFoundError:
        raise HTTPException(status_code=404, detail="Meeting not found")
    except MeetingClosedConflict as exc:
        # Committed by another request; retry would find the meeting ended.
        raise HTTPException(status_code=409, detail=str(exc))
    except EndAttemptIncomplete as exc:
        # Recoverable: keep success=False, explicitly retryable message.
        return EndMeetingResponse(
            success=False,
            votes=[],
            summary=None,
            message=str(exc),
        )


@router.post("/{meeting_id}/archive")
async def archive_meeting(meeting_id: str):
    """Archive a meeting (move to archive folder)."""
    manager = get_meeting_manager()
    
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if meeting.status == MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is already archived")
    
    success = await manager.update_meeting_status(meeting_id, MeetingStatus.ARCHIVED.value)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to archive meeting")
    
    return {"success": True, "message": "Meeting archived successfully"}


@router.post("/{meeting_id}/unarchive")
async def unarchive_meeting(meeting_id: str):
    """Unarchive a meeting (restore from archive)."""
    manager = get_meeting_manager()
    
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if meeting.status != MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is not archived")
    
    # Restore to active status
    success = await manager.update_meeting_status(meeting_id, MeetingStatus.ACTIVE.value)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to unarchive meeting")
    
    return {"success": True, "message": "Meeting unarchived successfully"}


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Permanently delete a meeting and all its data."""
    manager = get_meeting_manager()
    
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    success = await manager.delete_meeting(meeting_id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete meeting")
    
    return {"success": True, "message": "Meeting deleted successfully"}
