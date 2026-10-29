"""Participant construction for a new meeting roster (spec 06).

The use case turns catalog creation snapshots into the participant
payloads one meeting transaction persists. Template state arrives
exclusively as coherent snapshots through the persona-catalog port —
this module never reads personas, prompt_versions or assignment tables
itself, so a later template edit cannot tear a meeting's construction,
and template deletion cannot orphan it either.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence
from uuid import uuid4


def _uuid_str() -> str:
    return str(uuid4())

from app.modules.meetings.domain.models import (
    ParticipantSnapshot,
    participant_provider_carrier,
)
from app.modules.persona_catalog.public import GenerationPolicy


def generation_policy_for(template_carrier: Mapping[str, Any] | None) -> dict:
    """Explicit-only generation policy derived from a template carrier.

    Uses the catalog module's carrier language (the documented mapping:
    ``""`` provider/model are inherit markers, JSON-null keys mean
    inherit, recorded numbers are explicit recorded values — a zero
    included); only the explicit fields persist, so inherited settings
    keep resolving at execution start.
    """
    return GenerationPolicy.from_template_config(template_carrier or {}).to_storage()


@dataclass(frozen=True)
class RoleCapacityExceeded(ValueError):
    """A participant role fits the 200-character capacity column."""


class ConstructParticipants:
    """Snapshot the template state for each selected persona.

    Unknown persona ids raise BEFORE any write, listing every missing
    id (meeting creation validates its whole roster first).
    """

    def __init__(
        self,
        get_snapshot,
        prompt_composer: Callable[[str], str],
        *,
        id_factory: Callable[[], str] = _uuid_str,
    ) -> None:
        self._get_snapshot = get_snapshot
        self._prompt_composer = prompt_composer
        self._id_factory = id_factory

    async def execute(
        self,
        meeting_id: str,
        persona_ids: Sequence[str],
        created_at: str,
    ) -> list[ParticipantSnapshot]:
        # Pydantic hands UUID objects over; the whole construction speaks
        # in strings (payload JSON stay serializable).
        persona_ids = [str(persona_id) for persona_id in persona_ids]
        snapshots = await self._read_snapshots(list(persona_ids))
        # Validate the WHOLE roster before mapping anything so creation
        # fails before any write with every unknown id listed at once.
        missing = [
            persona_id
            for persona_id, snapshot in zip(persona_ids, snapshots)
            if snapshot is None
        ]
        if missing:
            raise ValueError(f"Unknown personas: {', '.join(missing)}")
        return [
            self._participant_from_snapshot(
                meeting_id,
                persona_ids[index],
                snapshots[index],
                created_at,
            )
            for index in range(len(persona_ids))
        ]

    async def _read_snapshots(self, persona_ids: list[str]) -> list:
        return await self._get_snapshot.execute_many(persona_ids)

    def _participant_from_snapshot(
        self,
        meeting_id: str,
        persona_id: str,
        snapshot,
        created_at: str,
    ) -> ParticipantSnapshot:
        template = snapshot.template
        role = template.subtitle or "AI Assistant"
        if len(role) > 200:
            raise ValueError(
                "Persona subtitle exceeds participant role capacity "
                "of 200 characters"
            )
        return ParticipantSnapshot(
            id=self._id_factory(),
            meeting_id=meeting_id,
            name=template.name,
            role=role,
            system_prompt=self._prompt_composer(snapshot.active_prompt or ""),
            provider_config=participant_provider_carrier(
                template.provider_config
            ),
            color=template.color or "#6366f1",
            persona_id=persona_id,
            stack_ids=snapshot.stack_ids,
            created_at=created_at,
            # Explicit-only policy derived from the SAME carrier the
            # verbatim provider_config snapshot carries; both persist.
            generation_policy=generation_policy_for(template.provider_config),
        )


def default_roster_participants(
    meeting_id: str,
    roster: Sequence[Mapping],
    created_at: str,
    *,
    prompt_composer: Callable[[str], str],
    id_factory: Callable[[], str] = _uuid_str,
) -> list[ParticipantSnapshot]:
    """Build the built-in roster's participants; they carry no template.

    Default-roster participants own no generation carrier (all-empty
    mapping → inherit everything) and no template id — the roster entries
    are meeting payloads, not catalog templates.
    """
    participants: list[ParticipantSnapshot] = []
    for persona in roster:
        role = persona["role"]
        if len(role) > 200:
            raise ValueError(
                "Default roster role exceeds participant role "
                "capacity of 200 characters"
            )
        participants.append(
            ParticipantSnapshot(
                id=id_factory(),
                meeting_id=meeting_id,
                name=persona["name"],
                role=role,
                system_prompt=prompt_composer(persona["system_prompt"]),
                provider_config={},
                color=persona["color"],
                persona_id=None,
                stack_ids=(),
                created_at=created_at,
                generation_policy={},
            )
        )
    return participants
