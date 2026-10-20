"""Request-scoped dependencies for composed module routes.

The composition root owns the adapter instances; a dependency only pairs
the port with its use case per request. Building a client or a service
inside a route/dependency is forbidden by spec-04.
"""

from fastapi import Request

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
