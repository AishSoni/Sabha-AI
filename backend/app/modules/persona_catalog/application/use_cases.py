"""Application use cases for the persona prompt catalog."""

from app.modules.persona_catalog.application.contracts import PromptCatalogPort
from app.modules.persona_catalog.domain.activations import (
    PromptSelectionActivated,
    PromptSelectionRefused,
)


class ActivatePromptVersion:
    """Flip a persona's active prompt version through the catalog port.

    Refusals (unknown persona or unknown version) come back as the domain
    outcome ``PromptSelectionRefused`` because they are business answers,
    not faults. Infrastructure failures propagate as raised exceptions;
    the presentation layer owns their translation to safe HTTP errors.
    """

    def __init__(self, catalog: PromptCatalogPort) -> None:
        self._catalog = catalog

    async def execute(
        self, persona_id: str, version: int
    ) -> PromptSelectionActivated | PromptSelectionRefused:
        activated = await self._catalog.activate_prompt_version(persona_id, version)
        if activated:
            return PromptSelectionActivated(persona_id=persona_id, version=version)
        return PromptSelectionRefused(persona_id=persona_id, version=version)
