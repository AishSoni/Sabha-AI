"""
Meetings API routes.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from typing import List, Optional

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
from app.modules.access.actors import Actor
from app.modules.access.deps import owner_or_404, require_actor
from app.modules.meetings.domain import (
    MeetingState as DomainState,
    require_archive_eligible,
    require_unarchive_target,
)
from app.modules.meetings.ending import EndingConflict
from app.modules.meetings.queue import QueueCapacity, QueueConflict, QueueValidation

router = APIRouter()


def get_meeting_manager() -> MeetingManager:
    return MeetingManager()


def get_orchestrator() -> Orchestrator:
    return Orchestrator(get_meeting_manager())


@router.post("", response_model=MeetingWithParticipants)
async def create_meeting(data: MeetingCreate, actor: Actor = Depends(require_actor)):
    """Create a new meeting with default AI participants."""
    manager = get_meeting_manager()
    # Bodies never establish identity: the caller always owns what it creates.
    owned = data.model_copy(update={"user_id": actor.identity})
    meeting = await manager.create_meeting(owned)
    return meeting


@router.get("", response_model=List[Meeting])
async def list_meetings(actor: Actor = Depends(require_actor)):
    """List the caller's own meetings."""
    manager = get_meeting_manager()
    meetings = await manager.list_meetings(user_id=actor.identity)
    return meetings


@router.get("/{meeting_id}", response_model=MeetingWithParticipants)
async def get_meeting(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Get a meeting with its participants and messages."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    owner_or_404(actor, meeting.user_id)
    return meeting


@router.post("/{meeting_id}/message")
async def add_user_message(
    meeting_id: str, data: UserMessageRequest, actor: Actor = Depends(require_actor)
):
    """Compatibility wrapper: same submit-or-queue decision as /messages."""
    return await submit_user_message(meeting_id, data, actor)


@router.post("/{meeting_id}/messages")
async def submit_user_message(
    meeting_id: str, data: UserMessageRequest, actor: Actor = Depends(require_actor)
):
    """Commit immediately when idle, otherwise queue FIFO (202 + entry)."""
    from fastapi.responses import JSONResponse

    manager = get_meeting_manager()

    # Verify meeting exists
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="meeting_not_active")

    try:
        queued = (await manager.pending_queue_count(meeting_id) > 0
                  or await manager.has_active_work(meeting_id))
    except Exception:
        queued = False
    if not queued:
        try:
            message = await manager.save_message(
                MessageCreate(
                    meeting_id=meeting_id,
                    content=data.content,
                    sender_type=SenderType.USER,
                    sender_name="User"
                )
            )
            return JSONResponse(
                status_code=201, content=message.model_dump(mode="json"))
        except Exception:
            pass
    try:
        entry = await manager.submit_queue_entry(
            meeting_id, actor.identity, data.content)
    except QueueValidation as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QueueCapacity as e:
        raise HTTPException(status_code=429, detail=str(e))
    return JSONResponse(status_code=202, content={"queued": True, "entry": entry})


@router.get("/{meeting_id}/queue")
async def get_queue(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Ordered pending queue entries with revisions."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    return {"entries": await manager.list_queue(meeting_id)}


@router.patch("/{meeting_id}/queue/{entry_id}")
async def edit_queued_message(
    meeting_id: str, entry_id: str, data: UserMessageRequest,
    expected_revision: int = 1, actor: Actor = Depends(require_actor),
):
    """Edit a pending entry; stale or dispatched edits conflict."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    try:
        return await manager.edit_queue_entry(
            entry_id, actor.identity, data.content, expected_revision)
    except QueueValidation as e:
        raise HTTPException(status_code=422, detail=str(e))
    except QueueConflict as e:
        raise HTTPException(status_code=409, detail=e.code)


@router.delete("/{meeting_id}/queue/{entry_id}", status_code=204)
async def remove_queued_message(
    meeting_id: str, entry_id: str,
    expected_revision: int = 1, actor: Actor = Depends(require_actor),
):
    """Remove a pending entry; stale or dispatched removals conflict."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    try:
        await manager.remove_queue_entry(
            entry_id, actor.identity, expected_revision)
    except QueueConflict as e:
        raise HTTPException(status_code=409, detail=e.code)
    return None


@router.post("/{meeting_id}/turn", response_model=TurnResponse)
async def execute_turn(
    meeting_id: str, data: TurnRequest, actor: Actor = Depends(require_actor)
):
    """Trigger an AI participant's turn."""
    from app.modules.meetings.engine import TurnFailure
    from app.modules.meetings.store import TurnConflict

    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    if await manager.pending_queue_count(meeting_id) > 0:
        raise HTTPException(status_code=409, detail="queue_not_drained")

    orchestrator = get_orchestrator()

    try:
        response = await orchestrator.execute_turn(meeting_id, data.participant_id)
        return response
    except TurnConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except TurnFailure as e:
        raise HTTPException(status_code=409, detail=f"{e.code}: {e}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing turn: {str(e)}")


@router.post("/{meeting_id}/turn/stream")
async def execute_turn_stream(
    meeting_id: str, data: TurnRequest, actor: Actor = Depends(require_actor)
):
    """Stream an AI participant's turn via Server-Sent Events."""
    from sse_starlette.sse import EventSourceResponse
    from app.services.streaming import events_to_sse

    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)

    orchestrator = get_orchestrator()
    
    async def stream_generator():
        try:
            async for sse_line in events_to_sse(
                orchestrator.execute_turn_streaming(meeting_id, data.participant_id)
            ):
                yield sse_line
        except Exception as e:
            import json
            yield {"data": json.dumps({"type": "error", "content": str(e)})}
    
    return EventSourceResponse(stream_generator())


