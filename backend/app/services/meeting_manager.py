"""Compatibility facade for the Meetings application service.

The real service moved to ``app.modules.meetings.application.meeting_service``.
This facade keeps the legacy ``get_supabase`` import in this module's
namespace so existing tests and still-unmigrated callers can keep patching
``app.services.meeting_manager.get_supabase``. It is deleted at A15.
"""

from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.supabase_meetings import (
    build_meeting_service,
)
from app.platform.database import get_supabase


class MeetingManager(MeetingService):
    """Legacy name for ``MeetingService`` wired to the platform client."""

    def __init__(self):
        built = build_meeting_service(get_supabase())
        super().__init__(
            built.db,
            built._snapshot_template,
            built._construct_participants,
        )
