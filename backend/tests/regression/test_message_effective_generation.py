"""Final assistant messages carry the effective generation record (spec 06).

The turn's *effective* configuration — the provider, model and sampling
parameters the inference actually ran with — is persisted on the final
assistant message of the turn. The record is honest and non-secret:
credential material never becomes message data, and every message that
did not run an inference (user and system messages, historic rows)
stays NULL on this column.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_tool_continuation_loop import (  # noqa: E402
    MEETING_ID,
    PARTICIPANT_ID,
    turn_env,
)

from app.llm.base import LLMResponse  # noqa: E402
from app.models import MessageCreate, RequestProviderSettings  # noqa: E402
from app.services.meeting_manager import MeetingManager  # noqa: E402
from app.services.orchestrator import Orchestrator  # noqa: E402

RECORD_KEYS = {"provider", "model", "temperature", "max_tokens", "base_url"}


def _answer(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        tool_calls=[],
        finish_reason="stop",
        usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    )


def _rows(db, meeting_id: str = MEETING_ID) -> list[tuple]:
    """Every message of the meeting: (sender_type, record)."""
    return [
        (row[0], row[1])
        for row in db.query(
            "SELECT sender_type, effective_generation FROM messages "
            "WHERE meeting_id = %s ORDER BY created_at",
            (meeting_id,),
        )
    ]


def _prune_legacy_user_and_ai(db) -> None:
    """Empty the seeded conversation so turn assertions see only the turn."""
    with db.connect() as conn:
        conn.execute("DELETE FROM messages WHERE meeting_id = %s", (MEETING_ID,))


def _seed_historic_messages(db) -> None:
    """One user question and one earlier AI answer, persisted before the
    column existed (legacy rows — they must stay NULL)."""
    now = datetime.now(timezone.utc).isoformat()
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, meeting_id, sender_type, sender_id, sender_name, content, created_at)
            VALUES
              (%s, %s, 'user', NULL, 'Director', 'What is the market size?', %s),
              (%s, %s, 'ai', %s, 'The Analyst', 'Prior answer about TAM.', %s)
            """,
            (
                str(uuid4()), MEETING_ID, now,
                str(uuid4()), MEETING_ID, PARTICIPANT_ID, now,
            ),
        )


async def test_the_final_assistant_message_persists_the_effective_record(turn_env):
    env = turn_env
    _prune_legacy_user_and_ai(env["db"])
    provider = env["install_provider"](
        responses=[_answer("The answer")],
    )
    orchestrator: Orchestrator = env["orchestrator"]

    await orchestrator.execute_turn(MEETING_ID, PARTICIPANT_ID)

    rows = _rows(env["db"])
    ai_rows = [(t, rec) for t, rec in rows if t == "ai"]
    assert len(ai_rows) == 1
    record = ai_rows[0][1]
    assert set(record.keys()) == RECORD_KEYS
    # The scripted provider ran with the settings the record captured.
    assert provider.calls, "the provider must have been called"
    call = provider.calls[-1]
    assert record["provider"] == "ollama"
    assert record["temperature"] == call["temperature"]
    assert record["max_tokens"] == call["max_tokens"]


async def test_credential_bytes_never_reach_the_effective_record(turn_env):
    env = turn_env
    _prune_legacy_user_and_ai(env["db"])
    env["install_provider"](
        responses=[_answer("The answer")],
    )
    orchestrator: Orchestrator = env["orchestrator"]

    await orchestrator.execute_turn(
        MEETING_ID,
        PARTICIPANT_ID,
        provider_settings=RequestProviderSettings(
            provider="gemini", model="fixture-gem"
        ),
        provider_api_key="sk-fixture-byok-secret",
    )

    record = _rows(env["db"])[-1][1]
    assert record is not None
    assert set(record.keys()) == RECORD_KEYS
    rendered = repr(record)
    assert "sk-fixture-byok-secret" not in rendered
    assert "api_key" not in rendered


async def test_messages_that_did_not_run_inference_honestly_stay_null(turn_env):
    env = turn_env
    _prune_legacy_user_and_ai(env["db"])
    env["install_provider"](
        responses=[_answer("The answer")],
    )
    orchestrator: Orchestrator = env["orchestrator"]

    # A user message has no inference: it must persist without a record.
    manager: MeetingManager = env["orchestrator"].meeting_manager
    saved = await manager.save_message(
        MessageCreate(meeting_id=MEETING_ID, content="Question from the floor",
                      sender_type="user", sender_name="Director")
    )
    assert saved.effective_generation is None
    rows = _rows(env["db"])
    assert rows[0][0] == "user" and rows[0][1] is None

    await orchestrator.execute_turn(MEETING_ID, PARTICIPANT_ID)
    ai_rows = [(t, rec) for t, rec in _rows(env["db"]) if t == "ai"]
    assert ai_rows[0][1] is not None


async def test_history_rows_stayed_null_through_the_turn(turn_env):
    env = turn_env
    _prune_legacy_user_and_ai(env["db"])
    _seed_historic_messages(env["db"])
    env["install_provider"](
        responses=[_answer("The answer")],
    )
    orchestrator: Orchestrator = env["orchestrator"]

    await orchestrator.execute_turn(MEETING_ID, PARTICIPANT_ID)

    rows = _rows(env["db"])
    historic = rows[:2]
    assert all(record is None for _, record in historic)
    final_record = rows[-1][1]
    assert final_record is not None
    assert set(final_record.keys()) == RECORD_KEYS


def test_the_upgraded_schema_extends_messages_without_rewriting_history(
    legacy_db,
):
    """Upgrade path: legacy message rows gain the (NULL) column verbatim."""
    UPGRADE_MIGRATIONS = ["017_message_effective_generation.sql"]
    migrations = Path(__file__).resolve().parents[2] / "migrations"

    now = datetime.now(timezone.utc).isoformat()
    with legacy_db.connect() as conn:
        conn.execute(
            """
            INSERT INTO meetings (id, name, agenda, status, created_at)
            VALUES (%s, 'Upgrade Council', 'Close the books', 'active', now())
            """,
            (MEETING_ID,),
        )
        conn.execute(
            """
            INSERT INTO messages (id, meeting_id, sender_type, sender_name, content, created_at)
            VALUES (%s, %s, 'ai', 'The Analyst', 'A legacy turn.', %s)
            """,
            (str(uuid4()), MEETING_ID, now),
        )
        for migration_name in UPGRADE_MIGRATIONS:
            conn.execute(
                (migrations / migration_name).read_text(encoding="utf-8")
            )
        rows = legacy_db.query(
            "SELECT effective_generation FROM messages WHERE meeting_id = %s",
            (MEETING_ID,),
        )
        assert rows == [(None,)]