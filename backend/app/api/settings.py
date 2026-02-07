"""
Settings API endpoints for provider configuration and API key testing.
"""

from typing import List, Literal, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

from app.models.settings_schemas import (
    ProvidersListResponse,
    TestKeyRequest,
    TestKeyResponse,
    EnvironmentInfo,
    SystemAIConfig,
    DEFAULT_PROVIDERS,
)
from app.core.config import settings


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
async def list_providers():
    """
    List all available LLM providers with their supported models and environment info.
    """
    environment = EnvironmentInfo(
        is_production=settings.app_env == "production",
        configured_providers=_get_configured_providers(),
        default_provider=settings.default_llm_provider,
        default_models=_get_default_models(),
    )
    
    # System AI defaults (can be overridden in frontend)
    system_ai = SystemAIConfig(
        provider=settings.default_llm_provider,
        model="",  # Use provider default
        temperature=0.5,
        max_tokens=2048,
    )
    
    return ProvidersListResponse(
        providers=DEFAULT_PROVIDERS,
        environment=environment,
        system_ai=system_ai,
    )


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
    
    except Exception as e:
        return FetchModelsResponse(success=False, message=str(e))


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
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            timeout=15.0,
        )
        
        if response.status_code in (400, 403):
            error = response.json().get("error", {})
            return FetchModelsResponse(success=False, message=error.get("message", "Invalid API key"))
        
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
    """Fetch models from Ollama."""
    async with httpx.AsyncClient() as client:
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
                message=f"Cannot connect to Ollama at {base_url}. Is Ollama running?",
            )


@router.post("/test-key", response_model=TestKeyResponse)
async def test_api_key(request: TestKeyRequest):
    """
    Test if an API key is valid for the specified provider.
    Makes a minimal API call to verify the key works.
    """
    try:
        if request.provider == "openrouter":
            return await _test_openrouter_key(request.api_key)
        elif request.provider == "gemini":
            return await _test_gemini_key(request.api_key)
        elif request.provider == "ollama":
            return await _test_ollama_connection(request.base_url or settings.ollama_base_url)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")
    except httpx.HTTPError as e:
        return TestKeyResponse(valid=False, message=f"Connection error: {str(e)}")
    except Exception as e:
        return TestKeyResponse(valid=False, message=f"Error: {str(e)}")


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
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            timeout=10.0,
        )
        
        if response.status_code == 400 or response.status_code == 403:
            error = response.json().get("error", {})
            return TestKeyResponse(valid=False, message=error.get("message", "Invalid API key"))
        
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
    """Test Ollama connection by listing local models."""
    async with httpx.AsyncClient() as client:
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
                message=f"Connected to Ollama at {base_url}",
                models=models if models else ["No models installed"],
            )
        except httpx.ConnectError:
            return TestKeyResponse(
                valid=False,
                message=f"Cannot connect to Ollama at {base_url}. Is Ollama running?",
            )
