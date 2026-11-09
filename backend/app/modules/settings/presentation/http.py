"""
Settings API endpoints for provider configuration and API key testing.
"""

from typing import List, Literal, Optional
import asyncio
import ipaddress
import logging
import socket
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from .schemas import (
    ProvidersListResponse,
    SettingsDiagnosticsResponse,
    TestKeyRequest,
    TestKeyResponse,
    EnvironmentInfo,
    SystemAIConfig,
    DEFAULT_PROVIDERS,
)
from .diagnostics import build_settings_diagnostics, system_ai_status_from_policy
from app.platform.config import settings
from app.modules.settings.infrastructure.system_ai import save_system_ai_config
from app.presentation.dependencies import get_system_ai_policy_reader

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Ollama destination trust gate (SSRF defense for settings probes).
# User-supplied Ollama origins are only reachable when explicitly configured
# as trusted; hostnames are pinned to resolved addresses (DNS-rebinding
# defense) and redirects are never followed.
# --------------------------------------------------------------------------

def _ollama_client() -> httpx.AsyncClient:
    """Single seam for Ollama probe requests (tests spy on this factory)."""
    return httpx.AsyncClient(follow_redirects=False)


UNTRUSTED_OLLAMA_MESSAGE = (
    "The Ollama endpoint must use a trusted configured origin without "
    "embedded credentials."
)


def _normalized_origin(url: str) -> str:
    """Normalize an origin to scheme://host:port for allowlist comparison."""
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "").lower()
    host = (parts.hostname or "").lower()
    if scheme not in ("http", "https") or not host:
        raise ValueError(UNTRUSTED_OLLAMA_MESSAGE)
    if "@" in (parts.netloc or ""):
        raise ValueError(UNTRUSTED_OLLAMA_MESSAGE)
    port = parts.port
    if port is None:
        port = 443 if scheme == "https" else 80
    return f"{scheme}://{host}:{port}"


def _trusted_ollama_origins() -> List[str]:
    """Origins the operator explicitly trusts for Ollama probes."""
    raw = (settings.ollama_allowed_origins or "").strip()
    if raw:
        return [_normalized_origin(entry) for entry in raw.split(",") if entry.strip()]
    # Empty configuration falls back to the operator's default endpoint only.
    return [_normalized_origin(settings.ollama_base_url)]


async def _ensure_trusted_ollama_destination(base_url: str) -> None:
    """Refuse to send Ollama probes anywhere outside the trusted origins."""
    origin = _normalized_origin(base_url)
    if origin not in _trusted_ollama_origins():
        raise ValueError(UNTRUSTED_OLLAMA_MESSAGE)

    parts = urlsplit(base_url)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parts.hostname, None, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError(
            "The Ollama endpoint could not be resolved to a trusted configured destination."
        ) from exc

    addresses = {info[4][0] for info in infos if info[0] in (socket.AF_INET, socket.AF_INET6)}
    if not addresses:
        raise ValueError(
            "The Ollama endpoint resolves to no usable address; refusing to probe."
        )

    dangerous = []
    for address in addresses:
        ip = ipaddress.ip_address(address)
        # Loopback (127.0.0.1 / ::1) is an allowed class for local Ollama;
        # ::1 is also Python-reserved, so never treat loopback as dangerous.
        if ip.is_loopback:
            continue
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
            dangerous.append(address)

    if dangerous:
        raise ValueError(
            "The Ollama endpoint resolves to a protected network; "
            "not a trusted configured destination."
        )

    # Cross-class resolution (e.g. loopback + public in one answer set) is the
    # classic rebinding signature for an allowlisted hostname.
    classes = set()
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_loopback:
            classes.add("loopback")
        elif ip.is_global:
            classes.add("global")
        else:
            classes.add("other")
    if len(classes) > 1:
        raise ValueError(
            "The Ollama endpoint resolves across network classes; "
            "not a trusted configured destination."
        )


router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_configured_providers() -> list[str]:
    """Check which providers have API keys configured in environment."""
    configured = []
    if settings.openrouter_api_key:
        configured.append("openrouter")
    if settings.gemini_api_key:
        configured.append("gemini")
    # Ollama doesn't need a key, but we check if it's reachable could be added
    configured.append("ollama")  # Always available locally
    return configured


def _get_default_models() -> dict:
    """Get default model for each provider from environment."""
    return {
        "openrouter": settings.openrouter_default_model,
        "gemini": settings.gemini_default_model,
        "ollama": settings.ollama_default_model,
    }


