from app.capabilities.inference.contracts import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
    StreamEvent,
    StreamEventType,
)
from app.platform.providers.openrouter import OpenRouterProvider
from app.platform.providers.ollama import OllamaProvider
from app.platform.providers.gemini import GeminiProvider
from app.platform.config import settings


def get_provider(
    provider_name: str = None,
    model: str = None,
    api_key: str = None,
    base_url: str = None,
) -> LLMProvider:
    """Factory function to get the appropriate LLM provider.

    `api_key`/`base_url` carry per-request BYOK values from the browser;
    falling back to the server-configured defaults when absent.
    """
    provider_name = provider_name or settings.default_llm_provider

    if provider_name == "openrouter":
        return OpenRouterProvider(model=model, api_key=api_key)
    elif provider_name == "ollama":
        return OllamaProvider(model=model, base_url=base_url)
    elif provider_name == "gemini":
        return GeminiProvider(model=model, api_key=api_key)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")


__all__ = [
    "LLMProvider",
    "LLMMessage",
    "LLMResponse",
    "ToolDefinition",
    "ToolCall",
    "StreamEvent",
    "StreamEventType",
    "OpenRouterProvider",
    "OllamaProvider",
    "GeminiProvider",
    "get_provider",
]
