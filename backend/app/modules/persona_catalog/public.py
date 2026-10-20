"""Persona catalog public facade (spec 06).

The module's outward contract: the domain models other modules may
import, the application use cases, and the ports composition wires.
Infrastructure adapters and presentation stay importable but the
facade documents the intended surface — plus the carrier/policy rules
other modules must follow instead of re-implementing them.
"""

from app.modules.persona_catalog.application.commands import (
    CreateTemplateCommand,
    UpdateTemplateCommand,
)
from app.modules.persona_catalog.application.contracts import (
    PersonaCatalogPort,
    PersonaEditConflict,
    PromptCatalogPort,
    PromptCatalogUnavailable,
    TemplateNotFound,
    UnknownStacks,
)
from app.modules.persona_catalog.application.queries import GetCreationSnapshot
from app.modules.persona_catalog.domain.models import (
    CreationSnapshot,
    GenerationPolicy,
    PersonaTemplate,
)

__all__ = [
    "CreateTemplateCommand",
    "UpdateTemplateCommand",
    "PersonaCatalogPort",
    "PersonaEditConflict",
    "PromptCatalogPort",
    "PromptCatalogUnavailable",
    "TemplateNotFound",
    "UnknownStacks",
    "GetCreationSnapshot",
    "CreationSnapshot",
    "GenerationPolicy",
    "PersonaTemplate",
]
