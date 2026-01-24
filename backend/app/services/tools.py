"""
Tool definitions for Sabha AI agents.
These tools are injected into the LLM context for function calling.
"""

from app.llm.base import ToolDefinition


# Web search tool - for Phase 2 with Tavily
SEARCH_KNOWLEDGE_BASE = ToolDefinition(
    name="search_knowledge_base",
    description="Search for documents, reports, or files uploaded to the meeting context or your private stack.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Semantic search query (e.g., 'Competitor pricing 2024')"
            }
        },
        "required": ["query"]
    }
)

WEB_SEARCH = ToolDefinition(
    name="web_search",
    description="Search the live internet for up-to-date information.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search keywords"
            }
        },
        "required": ["query"]
    }
)

LOG_DISAGREEMENT = ToolDefinition(
    name="log_disagreement",
    description="Log a formal disagreement with another participant. Use this when you fundamentally oppose a point.",
    parameters={
        "type": "object",
        "properties": {
            "target_participant_name": {
                "type": "string",
                "description": "Name of the AI or User you disagree with."
            },
            "topic": {
                "type": "string",
                "description": "Short summary of the conflict (max 5 words)."
            },
            "reasoning": {
                "type": "string",
                "description": "Why you disagree."
            },
            "severity": {
                "type": "integer",
                "description": "1 (Minor nitpick) to 5 (Critical blocker/Fundamental flaw)."
            }
        },
        "required": ["target_participant_name", "topic", "reasoning", "severity"]
    }
)

LOG_CONSENSUS = ToolDefinition(
    name="log_consensus",
    description="Log a point where multiple participants have reached alignment.",
    parameters={
        "type": "object",
        "properties": {
            "participants": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of names who agree."
            },
            "topic": {
                "type": "string",
                "description": "What was agreed upon."
            },
            "strength": {
                "type": "integer",
                "description": "1 (Tentative) to 5 (Unanimous/Strong)."
            }
        },
        "required": ["participants", "topic", "strength"]
    }
)


def get_default_tools() -> list[ToolDefinition]:
    """Get the default set of tools for AI agents."""
    return [LOG_DISAGREEMENT, LOG_CONSENSUS]


def get_all_tools() -> list[ToolDefinition]:
    """Get all available tools including search (for Phase 2)."""
    return [SEARCH_KNOWLEDGE_BASE, WEB_SEARCH, LOG_DISAGREEMENT, LOG_CONSENSUS]
