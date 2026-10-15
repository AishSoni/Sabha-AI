"""
Participants API routes.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.models import AIParticipant, AIParticipantCreate, MeetingStatus
from app.modules.access.actors import Actor
from app.modules.access.deps import owner_or_404, require_actor
from app.services import MeetingManager, DEFAULT_ROSTER

router = APIRouter()


def get_meeting_manager() -> MeetingManager:
    return MeetingManager()


@router.get("/templates", response_model=List[dict])
async def get_templates():
    """Get available AI participant templates (the default roster)."""
    return DEFAULT_ROSTER


@router.post("", response_model=AIParticipant)
async def add_participant(data: AIParticipantCreate, actor: Actor = Depends(require_actor)):
    """Add a new AI participant to a meeting."""
    manager = get_meeting_manager()
    meeting = await manager.get_meeting(data.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="meeting_not_active")
    participant = await manager.add_participant(data)
    return participant


@router.post("/{participant_id}/refresh-preview")
async def refresh_preview(
    participant_id: str, body: dict, actor: Actor = Depends(require_actor),
):
    """Preview persona refresh: diff + revision check, no mutation."""
    from app.modules.personas.refresh import RefreshConflict, preview_refresh

    manager = get_meeting_manager()
    participant = await manager.get_participant(participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    meeting = await manager.get_meeting(participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    persona = await manager.get_persona_snapshot(participant.persona_id) if participant.persona_id else None
    if not persona:
        raise HTTPException(status_code=409, detail="no_persona_source")
    try:
        return preview_refresh(
            participant=participant.model_dump(),
            persona=persona,
            expected_persona_revision=body.get("expected_persona_revision"),
        )
    except RefreshConflict as exc:
        raise HTTPException(status_code=409, detail=exc.code)


@router.post("/{participant_id}/refresh", response_model=AIParticipant)
async def refresh_participant(
    participant_id: str, body: dict, actor: Actor = Depends(require_actor),
):
    """Apply persona refresh when the meeting is idle and revisions match."""
    from app.modules.personas.refresh import RefreshConflict, apply_refresh
    from app.modules.personas.snapshots import build_participant_snapshot

    manager = get_meeting_manager()
    participant = await manager.get_participant(participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    meeting = await manager.get_meeting(participant.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    owner_or_404(actor, meeting.user_id)
    if meeting.status != MeetingStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="meeting_not_active")
    try:
        if await manager.has_active_work(meeting.id):
            raise RefreshConflict("turn_in_progress")
        if await manager.pending_queue_count(meeting.id) > 0:
            raise RefreshConflict("queue_not_drained")
    except RefreshConflict as exc:
        raise HTTPException(status_code=409, detail=exc.code)
    persona = await manager.get_persona_snapshot(participant.persona_id) if participant.persona_id else None
    if not persona:
        raise HTTPException(status_code=409, detail="no_persona_source")
    snapshot = build_participant_snapshot(
        persona=persona,
        active_prompt=persona.get("active_prompt", ""),
        stack_ids=persona.get("stack_ids", []),
        persona_revision=int(persona.get("revision") or 1),
    )
    try:
        updated = apply_refresh(
            participant=participant.model_dump(),
            persona=persona,
            snapshot=snapshot,
            expected_participant_revision=body.get("expected_participant_revision"),
            expected_persona_revision=body.get("expected_persona_revision"),
        )
    except RefreshConflict as exc:
        raise HTTPException(status_code=409, detail=exc.code)
    saved = await manager.update_participant_snapshot(participant_id, updated)
    return saved
