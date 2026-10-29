"""Spec 20 round-trip budgets for hot meeting reads.

The meeting detail endpoint used to fan a single request into three sequential
PostgREST calls, and the closing endpoint re-read the meeting plus two more
relations. These tests pin the consolidated shape: one RPC per read, so adding
rows can never add round trips.
"""

from __future__ import annotations

from app.modules.meetings.application.construct_participants import (
    ConstructParticipants,
)
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.domain.models import MeetingCreate
from app.modules.meetings.infrastructure.supabase_closing import (
    SupabaseClosingRepository,
)
from app.modules.persona_catalog.application.queries import GetCreationSnapshot

NOW = "2026-10-29T09:00:00+00:00"


class _Result:
    def __init__(self, data):
        self.data = data


class _CountingQuery:
    def __init__(self, client: "_CountingClient", name: str) -> None:
        self._client = client
        self._name = name

    def execute(self):
        self._client.calls.append(self._name)
        return _Result(self._client.response)


class _CountingClient:
    """Counts every ``execute``; table access would be a contract regression."""

    def __init__(self, response: dict) -> None:
        self.response = response
        self.calls: list[str] = []

    def rpc(self, name: str, params) -> _CountingQuery:
        return _CountingQuery(self, f"rpc:{name}")

    def table(self, name: str) -> _CountingQuery:
        return _CountingQuery(self, f"table:{name}")


def _meeting_bundle() -> dict:
    return {
        "meeting": {
            "id": "meeting-1",
            "user_id": "user-1",
            "name": "Board review",
            "agenda": "Decide",
            "status": "active",
            "total_cost": 0.25,
            "created_at": NOW,
            "archived_at": None,
        },
        "participants": [
            {
                "id": "participant-1",
                "meeting_id": "meeting-1",
                "name": "The Investor",
                "role": "investor",
                "system_prompt": "You are The Investor.",
                "provider_config": {"provider": "openrouter", "model": "m"},
                "color": "#111111",
                "persona_id": None,
                "stack_ids": ["stack-1"],
                "created_at": NOW,
                "generation_policy": None,
            }
        ],
        "messages": [
            {
                "id": "message-2",
                "meeting_id": "meeting-1",
                "content": "Second",
                "sender_type": "user",
                "sender_id": None,
                "sender_name": "Director",
                "citations": [],
                "tool_artifacts": None,
                "thinking_content": None,
                "estimated_cost": 0.0,
                "effective_generation": None,
                "sequence": 2,
                "request_key": None,
                "operation_id": None,
                "created_at": NOW,
            }
        ],
    }


def _service(client: _CountingClient) -> MeetingService:
    return MeetingService(
        client,
        snapshot_template=None,
        construct_participants=None,
        run_blocking=None,
    )


async def test_get_meeting_is_one_round_trip_and_maps_the_bundle():
    client = _CountingClient(_meeting_bundle())

    meeting = await _service(client).get_meeting("meeting-1")

    assert client.calls == ["rpc:read_meeting_bundle"]
    assert meeting is not None
    assert meeting.id == "meeting-1"
    assert meeting.participants[0].name == "The Investor"
    assert meeting.messages[0].sequence == 2


async def test_get_meeting_returns_none_without_a_second_read():
    client = _CountingClient(
        {"meeting": None, "participants": [], "messages": []}
    )

    assert await _service(client).get_meeting("missing") is None
    assert client.calls == ["rpc:read_meeting_bundle"]


class _BatchCatalog:
    """Answers a whole roster in one call and rejects per-persona reads."""

    def __init__(self, rows) -> None:
        self.rows = rows
        self.calls: list[list[str]] = []

    async def read_creation_snapshot(self, persona_id: str):
        raise AssertionError("meeting creation must batch its snapshots")

    async def read_creation_snapshots(self, persona_ids: list[str]):
        self.calls.append(list(persona_ids))
        return self.rows


PERSONA_ID = "11111111-1111-4111-8111-111111111111"


def _snapshot_row() -> dict:
    return {
        "id": PERSONA_ID,
        "name": "The Investor",
        "subtitle": "investor",
        "color": "#22c55e",
        "avatar_url": None,
        "provider_config": {"provider": "openrouter", "model": "m"},
        "is_default": True,
        "user_id": None,
        "created_at": NOW,
        "updated_at": NOW,
        "active_prompt": "poke holes",
        "active_prompt_version": 2,
        "stack_ids": [],
    }


async def test_meeting_creation_is_one_snapshot_batch_plus_one_write():
    catalog = _BatchCatalog([_snapshot_row()])
    created = {
        "meeting": {
            "id": "meeting-1",
            "user_id": "user-1",
            "name": "Board review",
            "agenda": "Decide",
            "status": "active",
            "total_cost": 0.0,
            "created_at": NOW,
        },
        "participants": [
            {
                "id": "participant-1",
                "meeting_id": "meeting-1",
                "name": "The Investor",
                "role": "investor",
                "system_prompt": "You are The Investor.",
                "provider_config": {"provider": "openrouter", "model": "m"},
                "color": "#22c55e",
                "persona_id": PERSONA_ID,
                "stack_ids": [],
                "created_at": NOW,
                "generation_policy": None,
            }
        ],
    }
    client = _CountingClient(created)
    service = MeetingService(
        client,
        snapshot_template=GetCreationSnapshot(catalog),
        construct_participants=ConstructParticipants(
            GetCreationSnapshot(catalog),
            prompt_composer=lambda base: base,
            id_factory=lambda: "participant-1",
        ),
        run_blocking=None,
    )

    meeting = await service.create_meeting(
        MeetingCreate(name="Board review", agenda="Decide", persona_ids=[PERSONA_ID])
    )

    assert catalog.calls == [[PERSONA_ID]]
    assert client.calls == ["rpc:create_meeting_transaction"]
    assert meeting.participants[0].name == "The Investor"


class _Manager:
    """Rejects the legacy three-read fallback if the repository reaches for it."""

    def __init__(self, db) -> None:
        self.db = db

    async def get_meeting(self, meeting_id: str):
        raise AssertionError("closing read must not re-read the meeting")


async def test_closing_read_is_one_round_trip():
    bundle = _meeting_bundle()
    bundle.update(
        {
            "closing": {
                "id": "closing-1",
                "meeting_id": "meeting-1",
                "request_key": "request-1",
                "mode": "vote",
                "stage": "voting",
                "from_status": "active",
                "summary_settings": {},
                "created_at": NOW,
                "updated_at": NOW,
            },
            "votes": [
                {
                    "participant_id": "participant-1",
                    "participant_name": "The Investor",
                    "role": "investor",
                    "status": "pending",
                    "attempt_id": "attempt-1",
                    "attempt_number": 2,
                    "attempt_lease_expires_at": NOW,
                }
            ],
            "processing_turn_started_at": NOW,
        }
    )
    client = _CountingClient(bundle)
    repository = SupabaseClosingRepository(_Manager(client))

    snapshot = await repository.read("meeting-1")

    assert client.calls == ["rpc:read_meeting_closing"]
    assert snapshot.closing is not None
    assert snapshot.votes[0].attempt_number == 2
    assert snapshot.context.participants[0].name == "The Investor"
    assert snapshot.context.messages[0].content == "Second"
    assert snapshot.processing_turn_started_at is not None
