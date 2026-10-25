"""Legacy schema package retained for personas.

Meeting contracts now live in the meetings module:
- domain entities/commands: ``app.modules.meetings.domain.models``
- HTTP request/response DTOs: ``app.modules.meetings.presentation.schemas``

Knowledge-stack contracts now live in the knowledge module:
``app.modules.knowledge.presentation.stacks_schemas``.
"""

from app.models.persona_schemas import (
    # Personas
    PersonaBase,
    PersonaCreate,
    PersonaUpdate,
    Persona,
    PersonaWithPrompt,
    # Prompt Versions
    PromptVersionBase,
    PromptVersionCreate,
    PromptVersion,
    PersonaListResponse,
)

__all__ = [
    # Personas
    "PersonaBase",
    "PersonaCreate",
    "PersonaUpdate",
    "Persona",
    "PersonaWithPrompt",
    "PromptVersionBase",
    "PromptVersionCreate",
    "PromptVersion",
    "PersonaListResponse",
]
