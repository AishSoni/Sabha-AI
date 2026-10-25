"""Meeting lifecycle HTTP surface.

This router owns the meeting CRUD, conversation reads, archive controls, and
deletion routes. Closing remains in ``http.py`` and the legacy summary/turn
adapters stay in their compatibility router until their own cutover slices.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.knowledge.domain.errors import KnowledgeUnavailable
from app.modules.meetings.domain.models import (
    Consensus,
    Disagreement,
    Meeting,
    MeetingCreate,
    MeetingStatus,
    MeetingWithParticipants,
    Message,
    MessageCreate,
    SenderType,
)
from app.modules.meetings.presentation.schemas import UserMessageRequest
from app.presentation.dependencies import get_meeting_manager

router = APIRouter(prefix="/meetings", tags=["meetings"])


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


@router.get("", response_model=list[Meeting])
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
    """Add a user message to the meeting through the locked write guard."""
    manager = get_meeting_manager()

    outcome, message = await manager.append_user_message(
        meeting_id,
        MessageCreate(
            meeting_id=meeting_id,
            content=data.content,
            sender_type=SenderType.USER,
            sender_name="User",
            request_key=data.request_key,
        ),
    )

    if outcome == "not_found":
        raise HTTPException(status_code=404, detail="Meeting not found")
    if outcome == "meeting_closed":
        # Name the observed status for the client, but only after the guard
        # already refused the write. Presentation never drives admission.
        meeting = await manager.get_meeting(meeting_id)
        status = meeting.status.value if meeting else "closed"
        raise HTTPException(
            status_code=409,
            detail=(
                f"Meeting is {status}; messages can only be sent "
                "to an active meeting"
            ),
        )
    if outcome == "invalid" or message is None:
        raise HTTPException(status_code=422, detail="Invalid message")

    return message


@router.get("/{meeting_id}/disagreements", response_model=list[Disagreement])
async def get_disagreements(meeting_id: str):
    """Get all disagreements for a meeting."""
    manager = get_meeting_manager()
    disagreements = await manager.get_disagreements(meeting_id)
    return disagreements


@router.get("/{meeting_id}/consensus", response_model=list[Consensus])
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


@router.post("/{meeting_id}/archive")
async def archive_meeting(meeting_id: str):
    """Archive a meeting (move to archive folder)."""
    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status == MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is already archived")

    result = await manager.archive_meeting(meeting_id)
    outcome = result.get("outcome")
    if outcome == "not_found":
        raise HTTPException(status_code=404, detail="Meeting not found")
    if outcome == "closing_in_progress":
        raise HTTPException(
            status_code=409,
            detail="The meeting is still closing and cannot be archived",
        )
    if outcome != "archived":
        raise HTTPException(status_code=500, detail="Failed to archive meeting")

    return {
        "success": True,
        "message": "Meeting archived successfully",
        "status": "archived",
    }


@router.post("/{meeting_id}/unarchive")
async def unarchive_meeting(meeting_id: str):
    """Unarchive a meeting (restore from archive)."""
    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status != MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is not archived")

    result = await manager.unarchive_meeting(meeting_id)
    outcome = result.get("outcome")
    if outcome == "not_found":
        raise HTTPException(status_code=404, detail="Meeting not found")
    if outcome != "unarchived":
        raise HTTPException(status_code=500, detail="Failed to unarchive meeting")

    return {
        "success": True,
        "message": "Meeting unarchived successfully",
        "status": result.get("status", "active"),
    }


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Permanently delete a meeting after Knowledge revokes its sources.

    Revocation and cleanup intents commit before the meeting row cascades, so
    an outage can defer physical cleanup but never resurrect eligibility.
    """
    from app.modules.knowledge.public import get_knowledge_lifecycle

    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    try:
        await get_knowledge_lifecycle().delete_parent(
            "meeting", meeting_id, reason="meeting_deleted"
        )
    except KnowledgeUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="Knowledge cleanup is temporarily unavailable; try again",
        ) from exc

    success = await manager.delete_meeting(meeting_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete meeting")

    return {"success": True, "message": "Meeting deleted successfully"}
