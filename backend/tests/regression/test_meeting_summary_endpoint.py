"""Regression for the real meeting-summary endpoint (spec-02 C4).

Evidence: the Summary tab only ever showed canned client-side mock text; no
endpoint existed that produced a persisted, paid, BYOK-driven summary. Contract
captured here:

- POST /meetings/{id}/summary persists a `📋 **MEETING SUMMARY**` system
  message and records the generation in the inference ledger (purpose=summary);
- the conversation must not be empty (422 otherwise);
- closed meetings (ended/archived) reject with 409 (read-only doctrine);
  `voting` (ending in progress) still answers — recovery semantics;
- BYOK rides the X-Provider-Key header to the provider and is never persisted;
  cloud providers with no key at all fail loudly (422);
- unknown meetings 404.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from tests.doubles.providers import LLMResponse
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PARTICIPANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

SUMMARY_MARKER = "📋 **MEETING SUMMARY**"

# Deterministic cost for the recorded provider (DECIMAL(10,6) rounds exactly).
EXPECTED_COST = round(15 * 0.00002, 6)


class RecordingProvider:
    """Captures the call and answers with a deterministic summary."""

    def __init__(self):
        self.calls: list[dict] = []
        self.provider_name = None
        self.model = None
        self.api_key = None

    def configure(self, provider_name, model, api_key=None):
        self.provider_name = provider_name
        self.model = model
        self.api_key = api_key
        return self

    async def complete(self, messages, tools=None, temperature=0.7, max_tokens=2048):
        self.calls.append(
            {
                "messages": [m.content for m in messages],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        return LLMResponse(content=f"{SUMMARY_MARKER} Interim synthesis", usage={
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        })

    def estimate_cost(self, usage: dict) -> float:
        return (usage or {}).get("total_tokens", 0) * 0.00002


def seed_meeting(db, status: str = "active", with_messages: bool = True) -> None:
    stub = stub_for(db)
    stub.table("meetings").insert(
        {
            "id": MEETING_ID,
            "name": "Summary probe",
            "agenda": "Decide the launch plan",
            "status": status,
            "total_cost": 0.0,
            "created_at": "2026-01-01T00:00:00Z",
        }
    ).execute()
    stub.table("ai_participants").insert(
        {
            "id": PARTICIPANT_ID,
            "meeting_id": MEETING_ID,
            "name": "The Analyst",
            "role": "Analyst",
            "system_prompt": "Analyze.",
            "provider_config": json.dumps(
                {"provider": "", "model": "", "temperature": 0.7}
            ),
            "color": "#6366f1",
            "created_at": "2026-01-01T00:00:00Z",
            "stack_ids": "[]",
        }
    ).execute()
    if with_messages:
        stub.table("messages").insert(
            [
                {
                    "meeting_id": MEETING_ID,
                    "sender_type": "user",
                    "sender_name": "You",
                    "content": "Where do we stand on pricing?",
                },
                {
                    "meeting_id": MEETING_ID,
                    "sender_type": "ai",
                    "sender_name": "The Analyst",
                    "content": "Charging per seat is riskier than metered pricing.",
                },
            ]
        ).execute()


@pytest.fixture()
def api_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    monkeypatch.setattr("app.modules.meetings.infrastructure.supabase_meetings.get_supabase", lambda: stub)
    # The TestClient boots the lifespan reconciler; point it at the stub too
    # (both modules own a private client factory).
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.reconciliation.get_supabase", lambda: stub
    )
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.vector_cleanup.get_supabase", lambda: stub
    )
    # Summary defaults are server-owned now; keep that read on the fixture DB.
    monkeypatch.setattr(
        "app.modules.settings.infrastructure.system_ai.get_supabase_admin", lambda: stub
    )
    return disposable_db


def post_summary(client, *, key=None, provider="ollama", model="llama3", base_url=None):
    headers = {"Content-Type": "application/json"}
    if key is not None:
        headers["X-Provider-Key"] = key
    body = {
        "provider": {
            "provider": provider,
            "model": model,
            "temperature": 0.2,
            "max_tokens": 900,
            "base_url": base_url,
        }
    }
    return client.post(f"/api/meetings/{MEETING_ID}/summary", json=body, headers=headers)


def test_summary_is_generated_persisted_and_accounted(api_env, monkeypatch):
    providers: list[RecordingProvider] = []

    def factory(provider_name=None, model=None, api_key=None, base_url=None):
        providers.append(RecordingProvider().configure(provider_name, model, api_key))
        return providers[-1]

    monkeypatch.setattr("app.modules.meetings.infrastructure.summary.get_provider", factory)

    db = api_env
    seed_meeting(db)

    with TestClient(app) as client:
        response = post_summary(client, key="sess-local-key")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sender_type"] == "system"
    # The message persists the FULL marker with body; stored row matches.
    assert payload["content"].startswith(SUMMARY_MARKER)
    assert "Interim synthesis" in payload["content"]

    rows = db.query(
        "SELECT sender_type, sender_name, content FROM messages WHERE meeting_id = %s "
        "AND sender_type = 'system'",
        (MEETING_ID,),
    )
    assert [r[2] for r in rows] == [payload["content"]]

    # Ledger: exactly one paid summary attempt, attributed to the provider.
    events = db.query(
        "SELECT purpose, provider, model, estimated_cost FROM inference_events "
        "WHERE meeting_id = %s",
        (MEETING_ID,),
    )
    assert [(e[0], e[1], e[2], float(e[3])) for e in events] == [
        ("summary", "ollama", "llama3", EXPECTED_COST)
    ]

    # The BYOK key reached the provider factory but persisted nowhere.
    assert providers[0].api_key == "sess-local-key"
    assert "sess-local-key" not in response.text

    # Meeting accounting moved once (ledger increments total_cost on insert).
    total = db.query("SELECT total_cost FROM meetings WHERE id = %s", (MEETING_ID,))[0][0]
    assert float(total) == EXPECTED_COST


def test_empty_conversation_is_rejected_with_422(api_env, monkeypatch):
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env, with_messages=False)

    with TestClient(app) as client:
        response = post_summary(client)

    assert response.status_code == 422
    assert "conversation" in response.json()["detail"].lower()
    # Nothing was persisted.
    count = api_env.query(
        "SELECT COUNT(*) FROM messages WHERE meeting_id = %s", (MEETING_ID,)
    )[0][0]
    assert count == 0


def test_system_only_conversation_is_rejected_with_422(api_env, monkeypatch):
    """Only system events exist (e.g. an ended marker) — nothing to summarize."""
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env, with_messages=False)
    stub = stub_for(api_env)
    stub.table("messages").insert(
        {
            "meeting_id": MEETING_ID,
            "sender_type": "system",
            "sender_name": "System",
            "content": "📋 **MEETING ENDED**",
        }
    ).execute()

    with TestClient(app) as client:
        response = post_summary(client)

    assert response.status_code == 422


@pytest.mark.parametrize("status", ["ended", "archived"])
def test_closed_meetings_reject_summary_generation(api_env, monkeypatch, status):
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env, status=status)

    with TestClient(app) as client:
        response = post_summary(client)

    assert response.status_code == 409
    assert status in response.json()["detail"]


def test_voting_meeting_still_generates_summaries(api_env, monkeypatch):
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env, status="voting")

    with TestClient(app) as client:
        response = post_summary(client)

    assert response.status_code == 200


def test_missing_browser_key_for_cloud_provider_is_rejected(api_env, monkeypatch):
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env)

    with TestClient(app) as client:
        response = post_summary(
            client, key=None, provider="openrouter", model="anthropic/claude-3"
        )

    assert response.status_code == 422
    assert "API key" in response.json()["detail"]


def test_unknown_meeting_is_404(api_env, monkeypatch):
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    with TestClient(app) as client:
        response = client.post(
            f"/api/meetings/99999999-9999-4999-8999-999999999999/summary",
            json={"provider": None},
        )
    assert response.status_code == 404


def test_summary_displays_accumulated_costs_in_message(api_env, monkeypatch):
    """The per-message estimated_cost is display data mirroring the ledger."""
    monkeypatch.setattr(
        "app.modules.meetings.infrastructure.summary.get_provider", lambda *a, **k: RecordingProvider()
    )
    seed_meeting(api_env)

    with TestClient(app) as client:
        response = post_summary(client)

    estimate = response.json().get("estimated_cost")
    assert estimate is not None
    assert float(estimate) == EXPECTED_COST