@router.get("/providers", response_model=ProvidersListResponse)
async def list_providers(system_ai_reader=Depends(get_system_ai_policy_reader)):
    """
    List all available LLM providers with their supported models and environment info.
    """
    environment = EnvironmentInfo(
        is_production=settings.app_env == "production",
        configured_providers=_get_configured_providers(),
        default_provider=settings.default_llm_provider,
        default_models=_get_default_models(),
    )
    
    # System AI is shared server policy. A saved mutation wins; otherwise the
    # deployment environment remains the fallback. The status keeps a missing
    # row distinct from a storage read failure.
    policy = await system_ai_reader()
    system_ai_status = system_ai_status_from_policy(policy)

    return ProvidersListResponse(
        providers=DEFAULT_PROVIDERS,
        environment=environment,
        system_ai=policy.config,
        system_ai_status=system_ai_status,
    )


@router.get("/diagnostics", response_model=SettingsDiagnosticsResponse)
async def get_settings_diagnostics(
    system_ai_reader=Depends(get_system_ai_policy_reader),
):
    """Report safe, read-only capability prerequisites.

    This route never probes a provider or storage service. Configured is not
    reported as verified, and no credential or server-owned URL is returned.
    """

    policy = await system_ai_reader()
    return build_settings_diagnostics(policy)


@router.put("/system-ai", response_model=SystemAIConfig)
async def update_system_ai(config: SystemAIConfig):
    """Persist the validated System AI policy.

    The request model owns field validation (supported provider, trimming,
    temperature and token bounds), so an invalid policy is a 422 before any
    write. Credentials are not part of this contract.
    """

    return await save_system_ai_config(config)


class FetchModelsRequest(BaseModel):
    """Request to fetch models from a provider."""
    provider: Literal["openrouter", "gemini", "ollama"]
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ModelInfo(BaseModel):
    """Information about a model."""
    id: str
    name: str
    context_length: Optional[int] = None


class FetchModelsResponse(BaseModel):
    """Response with fetched models."""
    success: bool
    models: List[ModelInfo] = []
    message: str = ""


@router.post("/models", response_model=FetchModelsResponse)
async def fetch_models(request: FetchModelsRequest):
    """
    Fetch available models from a provider's API.
    Returns models dynamically from the respective provider.
    """
    try:
        if request.provider == "openrouter":
            api_key = request.api_key or settings.openrouter_api_key
            if not api_key:
                return FetchModelsResponse(success=False, message="No API key provided")
            return await _fetch_openrouter_models(api_key)
        
        elif request.provider == "gemini":
            api_key = request.api_key or settings.gemini_api_key
            if not api_key:
                return FetchModelsResponse(success=False, message="No API key provided")
            return await _fetch_gemini_models(api_key)
        
        elif request.provider == "ollama":
            base_url = request.base_url or settings.ollama_base_url
            return await _fetch_ollama_models(base_url)
        
        else:
            return FetchModelsResponse(success=False, message=f"Unknown provider: {request.provider}")
    
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Model discovery failed for %s with HTTP %s",
            request.provider,
            exc.response.status_code,
        )
        return FetchModelsResponse(
            success=False,
            message=f"Model discovery failed with HTTP {exc.response.status_code}.",
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "Model discovery transport failure for %s: %s",
            request.provider,
            type(exc).__name__,
        )
        return FetchModelsResponse(
            success=False,
            message="Model discovery failed because the provider could not be reached.",
        )
    except ValueError as exc:
        # The Ollama trust gate raises only sanitized, actionable messages.
        return FetchModelsResponse(success=False, message=str(exc))
    except Exception as exc:  # noqa: BLE001 - never echo raw provider/storage errors
        logger.warning(
            "Model discovery failed for %s: %s",
            request.provider,
            type(exc).__name__,
        )
        return FetchModelsResponse(
            success=False,
            message="Model discovery failed for this provider.",
        )


async def _fetch_openrouter_models(api_key: str) -> FetchModelsResponse:
    """Fetch models from OpenRouter API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15.0,
        )
        
        if response.status_code == 401:
            return FetchModelsResponse(success=False, message="Invalid API key")
        
        response.raise_for_status()
        data = response.json()
        
        models = []
        for m in data.get("data", []):
            models.append(ModelInfo(
                id=m.get("id", ""),
                name=m.get("name", m.get("id", "")),
                context_length=m.get("context_length"),
            ))
        
        # Sort by name and limit
        models.sort(key=lambda x: x.name.lower())
        
        return FetchModelsResponse(
            success=True,
            models=models[:100],  # Limit to 100 models
            message=f"Fetched {len(models)} models",
        )


async def _fetch_gemini_models(api_key: str) -> FetchModelsResponse:
    """Fetch models from Gemini API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
            timeout=15.0,
        )
        
        if response.status_code in (400, 403):
            return FetchModelsResponse(success=False, message="Invalid API key")
        
        response.raise_for_status()
        data = response.json()
        
        models = []
        for m in data.get("models", []):
            model_id = m.get("name", "").replace("models/", "")
            # Filter to only include generateContent-capable models
            if "generateContent" in m.get("supportedGenerationMethods", []):
                models.append(ModelInfo(
                    id=model_id,
                    name=m.get("displayName", model_id),
                    context_length=m.get("inputTokenLimit"),
                ))
        
        return FetchModelsResponse(
            success=True,
            models=models,
            message=f"Fetched {len(models)} models",
        )


