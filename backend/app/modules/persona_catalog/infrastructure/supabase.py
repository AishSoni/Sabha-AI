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

from app.modules.persona_catalog.application.contracts import (
    PersonaEditConflict,
    PromptCatalogUnavailable,
    TemplateNotFound,
    UnknownStacks,
)


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


class SupabasePersonaCatalog:
    """``PersonaCatalogPort`` over the transactional persona RPC surface.

    Same transport as the prompt catalog (narrow RPC functions through
    the injected Supabase client). Template deletes ride the legacy
    table operations with prompt history removed first. Business
    refusals typed in the application contracts are decoded from the
    database's refusal markers; everything else collapses into the
    module's unavailability exception so no SQL detail escapes.
    """

    def __init__(self, client_provider: Callable[[], Any]) -> None:
        self._client_provider = client_provider

    def _client(self) -> Any:
        return self._client_provider()

    async def read_creation_snapshot(self, persona_id: str) -> dict | None:
        try:
            result = self._client().rpc(
                "read_persona_creation_snapshot",
                {"p_persona_id": persona_id},
            ).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise PromptCatalogUnavailable("the persona catalog failed to persist; retry later") from exc
        data = result.data
        if data is None:
            return None
        if not isinstance(data, dict):
            raise PromptCatalogUnavailable(
                "the persona catalog returned an unexpected result shape"
            )
        return data

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
        try:
            result = self._client().rpc(
                "create_persona_transaction",
                {
                    "p_persona_id": persona_id,
                    "p_name": name,
                    "p_subtitle": subtitle,
                    "p_color": color,
                    "p_avatar_url": avatar_url,
                    "p_provider_config": provider_config,
                    "p_is_default": is_default,
                    "p_user_id": user_id,
                    "p_prompt_id": prompt_id,
                    "p_system_prompt": system_prompt,
                    "p_created_at": created_at,
                    "p_stack_ids": stack_ids,
                },
            ).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
        row = result.data
        if not isinstance(row, dict):
            raise PromptCatalogUnavailable(
                "the persona catalog returned an unexpected result shape"
            )
        return row

    async def update_persona(
        self,
        persona_id: str,
        fields: dict,
        expected_updated_at: str | None,
        updated_at: str,
    ) -> dict:
        try:
            result = self._client().rpc(
                "update_persona_transaction",
                {
                    "p_persona_id": persona_id,
                    "p_name": fields.get("name"),
                    "p_subtitle": fields.get("subtitle"),
                    "p_color": fields.get("color"),
                    "p_avatar_url": fields.get("avatar_url"),
                    "p_provider_config": fields.get("provider_config"),
                    "p_stack_ids": fields.get("stack_ids"),
                    "p_expected_updated_at": expected_updated_at,
                    "p_updated_at": updated_at,
                },
            ).execute()
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
        row = result.data
        if not isinstance(row, dict):
            raise PromptCatalogUnavailable(
                "the persona catalog returned an unexpected result shape"
            )
        return row

    async def delete_persona(self, persona_id: str) -> bool:
        try:
            self._client().table("prompt_versions").delete().eq(
                "persona_id", persona_id
            ).execute()
            result = (
                self._client()
                .table("personas")
                .delete()
                .eq("id", persona_id)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise PromptCatalogUnavailable("the persona catalog failed to persist; retry later") from exc
        return len(result.data or []) > 0

    @staticmethod
    def _translate(exc: BaseException) -> BaseException:
        """Decode refusal markers; the rest stays a persistence failure."""
        text = str(exc)
        message = getattr(exc, "message", "") or ""
        combined = f"{message} {text}"
        if "persona_edit_conflict" in combined:
            return PersonaEditConflict(
                "the template changed while you were editing; reload and retry"
            )
        if "persona_not_found" in combined:
            return TemplateNotFound("persona template not found")
        if "unknown_knowledge_stacks" in combined:
            return UnknownStacks([])
        return PromptCatalogUnavailable("the persona catalog failed to persist; retry later")
