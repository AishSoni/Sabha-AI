"""Participant template and creation routes (spec-06 cutover)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from typing import List

from app.modules.meetings.application.prompts import DEFAULT_ROSTER
from app.modules.meetings.domain.models import AIParticipant, AIParticipantCreate
from app.presentation.dependencies import get_meeting_manager

router = APIRouter(prefix="/participants", tags=["participants"])


@router.get("/templates", response_model=List[dict])
async def get_templates():
    """Get available AI participant templates (the default roster)."""
    return DEFAULT_ROSTER


@router.post("", response_model=AIParticipant)
async def add_participant(
    data: AIParticipantCreate,
    manager=Depends(get_meeting_manager),
):
    """Add a new AI participant to a meeting."""
    participant = await manager.add_participant(data)
    return participant
