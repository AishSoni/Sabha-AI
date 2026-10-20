"""Turn execution honours the participant's generation policy (spec 06).

The policy column wins over the legacy provider_config carrier and the
server defaults (only per-request overrides outrank it); the provenance
labels on the persisted record prove where every resolved value came
from. Resolution happens at execution START with those frozen values —
mid-turn default changes cannot alter a turn already running.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_tool_continuation_loop import (  # noqa: E402
    MEETING_ID,
    PARTICIPANT_ID,
    turn_env,
)

from app.llm.base import LLMResponse  # noqa: E402
from app.services.orchestrator import Orchestrator  # noqa: E402


def _answer(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        tool_calls=[],
        finish_reason="stop",
        usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    )


async def test_the_policy_temperature_outranks_the_legacy_carrier(turn_env):
    env = turn_env
    with env["db"].connect() as conn:
        # Legacy carrier says 0.2; the explicit policy says 0.33 — the
        # recorded explicit value must win over the inherited carrier.
        conn.execute(
            """
            UPDATE ai_participants
            SET generation_policy = '{"temperature": 0.33}'::jsonb
            WHERE id = %s
            """,
            (PARTICIPANT_ID,),
        )
    provider = env["install_provider"](responses=[_answer("The answer")])
    orchestrator: Orchestrator = env["orchestrator"]

    await orchestrator.execute_turn(MEETING_ID, PARTICIPANT_ID)

    assert provider.calls, "the provider must have been called"
    # The request layer was empty: policy outranks the carrier value.
    assert provider.calls[0]["temperature"] == 0.33
    # Carrier values still fill the fields the policy never set.
    assert provider.calls[0]["max_tokens"] == 1234

    row = env["db"].query(
        "SELECT effective_generation FROM messages "
        "WHERE meeting_id = %s AND sender_type = 'ai'",
        (MEETING_ID,),
    )
    record = row[0][0]
    assert record["temperature"] == 0.33
    assert record["provenance"]["temperature"] == "policy"
    assert record["provenance"]["max_tokens"] == "legacy_snapshot"
