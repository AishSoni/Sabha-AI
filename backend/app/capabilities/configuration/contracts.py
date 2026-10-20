"""Configuration capability contracts.

Pure-Python value contracts only: importable by domain/application code
without dragging infrastructure or SDK clients along.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal


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


@dataclass(frozen=True)
class GenerationDefaults:
    """The server's current generation fallbacks.

    Inherited fields resolve against these AT EXECUTION START (per turn);
    defaults changing between enqueue and execution therefore move running
    reads forward only for turns that have not started yet.
    """

    provider: str
    model: str
    temperature: float
    max_tokens: int


class IncompatibleGenerationPlan(ValueError):
    """The resolved generation plan cannot be driven: either the provider
    name points at no runtime transport or the requested model sits outside
    that provider's catalog.

    Spec 06 requires provider to resolve before compatible model/parameters
    and invalid combinations to fail visibly instead of silently calling
    another (paid) provider.
    """


CredentialReference = Literal["none", "server", "browser"]


@dataclass(frozen=True)
class EffectiveGenerationSettings:
    """One frozen effective configuration for one operation.

    Settings are captured once at execution start and stay fixed for the
    whole tool loop; the next turn resolves a fresh record (and picks up a
    defaults revision for inherited fields). No secret ever lands here —
    ``credential_reference`` names the source NONE/SERVER/BROWSER so the
    persistence layer (spec-07 claim time) can audit provenance without
    credential bytes.
    """

    provider: str
    model: str
    temperature: float
    max_tokens: int
    base_url: str | None
    credential_reference: str = "none"
    provenance: Mapping[str, str] = field(default_factory=dict)

    def as_gen_dict(self) -> dict:
        """The inference-time shape: the keys the provider factory drives."""
        return {
            "provider": self.provider,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "base_url": self.base_url,
        }

    def as_record(self) -> dict:
        """What persistence records on the turn (messages.effective_generation).

        Provenance maps field -> source: request | policy | legacy_snapshot |
        defaults. Credential bytes are structurally absent.
        """
        return {
            **self.as_gen_dict(),
            "credential_reference": self.credential_reference,
            "provenance": dict(self.provenance),
        }
