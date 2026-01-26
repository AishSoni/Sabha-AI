from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
)
from app.llm.openrouter import OpenRouterProvider
from app.llm.ollama import OllamaProvider
from app.core.config import settings


def get_provider(provider_name: str = None, model: str = None) -> LLMProvider:
    """Factory function to get the appropriate LLM provider."""
    provider_name = provider_name or settings.default_llm_provider
    
    if provider_name == "openrouter":
        return OpenRouterProvider(model=model)
    elif provider_name == "ollama":
        return OllamaProvider(model=model)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")


__all__ = [
    "LLMProvider",
    "LLMMessage",
    "LLMResponse",
    "ToolDefinition",
    "ToolCall",
    "OpenRouterProvider",
    "OllamaProvider",
    "get_provider",
]
