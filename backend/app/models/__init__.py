"""Legacy schema package retained for personas and knowledge stacks.

Meeting contracts now live in the meetings module:
- domain entities/commands: ``app.modules.meetings.domain.models``
- HTTP request/response DTOs: ``app.modules.meetings.presentation.schemas``
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

from app.models.knowledge_stacks_schemas import (
    KnowledgeStackBase,
    KnowledgeStackCreate,
    KnowledgeStackUpdate,
    KnowledgeStack,
    KnowledgeStackListResponse,
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
    # Knowledge Stacks
    "KnowledgeStackBase",
    "KnowledgeStackCreate",
    "KnowledgeStackUpdate",
    "KnowledgeStack",
    "KnowledgeStackListResponse",
]