@router.get("/{meeting_id}/disagreements", response_model=List[Disagreement])
async def get_disagreements(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Get all disagreements for a meeting."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    disagreements = await manager.get_disagreements(meeting_id)
    return disagreements


@router.get("/{meeting_id}/consensus", response_model=List[Consensus])
async def get_consensus(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Get all consensus entries for a meeting."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    consensus = await manager.get_consensus_list(meeting_id)
    return consensus


@router.get("/{meeting_id}/context-stats")
async def get_context_stats(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Get context/token usage statistics for a meeting."""
    import tiktoken

    manager = get_meeting_manager()
    meeting = await manager.get_meeting(meeting_id)

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    
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
async def end_meeting(
    meeting_id: str, data: EndMeetingRequest, actor: Actor = Depends(require_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="X-Idempotency-Key"),
):
    """End a meeting, optionally collecting votes from AI participants."""
    import uuid as _uuid

    from app.modules.meetings.domain import decide_end, evaluate_votes
    from app.modules.meetings.ending import (
        build_summary_prompt,
        build_vote_prompt,
        parse_vote_response,
        shorten,
    )

    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)

    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(status_code=400, detail=f"Meeting is already {meeting.status}")
    if await manager.pending_queue_count(meeting_id) > 0:
        raise HTTPException(status_code=409, detail="queue_not_drained")

    key = idempotency_key or str(_uuid.uuid4())
    roster = [{"id": p.id, "name": p.name} for p in meeting.participants]
    try:
        attempt = await manager.begin_ending_attempt(
            meeting_id, roster, data.force_end, key)
    except EndingConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    if attempt["duplicate"]:
        prior = await manager.get_ending_attempt(attempt["attempt_id"])
        votes = [EndMeetingVote(**v) for v in (prior["votes"] if prior else [])]
        return EndMeetingResponse(
            success=(prior["outcome"] == "completed") if prior else False,
            votes=votes,
            summary=prior["summary"] if prior else None,
            message="Duplicate end request: returning the original outcome.",
        )
    attempt_id = attempt["attempt_id"]
    try:
        await manager.claim_ending_lease(meeting_id, attempt_id)
    except EndingConflict as e:
        raise HTTPException(status_code=409, detail=str(e))

    usage: dict = {}
    try:
        votes = []

        # If not force end, collect votes from each AI
        if not data.force_end:
            await manager.update_meeting_status(meeting_id, MeetingStatus.VOTING.value)

            # Build conversation summary for voting context
            recent_messages = meeting.messages[-20:]  # Last 20 messages for context
            conversation_context = "\n".join([
                f"{msg.sender_name}: {shorten(msg.content)}"
                for msg in recent_messages
            ])

            # Get vote from each participant
            for participant in meeting.participants:
                try:
                    provider = get_provider(
                        participant.provider_config.provider or None,
                        participant.provider_config.model or None
                    )
                    vote_prompt = build_vote_prompt(
                        participant.name, participant.role,
                        conversation_context, meeting.agenda)

                    messages = [LLMMessage(role="user", content=vote_prompt)]
                    response = await provider.complete(messages=messages, tools=[], temperature=0.3)
                    ballot = parse_vote_response(response.content)
                    votes.append(EndMeetingVote(
                        participant_id=participant.id,
                        participant_name=participant.name,
                        vote=ballot["vote"],
                        reason=ballot["reason"]
                    ))
                except Exception as e:
                    votes.append(EndMeetingVote(
                        participant_id=participant.id,
                        participant_name=participant.name,
                        vote=False,
                        reason=f"Error getting vote: {str(e)}"
                    ))
        usage["vote_calls"] = len(votes)

        # Strict-majority rule: ties fail, invalid votes count as non-yes.
        yes_votes = sum(1 for v in votes if v.vote)
        invalid_votes = sum(
            1 for v in votes
            if v.reason.startswith("Could not parse")
            or v.reason.startswith("Error getting vote")
        )
        try:
            evaluation = evaluate_votes(
                roster_count=len(roster), yes_count=yes_votes,
                invalid_count=invalid_votes if not data.force_end else 0,
                force=data.force_end,
            )
        except ValueError:
            evaluation = None

        if evaluation is None or not evaluation.should_end:
            await manager.record_ending_votes(attempt_id, [v.model_dump() for v in votes])
            try:
                await manager.commit_ending_attempt(
                    attempt_id, "rejected", None, usage)
            except EndingConflict:
                await manager.update_meeting_status(
                    meeting_id, MeetingStatus.ACTIVE.value)
            else:
                await manager.update_meeting_status(
                    meeting_id, MeetingStatus.ACTIVE.value)
            return EndMeetingResponse(
                success=False,
                votes=votes,
                summary=None,
                message=f"Vote failed: {yes_votes}/{len(votes)} voted to end. Meeting continues."
            )

        # Meeting will end - generate executive summary (outside any transaction)
        all_messages = meeting.messages
        conversation_full = "\n".join([
            f"{msg.sender_name}: {msg.content}"
            for msg in all_messages
        ])

        # System AI generates the summary; participant providers are never borrowed.
        from app.modules.personas.preferences import effective_for_system_ai

        system_ai = effective_for_system_ai()
        provider = get_provider(
            system_ai.provider or None,
            system_ai.model or None,
        )

        summary_prompt = build_summary_prompt(
            meeting.name, meeting.agenda,
            ", ".join([p.name + " (" + p.role + ")" for p in meeting.participants]),
            conversation_full,
        )

        messages = [LLMMessage(role="user", content=summary_prompt)]
        try:
            response = await provider.complete(messages=messages, tools=[], temperature=0.3)
            executive_summary = response.content
        except Exception:
            executive_summary = None
        usage["summary_calls"] = 1

        decision = decide_end(
            roster_count=len(roster), yes_count=yes_votes,
            invalid_count=invalid_votes if not data.force_end else 0,
            force=data.force_end, summary_failed=not executive_summary,
            summary_text=executive_summary,
        )
        await manager.record_ending_votes(attempt_id, [v.model_dump() for v in votes])
        if not decision.summary:
            try:
                await manager.commit_ending_attempt(
                    attempt_id, "failed", None, usage)
            except EndingConflict:
                pass
            await manager.update_meeting_status(
                meeting_id, MeetingStatus.ACTIVE.value)
            return EndMeetingResponse(
                success=False,
                votes=votes,
                summary=None,
                message="Summary generation failed. Meeting restored to active.",
            )
        try:
            await manager.commit_ending_attempt(
                attempt_id, "completed", decision.summary, usage)
        except EndingConflict:
            # RPC unavailable pre-migration: legacy sequential fallback.
            await manager.save_message(
                MessageCreate(
                    meeting_id=meeting_id,
                    content=f"📋 **MEETING ENDED**\n\n{decision.summary}",
                    sender_type=SenderType.SYSTEM,
                    sender_name="System"
                )
            )
            await manager.update_meeting_status(meeting_id, MeetingStatus.ENDED.value)
        else:
            # Save the summary as a system message alongside the atomic commit.
            await manager.save_message(
                MessageCreate(
                    meeting_id=meeting_id,
                    content=f"📋 **MEETING ENDED**\n\n{decision.summary}",
                    sender_type=SenderType.SYSTEM,
                    sender_name="System"
                )
            )

        return EndMeetingResponse(
            success=True,
            votes=votes,
            summary=decision.summary,
            message="Meeting ended successfully. Executive summary generated."
        )
    finally:
        await manager.release_lease(meeting_id)


@router.post("/{meeting_id}/archive")
async def archive_meeting(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Archive a meeting (move to archive folder)."""
    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)

    if meeting.status == MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is already archived")

    try:
        prior = require_archive_eligible(
            status=DomainState(meeting.status.value),
            has_active_work=await manager.has_active_work(meeting_id),
            pending_queue=await manager.pending_queue_count(meeting_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    success = await manager.archive_meeting(meeting_id, prior.value)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to archive meeting")

    return {"success": True, "message": "Meeting archived successfully"}


@router.post("/{meeting_id}/unarchive")
async def unarchive_meeting(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Unarchive a meeting (restore from archive)."""
    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    
    if meeting.status != MeetingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Meeting is not archived")

    # Restore the preserved prior state; unknown provenance stays blocked.
    prior_state = getattr(meeting, "archived_from", None)
    if prior_state is None:
        prior_state = "unknown"
    try:
        target = require_unarchive_target(prior_state)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Restore to preserved prior status (never silently reopen ended).
    success = await manager.update_meeting_status(meeting_id, target.value)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to unarchive meeting")

    return {"success": True, "message": "Meeting unarchived successfully"}


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, actor: Actor = Depends(require_actor)):
    """Permanently delete a meeting and all its data."""
    manager = get_meeting_manager()

    meeting = await manager.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    
    success = await manager.delete_meeting(meeting_id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete meeting")
    
    return {"success": True, "message": "Meeting deleted successfully"}
