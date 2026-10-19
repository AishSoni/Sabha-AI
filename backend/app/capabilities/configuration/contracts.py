"""Configuration capability contracts.

Pure-Python value contracts only: importable by domain/application code
without dragging infrastructure or SDK clients along.
"""

from dataclasses import dataclass


class MissingProviderKeyError(ValueError):
    """A cloud-provider turn carries no browser key (BYOK) and the server has
    no configured key either — the turn cannot authenticate, so fail loudly
    instead of silently proceeding."""


@dataclass(frozen=True)
class ProviderSnapshotDefaults:
    """Fallback when a participant carries no provider_config snapshot
    (value parity with the persisted ProviderConfig DTO defaults)."""

    provider: str = ""
    model: str = ""
    temperature: float = 0.7
    max_tokens: int = 2048


@dataclass(frozen=True)
class RequestDefaults:
    """Fallback when a turn carries no per-request provider settings
    (value parity with the RequestProviderSettings DTO: every field unset)."""

    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    base_url: str | None = None