async def _fetch_ollama_models(base_url: str) -> FetchModelsResponse:
    """Fetch models from Ollama (only towards trusted configured origins)."""
    await _ensure_trusted_ollama_destination(base_url)
    async with _ollama_client() as client:
        try:
            response = await client.get(
                f"{base_url}/api/tags",
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("models", []):
                models.append(ModelInfo(
                    id=m.get("name", ""),
                    name=m.get("name", ""),
                    context_length=None,  # Ollama doesn't expose this
                ))
            
            if not models:
                return FetchModelsResponse(
                    success=True,
                    models=[],
                    message="No models installed. Run 'ollama pull <model>' to install.",
                )
            
            return FetchModelsResponse(
                success=True,
                models=models,
                message=f"Fetched {len(models)} models",
            )
        
        except httpx.ConnectError:
            return FetchModelsResponse(
                success=False,
                message=(
                    "Cannot connect to the configured Ollama endpoint. "
                    "Is Ollama running?"
                ),
            )


@router.post("/test-key", response_model=TestKeyResponse)
async def test_api_key(request: TestKeyRequest):
    """
    Test if an API key is valid for the specified provider.
    Makes a minimal API call to verify the key works.
    """
    api_key = (request.api_key or "").strip()

    # Hosted providers need a credential before any network call. Returning a
    # capability result keeps the failure useful instead of surfacing a schema
    # error. Local providers may legitimately be keyless.
    if request.provider in ("openrouter", "gemini") and not api_key:
        return TestKeyResponse(
            valid=False,
            message="Enter an API key before testing this provider.",
        )

    try:
        if request.provider == "openrouter":
            return await _test_openrouter_key(api_key)
        elif request.provider == "gemini":
            return await _test_gemini_key(api_key)
        elif request.provider == "ollama":
            return await _test_ollama_connection(request.base_url or settings.ollama_base_url)
        else:
            raise HTTPException(status_code=400, detail="Unknown provider")
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Connection test failed for %s with HTTP %s",
            request.provider,
            exc.response.status_code,
        )
        return TestKeyResponse(
            valid=False,
            message=f"Connection test failed with HTTP {exc.response.status_code}.",
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "Connection test transport failure for %s: %s",
            request.provider,
            type(exc).__name__,
        )
        return TestKeyResponse(
            valid=False,
            message="Connection test failed because the provider could not be reached.",
        )
    except ValueError as exc:
        # The Ollama trust gate raises only sanitized, actionable messages.
        return TestKeyResponse(valid=False, message=str(exc))
    except Exception as exc:  # noqa: BLE001 - never echo raw provider/storage errors
        logger.warning(
            "Connection test failed for %s: %s",
            request.provider,
            type(exc).__name__,
        )
        return TestKeyResponse(
            valid=False,
            message="Connection test failed for this provider.",
        )


async def _test_openrouter_key(api_key: str) -> TestKeyResponse:
    """Test OpenRouter API key by fetching available models."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10.0,
        )
        
        if response.status_code == 401:
            return TestKeyResponse(valid=False, message="Invalid API key")
        
        response.raise_for_status()
        data = response.json()
        
        # Extract model IDs
        models = [m.get("id") for m in data.get("data", [])[:20]]
        
        return TestKeyResponse(
            valid=True,
            message="API key is valid",
            models=models,
        )


async def _test_gemini_key(api_key: str) -> TestKeyResponse:
    """Test Gemini API key by listing models."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": api_key},
            timeout=10.0,
        )
        
        if response.status_code == 400 or response.status_code == 403:
            return TestKeyResponse(valid=False, message="Invalid API key")
        
        response.raise_for_status()
        data = response.json()
        
        # Extract model names
        models = [m.get("name", "").replace("models/", "") for m in data.get("models", [])[:20]]
        
        return TestKeyResponse(
            valid=True,
            message="API key is valid",
            models=models,
        )


async def _test_ollama_connection(base_url: str) -> TestKeyResponse:
    """Test Ollama connection by listing local models (trusted origins only)."""
    await _ensure_trusted_ollama_destination(base_url)
    async with _ollama_client() as client:
        try:
            response = await client.get(
                f"{base_url}/api/tags",
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
            
            # Extract model names
            models = [m.get("name") for m in data.get("models", [])]
            
            return TestKeyResponse(
                valid=True,
                message="Connected to the configured Ollama endpoint.",
                models=models if models else ["No models installed"],
            )
        except httpx.ConnectError:
            return TestKeyResponse(
                valid=False,
                message=(
                    "Cannot connect to the configured Ollama endpoint. "
                    "Is Ollama running?"
                ),
            )
