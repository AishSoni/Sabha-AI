"""Build read-only capability diagnostics without probing dependencies.

Spec 38 requires settings to show why a capability is missing or unverified
without turning a configuration read into a network probe. This module only
inspects deployment configuration and the System AI policy; it never returns a
credential or a server-owned URL.
"""

from __future__ import annotations

from app.modules.settings.infrastructure.system_ai import SystemAIPolicy
from app.modules.settings.presentation.schemas import (
    DEFAULT_PROVIDERS,
    EmbeddingDiagnostic,
    ExecutionDiagnostic,
    KnowledgeDiagnostic,
    ProviderDiagnostic,
    SettingsDiagnosticsResponse,
    SystemAIStatus,
)
from app.platform.config import settings

_EMBEDDING_CREDENTIALS = {
    "gemini": lambda: bool((settings.gemini_api_key or "").strip()),
    "openai": lambda: bool((settings.openai_api_key or "").strip()),
    "cohere": lambda: bool((settings.cohere_api_key or "").strip()),
    "ollama": lambda: False,
}

_PROVIDER_CREDENTIALS = {
    "openrouter": lambda: bool((settings.openrouter_api_key or "").strip()),
    "gemini": lambda: bool((settings.gemini_api_key or "").strip()),
    "ollama": lambda: False,
}

_SYSTEM_AI_STATES = {
    "stored": "available",
    "environment": "missing",
    "fallback": "failed",
}


def system_ai_status_from_policy(policy: SystemAIPolicy) -> SystemAIStatus:
    """Translate policy provenance into the public, safe status."""
    return SystemAIStatus(
        source=policy.source,
        state=_SYSTEM_AI_STATES[policy.source],
        degraded=policy.degraded,
        message=policy.message,
    )


def _provider_diagnostic(provider) -> ProviderDiagnostic:
    credential_required = bool(provider.requires_api_key)
    configured = _PROVIDER_CREDENTIALS.get(provider.id, lambda: False)()

    if not credential_required:
        return ProviderDiagnostic(
            id=provider.id,
            name=provider.name,
            credential_required=False,
            server_credential_configured=False,
            state="unverified",
            detail="The local Ollama endpoint is configured, but reachability has not been verified.",
            effect=(
                "Model discovery and local inference will fail until Ollama is "
                "reachable at the trusted endpoint."
            ),
            remediation="Start Ollama and use Test connection in Providers.",
        )

    if not configured:
        return ProviderDiagnostic(
            id=provider.id,
            name=provider.name,
            credential_required=True,
            server_credential_configured=False,
            state="missing",
            detail=f"No server credential is configured for {provider.name}.",
            effect=(
                "Server-side work for this provider cannot run unless a "
                "browser-vault credential is supplied."
            ),
            remediation=(
                "Add a deployment credential, or store a browser key in "
                "Credentials and test the connection."
            ),
        )

    return ProviderDiagnostic(
        id=provider.id,
        name=provider.name,
        credential_required=True,
        server_credential_configured=True,
        state="unverified",
        detail=(
            f"A server credential is configured for {provider.name}, but this "
            "read does not contact the provider."
        ),
        effect=(
            "Provider calls may still fail if the credential is invalid or the "
            "provider is unreachable."
        ),
        remediation="Run Test connection in Providers to verify the current configuration.",
    )


def _embedding_diagnostic() -> EmbeddingDiagnostic:
    provider = (settings.embedding_provider or "").strip().lower()
    credential_required = provider in ("gemini", "openai", "cohere")
    configured = _EMBEDDING_CREDENTIALS.get(provider, lambda: False)()

    if credential_required and not configured:
        return EmbeddingDiagnostic(
            provider=provider,
            model=settings.embedding_model,
            dimension=settings.embedding_dimension,
            credential_required=True,
            server_credential_configured=False,
            state="missing",
            detail=f"The {provider} embedding provider requires a credential, but no server key is configured.",
            effect="Document ingestion and semantic search cannot create embeddings.",
            remediation=(
                "Configure the embedding credential, or switch to a keyless "
                "local embedding provider."
            ),
        )

    return EmbeddingDiagnostic(
        provider=provider,
        model=settings.embedding_model,
        dimension=settings.embedding_dimension,
        credential_required=credential_required,
        server_credential_configured=configured,
        state="unverified",
        detail=(
            f"The {provider} embedding model is configured, but this read does "
            "not contact the provider."
        ),
        effect=(
            "Ingestion or search may fail if the provider is unreachable or the "
            "model is unavailable."
        ),
        remediation="Upload a document or run an ingestion check to verify embeddings.",
    )


def _knowledge_diagnostic() -> KnowledgeDiagnostic:
    qdrant_configured = bool((settings.qdrant_url or "").strip())
    bucket_configured = bool((settings.knowledge_bucket or "").strip())

    if not qdrant_configured or not bucket_configured:
        return KnowledgeDiagnostic(
            qdrant_configured=qdrant_configured,
            qdrant_credential_configured=bool((settings.qdrant_api_key or "").strip()),
            bucket_configured=bucket_configured,
            state="missing",
            detail="The knowledge vector store or source bucket is not configured.",
            effect="Knowledge stacks cannot persist or search documents.",
            remediation="Configure the Qdrant URL and knowledge bucket for this deployment.",
        )

    return KnowledgeDiagnostic(
        qdrant_configured=True,
        qdrant_credential_configured=bool((settings.qdrant_api_key or "").strip()),
        bucket_configured=True,
        state="unverified",
        detail=(
            "Qdrant and the knowledge bucket are configured, but this read does "
            "not contact either service."
        ),
        effect="Knowledge upload or search may fail if storage is unavailable.",
        remediation="Verify storage health before relying on knowledge stacks.",
    )


def _execution_diagnostic() -> ExecutionDiagnostic:
    liveness_scope = (
        "GET /health reports process liveness only; it does not establish "
        "provider, storage, or worker readiness."
    )

    if settings.turn_runner_enabled:
        return ExecutionDiagnostic(
            state="available",
            in_process_runner="enabled",
            external_worker="unknown",
            detail="The in-process turn runner is enabled in this API process.",
            effect=(
                "Queued turns can run in this process; the presence of a "
                "separate worker cannot be established from this response."
            ),
            remediation="No action is needed for the in-process runner.",
            liveness_scope=liveness_scope,
        )

    return ExecutionDiagnostic(
        state="disabled",
        in_process_runner="disabled",
        external_worker="unknown",
        detail="The in-process turn runner is disabled in this API process.",
        effect=(
            "New turns may remain queued unless a separate worker is running. "
            "The presence of that worker cannot be established from this response."
        ),
        remediation=(
            "Start the external turn worker, or enable the in-process runner "
            "for this deployment."
        ),
        liveness_scope=liveness_scope,
    )


def build_settings_diagnostics(policy: SystemAIPolicy) -> SettingsDiagnosticsResponse:
    """Assemble the safe diagnostics payload from configuration and policy."""
    return SettingsDiagnosticsResponse(
        runtime_mode=settings.runtime_mode,
        app_env=settings.app_env,
        providers=[_provider_diagnostic(provider) for provider in DEFAULT_PROVIDERS],
        embedding=_embedding_diagnostic(),
        knowledge=_knowledge_diagnostic(),
        execution=_execution_diagnostic(),
        system_ai=system_ai_status_from_policy(policy),
    )
