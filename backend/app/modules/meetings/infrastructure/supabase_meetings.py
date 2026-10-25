"""Composition helpers for the Meetings module's Supabase adapter.

The application service only needs a database client and the persona
catalog's creation-snapshot use case. This module is the one place that
knows how those are built from the platform and persona-catalog
infrastructure.
"""

from __future__ import annotations

from app.modules.meetings.application.construct_participants import (
    ConstructParticipants,
)
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.application.prompts import get_full_prompt
from app.modules.persona_catalog.infrastructure.supabase import (
    SupabasePersonaCatalog,
)
from app.modules.persona_catalog.public import GetCreationSnapshot


def build_meeting_service(db, *, service_factory=MeetingService) -> MeetingService:
    """Build a ``MeetingService`` over one database client."""
    snapshots = GetCreationSnapshot(SupabasePersonaCatalog(lambda: db))
    construct = ConstructParticipants(snapshots, prompt_composer=get_full_prompt)
    return service_factory(db, snapshots, construct)
