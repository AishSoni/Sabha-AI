"""Request-scoped dependencies for composed module routes.

The composition root owns the adapter instances; a dependency only pairs
the port with its use case per request. Building a client or a service
inside a route/dependency is forbidden by spec-04.
"""

from fastapi import Request

from app.modules.persona_catalog.application.use_cases import ActivatePromptVersion


def activate_prompt_version(request: Request) -> ActivatePromptVersion:
    """Activation use case wired to the container's prompt catalog port."""
    return ActivatePromptVersion(request.app.state.container.prompt_catalog)
