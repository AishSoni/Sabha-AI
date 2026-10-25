"""Request-scoped dependencies for composed module routes.

The composition root owns the adapter instances; a dependency only pairs
the port with its use case per request. Building a client or a service
inside a route/dependency is forbidden by spec-04.
"""

from fastapi import HTTPException, Request

from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.supabase_meetings import (
    build_default_meeting_service,
)
from app.modules.meetings.infrastructure.turns import TurnQueueService

from app.modules.meetings.application.closing import ClosingService
from app.modules.persona_catalog.application.use_cases import (
    ActivatePromptVersion,
    CreatePromptVersion,
    CreateTemplate,
    DeleteTemplate,
    ListPromptVersions,
    ListTemplates,
    ReadTemplate,
    UpdateTemplate,
)


def get_meeting_manager() -> MeetingService:
    """The meeting lifecycle service for the module-owned routes."""
    return build_default_meeting_service()


def get_turn_queue(request: Request) -> TurnQueueService:
    """The composition root's durable turn service (spec-07)."""
    service = getattr(request.app.state.container, "turn_queue", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Turn queue is not configured")
    return service


def get_closing(request: Request) -> ClosingService:
    """The composition root's coordinated closing service (spec-08)."""
    service = getattr(request.app.state.container, "closing", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Closing is not configured")
    return service


def activate_prompt_version(request: Request) -> ActivatePromptVersion:
    """Activation use case wired to the container's prompt catalog port."""
    return ActivatePromptVersion(request.app.state.container.prompt_catalog)


def _persona_catalog(request: Request):
    """The container's persona catalog port (None = not wired)."""
    catalog = request.app.state.container.persona_catalog
    if catalog is None:
        raise RuntimeError(
            "The composition root did not configure a persona catalog port"
        )
    return catalog


def read_template(request: Request) -> ReadTemplate:
    return ReadTemplate(_persona_catalog(request))


def list_templates(request: Request) -> ListTemplates:
    return ListTemplates(_persona_catalog(request))


def create_template(
    request: Request,
) -> CreateTemplate:
    return CreateTemplate(_persona_catalog(request))


def update_template(request: Request) -> UpdateTemplate:
    return UpdateTemplate(_persona_catalog(request))


def delete_template(request: Request) -> DeleteTemplate:
    return DeleteTemplate(_persona_catalog(request))


def list_prompt_versions(request: Request) -> ListPromptVersions:
    return ListPromptVersions(_persona_catalog(request))


def create_prompt_revision(request: Request) -> CreatePromptVersion:
    return CreatePromptVersion(_persona_catalog(request))
