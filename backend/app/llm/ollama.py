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
    
    async def stream(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        """Stream completion via Ollama API."""
        from app.llm.base import StreamEvent, StreamEventType
        
        payload = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        if tools:
            payload["tools"] = self._convert_tools(tools)
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=120.0
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield StreamEvent(
                        type=StreamEventType.ERROR,
                        content=f"Ollama error {response.status_code}: {error_text.decode()}"
                    )
                    return
                
                accumulated_text = ""
                tool_calls = []
                usage = {}
                in_thinking = False
                thinking_buffer = ""
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    
                    message = data.get("message", {})
                    content = message.get("content", "")
                    
                    # Handle thinking blocks (models may use <think> tags)
                    if "<think>" in content:
                        in_thinking = True
                        content = content.replace("<think>", "")
                    
                    if in_thinking:
                        if "</think>" in content:
                            in_thinking = False
                            parts = content.split("</think>")
                            thinking_buffer += parts[0]
                            yield StreamEvent(
                                type=StreamEventType.THINKING,
                                content=thinking_buffer.strip()
                            )
                            thinking_buffer = ""
                            content = parts[1] if len(parts) > 1 else ""
                        else:
                            thinking_buffer += content
                            continue
                    
                    if content:
                        yield StreamEvent(type=StreamEventType.TEXT, content=content)
                        accumulated_text += content
                    
                    # Handle tool calls
                    if "tool_calls" in message:
                        for tc in message["tool_calls"]:
                            func = tc.get("function", {})
                            args = func.get("arguments", {})
                            if isinstance(args, str):
                                args = json.loads(args)
                            yield StreamEvent(
                                type=StreamEventType.TOOL_CALL,
                                tool_name=func.get("name", ""),
                                tool_arguments=args
                            )
                    
                    # Check if done
                    if data.get("done"):
                        usage = {
                            "prompt_tokens": data.get("prompt_eval_count", 0),
                            "completion_tokens": data.get("eval_count", 0),
                            "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
                        }
                
                yield StreamEvent(type=StreamEventType.DONE, usage=usage)
    
    def estimate_cost(self, usage: dict) -> float:
        """Ollama runs locally, so cost is always 0."""
        return 0.0
