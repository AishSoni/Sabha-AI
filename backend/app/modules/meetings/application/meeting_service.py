"""
Meeting manager service - handles meeting lifecycle and persistence.
"""

from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.modules.meetings.domain.models import (
    AIParticipant,
    AIParticipantCreate,
    Consensus,
    ConsensusCreate,
    Disagreement,
    DisagreementCreate,
    Meeting,
    MeetingCreate,
    MeetingStatus,
    MeetingWithParticipants,
    Message,
    MessageCreate,
    SenderType,
)
from app.modules.meetings.application.construct_participants import (
    default_roster_participants,
    generation_policy_for,
)
from app.modules.meetings.application.prompts import DEFAULT_ROSTER, get_full_prompt


def _now_iso() -> str:
    """UTC timestamp in the same wire format as the rest of the modules."""
    return datetime.now(timezone.utc).isoformat()


def _status_value(status: "MeetingStatus | str") -> str:
    """Normalize an enum-or-string status into its persisted value."""
    return status.value if isinstance(status, MeetingStatus) else status


def _present_meeting_row(row: dict) -> dict:
    """Project archive state into the public lifecycle status (spec-08).

    ``status`` stays the lifecycle axis (active/voting/ended); ``archived_at``
    is an overlay. API callers still see the single ``archived`` value they
    have always used, without unarchive guessing a pre-archive status.
    """
    data = dict(row)
    archived_at = data.pop("archived_at", None)
    if archived_at is not None:
        data["status"] = MeetingStatus.ARCHIVED.value
    return data


class MeetingService:
    """Manages meeting lifecycle and database operations."""

    def __init__(self, db, snapshot_template, construct_participants):
        self.db = db
        self._snapshot_template = snapshot_template
        self._construct_participants = construct_participants
    
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
        now = _now_iso()

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

        # Participant construction is a Meetings application use case reading
        # the persona catalog's coherent creation snapshots — never template
        # tables. A snapshot under the persona lock is the participant's
        # independent copy: later template edits/deletion cannot re-read.
        if data.persona_ids and len(data.persona_ids) > 0:
            participants_payload = [
                snapshot.to_payload()
                for snapshot in await self._construct_participants.execute(
                    meeting_id, list(data.persona_ids), now
                )
            ]
        elif add_default_roster:
            # The built-in roster carries no template state at all.
            participants_payload = [
                snapshot.to_payload()
                for snapshot in default_roster_participants(
                    meeting_id, DEFAULT_ROSTER, now, prompt_composer=get_full_prompt
                )
            ]

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
        
        meeting_data = _present_meeting_row(meeting_result.data[0])
        
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
        
        return [Meeting(**_present_meeting_row(m)) for m in result.data]
    
    async def add_participant(self, data: AIParticipantCreate) -> AIParticipant:
        """Add an AI participant to a meeting.

        Knowledge-stack assignments snapshot from the template at creation so
        later template edits cannot retroactively widen or shrink this
        participant's private knowledge access.
        """

        participant_id = str(uuid.uuid4())
        now = _now_iso()

        stack_ids: List[str] = []
        if data.persona_id:
            # Template assignment snapshot through the catalog port (one
            # coherent read); an unknown template keeps the legacy
            # no-assignments fallback.
            snapshot = await self._snapshot_template.execute(str(data.persona_id))
            if snapshot is not None:
                stack_ids = list(snapshot.stack_ids)

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
            # Explicit-only policy derived from the recorded carrier;
            # the participants API can express inherit through ""/null
            # carrier markers, never through a bootstrap default.
            "generation_policy": generation_policy_for(
                data.provider_config.model_dump()
            ),
        }
        
        result = self.db.table("ai_participants").insert(participant_data).execute()
        
        return AIParticipant(**result.data[0])

    async def ensure_participant_knowledge_scope(self, participant) -> None:
        """Guarantee ``participant.stack_ids`` is populated before inference.

        Assignment snapshots are authoritative (captured at participant
        creation); stack CONTENTS stay live via per-stack collections at
        execution time. Legacy participant rows created before the
        snapshot column carry NULL: ONE assembly-time template join
        resolves their stack scope here, so the execution path itself
        never reads template tables (spec 06).
        """
        if participant.stack_ids is not None:
            return
        persona_id = participant.persona_id
        if not persona_id:
            participant.stack_ids = []
            return
        result = self.db.table("persona_knowledge_stacks") \
            .select("stack_id") \
            .eq("persona_id", persona_id) \
            .execute()
        participant.stack_ids = [row["stack_id"] for row in (result.data or [])]
    
    async def save_message(self, data: MessageCreate) -> Message:
        """Save a message to the database."""
        
        message_id = str(uuid.uuid4())
        now = _now_iso()
        
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
            "effective_generation": data.effective_generation,
            "request_key": data.request_key,
            "operation_id": data.operation_id,
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
        now = _now_iso()
        
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
        now = _now_iso()
        
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

    # ------------------------------------------------------------------
    # Spec-08 guarded lifecycle writes
    # ------------------------------------------------------------------

    async def append_user_message(
        self, meeting_id: str, data: MessageCreate
    ) -> tuple[str, Optional[Message]]:
        """Persist a user message through the meeting-locked guard.

        Returns ``(outcome, message)`` where outcome is accepted, duplicate,
        meeting_closed, not_found, or invalid. The guard reads the meeting row
        under lock, so a close racing this write cannot slip through a stale
        precheck.
        """
        payload = {
            "id": str(uuid.uuid4()),
            "content": data.content,
            "sender_type": data.sender_type.value,
            "sender_name": data.sender_name,
            "sender_id": data.sender_id,
            "request_key": data.request_key,
            "created_at": _now_iso(),
        }
        result = self.db.rpc(
            "append_user_message",
            {
                "p_meeting_id": meeting_id,
                "p_message": payload,
                "p_now": _now_iso(),
            },
        ).execute()
        body = result.data or {}
        outcome = str(body.get("outcome") or "invalid")
        row = body.get("message")
        return outcome, (Message(**row) if row else None)

    async def archive_meeting(self, meeting_id: str) -> dict:
        """Set the archive overlay without changing the lifecycle status."""
        result = self.db.rpc(
            "archive_meeting_guarded",
            {"p_meeting_id": meeting_id, "p_now": _now_iso()},
        ).execute()
        return dict(result.data or {})

    async def unarchive_meeting(self, meeting_id: str) -> dict:
        """Clear the archive overlay; never reopens an ended meeting."""
        result = self.db.rpc(
            "unarchive_meeting_guarded",
            {"p_meeting_id": meeting_id, "p_now": _now_iso()},
        ).execute()
        return dict(result.data or {})

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
