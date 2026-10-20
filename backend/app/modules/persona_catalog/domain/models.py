"""Persona catalog domain models (spec 06).

GenerationPolicy is the artifact the whole spec turns on: template and
participant generation settings become explicit-vs-inherit per field
instead of a frozen snapshot that silently pins server defaults.

Template carrier mapping (personas.provider_config JSONB), agreed for
spec 06:
- ``""`` provider/model and JSON ``null`` fields mean "inherit" (the
  pre-existing "Empty = use default" convention, formalized).
- Recorded numeric temperature/max_tokens are explicit recorded values
  (a default-seeded marker is not silently reinterpreted as inheritance;
  the only documented inherit markers are ``""`` and ``null``).
- A participant created from a template copies ONLY its explicit
  fields; legacy participant rows keep their provider_config verbatim
  and get no policy content at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping, Optional


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


@dataclass(frozen=True)
class GenerationPolicy:
    """Field-level explicit-vs-inherit generation settings.

    ``None`` means the field is inherited (resolved from server defaults
    at each turn's execution start); a recorded value is an explicit
    override, including a zero temperature. Nothing here ever resolves a
    default into the overrides at construction time.
    """

    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    temperature_override: Optional[float] = None
    max_tokens_override: Optional[int] = None

    @classmethod
    def from_template_config(
        cls, config: Mapping[str, Any] | None
    ) -> "GenerationPolicy":
        """Map a template's provider_config JSONB into the policy fields.

        Missing keys, ``""`` provider/model and JSON ``null`` values all
        map to inherit (``None``); recorded numbers map to explicit
        overrides.
        """
        carrier = config or {}
        temperature = carrier.get("temperature")
        max_tokens = carrier.get("max_tokens")
        provider = carrier.get("provider")
        model = carrier.get("model")
        return cls(
            provider_override=provider or None,
            model_override=model or None,
            temperature_override=None if temperature is None else float(temperature),
            max_tokens_override=None if max_tokens is None else int(max_tokens),
        )

    def to_storage(self) -> dict:
        """Explicit-only storage payload for ``ai_participants.generation_policy``.

        Inherited fields are ABSENT from the mapping (absence = inherit);
        stored rows stay additive and self-describing. Never called with
        inferable defaults — only explicit overrides reach storage.
        """
        stored: dict = {}
        if self.provider_override is not None:
            stored["provider"] = self.provider_override
        if self.model_override is not None:
            stored["model"] = self.model_override
        if self.temperature_override is not None:
            stored["temperature"] = self.temperature_override
        if self.max_tokens_override is not None:
            stored["max_tokens"] = self.max_tokens_override
        return stored


@dataclass(frozen=True)
class PersonaTemplate:
    """A persona template row (no prompt/stack/fixture extras)."""

    id: str
    name: str
    subtitle: Optional[str]
    color: Optional[str]
    avatar_url: Optional[str]
    provider_config: dict
    is_default: bool
    user_id: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "PersonaTemplate":
        return cls(
            id=str(row["id"]),
            name=row.get("name", ""),
            subtitle=row.get("subtitle"),
            color=row.get("color"),
            avatar_url=row.get("avatar_url"),
            provider_config=dict(row.get("provider_config") or {}),
            is_default=bool(row.get("is_default") or False),
            user_id=row.get("user_id"),
            created_at=_iso(row.get("created_at")),
            updated_at=_iso(row.get("updated_at")),
        )


@dataclass(frozen=True)
class CreationSnapshot:
    """The coherent participant-creation view of one template.

    Read atomically under the persona lock: the template row, the active
    prompt selection and the ordered stack assignment ids capture ONE
    state, so a concurrent editor or prompt flip cannot tear a meeting's
    participant construction.
    """

    template: PersonaTemplate
    stack_ids: tuple[str, ...]
    active_prompt: Optional[str]
    active_prompt_version: Optional[int]

    @classmethod
    def from_rpc_row(cls, row: Mapping[str, Any]) -> "CreationSnapshot":
        if "template" in row and isinstance(row["template"], Mapping):
            template = PersonaTemplate.from_row(row["template"])
        else:
            template = PersonaTemplate.from_row(row)
        return cls(
            template=template,
            stack_ids=tuple(str(sid) for sid in row.get("stack_ids") or ()),
            active_prompt=row.get("active_prompt"),
            active_prompt_version=(
                int(row["active_prompt_version"])
                if row.get("active_prompt_version") is not None
                else None
            ),
        )
