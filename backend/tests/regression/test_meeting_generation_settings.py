"""Regression: persona generation settings must survive meeting creation.

Evidence (spec 01): MeetingManager.create_meeting ignores
personas.provider_config, so participants were always created with the bare
default ProviderConfig; ProviderConfig itself had no max_tokens field, and
neither inference path passes max_tokens to providers.
"""

import json
import uuid

import pytest

from app.modules.meetings.domain.models import MeetingCreate, ProviderConfig
from main import app

PERSONA_ID = "22222222-2222-4222-8222-222222222222"

GEMINI_CONFIG = {
    "provider": "gemini",
    "model": "fixture-model",
    "temperature": 0.2,
    "max_tokens": 1234,
}


@pytest.fixture()
def meeting_env(disposable_db, monkeypatch):
    """MeetingManager pointed at the disposable database row surface."""
    from tests.doubles.supabase_stub import SupabaseStub

    stub = SupabaseStub(disposable_db.uri)
    monkeypatch.setattr("app.modules.meetings.infrastructure.supabase_meetings.get_supabase", lambda: stub)
    return disposable_db, stub


_OMIT_CONFIG = object()  # sentinel: seed with the gemini fixture config


def seed_persona(db, provider_config=_OMIT_CONFIG):
    """Seed the fixture persona. Omit to use GEMINI_CONFIG; pass None for a
    persona row whose provider_config column is NULL (server defaults)."""
    persona_row = {
        "id": PERSONA_ID,
        "name": "Data Analyst",
        "subtitle": "Critical Research Specialist",
        "color": "#3b82f6",
        "provider_config": GEMINI_CONFIG if provider_config is _OMIT_CONFIG else provider_config,
        "is_default": True,
    }
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO personas (id, name, subtitle, color, provider_config, is_default)
            VALUES (%(id)s, %(name)s, %(subtitle)s, %(color)s,
                    %(provider_config)s::jsonb, %(is_default)s)
            """,
            {
                **persona_row,
                "provider_config": json.dumps(
                    persona_row["provider_config"]) if persona_row["provider_config"] is not None else None,
            },
        )
    return persona_row


async def _create_meeting(db, persona_ids):
    from app.modules.meetings.infrastructure.supabase_meetings import (
        build_default_meeting_service,
    )

    manager = build_default_meeting_service()
    return await manager.create_meeting(
        MeetingCreate(name="Probe", persona_ids=persona_ids)
    )


async def test_persona_generation_settings_are_copied_into_participant(meeting_env):
    db, stub = meeting_env
    seed_persona(db)

    meeting = await _create_meeting(db, [PERSONA_ID])

    assert len(meeting.participants) == 1
    pc = meeting.participants[0].provider_config
    assert pc.provider == "gemini"
    assert pc.model == "fixture-model"
    assert pc.temperature == 0.2
    assert pc.max_tokens == 1234

    row = db.query(
        "SELECT provider_config FROM ai_participants WHERE persona_id = %s", (PERSONA_ID,)
    )[0][0]
    assert row["provider"] == "gemini"
    assert row["max_tokens"] == 1234


async def test_persona_without_provider_config_falls_back_to_server_defaults(meeting_env):
    db, stub = meeting_env
    seed_persona(db, provider_config=None)

    meeting = await _create_meeting(db, [PERSONA_ID])

    pc = meeting.participants[0].provider_config
    assert pc.provider == ""      # empty -> server default provider
    assert pc.model == ""         # empty -> provider default model
    assert pc.temperature == 0.7  # server default temperature
    assert pc.max_tokens == 2048  # server default max tokens


def test_provider_config_model_has_max_tokens():
    assert ProviderConfig().max_tokens == 2048
