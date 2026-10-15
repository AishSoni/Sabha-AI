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
from app.services.lifecycle_store import LifecycleStoreMixin


class MeetingManager(LifecycleStoreMixin):
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

        # Build initial participant payloads first so meeting + roster commit
        # atomically via RPC (sequential fallback only pre-migration).
        payloads = []

        # If persona_ids provided, fetch those personas from DB
        if data.persona_ids and len(data.persona_ids) > 0:
            # Fetch personas from database
            personas_result = self.db.table("personas") \
                .select("*") \
                .in_("id", data.persona_ids) \
                .execute()

            for persona_data in personas_result.data:
                # Fetch active prompt for this persona
                active_prompt = ""
                active_version = None
                prompts_result = self.db.table("prompt_versions") \
                    .select("content, version") \
                    .eq("persona_id", persona_data["id"]) \
                    .eq("is_active", True) \
                    .limit(1) \
                    .execute()

                if prompts_result.data:
                    active_prompt = prompts_result.data[0].get("content", "")
                    active_version = prompts_result.data[0].get("version")

                from app.modules.personas.snapshots import build_participant_snapshot

                stack_rows = []
                try:
                    stack_rows = self.db.table("persona_knowledge_stacks") \
                        .select("stack_id") \
                        .eq("persona_id", persona_data["id"]) \
                        .execute().data or []
                except Exception:
                    stack_rows = []
                snapshot = build_participant_snapshot(
                    persona={**persona_data, "active_prompt_version": active_version},
                    active_prompt=active_prompt,
                    stack_ids=[r.get("stack_id") for r in stack_rows],
                    persona_revision=int(persona_data.get("revision") or 1),
                )
                payloads.append(
                    {
                        "id": str(uuid.uuid4()),
                        "name": snapshot["name"],
                        "role": snapshot["role"],
                        "system_prompt": snapshot["system_prompt"],
                        "provider_config": snapshot["provider_config"],
                        "color": snapshot["color"],
                        "persona_id": persona_data["id"],
                        "created_at": now,
                    }
                )
        elif add_default_roster:
            # Use default roster if no persona_ids provided
            for persona in DEFAULT_ROSTER:
                payloads.append(
                    {
                        "id": str(uuid.uuid4()),
                        "name": persona["name"],
                        "role": persona["role"],
                        "system_prompt": get_full_prompt(persona["system_prompt"]),
                        "provider_config": {"provider": "", "model": "",
                                            "temperature": 0.7},
                        "color": persona["color"],
                        "persona_id": None,
                        "created_at": now,
                    }
                )

        meeting_row, participant_rows = await self.create_meeting_atomic(
            meeting_data, payloads)
        participants = [AIParticipant(**p) for p in participant_rows]

        return MeetingWithParticipants(
            **meeting_row,
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
            "persona_id": data.persona_id,
            "created_at": now,
        }

        result = self.db.table("ai_participants").insert(participant_data).execute()

        return AIParticipant(**result.data[0])

    async def get_participant(self, participant_id: str) -> Optional[AIParticipant]:
        """Fetch one participant by id."""
        result = self.db.table("ai_participants").select("*").eq("id", participant_id).execute()
        if not result.data:
            return None
        return AIParticipant(**result.data[0])

    async def get_persona_snapshot(self, persona_id: str | None) -> Optional[dict]:
        """Persona source for refresh: config + active prompt + stacks + revision."""
        if not persona_id:
            return None
        persona_rows = self.db.table("personas").select("*").eq("id", persona_id).execute()
        if not persona_rows.data:
            return None
        persona = dict(persona_rows.data[0])
        prompt_rows = self.db.table("prompt_versions").select(
            "content, version").eq("persona_id", persona_id).eq(
            "is_active", True).execute()
        active_prompt = ""
        active_version = None
        if prompt_rows.data:
            active_prompt = prompt_rows.data[0].get("content", "")
            active_version = prompt_rows.data[0].get("version")
        try:
            stack_rows = self.db.table("persona_knowledge_stacks").select(
                "stack_id").eq("persona_id", persona_id).execute().data or []
        except Exception:
            stack_rows = []
        persona["active_prompt"] = active_prompt
        persona["active_prompt_version"] = active_version
        persona["stack_ids"] = [r.get("stack_id") for r in stack_rows]
        return persona

    async def update_participant_snapshot(self, participant_id: str, snapshot: dict) -> AIParticipant:
        """Persist an applied refresh snapshot."""
        update = {
            "system_prompt": snapshot.get("system_prompt"),
            "provider_config": snapshot.get("provider_config"),
        }
        # New provenance columns are additive; legacy tables ignore them.
        for key in ("persona_version", "persona_revision", "snapshot_revision",
                    "effective_provider"):
            if key in snapshot:
                update[key] = snapshot[key]
        result = self.db.table("ai_participants").update(update).eq(
            "id", participant_id).execute()
        if not result.data:
            raise ValueError("Participant not found")
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

    async def delete_meeting(self, meeting_id: str) -> bool:
        """Delete a meeting and all its related data."""
        from datetime import timezone
        from app.modules.knowledge import lifecycle as lifecycle_service

        # Tombstone meeting documents first so retrieval excludes them before
        # any row or vector disappears; cleanup persists to the outbox.
        try:
            docs = self.db.table("documents")\
                .select("id, qdrant_collection")\
                .eq("meeting_id", meeting_id)\
                .execute()
            if docs.data:
                from app.services.vector_store import get_vector_store
                vectors = get_vector_store()
                now = datetime.now(timezone.utc).isoformat()
                for doc in docs.data:
                    document_id = doc.get("id", "")
                    collection = doc.get("qdrant_collection", "")
                    self.db.table("documents").update({
                        "status": "deleting",
                        "cleanup_pending": True,
                        "deleted_at": now,
                    }).eq("id", document_id).execute()
                    if collection:
                        await lifecycle_service.enqueue_cleanup(
                            self.db, document_id, collection
                        )
                        await lifecycle_service.run_cleanup_job(
                            self.db, vectors, document_id
                        )
                # Belt-and-braces: dropping the meeting's shared collection
                # removes orphan points even if row cascades erase pending
                # outbox entries before vectors recover.
                try:
                    from app.services.vector_store import VectorStoreManager
                    await vectors.delete_collection(
                        VectorStoreManager.meeting_collection_name(meeting_id)
                    )
                except Exception:
                    pass
        except Exception:
            pass

        # Delete messages first (foreign key constraint)
        self.db.table("messages") \
            .delete() \
            .eq("meeting_id", meeting_id) \
            .execute()
        
        # Delete disagreements
        self.db.table("disagreements") \
            .delete() \
            .eq("meeting_id", meeting_id) \
            .execute()
        
        # Delete consensus
        self.db.table("consensus") \
            .delete() \
            .eq("meeting_id", meeting_id) \
            .execute()
        
        # Delete participants
        self.db.table("ai_participants") \
            .delete() \
            .eq("meeting_id", meeting_id) \
            .execute()
        
        # Finally delete the meeting
        result = self.db.table("meetings") \
            .delete() \
            .eq("id", meeting_id) \
            .execute()
        
        return len(result.data) > 0
