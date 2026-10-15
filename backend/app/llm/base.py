from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import List, Optional, Any, AsyncGenerator, Literal
from enum import Enum


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
    tool_name: Optional[str] = None  # Tool name for providers needing it (e.g. Gemini)


class LLMResponse(BaseModel):
    """Response from an LLM provider."""
    content: Optional[str] = None
    tool_calls: List[ToolCall] = []
    finish_reason: str = "stop"
    usage: dict = {}  # Token usage info


class StreamEventType(str, Enum):
    """Types of streaming events."""
    TEXT = "text"
    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    CITATION = "citation"
    DONE = "done"
    ERROR = "error"


class StreamEvent(BaseModel):
    """A streaming event from the LLM."""
    type: StreamEventType
    content: Optional[str] = None
    # For tool calls (provider-native call ID is preserved, never the tool name)
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    tool_arguments: Optional[dict] = None
    tool_result: Optional[str] = None
    # For citations
    source: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    # Invocation completion (provider-level) is not application completion.
    invocation_finished: bool = False
    # For done event
    message_id: Optional[str] = None
    usage: Optional[dict] = None
    
    model_config = {"use_enum_values": True}


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
    
    async def stream(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream a completion from the LLM.
        
        Default implementation falls back to complete() and yields chunks.
        Providers can override for true streaming.
        """
        response = await self.complete(messages, tools, temperature, max_tokens)
        
        # Yield content as a single chunk
        if response.content:
            yield StreamEvent(type=StreamEventType.TEXT, content=response.content)
        
        # Yield tool calls (preserve provider-native IDs)
        for tc in response.tool_calls:
            yield StreamEvent(
                type=StreamEventType.TOOL_CALL,
                tool_call_id=tc.id,
                tool_name=tc.name,
                tool_arguments=tc.arguments,
                invocation_finished=False,
            )

        # Provider invocation finished; not an application turn completion.
        yield StreamEvent(
            type=StreamEventType.DONE, usage=response.usage, invocation_finished=True
        )
    
    @abstractmethod
    def estimate_cost(self, usage: dict) -> float:
        """Estimate the cost of a completion based on token usage."""
        pass
