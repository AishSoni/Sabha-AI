from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
)
from app.llm.openrouter import OpenRouterProvider


def get_provider(provider_name: str = "openrouter", model: str = None) -> LLMProvider:
    """Factory function to get the appropriate LLM provider."""
    if provider_name == "openrouter":
        return OpenRouterProvider(model=model)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")


__all__ = [
    "LLMProvider",
    "LLMMessage",
    "LLMResponse",
    "ToolDefinition",
    "ToolCall",
    "OpenRouterProvider",
    "get_provider",
]
