"""Meetings public facade (spec 06).

What other modules consume from the meetings module: the participant
snapshot model and its carrier/temperature rules, plus the
construction use case that turns catalog creation snapshots into
participants for a meeting transaction.
"""

from app.modules.meetings.application.construct_participants import (
    ConstructParticipants,
    default_roster_participants,
    generation_policy_for,
)
from app.modules.meetings.domain.models import (
    GENERATION_CARRIER_KEYS,
    ParticipantSnapshot,
    participant_provider_carrier,
    resolve_temperature,
)

__all__ = [
    "ConstructParticipants",
    "default_roster_participants",
    "GENERATION_CARRIER_KEYS",
    "ParticipantSnapshot",
    "generation_policy_for",
    "participant_provider_carrier",
    "resolve_temperature",
]
