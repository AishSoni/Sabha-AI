"""Supabase implementation of the persona catalog port.

The adapter wraps the narrow Postgres RPC functions through the Supabase
client and translates transport and
PostgREST failures into the module's typed exception so presentation can
answer with a safe 503. Business refusals stay boolean values; nothing
here leaks SQL or provider details upward.

The client resolves through an injected provider callable (the
``app.platform.database.get_supabase`` singleton accessor, normally built
once at composition). Regressions patch that accessor per request; the
adapter itself is constructed once in the composition root. Every blocking
``execute()`` goes through the shared data-access pool (spec 20), so a slow
round trip never stalls the event loop.
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
from app.platform.blocking import run_blocking


class SupabasePromptCatalog:
    """``PromptCatalogPort`` over the narrow Supabase RPC functions."""

    def __init__(self, client_provider: Callable[[], Any]) -> None:
        self._client_provider = client_provider

    def _client(self) -> Any:
        return self._client_provider()

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        try:
            result = await run_blocking(
                lambda: self._client()
                .rpc(
                    "activate_prompt_version",
                    {"p_persona_id": persona_id, "p_version": version},
                )
                .execute()
            )
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
            result = await run_blocking(
                lambda: self._client()
                .rpc(
                    "create_prompt_version",
                    {
                        "p_persona_id": persona_id,
                        "p_content": content,
                        "p_version_id": version_id,
                        "p_created_at": created_at,
                    },
                )
                .execute()
            )
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

    async def _reject_unknown_stacks(self, stack_ids: list[str]) -> None:
        """Legacy parity: unknown stack ids fail with the ids named.

        Validation reads before the transaction runs, so the typed
        ``UnknownStacks`` carries the offending ids for the 422 detail.
        """
        if not stack_ids:
            return
        try:
            result = await run_blocking(
                lambda: self._client()
                .table("knowledge_stacks")
                .select("id")
                .in_("id", stack_ids)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
        known = {row["id"] for row in (result.data or [])}
        unknown = [sid for sid in stack_ids if sid not in known]
        if unknown:
            raise UnknownStacks(unknown)

    async def read_creation_snapshot(self, persona_id: str) -> dict | None:
        try:
            result = await run_blocking(
                lambda: self._client()
                .rpc(
                    "read_persona_creation_snapshot",
                    {"p_persona_id": persona_id},
                )
                .execute()
            )
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
        await self._reject_unknown_stacks(stack_ids)
        try:
            result = await run_blocking(
                lambda: self._client()
                .rpc(
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
                )
                .execute()
            )
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
        if fields.get("stack_ids") is not None:
            await self._reject_unknown_stacks(fields["stack_ids"])
        try:
            result = await run_blocking(
                lambda: self._client()
                .rpc(
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
                )
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
        row = result.data
        if not isinstance(row, dict):
            raise PromptCatalogUnavailable(
                "the persona catalog returned an unexpected result shape"
            )
        return row

    async def list_templates(
        self, user_id: str | None = None, include_defaults: bool = True
    ) -> list[dict]:
        """List personas with three fixed round trips (spec 20).

        The list is a read view (not used by participant construction), so it
        does not need the persona lock: rows may reflect concurrent edits
        mid-flight, exactly like the legacy fanout. Prompts and stack
        assignments are fetched for every listed persona in one query each,
        so adding rows never adds round trips.
        """
        try:
            query = self._client().table("personas").select("*")
            if user_id:
                if include_defaults:
                    query = query.or_(f"user_id.eq.{user_id},is_default.eq.true")
                else:
                    query = query.eq("user_id", user_id)
            result = await run_blocking(
                lambda: query.order("created_at", desc=True).execute()
            )

            personas = list(result.data or [])
            if not personas:
                return []
            persona_ids = [persona["id"] for persona in personas]

            prompt_result = await run_blocking(
                lambda: self._client()
                .table("prompt_versions")
                .select("persona_id, content, version")
                .in_("persona_id", persona_ids)
                .eq("is_active", True)
                .execute()
            )
            stack_result = await run_blocking(
                lambda: self._client()
                .table("persona_knowledge_stacks")
                .select("persona_id, stack_id")
                .in_("persona_id", persona_ids)
                .execute()
            )

            prompts: dict[str, dict] = {}
            for prompt in prompt_result.data or []:
                prompts.setdefault(str(prompt["persona_id"]), prompt)
            stacks: dict[str, list[str]] = {}
            for assignment in stack_result.data or []:
                stacks.setdefault(str(assignment["persona_id"]), []).append(
                    assignment["stack_id"]
                )

            rows: list[dict] = []
            for persona in personas:
                persona_id = str(persona["id"])
                prompt = prompts.get(persona_id, {})
                rows.append(
                    {
                        **persona,
                        "active_prompt": prompt.get("content"),
                        "active_prompt_version": prompt.get("version"),
                        "stack_ids": stacks.get(persona_id, []),
                    }
                )
            return rows
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc

    async def list_prompt_versions(self, persona_id: str) -> list[dict]:
        try:
            result = await run_blocking(
                lambda: self._client()
                .table("prompt_versions")
                .select("*")
                .eq("persona_id", persona_id)
                .order("version", desc=True)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
        return list(result.data or [])

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        """Activate a revision (same transport as the prompt catalog)."""
        try:
            result = await run_blocking(
                lambda: self._client()
                .rpc(
                    "activate_prompt_version",
                    {"p_persona_id": persona_id, "p_version": version},
                )
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            raise self._translate(exc) from exc
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
            result = await run_blocking(
                lambda: self._client()
                .rpc(
                    "create_prompt_version",
                    {
                        "p_persona_id": persona_id,
                        "p_content": content,
                        "p_version_id": version_id,
                        "p_created_at": created_at,
                    },
                )
                .execute()
            )
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
            await run_blocking(
                lambda: self._client()
                .table("prompt_versions")
                .delete()
                .eq("persona_id", persona_id)
                .execute()
            )
            result = await run_blocking(
                lambda: self._client()
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
