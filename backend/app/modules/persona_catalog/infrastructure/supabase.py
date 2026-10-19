"""Supabase implementation of the persona catalog port.

The adapter wraps the narrow Postgres RPC functions through the Supabase
client — the same seam PersonaManager uses — and translates transport and
PostgREST failures into the module's typed exception so presentation can
answer with a safe 503. Business refusals stay boolean values; nothing
here leaks SQL or provider details upward.

The client resolves through an injected provider callable (the
``app.core.database.get_supabase`` singleton accessor, normally built
once at composition). Regressions patch that accessor per request; the
adapter itself is constructed once in the composition root. The sync
``execute()`` call mirrors the legacy ``PersonaManager`` call chain
(compatibility over purity for this slice).
"""

from typing import Any, Callable

import httpx
from postgrest.exceptions import APIError

from app.modules.persona_catalog.application.contracts import PromptCatalogUnavailable


class SupabasePromptCatalog:
    """``PromptCatalogPort`` over the narrow Supabase RPC functions."""

    def __init__(self, client_provider: Callable[[], Any]) -> None:
        self._client_provider = client_provider

    def _client(self) -> Any:
        return self._client_provider()

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        try:
            result = self._client().rpc(
                "activate_prompt_version",
                {"p_persona_id": persona_id, "p_version": version},
            ).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise PromptCatalogUnavailable(
                "prompt catalog persistence failed"
            ) from exc
        return bool(result.data)

    async def create_prompt_version(
        self,
        persona_id: str,
        content: str,
        *,
        version_id: str,
        created_at: str,
    ) -> dict:
        try:
            result = self._client().rpc(
                "create_prompt_version",
                {
                    "p_persona_id": persona_id,
                    "p_content": content,
                    "p_version_id": version_id,
                    "p_created_at": created_at,
                },
            ).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise PromptCatalogUnavailable(
                "prompt catalog persistence failed"
            ) from exc
        row = result.data
        if not isinstance(row, dict):
            raise PromptCatalogUnavailable(
                "prompt catalog returned an unexpected result shape"
            )
        return row
