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
