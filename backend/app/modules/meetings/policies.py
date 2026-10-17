"""Turn engine resource policies (D-06 and CONTRACTS sections 3-4)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TurnPolicies:
    """Bounded execution limits for a single turn."""

    max_invocations: int = 8
    max_tool_calls: int = 16
    deadline_seconds: float = 120.0
    max_tool_result_chars: int = 8000
    max_context_chars: int = 48000
    max_output_chars: int = 8000
    max_query_chars: int = 1000
    # Final-answer SSE text_delta chunk size (CONTRACTS §4 incremental text).
    stream_chunk_chars: int = 400


DEFAULT_POLICIES = TurnPolicies()
