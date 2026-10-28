"""Request-scoped dependencies for composed module routes.

The composition root owns the adapter instances; a dependency only pairs
the port with its use case per request. Building a client or a service
inside a route/dependency is forbidden by spec-04.
"""

from typing import Any, Callable

from fastapi import HTTPException, Request

from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.infrastructure.turns import TurnQueueService

from app.modules.meetings.application.closing import ClosingService
from app.modules.meetings.application.ports import MeetingReads, TurnObservation
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


def _container(request: Request):
    return request.app.state.container


def _meeting_service_from_container(container):
    """The lifecycle service, falling back to the queue's owned service.

    The durable turn service is constructed around a meeting service, so a
    container that wires only the queue still exposes one live composition.
    """
    service = getattr(container, "meeting_service", None)
    if service is None:
        queue = getattr(container, "turn_queue", None)
        service = getattr(queue, "meeting_manager", None)
    return service


def get_meeting_manager(request: Request) -> MeetingService:
    """The composition root's meeting lifecycle service."""
    service = _meeting_service_from_container(_container(request))
    if service is None:
        raise HTTPException(status_code=503, detail="Meeting service is not configured")
    return service


def get_meeting_reads(request: Request) -> MeetingReads:
    """The read-only meeting projection used by resource reads (spec-14)."""
    container = _container(request)
    reads = getattr(container, "meeting_reads", None)
    if reads is None:
        reads = _meeting_service_from_container(container)
    if reads is None:
        raise HTTPException(status_code=503, detail="Meeting reads are not configured")
    return reads


def get_turn_observation(request: Request) -> TurnObservation:
    """The observation port used by turn status/list/event reads (spec-14)."""
    container = _container(request)
    observation = getattr(container, "turn_observation", None)
    if observation is None:
        observation = getattr(container, "turn_queue", None)
    if observation is None:
        raise HTTPException(
            status_code=503, detail="Turn observation is not configured"
        )
    return observation


def get_knowledge_lifecycle(request: Request):
    """The composition root's knowledge lifecycle adapter (spec-14)."""
    container = _container(request)
    lifecycle = getattr(container, "knowledge_lifecycle", None)
    if lifecycle is None:
        factory = getattr(container, "knowledge_lifecycle_factory", None)
        if factory is not None:
            lifecycle = factory()
    if lifecycle is None:
        raise HTTPException(status_code=503, detail="Knowledge is not configured")
    return lifecycle


def get_knowledge_db(request: Request):
    """The composition root's live knowledge persistence client."""
    container = _container(request)
    factory = getattr(container, "knowledge_db_factory", None)
    if factory is None:
        raise HTTPException(status_code=503, detail="Knowledge is not configured")
    return factory()


def get_system_ai_reader(request: Request):
    """The composition root's System AI read port (spec-14)."""
    reader = getattr(_container(request), "system_ai_reader", None)
    if reader is None:
        raise HTTPException(status_code=503, detail="Settings are not configured")
    return reader


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
