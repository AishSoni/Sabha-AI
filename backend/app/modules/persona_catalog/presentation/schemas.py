"""Persona module HTTP schemas (spec 06).

Template generation settings arrive per-field nullable: an explicit
value records an override (including temperature 0.0), a JSON ``null``
(or the legacy empty-string provider/model marker) records "inherit".
An omitted ``provider_config`` on create means "all inherit" (the
carrier stores ``{}``, not the legacy concrete defaults); an omitted
``provider_config`` on update means "no change", so clearing to inherit
is an explicit object with null fields.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from app.modules.persona_catalog.application.commands import CreateTemplateCommand


def _explicit(value: Any, inherit_markers: tuple = (None, "")) -> Any:
    """Collapse legacy inherit markers (empty string/None) to JSON null."""
    return None if value in inherit_markers else value


class TemplateGenerationSettings(BaseModel):
    """Per-field generation carrier view (None = inherit)."""

    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

    @classmethod
    def from_carrier(cls, carrier: Optional[dict]) -> "TemplateGenerationSettings":
        cfg = carrier or {}
        return cls(
            provider=_explicit(cfg.get("provider")),
            model=_explicit(cfg.get("model")),
            temperature=_explicit(cfg.get("temperature")),
            max_tokens=_explicit(cfg.get("max_tokens")),
        )

    def to_storage(self) -> dict:
        """Recorded carrier: explicit nulls for inherit, values verbatim."""
        return {
            "provider": self.provider,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }


class TemplateBase(BaseModel):
    """Template identity/metadata fields."""

    name: str
    subtitle: Optional[str] = None
    color: str = "#6366f1"
    avatar_url: Optional[str] = None
    provider_config: Optional[TemplateGenerationSettings] = None
    is_default: bool = False
    stack_ids: list[str] = Field(default_factory=list)


class TemplateCreate(TemplateBase):
    """Creation payload; omitted provider_config means all-inherit."""

    system_prompt: str = ""
    user_id: Optional[str] = None


class TemplateUpdate(BaseModel):
    """Partial template edit; None fields mean "leave unchanged".

    ``provider_config`` follows the module carrier rule: omitted/null
    keeps the recorded carrier, an object (even all-null) replaces it.
    """

    name: Optional[str] = None
    subtitle: Optional[str] = None
    color: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_config: Optional[TemplateGenerationSettings] = None
    stack_ids: Optional[list[str]] = None


class TemplateView(BaseModel):
    """One template as the roster/history editor consumes it."""

    id: str
    name: str
    subtitle: Optional[str] = None
    color: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_config: TemplateGenerationSettings
    is_default: bool = False
    user_id: Optional[str] = None
    created_at: Any = None
    updated_at: Any = None
    stack_ids: list[str] = Field(default_factory=list)
    active_prompt: Optional[str] = None
    active_prompt_version: Optional[int] = None


class PromptRevisionInput(BaseModel):
    """New prompt revision payload."""

    content: str


class PromptVersionView(BaseModel):
    """One prompt history row."""

    id: str
    persona_id: str
    version: int
    content: str
    is_active: bool = True
    created_at: Any = None


def template_view(row: dict) -> TemplateView:
    """Map a flat catalog row (snapshot or list fanout) to the view."""
    return TemplateView(
        id=row["id"],
        name=row["name"],
        subtitle=row.get("subtitle"),
        color=row.get("color"),
        avatar_url=row.get("avatar_url"),
        provider_config=TemplateGenerationSettings.from_carrier(
            row.get("provider_config")
        ),
        is_default=bool(row.get("is_default", False)),
        user_id=row.get("user_id"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        stack_ids=[str(sid) for sid in row.get("stack_ids") or []],
        active_prompt=row.get("active_prompt"),
        active_prompt_version=row.get("active_prompt_version"),
    )


def prompt_version_view(row: dict) -> PromptVersionView:
    return PromptVersionView(
        id=row["id"],
        persona_id=row["persona_id"],
        version=row["version"],
        content=row["content"],
        is_active=bool(row.get("is_active", True)),
        created_at=row.get("created_at"),
    )


def create_request_to_command(payload: TemplateCreate) -> CreateTemplateCommand:
    """HTTP creation payload -> application command.

    ``provider_config`` omitted stores an all-inherit carrier (``{}``)
    instead of the legacy concrete column defaults; sent settings are
    recorded verbatim (nulls included).
    """
    settings = payload.provider_config
    return CreateTemplateCommand(
        name=payload.name,
        subtitle=payload.subtitle,
        color=payload.color,
        avatar_url=payload.avatar_url,
        provider_config=settings.to_storage() if settings is not None else {},
        is_default=payload.is_default,
        user_id=payload.user_id,
        system_prompt=payload.system_prompt,
        stack_ids=list(payload.stack_ids),
    )


def update_request_to_fields(payload: TemplateUpdate) -> dict:
    """HTTP update payload -> port fields dict (omitted keeps state)."""
    fields: dict = {}
    if payload.name is not None:
        fields["name"] = payload.name
    if payload.subtitle is not None:
        fields["subtitle"] = payload.subtitle
    if payload.color is not None:
        fields["color"] = payload.color
    if payload.avatar_url is not None:
        fields["avatar_url"] = payload.avatar_url
    if payload.provider_config is not None:
        fields["provider_config"] = payload.provider_config.to_storage()
    if payload.stack_ids is not None:
        fields["stack_ids"] = list(payload.stack_ids)
    return fields
