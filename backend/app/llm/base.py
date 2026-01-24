from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import List, Optional, Any


class ToolDefinition(BaseModel):
    """Definition of a tool that an LLM can call."""
    name: str
    description: str
    parameters: dict


class ToolCall(BaseModel):
    """A tool call made by the LLM."""
    id: str
    name: str
    arguments: dict


class LLMMessage(BaseModel):
    """A message in the LLM conversation."""
    role: str  # "user", "assistant", "system", "tool"
    content: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None  # For tool response messages


class LLMResponse(BaseModel):
    """Response from an LLM provider."""
    content: Optional[str] = None
    tool_calls: List[ToolCall] = []
    finish_reason: str = "stop"
    usage: dict = {}  # Token usage info


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    async def complete(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """
        Generate a completion from the LLM.
        
        Args:
            messages: Conversation history
            tools: Available tools for the LLM to call
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            
        Returns:
            LLMResponse with content and/or tool calls
        """
        pass
    
    @abstractmethod
    def estimate_cost(self, usage: dict) -> float:
        """Estimate the cost of a completion based on token usage."""
        pass
