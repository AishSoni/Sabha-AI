"""
Gemini LLM Provider - Google's Gemini API adapter.
"""

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


class GeminiProvider(LLMProvider):
    """Google Gemini API provider."""
    
    def __init__(self, model: Optional[str] = None):
        self.model = model or settings.gemini_default_model
        self.api_key = settings.gemini_api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        
    def _convert_messages(self, messages: List[LLMMessage]) -> tuple[str, list]:
        """
        Convert internal message format to Gemini format.
        Returns (system_instruction, contents).
        """
        system_instruction = None
        contents = []
        
        for msg in messages:
            if msg.role == "system":
                system_instruction = msg.content
            elif msg.role == "user":
                contents.append({
                    "role": "user",
                    "parts": [{"text": msg.content or ""}]
                })
            elif msg.role == "assistant":
                parts = []
                if msg.content:
                    parts.append({"text": msg.content})
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        parts.append({
                            "functionCall": {
                                "name": tc.name,
                                "args": tc.arguments
                            }
                        })
                if parts:
                    contents.append({"role": "model", "parts": parts})
            elif msg.role == "tool":
                contents.append({
                    "role": "function",
                    "parts": [{
                        "functionResponse": {
                            "name": msg.tool_call_id or "unknown",
                            "response": {"result": msg.content}
                        }
                    }]
                })
        
        return system_instruction, contents
    
    def _convert_tools(self, tools: List[ToolDefinition]) -> list:
        """Convert tool definitions to Gemini format (uses OpenAPI-style lowercase types)."""
        function_declarations = []
        
        for tool in tools:
            func_decl = {
                "name": tool.name,
                "description": tool.description,
            }
            
            # Gemini uses standard OpenAPI schema format with lowercase type names
            if tool.parameters:
                func_decl["parameters"] = tool.parameters
            
            function_declarations.append(func_decl)
        
        return [{"functionDeclarations": function_declarations}]
    
    async def complete(
        self,
        messages: List[LLMMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """Generate completion via Gemini API."""
        
        system_instruction, contents = self._convert_messages(messages)
        
        # Ensure we have at least one content message
        if not contents:
            contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        
        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }
        
        if tools:
            payload["tools"] = self._convert_tools(tools)
        
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                timeout=60.0
            )
            
            # Better error handling
            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"Gemini API error {response.status_code}: {error_text}")
            
            data = response.json()
        
        # Parse response
        candidates = data.get("candidates", [])
        if not candidates:
            error = data.get("error", {})
            if error:
                raise Exception(f"Gemini error: {error.get('message', 'Unknown error')}")
            return LLMResponse(content="No response generated", finish_reason="error", usage={})
        
        candidate = candidates[0]
        content_parts = candidate.get("content", {}).get("parts", [])
        
        # Extract text content and tool calls
        text_content = ""
        tool_calls = []
        
        for part in content_parts:
            if "text" in part:
                text_content += part["text"]
            if "functionCall" in part:
                fc = part["functionCall"]
                tool_calls.append(ToolCall(
                    id=fc.get("name", f"call_{len(tool_calls)}"),
                    name=fc.get("name", ""),
                    arguments=fc.get("args", {})
                ))
        
        # Parse usage metadata
        usage_meta = data.get("usageMetadata", {})
        usage = {
            "prompt_tokens": usage_meta.get("promptTokenCount", 0),
            "completion_tokens": usage_meta.get("candidatesTokenCount", 0),
            "total_tokens": usage_meta.get("totalTokenCount", 0)
        }
        
        return LLMResponse(
            content=text_content if text_content else None,
            tool_calls=tool_calls,
            finish_reason=candidate.get("finishReason", "stop"),
            usage=usage
        )
    
    def estimate_cost(self, usage: dict) -> float:
        """Estimate cost based on Gemini pricing."""
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        
        # Gemini Flash pricing (very cheap)
        if "flash" in self.model.lower():
            input_cost = (prompt_tokens / 1_000_000) * 0.075
            output_cost = (completion_tokens / 1_000_000) * 0.30
        # Gemini Pro pricing
        else:
            input_cost = (prompt_tokens / 1_000_000) * 1.25
            output_cost = (completion_tokens / 1_000_000) * 5.00
        
        return input_cost + output_cost
