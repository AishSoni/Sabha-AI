"""Configuration capability ports.

The capability defaults to the settings-backed adapters in
``infrastructure-side helpers`` living in the same package (service.py);
orchestrator wiring replaces them with explicit instances so tests can
control both the server defaults and the provider catalog without the
environment.
"""

from typing import Protocol

from app.capabilities.configuration.contracts import GenerationDefaults


class GenerationDefaultsSource(Protocol):
    """Server fallbacks for a participant's inherited fields.

    Queried once per resolution — a queued turn that enqueued under old
    defaults resolves the new revision at its own execution start.
    """

    def current(self) -> GenerationDefaults: ...


class ProviderCatalogPort(Protocol):
    """Which providers the runtime can drive, and with which models.

    Provider resolution (spec 06) must fail visibly for an unsupported
    provider BEFORE model/parameter checks and before any transport is
    constructed.
    """

    def supported(self, provider: str) -> bool: ...

    def model_supported(self, provider: str, model: str | None) -> bool: ...
