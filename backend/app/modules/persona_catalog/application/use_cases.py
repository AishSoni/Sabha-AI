"""Application use cases for the persona prompt catalog."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

from app.modules.persona_catalog.application.commands import (
    CreateTemplateCommand,
    UpdateTemplateCommand,
)
from app.modules.persona_catalog.application.contracts import PersonaCatalogPort, PromptCatalogPort
from app.modules.persona_catalog.domain.activations import (
    PromptSelectionActivated,
    PromptSelectionRefused,
)
from app.modules.persona_catalog.domain.models import CreationSnapshot
from app.modules.persona_catalog.domain.services import validate_template_request


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid_str() -> str:
    return str(uuid.uuid4())


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


class ReadTemplate:
    """Read one template as its coherent snapshot row (prompt included)."""

    def __init__(self, catalog: PersonaCatalogPort) -> None:
        self._catalog = catalog

    async def execute(self, persona_id: str) -> Optional[dict]:
        return await self._catalog.read_creation_snapshot(persona_id)


class ListTemplates:
    """List templates through the port (same filter semantics as legacy)."""

    def __init__(self, catalog: PersonaCatalogPort) -> None:
        self._catalog = catalog

    async def execute(
        self, user_id: Optional[str] = None, include_defaults: bool = True
    ) -> list[dict]:
        return await self._catalog.list_templates(user_id, include_defaults)


class CreateTemplate:
    """Create a template (+initial prompt) through the transaction.

    Domain validation happens here (not in the route), ids and
    timestamps are generated at the application boundary and the port
    performs the atomic persistence.
    """

    def __init__(
        self,
        catalog: PersonaCatalogPort,
        *,
        id_factory: Callable[[], str] = _uuid_str,
        clock: Callable[[], str] = _now_iso,
    ) -> None:
        self._catalog = catalog
        self._id_factory = id_factory
        self._clock = clock

    async def execute(self, command: CreateTemplateCommand) -> dict:
        stack_ids = validate_template_request(
            name=command.name,
            subtitle=command.subtitle,
            color=command.color,
            stack_ids=command.stack_ids,
        )
        created_at = self._clock()
        persona_id = self._id_factory()
        return await self._catalog.create_persona(
            persona_id,
            command.name,
            subtitle=command.subtitle,
            color=command.color,
            avatar_url=command.avatar_url,
            provider_config=command.provider_config,
            is_default=command.is_default,
            user_id=command.user_id,
            system_prompt=command.system_prompt or None,
            prompt_id=self._id_factory(),
            created_at=created_at,
            stack_ids=stack_ids,
        )


class UpdateTemplate:
    """Guarded partial update with a fresh timestamp."""

    def __init__(
        self,
        catalog: PersonaCatalogPort,
        *,
        clock: Callable[[], str] = _now_iso,
    ) -> None:
        self._catalog = catalog
        self._clock = clock

    async def execute(self, persona_id: str, command: UpdateTemplateCommand) -> dict:
        return await self._catalog.update_persona(
            persona_id,
            {
                "name": command.name,
                "subtitle": command.subtitle,
                "color": command.color,
                "avatar_url": command.avatar_url,
                "provider_config": command.provider_config,
                "stack_ids": command.stack_ids,
            },
            expected_updated_at=None,
            updated_at=self._clock(),
        )


class DeleteTemplate:
    """Remove a template and its prompt history; False when unknown."""

    def __init__(self, catalog: PersonaCatalogPort) -> None:
        self._catalog = catalog

    async def execute(self, persona_id: str) -> bool:
        return await self._catalog.delete_persona(persona_id)


class ListPromptVersions:
    """Prompt history read through the catalog port."""

    def __init__(self, catalog: PersonaCatalogPort) -> None:
        self._catalog = catalog

    async def execute(self, persona_id: str) -> list[dict]:
        return await self._catalog.list_prompt_versions(persona_id)


class CreatePromptVersion:
    """Append a revision and activate it through the catalog port."""

    def __init__(
        self,
        catalog: PersonaCatalogPort,
        *,
        id_factory: Callable[[], str] = _uuid_str,
        clock: Callable[[], str] = _now_iso,
    ) -> None:
        self._catalog = catalog
        self._id_factory = id_factory
        self._clock = clock

    async def execute(self, persona_id: str, content: str) -> dict:
        return await self._catalog.create_prompt_version(
            persona_id,
            content,
            version_id=self._id_factory(),
            created_at=self._clock(),
        )
