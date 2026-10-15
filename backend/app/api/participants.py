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
