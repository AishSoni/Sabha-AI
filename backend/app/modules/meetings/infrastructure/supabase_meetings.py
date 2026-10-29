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
from app.platform.database import get_supabase


def build_meeting_service(
    db, *, service_factory=MeetingService, run_blocking=None
) -> MeetingService:
    """Build a ``MeetingService`` over one database client."""
    snapshots = GetCreationSnapshot(SupabasePersonaCatalog(lambda: db))
    construct = ConstructParticipants(snapshots, prompt_composer=get_full_prompt)
    return service_factory(db, snapshots, construct, run_blocking=run_blocking)


def build_default_meeting_service() -> MeetingService:
    """Build the process-wide service over the platform's Supabase client.

    ``get_supabase`` stays in this module's namespace so deployment tests can
    replace it with a disposable-database stub without reaching into routes.
    """
    return build_meeting_service(get_supabase())
