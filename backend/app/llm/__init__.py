from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
    StreamEvent,
    StreamEventType,
)
from app.llm.openrouter import OpenRouterProvider
from app.llm.ollama import OllamaProvider
from app.llm.gemini import GeminiProvider
from app.core.config import settings


def get_provider(provider_name: str = None, model: str = None) -> LLMProvider:
    """Factory function to get the appropriate LLM provider."""
    provider_name = provider_name or settings.default_llm_provider
    
    if provider_name == "openrouter":
        return OpenRouterProvider(model=model)
    elif provider_name == "ollama":
        return OllamaProvider(model=model)
    elif provider_name == "gemini":
        return GeminiProvider(model=model)
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
