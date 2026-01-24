"""
Participants API routes.
"""

from fastapi import APIRouter, HTTPException
from typing import List

from app.models import AIParticipant, AIParticipantCreate
from app.services import MeetingManager, DEFAULT_ROSTER

router = APIRouter()


def get_meeting_manager() -> MeetingManager:
    return MeetingManager()


@router.get("/templates", response_model=List[dict])
async def get_templates():
    """Get available AI participant templates (the default roster)."""
    return DEFAULT_ROSTER


@router.post("", response_model=AIParticipant)
async def add_participant(data: AIParticipantCreate):
    """Add a new AI participant to a meeting."""
    manager = get_meeting_manager()
    participant = await manager.add_participant(data)
    return participant
