"""Server-owned System AI configuration (spec-10).

Authoritative generation defaults and System AI are server state, edited
through a validated mutation. The environment remains the fallback for a
fresh deployment with no saved row, and summaries must resolve through the
saved System AI rather than whichever participant happens to be first.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app
from tests.doubles.providers import LLMResponse
from tests.doubles.supabase_stub import stub_for

MEETING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PARTICIPANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def seed_meeting(db) -> None:
    stub = stub_for(db)
    stub.table("meetings").insert(
        {
            "id": MEETING_ID,
            "name": "System AI probe",
            "agenda": "Decide who summarizes",
            "status": "active",
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
    stub.table("messages").insert(
        {
            "meeting_id": MEETING_ID,
            "sender_type": "user",
            "sender_name": "You",
            "content": "Please summarize the discussion.",
        }
    ).execute()


@pytest.fixture()
def settings_env(disposable_db, monkeypatch):
    stub = stub_for(disposable_db)
    monkeypatch.setattr(
        "app.services.system_ai_settings.get_supabase_admin", lambda: stub
    )
    monkeypatch.setattr("app.services.meeting_manager.get_supabase", lambda: stub)
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.reconciliation.get_supabase", lambda: stub
    )
    monkeypatch.setattr(
        "app.modules.knowledge.infrastructure.vector_cleanup.get_supabase", lambda: stub
    )
    return disposable_db


class RecordingProvider:
    def __init__(self):
        self.calls: list[dict] = []
        self.configured = None

    def configure(self, provider_name, model, api_key=None, base_url=None):
        self.configured = (provider_name, model, base_url)
        return self

    async def complete(self, messages, tools=None, temperature=0.7, max_tokens=2048):
        self.calls.append({"temperature": temperature, "max_tokens": max_tokens})
        return LLMResponse(
            content="📋 **MEETING SUMMARY** persisted defaults",
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        )

    def estimate_cost(self, usage: dict) -> float:
        return 0.0


def test_environment_is_the_fallback_when_no_system_ai_was_saved(settings_env):
    with TestClient(app) as client:
        response = client.get("/api/settings/providers")

    assert response.status_code == 200
    assert response.json()["system_ai"] == {
        "provider": "ollama",
        "model": "",
        "temperature": 0.5,
        "max_tokens": 2048,
    }


def test_update_persists_and_the_next_read_returns_server_state(settings_env):
    with TestClient(app) as client:
        updated = client.put(
            "/api/settings/system-ai",
            json={
                "provider": "ollama",
                "model": "llama3.2:latest",
                "temperature": 0.3,
                "max_tokens": 1234,
            },
        )
        assert updated.status_code == 200, updated.text
        assert updated.json() == {
            "provider": "ollama",
            "model": "llama3.2:latest",
            "temperature": 0.3,
            "max_tokens": 1234,
        }

        # A second read (and a fresh TestClient) is still server state.
        again = client.get("/api/settings/providers")
        assert again.status_code == 200
        assert again.json()["system_ai"] == updated.json()

    row = settings_env.query(
        "SELECT provider, model, temperature, max_tokens "
        "FROM system_ai_settings WHERE id = 'default'"
    )
    assert len(row) == 1
    assert row[0][0] == "ollama"
    assert row[0][1] == "llama3.2:latest"
    assert float(row[0][2]) == 0.3
    assert row[0][3] == 1234


@pytest.mark.parametrize(
    "payload",
    [
        {
            "provider": "not-a-provider",
            "model": "x",
            "temperature": 0.5,
            "max_tokens": 2048,
        },
        {"provider": "ollama", "model": "x", "temperature": 1.5, "max_tokens": 2048},
        {"provider": "ollama", "model": "x", "temperature": 0.5, "max_tokens": 10},
        {"provider": "ollama", "model": "x", "temperature": 0.5, "max_tokens": 20000},
    ],
)
def test_invalid_system_ai_mutations_are_rejected_and_do_not_persist(
    settings_env, payload
):
    with TestClient(app) as client:
        response = client.put("/api/settings/system-ai", json=payload)

    assert response.status_code == 422
    row = settings_env.query(
        "SELECT COUNT(*) FROM system_ai_settings WHERE id = 'default'"
    )
    assert row[0][0] == 0


def test_summary_resolves_the_saved_system_ai_when_the_request_has_no_override(
    settings_env, monkeypatch
):
    providers: list[RecordingProvider] = []

    def factory(provider_name=None, model=None, api_key=None, base_url=None):
        providers.append(RecordingProvider().configure(provider_name, model, api_key, base_url))
        return providers[-1]

    monkeypatch.setattr("app.services.summary_service.get_provider", factory)
    seed_meeting(settings_env)

    with TestClient(app) as client:
        saved = client.put(
            "/api/settings/system-ai",
            json={
                "provider": "ollama",
                "model": "system-model",
                "temperature": 0.2,
                "max_tokens": 900,
            },
        )
        assert saved.status_code == 200, saved.text

        response = client.post(f"/api/meetings/{MEETING_ID}/summary", json={})

    assert response.status_code == 200, response.text
    assert providers[0].configured == ("ollama", "system-model", None)
    assert providers[0].calls == [{"temperature": 0.2, "max_tokens": 900}]
