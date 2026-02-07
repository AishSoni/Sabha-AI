"""
Settings schemas for provider configuration and user preferences.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal


# ============== Provider Configuration ==============

class ProviderModelInfo(BaseModel):
    """Information about a model available from a provider."""
    id: str
    name: str
    context_length: int = 4096
    supports_tools: bool = True
    supports_streaming: bool = True


class ProviderInfo(BaseModel):
    """Information about an LLM provider."""
    id: str  # "openrouter", "gemini", "ollama"
    name: str  # Display name
    description: str
    requires_api_key: bool
    base_url: Optional[str] = None  # For Ollama configuration
    models: List[ProviderModelInfo]
    default_model: str
    default_temperature: float = 0.7
    default_max_tokens: int = 2048


class ProviderSettings(BaseModel):
    """User settings for a specific provider."""
    provider_id: str
    enabled: bool = False
    api_key: Optional[str] = None  # Not persisted on server
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048


class TestKeyRequest(BaseModel):
    """Request to test an API key."""
    provider: Literal["openrouter", "gemini", "ollama"]
    api_key: str
    base_url: Optional[str] = None  # For Ollama


class TestKeyResponse(BaseModel):
    """Response from API key test."""
    valid: bool
    message: str
    models: Optional[List[str]] = None  # Available models if valid


class SystemAIConfig(BaseModel):
    """Configuration for the System AI used for app-level functions."""
    provider: str = ""  # Empty = use default
    model: str = ""     # Empty = use provider default
    temperature: float = 0.5  # Lower for more consistent system tasks
    max_tokens: int = 2048


class EnvironmentInfo(BaseModel):
    """Environment information for the frontend."""
    is_production: bool = False
    configured_providers: List[str] = []  # Providers with API keys in env
    default_provider: str = ""
    # Default settings per provider (from env, no keys exposed)
    default_models: dict = {}  # {"openrouter": "anthropic/claude-sonnet-4", ...}


class ProvidersListResponse(BaseModel):
    """Response with all available providers and environment info."""
    providers: List[ProviderInfo]
    environment: EnvironmentInfo
    system_ai: SystemAIConfig


# ============== Default Provider Data ==============

OPENROUTER_MODELS = [
    ProviderModelInfo(id="anthropic/claude-sonnet-4-20250514", name="Claude Sonnet 4", context_length=200000, supports_tools=True),
    ProviderModelInfo(id="anthropic/claude-3.5-sonnet", name="Claude 3.5 Sonnet", context_length=200000, supports_tools=True),
    ProviderModelInfo(id="openai/gpt-4o", name="GPT-4o", context_length=128000, supports_tools=True),
    ProviderModelInfo(id="openai/gpt-4o-mini", name="GPT-4o Mini", context_length=128000, supports_tools=True),
    ProviderModelInfo(id="google/gemini-2.0-flash-001", name="Gemini 2.0 Flash", context_length=1000000, supports_tools=True),
    ProviderModelInfo(id="deepseek/deepseek-r1", name="DeepSeek R1", context_length=64000, supports_tools=True),
]

GEMINI_MODELS = [
    ProviderModelInfo(id="gemini-2.0-flash", name="Gemini 2.0 Flash", context_length=1000000, supports_tools=True),
    ProviderModelInfo(id="gemini-1.5-flash", name="Gemini 1.5 Flash", context_length=1000000, supports_tools=True),
    ProviderModelInfo(id="gemini-1.5-pro", name="Gemini 1.5 Pro", context_length=2000000, supports_tools=True),
    ProviderModelInfo(id="gemini-2.5-pro-preview-05-06", name="Gemini 2.5 Pro Preview", context_length=1000000, supports_tools=True),
]

OLLAMA_MODELS = [
    ProviderModelInfo(id="llama3.2", name="Llama 3.2", context_length=128000, supports_tools=True),
    ProviderModelInfo(id="llama3.1", name="Llama 3.1", context_length=128000, supports_tools=True),
    ProviderModelInfo(id="mistral", name="Mistral", context_length=32000, supports_tools=False),
    ProviderModelInfo(id="codellama", name="Code Llama", context_length=16000, supports_tools=False),
    ProviderModelInfo(id="phi3", name="Phi-3", context_length=128000, supports_tools=False),
]

DEFAULT_PROVIDERS = [
    ProviderInfo(
        id="openrouter",
        name="OpenRouter",
        description="Access multiple LLM providers through a unified API",
        requires_api_key=True,
        models=OPENROUTER_MODELS,
        default_model="anthropic/claude-sonnet-4-20250514",
    ),
    ProviderInfo(
        id="gemini",
        name="Google Gemini",
        description="Google's multimodal AI models",
        requires_api_key=True,
        models=GEMINI_MODELS,
        default_model="gemini-2.0-flash",
    ),
    ProviderInfo(
        id="ollama",
        name="Ollama (Local)",
        description="Run open-source models locally",
        requires_api_key=False,
        base_url="http://localhost:11434",
        models=OLLAMA_MODELS,
        default_model="llama3.2",
    ),
]
