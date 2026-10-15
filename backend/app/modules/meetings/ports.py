"""Ports for the shared turn engine (CONTRACTS sections 4, 8).

Application code depends on these protocols; infrastructure implements them.
No FastAPI, Supabase, Qdrant, or provider SDK imports here.
"""

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol


@dataclass(frozen=True)
class CitationItem:
    source: str
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None


@dataclass(frozen=True)
class KnowledgeResult:
    items: list[dict[str, Any]]
    citations: list[CitationItem] = field(default_factory=list)


@dataclass(frozen=True)
class ToolExecutionContext:
    turn_id: str
    invocation_index: int
    provider_call_id: str
    meeting_id: str
    participant_id: str
    participant_name: str


@dataclass(frozen=True)
class ToolOutcome:
    succeeded: bool
    result_text: str
    effect_id: Optional[str] = None
    citations: list[CitationItem] = field(default_factory=list)
    retryable: bool = False
    # Machine-readable code for terminal mapping, e.g. "unknown_tool",
    # "invalid_arguments", "unauthorized", "provider_error".
    code: str = "ok"


class KnowledgeSearch(Protocol):
    async def search(
        self,
        query: str,
        meeting_id: str,
        persona_id: Optional[str],
    ) -> KnowledgeResult: ...


class MeetingLoader(Protocol):
    async def get_meeting(self, meeting_id: str) -> Any: ...

    async def save_message(self, data: Any) -> Any: ...

    async def save_disagreement(self, data: Any) -> Any: ...

    async def save_consensus(self, data: Any) -> Any: ...


class ProviderResolver(Protocol):
    def __call__(self, provider_name: Optional[str], model: Optional[str]) -> Any: ...


class Clock(Protocol):
    def now(self) -> float: ...
