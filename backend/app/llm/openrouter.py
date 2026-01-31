import httpx
from typing import List, Optional, AsyncGenerator
import json

from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMResponse,
    ToolDefinition,
    ToolCall,
    StreamEvent,
    StreamEventType,
)
from app.core.config import settings


class OpenRouterProvider(LLMProvider):
    """OpenRouter API provider supporting multiple LLM backends."""
    
    def __init__(self, model: Optional[str] = None):
        self.model = model or settings.openrouter_default_model
        self.base_url = settings.openrouter_base_url
        self.api_key = settings.openrouter_api_key
        
    def _convert_messages(self, messages: List[LLMMessage]) -> List[dict]:
        """Convert internal message format to OpenRouter format."""
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
                            "arguments": json.dumps(tc.arguments)
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
        """Convert tool definitions to OpenRouter format."""
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
        """Generate completion via OpenRouter API."""
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Sabha"
        }
        
        payload = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        if tools:
            payload["tools"] = self._convert_tools(tools)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
        
        choice = data["choices"][0]
        message = choice["message"]
        
        # Parse tool calls if present
        tool_calls = []
        if "tool_calls" in message and message["tool_calls"]:
            for tc in message["tool_calls"]:
                tool_calls.append(ToolCall(
                    id=tc["id"],
                    name=tc["function"]["name"],
                    arguments=json.loads(tc["function"]["arguments"])
                ))
        
        return LLMResponse(
            content=message.get("content"),
            tool_calls=tool_calls,
            finish_reason=choice.get("finish_reason", "stop"),
            usage=data.get("usage", {})
        )
    
    def estimate_cost(self, usage: dict) -> float:
        """Estimate cost based on token usage (approximate)."""
        # Rough estimates - varies by model
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)
        
        # Approximate costs per 1M tokens (Claude Sonnet pricing via OpenRouter)
        input_cost_per_m = 3.0
        output_cost_per_m = 15.0
        
        cost = (input_tokens * input_cost_per_m / 1_000_000) + \
               (output_tokens * output_cost_per_m / 1_000_000)
        
        return round(cost, 6)
    
    async def stream(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream a completion from OpenRouter with true SSE support.
        Handles extended thinking/reasoning content from models like Claude, DeepSeek, Gemini.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Sabha"
        }
        
        payload = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,  # Enable streaming
        }
        
        if tools:
            payload["tools"] = self._convert_tools(tools)
        
        # Track accumulated tool calls for proper parsing
        pending_tool_calls: dict[int, dict] = {}
        usage_data = {}
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=120.0
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                        
                    # SSE format: "data: {...}"
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix
                        
                        if data_str.strip() == "[DONE]":
                            # Stream complete
                            yield StreamEvent(
                                type=StreamEventType.DONE,
                                usage=usage_data
                            )
                            break
                        
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        
                        # Handle usage info if present
                        if "usage" in data:
                            usage_data = data["usage"]
                        
                        if not data.get("choices"):
                            continue
                            
                        choice = data["choices"][0]
                        delta = choice.get("delta", {})
                        
                        # Handle reasoning/thinking content (extended thinking models)
                        # OpenRouter sends this as delta.reasoning_content or delta.thinking
                        reasoning = delta.get("reasoning_content") or delta.get("thinking") or delta.get("reasoning")
                        if reasoning:
                            yield StreamEvent(
                                type=StreamEventType.THINKING,
                                content=reasoning
                            )
                        
                        # Handle regular content
                        if delta.get("content"):
                            yield StreamEvent(
                                type=StreamEventType.TEXT,
                                content=delta["content"]
                            )
                        
                        # Handle tool calls (streamed incrementally)
                        if delta.get("tool_calls"):
                            for tc in delta["tool_calls"]:
                                idx = tc.get("index", 0)
                                
                                if idx not in pending_tool_calls:
                                    pending_tool_calls[idx] = {
                                        "id": tc.get("id", ""),
                                        "name": "",
                                        "arguments": ""
                                    }
                                
                                # Accumulate function info
                                if "function" in tc:
                                    if tc["function"].get("name"):
                                        pending_tool_calls[idx]["name"] = tc["function"]["name"]
                                    if tc["function"].get("arguments"):
                                        pending_tool_calls[idx]["arguments"] += tc["function"]["arguments"]
                        
                        # Check for finish reason - emit accumulated tool calls
                        finish_reason = choice.get("finish_reason")
                        if finish_reason == "tool_calls" and pending_tool_calls:
                            for idx, tc_data in pending_tool_calls.items():
                                try:
                                    args = json.loads(tc_data["arguments"]) if tc_data["arguments"] else {}
                                except json.JSONDecodeError:
                                    args = {}
                                
                                yield StreamEvent(
                                    type=StreamEventType.TOOL_CALL,
                                    tool_name=tc_data["name"],
                                    tool_arguments=args
                                )
                            pending_tool_calls.clear()
        
        # Ensure we always yield done if not already done
        if not usage_data:
            yield StreamEvent(type=StreamEventType.DONE, usage={})
