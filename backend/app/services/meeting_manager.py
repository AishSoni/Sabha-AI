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
    ProviderConfig,
    SenderType,
    MeetingStatus,
)
from app.services.prompts import DEFAULT_ROSTER, get_full_prompt


def _status_value(status: "MeetingStatus | str") -> str:
    """Normalize an enum-or-string status into its persisted value."""
    return status.value if isinstance(status, MeetingStatus) else status


class MeetingManager:
    """Manages meeting lifecycle and database operations."""
    
    def __init__(self):
        self.db = get_supabase()
    
    async def create_meeting(
        self,
        data: MeetingCreate,
        add_default_roster: bool = True
    ) -> MeetingWithParticipants:
        """Create a new meeting with optional default participants.

        Personas are validated BEFORE any write, and the meeting row plus all
        participants are persisted in one transactional write: a failure
        anywhere rolls the whole creation back instead of leaving an orphan
        meeting behind.
        """

        meeting_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        meeting_data = {
            "id": meeting_id,
            "name": data.name,
            "agenda": data.agenda,
            "user_id": data.user_id,
            "status": "active",
            "total_cost": 0.0,
            "created_at": now,
        }

        participants_payload: List[dict] = []

        # If persona_ids provided, fetch those personas from DB
        if data.persona_ids and len(data.persona_ids) > 0:
            # Fetch personas from database
            personas_result = self.db.table("personas") \
                .select("*") \
                .in_("id", data.persona_ids) \
                .execute()

            found = {str(p["id"]): p for p in personas_result.data}
            missing = [str(pid) for pid in data.persona_ids if str(pid) not in found]
            if missing:
                raise ValueError(f"Unknown personas: {', '.join(missing)}")

            # Snapshot the persona's knowledge-stack assignments into the
            # participant at creation: later template edits/deletions must
            # not retroactively change meeting knowledge access.
            assignments_result = self.db.table("persona_knowledge_stacks") \
                .select("persona_id, stack_id") \
                .in_("persona_id", [str(pid) for pid in data.persona_ids]) \
                .execute()
            assignments_by_persona: dict = {}
            for row in assignments_result.data:
                assignments_by_persona.setdefault(str(row["persona_id"]), []).append(
                    str(row["stack_id"])
                )

            for persona_id in data.persona_ids:
                persona_data = found[str(persona_id)]
                # Fetch active prompt for this persona
                active_prompt = ""
                prompts_result = self.db.table("prompt_versions") \
                    .select("content") \
                    .eq("persona_id", persona_data["id"]) \
                    .eq("is_active", True) \
                    .limit(1) \
                    .execute()

                if prompts_result.data:
                    active_prompt = prompts_result.data[0].get("content", "")

                # Snapshot the persona's generation settings into this
                # participant at creation time; empty values keep the
                # server defaults.
                persona_cfg = persona_data.get("provider_config") or {}
                role = persona_data.get("subtitle") or "AI Assistant"
                if len(role) > 200:
                    raise ValueError(
                        "Persona subtitle exceeds participant role capacity "
                        "of 200 characters"
                    )
                participants_payload.append({
                    "id": str(uuid.uuid4()),
                    "meeting_id": meeting_id,
                    "name": persona_data["name"],
                    "role": role,
                    "system_prompt": get_full_prompt(active_prompt),
                    "provider_config": ProviderConfig(
                        provider=persona_cfg.get("provider") or "",
                        model=persona_cfg.get("model") or "",
                        temperature=persona_cfg.get("temperature", 0.7),
                        max_tokens=persona_cfg.get("max_tokens", 2048),
                    ).model_dump(),
                    "color": persona_data["color"],
                    "persona_id": str(persona_data["id"]),
                    "stack_ids": assignments_by_persona.get(str(persona_data["id"]), []),
                    "created_at": now,
                })
        elif add_default_roster:
            # Use default roster if no persona_ids provided
            for persona in DEFAULT_ROSTER:
                role = persona["role"]
                if len(role) > 200:
                    raise ValueError(
                        "Default roster role exceeds participant role "
                        "capacity of 200 characters"
                    )
                participants_payload.append({
                    "id": str(uuid.uuid4()),
                    "meeting_id": meeting_id,
                    "name": persona["name"],
                    "role": role,
                    "system_prompt": get_full_prompt(persona["system_prompt"]),
                    "provider_config": ProviderConfig().model_dump(),
                    "color": persona["color"],
                    "persona_id": None,
                    "stack_ids": [],
                    "created_at": now,
                })

        # One transaction persists meeting + participants; any failure inside
        # the write rolls everything back.
        result = self.db.rpc(
            "create_meeting_transaction",
            {"p_meeting": meeting_data, "p_participants": participants_payload},
        ).execute()
        payload = result.data

        participants = [AIParticipant(**row) for row in payload["participants"]]

        return MeetingWithParticipants(            **payload["meeting"],
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
        """Add an AI participant to a meeting.

        Knowledge-stack assignments snapshot from the template at creation so
        later template edits cannot retroactively widen or shrink this
        participant's private knowledge access.
        """

        participant_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        stack_ids: List[str] = []
        if data.persona_id:
            assignments_result = self.db.table("persona_knowledge_stacks") \
                .select("stack_id") \
                .eq("persona_id", data.persona_id) \
                .execute()
            stack_ids = [str(row["stack_id"]) for row in assignments_result.data]

        participant_data = {
            "id": participant_id,
            "meeting_id": data.meeting_id,
            "name": data.name,
            "role": data.role,
            "system_prompt": data.system_prompt,
            "provider_config": data.provider_config.model_dump(),
            "color": data.color,
            "persona_id": data.persona_id,
            "stack_ids": stack_ids,
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

        # Spec-02: saving a message is accounting-NEUTRAL. estimated_cost on
        # the message is display data only; the universal inference ledger
        # (record_inference_cost) owns meetings.total_cost.

        return Message(**result.data[0])

    async def record_inference_cost(
        self,
        *,
        inference_id: str,
        meeting_id: str,
        purpose: str,
        provider: Optional[str],
        model: Optional[str],
        cost: float = 0.0,
    ) -> bool:
        """Record one completed inference attempt in the universal ledger.

        Returns True the first time this inference id is seen (the meeting
        total was updated), False when the id was already recorded
        (idempotent replay — never double counted)."""
        result = self.db.rpc(
            "record_inference_cost",
            {
                "p_inference_id": str(inference_id),
                "p_meeting_id": str(meeting_id),
                "p_purpose": purpose,
                "p_provider": provider,
                "p_model": model,
                "p_cost": cost,
            },
        ).execute()
        return bool(result.data)
    
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

    async def transition_meeting_status(
        self,
        meeting_id: str,
        expected_from: "MeetingStatus | str",
        next_status: "MeetingStatus | str",
    ) -> bool:
        """Compare-and-swap a meeting's status.

        The update carries the current status as an extra filter, so it only
        commits when the persisted status still equals `expected_from`. A
        transition that lost a race (or the whole meeting is unknown) returns
        False instead of clobbering another writer's state — no
        last-writer-wins overwrite.
        """
        result = self.db.table("meetings") \
            .update({"status": _status_value(next_status)}) \
            .eq("id", meeting_id) \
            .eq("status", _status_value(expected_from)) \
            .execute()

        return len(result.data) > 0

    async def commit_meeting_ending(
        self,
        meeting_id: str,
        from_status: "MeetingStatus | str",
        content: Optional[str],
    ) -> bool:
        """Persist the ending message and close the meeting in one transaction.

        The RPC CAS-protects the status flip (`from_status` is usually
        'voting'), so a losing writer reports False and persists nothing —
        the ending message cannot outlive a lost race and a committed ending
        cannot exist without its summary message. Partial commitment is
        impossible because both writes share one transaction.
        """
        result = self.db.rpc(
            "commit_meeting_ending",
            {
                "p_meeting_id": meeting_id,
                "p_from_status": _status_value(from_status),
                "p_content": content,
            },
        ).execute()
        return bool(result.data)

    async def get_latest_message_with_prefix(
        self, meeting_id: str, prefix: str
    ) -> Optional[Message]:
        """Newest system message whose content starts with `prefix`.

        Used for ending-marker recovery checks (skip regeneration when an
        ending or summary already persisted) without loading the whole
        conversation.
        """
        result = self.db.table("messages") \
            .select("*") \
            .eq("meeting_id", meeting_id) \
            .eq("sender_type", SenderType.SYSTEM.value) \
            .like("content", f"{prefix}%") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        data = result.data or []
        return Message(**data[0]) if data else None

    async def delete_meeting(self, meeting_id: str) -> bool:
        """Delete a meeting and all its related data."""
        
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
