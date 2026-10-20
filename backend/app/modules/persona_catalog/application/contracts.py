"""Persona catalog application contracts.

The port mirrors the atomic persistence surface the first composed route
(prompt activation) needs. Adapter implementations live in the module's
infrastructure package; the use case only ever sees this Protocol, so
fakes can stand in for Supabase and SDK isolation stays provable.
"""

from typing import Protocol


class PromptCatalogUnavailable(RuntimeError):
    """The catalog's persistence layer failed (transport/provider error).

    Infrastructure adapters raise this when the RPC call itself fails —
    business refusals travel as outcome values, never as this exception.
    Presentation translates it to a safe 503 without SQL/provider detail.
    """


class TemplateNotFound(LookupError):
    """A template write referenced a persona id that does not exist."""


class PersonaEditConflict(RuntimeError):
    """A guarded update lost the optimistic-concurrency race.

    The previous state was preserved; the caller must re-read and
    re-apply its edit. Presentation answers 409, never 503.
    """


class UnknownStacks(ValueError):
    """A creation/replacement referenced stack ids that do not exist."""

    def __init__(self, unknown: list[str]) -> None:
        self.unknown = [str(sid) for sid in unknown]
        super().__init__(
            "unknown_knowledge_stacks: "
            + ", ".join(self.unknown)
        )


class PromptCatalogPort(Protocol):
    """Persistence seam for prompt selection changes."""

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        """Activate one version atomically.

        ``False`` refusals mean unknown persona or unknown version; the
        previously active selection is preserved in both cases.
        """

    async def create_prompt_version(
        self,
        persona_id: str,
        content: str,
        *,
        version_id: str,
        created_at: str,
    ) -> dict:
        """Append a new version and make it active atomically.

        Returns the persisted row mapping (at least ``version`` and
        ``is_active``). Unknown personas and constraint violations raise —
        including on ``content=None`` — and persist nothing.
        """


class PersonaCatalogPort(Protocol):
    """Persistence seam for template CRUD and creation snapshots.

    The snapshot call is the one participant construction (Meetings
    module) consumes: a coherent single-call view of template, active
    prompt and assignments, taken under the persona lock.

    Refusals from business rules travel as the typed exceptions above
    (``TemplateNotFound``, ``PersonaEditConflict``, ``UnknownStacks``);
    transport and shape failures raise ``PromptCatalogUnavailable``.
    """

    async def read_creation_snapshot(self, persona_id: str) -> dict | None:
        """Return the coherent template snapshot row, or None if unknown."""

    async def list_templates(
        self, user_id: str | None = None, include_defaults: bool = True
    ) -> list[dict]:
        """Return template rows (flat, with stack_ids/active_prompt keys).

        ``include_defaults`` widens the user filter with system-default
        templates, exactly like the legacy list view.
        """

    async def list_prompt_versions(self, persona_id: str) -> list[dict]:
        """Return the template's prompt history, newest version first."""

    async def create_prompt_version(
        self,
        persona_id: str,
        content: str,
        *,
        version_id: str,
        created_at: str,
    ) -> dict:
        """Append a revision and activate it atomically; return the row.

        Unknown templates raise ``TemplateNotFound``; constraint
        violations and transport failures follow the same rules as the
        prompt catalog port.
        """

    async def create_persona(
        self,
        persona_id: str,
        name: str,
        *,
        subtitle: str | None,
        color: str | None,
        avatar_url: str | None,
        provider_config: dict,
        is_default: bool,
        user_id: str | None,
        system_prompt: str | None,
        prompt_id: str,
        created_at: str,
        stack_ids: list[str],
    ) -> dict:
        """Create template + prompt + assignments atomically; return the row."""

    async def update_persona(
        self,
        persona_id: str,
        fields: dict,
        expected_updated_at: str | None,
        updated_at: str,
    ) -> dict:
        """Apply a guarded metadata/assignment update; return the row.

        ``fields`` maps to "leave unchanged" when a value is None; a
        ``stack_ids`` list replaces assignments, an absent key keeps
        them. Non-None ``expected_updated_at`` arms the CAS check.
        """

    async def delete_persona(self, persona_id: str) -> bool:
        """Delete the template (history dies with it); False if unknown."""
