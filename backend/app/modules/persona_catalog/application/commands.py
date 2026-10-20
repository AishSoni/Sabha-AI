"""Persona catalog application commands (spec 06).

Plain dataclasses the presentation layer fills in; infrastructure
adapters translate them into the transactional RPC parameters.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class CreateTemplateCommand:
    """Everything a template creation transaction persists at once.

    ``provider_config`` is the raw JSONB carrier as delivered (legacy
    concrete values or per-field-null inherit markers); the policy
    mapping to explicit-vs-inherit happens in the domain layer, never
    here.
    """

    name: str
    subtitle: Optional[str] = None
    color: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_config: dict = field(default_factory=dict)
    is_default: bool = False
    user_id: Optional[str] = None
    system_prompt: Optional[str] = None
    stack_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class UpdateTemplateCommand:
    """A partial template edit; None fields mean "leave unchanged"."""
    # sentinel-free: every field is Optional and None == "no change".

    name: Optional[str] = None
    subtitle: Optional[str] = None
    color: Optional[str] = None
    avatar_url: Optional[str] = None
    provider_config: Optional[dict] = None
    stack_ids: Optional[list[str]] = None
