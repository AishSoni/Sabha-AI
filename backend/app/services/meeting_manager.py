"""
Meeting manager service - handles meeting lifecycle and persistence.
"""

from typing import Optional, List
from datetime import datetime
import uuid

from app.core.database import get_supabase
from app.models import (
    Meeting,
    MeetingCreate,
    MeetingWithParticipants,
    AIParticipant,
    AIParticipantCreate,
    Message,
    MessageCreate,
    Disagreement,
    DisagreementCreate,
    Consensus,
    ConsensusCreate,
    SenderType,
)
from app.services.prompts import DEFAULT_ROSTER, get_full_prompt


class MeetingManager:
    """Manages meeting lifecycle and database operations."""
    
    def __init__(self):
        self.db = get_supabase()
    
    async def create_meeting(
        self,
        data: MeetingCreate,
        add_default_roster: bool = True
    ) -> MeetingWithParticipants:
        """Create a new meeting with optional default participants."""
        
        meeting_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        # Insert meeting
        meeting_data = {
            "id": meeting_id,
            "name": data.name,
            "agenda": data.agenda,
            "user_id": data.user_id,
            "status": "active",
            "total_cost": 0.0,
            "created_at": now,
        }
        
        result = self.db.table("meetings").insert(meeting_data).execute()
        
        # Add default AI participants if requested
        participants = []
        if add_default_roster:
            for persona in DEFAULT_ROSTER:
                participant = await self.add_participant(
                    AIParticipantCreate(
                        meeting_id=meeting_id,
                        name=persona["name"],
                        role=persona["role"],
                        system_prompt=get_full_prompt(persona["system_prompt"]),
                        color=persona["color"],
                    )
                )
                participants.append(participant)
        
        return MeetingWithParticipants(
            **result.data[0],
            participants=participants,
            messages=[]
        )
    
    async def get_meeting(self, meeting_id: str) -> Optional[MeetingWithParticipants]:
        """Get a meeting with all its participants and messages."""
        
        # Fetch meeting
        meeting_result = self.db.table("meetings") \
            .select("*") \
            .eq("id", meeting_id) \
            .execute()
        
        if not meeting_result.data:
            return None
        
        meeting_data = meeting_result.data[0]
        
        # Fetch participants
        participants_result = self.db.table("ai_participants") \
            .select("*") \
            .eq("meeting_id", meeting_id) \
            .execute()
        
        participants = [AIParticipant(**p) for p in participants_result.data]
        
        # Fetch messages
        messages_result = self.db.table("messages") \
            .select("*") \
            .eq("meeting_id", meeting_id) \
            .order("created_at") \
            .execute()
        
        messages = [Message(**m) for m in messages_result.data]
        
        return MeetingWithParticipants(
            **meeting_data,
            participants=participants,
            messages=messages
        )
    
    async def list_meetings(self, user_id: Optional[str] = None) -> List[Meeting]:
        """List all meetings, optionally filtered by user."""
        
        query = self.db.table("meetings").select("*")
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.order("created_at", desc=True).execute()
        
        return [Meeting(**m) for m in result.data]
    
    async def add_participant(self, data: AIParticipantCreate) -> AIParticipant:
        """Add an AI participant to a meeting."""
        
        participant_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        participant_data = {
            "id": participant_id,
            "meeting_id": data.meeting_id,
            "name": data.name,
            "role": data.role,
            "system_prompt": data.system_prompt,
            "provider_config": data.provider_config.model_dump(),
            "color": data.color,
            "created_at": now,
        }
        
        result = self.db.table("ai_participants").insert(participant_data).execute()
        
        return AIParticipant(**result.data[0])
    
    async def save_message(self, data: MessageCreate) -> Message:
        """Save a message to the database."""
        
        message_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        message_data = {
            "id": message_id,
            "meeting_id": data.meeting_id,
            "sender_type": data.sender_type.value,
            "sender_id": data.sender_id,
            "sender_name": data.sender_name,
            "content": data.content,
            "citations": [c.model_dump() for c in data.citations],
            "tool_artifacts": data.tool_artifacts,
            "thinking_content": data.thinking_content,
            "estimated_cost": data.estimated_cost,
            "created_at": now,
        }
        
        result = self.db.table("messages").insert(message_data).execute()
        
        # Update meeting total cost
        if data.estimated_cost > 0:
            self.db.rpc(
                "increment_meeting_cost",
                {"meeting_id": data.meeting_id, "cost_delta": data.estimated_cost}
            ).execute()
        
        return Message(**result.data[0])
    
    async def save_disagreement(self, data: DisagreementCreate) -> Disagreement:
        """Save a disagreement to the database."""
        
        disagreement_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        disagreement_data = {
            "id": disagreement_id,
            "meeting_id": data.meeting_id,
            "source_ai_id": data.source_ai_id,
            "target_name": data.target_name,
            "topic": data.topic,
            "reasoning": data.reasoning,
            "severity": data.severity,
            "status": "open",
            "created_at": now,
        }
        
        result = self.db.table("disagreements").insert(disagreement_data).execute()
        
        return Disagreement(**result.data[0])
    
    async def save_consensus(self, data: ConsensusCreate) -> Consensus:
        """Save a consensus to the database."""
        
        consensus_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        consensus_data = {
            "id": consensus_id,
            "meeting_id": data.meeting_id,
            "participants": data.participants,
            "topic": data.topic,
            "strength": data.strength,
            "created_at": now,
        }
        
        result = self.db.table("consensus").insert(consensus_data).execute()
        
        return Consensus(**result.data[0])
    
    async def get_disagreements(self, meeting_id: str) -> List[Disagreement]:
        """Get all disagreements for a meeting."""
        
        result = self.db.table("disagreements") \
            .select("*") \
            .eq("meeting_id", meeting_id) \
            .order("created_at") \
            .execute()
        
        return [Disagreement(**d) for d in result.data]
    
    async def get_consensus_list(self, meeting_id: str) -> List[Consensus]:
        """Get all consensus entries for a meeting."""
        
        result = self.db.table("consensus") \
            .select("*") \
            .eq("meeting_id", meeting_id) \
            .order("created_at") \
            .execute()
        
        return [Consensus(**c) for c in result.data]

    async def update_meeting_status(self, meeting_id: str, status: str) -> bool:
        """Update a meeting's status."""
        
        result = self.db.table("meetings") \
            .update({"status": status}) \
            .eq("id", meeting_id) \
            .execute()
        
        return len(result.data) > 0
