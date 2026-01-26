import httpx
from typing import List, Optional
import json

from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
)
from app.core.config import settings


class OllamaProvider(LLMProvider):
    """Ollama local LLM provider for running models locally."""
    
    def __init__(self, model: Optional[str] = None):
        self.model = model or settings.ollama_default_model
        self.base_url = settings.ollama_base_url
        
    def _convert_messages(self, messages: List[LLMMessage]) -> List[dict]:
        """Convert internal message format to Ollama format."""
        converted = []
        for msg in messages:
            message_dict = {"role": msg.role, "content": msg.content or ""}
            
            if msg.tool_calls:
                message_dict["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments
                        }
                    }
                    for tc in msg.tool_calls
                ]
            
            if msg.tool_call_id:
                message_dict["tool_call_id"] = msg.tool_call_id
                message_dict["role"] = "tool"
                
            converted.append(message_dict)
        return converted
    
    def _convert_tools(self, tools: List[ToolDefinition]) -> List[dict]:
        """Convert tool definitions to Ollama format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters
                }
            }
            for tool in tools
        ]
    
    async def complete(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """Generate completion via Ollama API."""
        
        payload = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        if tools:
            payload["tools"] = self._convert_tools(tools)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=120.0  # Longer timeout for local models
            )
            response.raise_for_status()
            data = response.json()
        
        message = data.get("message", {})
        
        # Parse tool calls if present
        tool_calls = []
        if "tool_calls" in message and message["tool_calls"]:
            for tc in message["tool_calls"]:
                func = tc.get("function", {})
                args = func.get("arguments", {})
                # Ollama may return arguments as string or dict
                if isinstance(args, str):
                    args = json.loads(args)
                tool_calls.append(ToolCall(
                    id=tc.get("id", f"call_{len(tool_calls)}"),
                    name=func.get("name", ""),
                    arguments=args
                ))
        
        # Calculate approximate token usage
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)
        
        return LLMResponse(
            content=message.get("content"),
            tool_calls=tool_calls,
            finish_reason="stop",
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            }
        )
    
    def estimate_cost(self, usage: dict) -> float:
        """Ollama runs locally, so cost is always 0."""
        return 0.0
