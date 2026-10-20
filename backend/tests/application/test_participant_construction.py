"""Participant construction use case (spec 06).

Meetings build participants from catalog creation snapshots (one
coherent port call per template), never from template tables. Pin:
unknown personas fail before any write, roles cap at 200 characters,
recorded carriers pass through verbatim (inherit keys omitted), the
default roster carries no template, and two participants constructed
from one shared template are independent copies.
"""

import pytest

from app.modules.meetings.application.construct_participants import (
    ConstructParticipants,
    default_roster_participants,
)
from app.modules.meetings.domain.models import resolve_temperature
from app.modules.persona_catalog.application.queries import GetCreationSnapshot

PERSONA_ID = "44444444-4444-4444-8444-444444444444"
UNKNOWN_ID = "44444444-4444-4444-8444-444444444449"
STACK_A = "55555555-5555-4555-8555-555555555551"
STACK_B = "55555555-5555-4555-8555-555555555552"


def _snapshot_row(**overrides):
    row = {
        "id": PERSONA_ID,
        "name": "The Investor",
        "subtitle": "investor",
        "color": "#22c55e",
        "avatar_url": None,
        "provider_config": {
            "provider": "",
            "model": "",
            "temperature": 0.0,
            "max_tokens": 1500,
        },
        "is_default": True,
        "user_id": None,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
        "active_prompt": "poke holes",
        "active_prompt_version": 2,
        "stack_ids": [STACK_A, STACK_B],
    }
    row.update(overrides)
    return row


class FakeCatalog:
    """Snapshot-only catalog port double; records reads and writes.

    ``snapshot=None`` makes every read miss (unknown persona).
    """

    def __init__(self, snapshot=_snapshot_row()) -> None:
        self.snapshot = snapshot
        self.reads: list[str] = []

    async def read_creation_snapshot(self, persona_id: str):
        self.reads.append(persona_id)
        return self.snapshot


def _use_case(catalog):
    return ConstructParticipants(
        GetCreationSnapshot(catalog),
        lambda base: f"<base {base}>",
        id_factory=lambda: "fixed-participant-id",
    )


async def test_participants_are_built_from_one_snapshot_each():
    catalog = FakeCatalog()
    participants = await _use_case(catalog).execute(
        "meeting-1", [PERSONA_ID], created_at="2026-01-01T01:00:00"
    )

    assert catalog.reads == [PERSONA_ID]
    assert len(participants) == 1
    participant = participants[0]
    assert participant.id == "fixed-participant-id"
    assert participant.meeting_id == "meeting-1"
    assert participant.name == "The Investor"
    assert participant.role == "investor"
    assert participant.system_prompt == "<base poke holes>"
    assert participant.stack_ids == (STACK_A, STACK_B)
    assert participant.persona_id == PERSONA_ID


async def test_two_participants_from_one_shared_template_construct_independently():
    catalog = FakeCatalog()
    first = (await _use_case(catalog).execute("meeting-A", [PERSONA_ID], "t1"))[0]
    second = (await _use_case(catalog).execute("meeting-B", [PERSONA_ID], "t2"))[0]

    assert first.meeting_id == "meeting-A"
    assert second.meeting_id == "meeting-B"
    # Same template truth, in twice — without sharing mutable state
    assert (
        first.to_payload()["system_prompt"]
        == second.to_payload()["system_prompt"]
        == "<base poke holes>"
    )
    assert catalog.reads == [PERSONA_ID, PERSONA_ID]


async def test_a_recorded_carrier_passes_through_verbatim():
    participants = await _use_case(FakeCatalog()).execute(
        "meeting-1", [PERSONA_ID], "t"
    )
    carrier = participants[0].provider_config
    assert carrier == {
        "provider": "",
        "model": "",
        "temperature": 0.0,
        "max_tokens": 1500,
    }
    assert resolve_temperature(carrier) == 0.0


async def test_the_policy_is_derived_explicit_only_from_the_template_carrier():
    """The policy never freezes inheritance: "" provider/model are the
    template's documented inherit markers, while recorded numbers — an
    explicit zero included — travel as explicit values."""
    participants = await _use_case(FakeCatalog()).execute(
        "meeting-1", [PERSONA_ID], "t"
    )
    payload = participants[0].to_payload()
    assert payload["generation_policy"] == {
        "temperature": 0.0,
        "max_tokens": 1500,
    }
    # The legacy carrier stays verbatim beside the derived policy.
    assert payload["provider_config"] == {
        "provider": "",
        "model": "",
        "temperature": 0.0,
        "max_tokens": 1500,
    }


async def test_a_fully_concrete_carrier_becomes_a_fully_explicit_policy():
    catalog = FakeCatalog(
        _snapshot_row(
            provider_config={
                "provider": "openrouter",
                "model": "fixture/model",
                "temperature": 0.2,
                "max_tokens": 1500,
            }
        )
    )
    participants = await _use_case(catalog).execute("meeting-1", [PERSONA_ID], "t")
    assert participants[0].to_payload()["generation_policy"] == {
        "provider": "openrouter",
        "model": "fixture/model",
        "temperature": 0.2,
        "max_tokens": 1500,
    }


async def test_an_absent_carrier_derives_an_all_inherit_policy():
    catalog = FakeCatalog(_snapshot_row(provider_config=None))
    participants = await _use_case(catalog).execute("meeting-1", [PERSONA_ID], "t")
    assert participants[0].to_payload()["generation_policy"] == {}


async def test_missing_carrier_keys_are_omitted_not_frozen():
    catalog = FakeCatalog(_snapshot_row(provider_config=None))
    participants = await _use_case(catalog).execute("meeting-1", [PERSONA_ID], "t")
    assert participants[0].provider_config == {}
    assert participants[0].provider_config.get("temperature") is None


async def test_unknown_personas_fail_before_any_write():
    catalog = FakeCatalog(snapshot=None)
    use_case = _use_case(catalog)
    with pytest.raises(ValueError, match="Unknown persona"):
        await use_case.execute("meeting-1", [UNKNOWN_ID], "t")
    assert catalog.reads == [UNKNOWN_ID]


async def test_an_overlong_role_still_fails_the_way_the_api_did():
    catalog = FakeCatalog(_snapshot_row(subtitle="x" * 201))
    with pytest.raises(ValueError, match="role capacity"):
        await _use_case(catalog).execute("meeting-1", [PERSONA_ID], "t")


def test_default_roster_participants_carry_no_template_state():
    roster = [
        {
            "name": "The Investor",
            "role": "investor",
            "system_prompt": "roster prompt",
            "color": "#22c55e",
        },
    ]
    participants = default_roster_participants(
        "meeting-roster",
        roster,
        "t",
        prompt_composer=lambda base: f"<r {base}>",
        id_factory=lambda: "roster-id",
    )
    assert participants[0].provider_config == {}
    assert participants[0].persona_id is None
    assert participants[0].stack_ids == ()
    assert participants[0].to_payload()["generation_policy"] == {}
    assert participants[0].system_prompt == "<r roster prompt>"
