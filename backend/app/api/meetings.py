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
    EndMeetingRequest,
    EndMeetingResponse,
    EndMeetingVote,
    MeetingStatus,
)
from app.services import MeetingManager, Orchestrator
from app.llm import get_provider, LLMMessage

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
    """End a meeting, optionally collecting votes from AI participants."""
    manager = get_meeting_manager()
    
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(status_code=400, detail=f"Meeting is already {meeting.status}")
    
    votes = []
    
    # If not force end, collect votes from each AI
    if not data.force_end:
        await manager.update_meeting_status(meeting_id, MeetingStatus.VOTING.value)
        
        # Build conversation summary for voting context
        recent_messages = meeting.messages[-20:]  # Last 20 messages for context
        conversation_context = "\n".join([
            f"{msg.sender_name}: {msg.content[:200]}..." if len(msg.content) > 200 else f"{msg.sender_name}: {msg.content}"
            for msg in recent_messages
        ])
        
        # Get vote from each participant
        for participant in meeting.participants:
            try:
                provider = get_provider(
                    participant.provider_config.provider or None,
                    participant.provider_config.model or None
                )
                
                vote_prompt = f"""You are {participant.name}, a {participant.role} in this meeting.
                
The user is proposing to end this meeting. Based on the recent discussion below, please vote on whether you think the meeting should end now.

RECENT DISCUSSION:
{conversation_context}

MEETING AGENDA:
{meeting.agenda}

Please respond with ONLY a JSON object in this exact format (no other text):
{{"vote": true or false, "reason": "Your brief reason (1-2 sentences)"}}

Vote TRUE if you believe the meeting has achieved its objectives or reached a natural conclusion.
Vote FALSE if you believe there are important topics still to discuss."""

                messages = [LLMMessage(role="user", content=vote_prompt)]
                response = await provider.complete(messages=messages, tools=[], temperature=0.3)
                
                # Parse the response
                import json
                try:
                    content = response.content.strip()
                    # Try to extract JSON from the response
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0].strip()
                    
                    vote_data = json.loads(content)
                    votes.append(EndMeetingVote(
                        participant_id=participant.id,
                        participant_name=participant.name,
                        vote=vote_data.get("vote", False),
                        reason=vote_data.get("reason", "No reason provided")
                    ))
                except (json.JSONDecodeError, KeyError):
                    # If parsing fails, mark as abstain (no vote)
                    votes.append(EndMeetingVote(
                        participant_id=participant.id,
                        participant_name=participant.name,
                        vote=False,
                        reason=f"Could not parse vote response: {response.content[:100]}..."
                    ))
                    
            except Exception as e:
                votes.append(EndMeetingVote(
                    participant_id=participant.id,
                    participant_name=participant.name,
                    vote=False,
                    reason=f"Error getting vote: {str(e)}"
                ))
        
        # Check if majority voted to end
        yes_votes = sum(1 for v in votes if v.vote)
        should_end = yes_votes > len(votes) / 2
        
        if not should_end:
            # Revert to active status
            await manager.update_meeting_status(meeting_id, MeetingStatus.ACTIVE.value)
            return EndMeetingResponse(
                success=False,
                votes=votes,
                summary=None,
                message=f"Vote failed: {yes_votes}/{len(votes)} voted to end. Meeting continues."
            )
    
    # Meeting will end - generate executive summary
    all_messages = meeting.messages
    conversation_full = "\n".join([
        f"{msg.sender_name}: {msg.content}"
        for msg in all_messages
    ])
    
    # Use the first participant's provider for summary generation
    if meeting.participants:
        provider = get_provider(
            meeting.participants[0].provider_config.provider or None,
            meeting.participants[0].provider_config.model or None
        )
    else:
        provider = get_provider()
    
    summary_prompt = f"""Generate an Executive Summary of this meeting.

MEETING NAME: {meeting.name}

MEETING AGENDA:
{meeting.agenda}

PARTICIPANTS:
{", ".join([p.name + " (" + p.role + ")" for p in meeting.participants])}

FULL CONVERSATION:
{conversation_full}

Please create a comprehensive executive summary in this format:

# Executive Summary

## Overview
[Brief 2-3 sentence overview of the meeting]

## Key Discussion Points
[Bullet points of main topics discussed]

## Decisions Made
[Any decisions or consensus reached]

## Action Items
[Any action items identified, if applicable]

## Areas of Disagreement
[Any unresolved disagreements, if applicable]

## Conclusion
[Brief concluding statement]"""

    messages = [LLMMessage(role="user", content=summary_prompt)]
    response = await provider.complete(messages=messages, tools=[], temperature=0.3)
    executive_summary = response.content
    
    # Save the summary as a system message
    await manager.save_message(
        MessageCreate(
            meeting_id=meeting_id,
            content=f"📋 **MEETING ENDED**\n\n{executive_summary}",
            sender_type=SenderType.SYSTEM,
            sender_name="System"
        )
    )
    
    # Update meeting status to ended
    await manager.update_meeting_status(meeting_id, MeetingStatus.ENDED.value)
    
    return EndMeetingResponse(
        success=True,
        votes=votes,
        summary=executive_summary,
        message="Meeting ended successfully. Executive summary generated."
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
