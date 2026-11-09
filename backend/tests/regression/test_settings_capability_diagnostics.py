"""Capability diagnostics must be safe, read-only, and truthful.

The diagnostics response never contacts providers or storage. It reports the
deployment's prerequisites, distinguishes configured from verified, and never
returns a credential or a server-owned URL.
"""

from fastapi.testclient import TestClient

from app.bootstrap import Container
from app.modules.settings.domain import SystemAIConfig
from app.modules.settings.infrastructure.system_ai import SystemAIPolicy
from app.platform.config import settings
from main import app

SERVER_KEY = "sk-server-secret-diagnostics"
QDRANT_KEY = "qdrant-secret-diagnostics"


def _container(policy: SystemAIPolicy) -> Container:
    async def read_policy() -> SystemAIPolicy:
        return policy

    return Container(
        prompt_catalog=object(),
        system_ai_policy_reader=read_policy,
    )


def test_diagnostics_report_safe_capability_states(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", SERVER_KEY, raising=False)
    monkeypatch.setattr(settings, "gemini_api_key", "", raising=False)
    monkeypatch.setattr(settings, "embedding_provider", "openai", raising=False)
    monkeypatch.setattr(settings, "openai_api_key", "", raising=False)
    monkeypatch.setattr(settings, "qdrant_api_key", QDRANT_KEY, raising=False)
    monkeypatch.setattr(settings, "qdrant_url", "https://qdrant.example", raising=False)
    monkeypatch.setattr(settings, "knowledge_bucket", "knowledge-sources", raising=False)
    monkeypatch.setattr(settings, "turn_runner_enabled", False, raising=False)

    policy = SystemAIPolicy(
        config=SystemAIConfig(provider="ollama", model="", temperature=0.5, max_tokens=2048),
        source="fallback",
        degraded=True,
        message=(
            "The saved System AI policy could not be read. "
            "Environment defaults are in effect until storage recovers."
        ),
    )
    monkeypatch.setattr(app.state, "container", _container(policy))

    with TestClient(app) as client:
        response = client.get("/api/settings/diagnostics")

    assert response.status_code == 200
    body = response.json()
    providers = {provider["id"]: provider for provider in body["providers"]}

    assert providers["openrouter"]["state"] == "unverified"
    assert providers["openrouter"]["server_credential_configured"] is True
    assert providers["gemini"]["state"] == "missing"
    assert providers["gemini"]["server_credential_configured"] is False
    assert providers["ollama"]["state"] == "unverified"
    assert providers["ollama"]["credential_required"] is False

    assert body["embedding"]["state"] == "missing"
    assert body["embedding"]["credential_required"] is True
    assert body["embedding"]["server_credential_configured"] is False

    assert body["knowledge"]["state"] == "unverified"
    assert body["knowledge"]["qdrant_configured"] is True
    assert body["knowledge"]["qdrant_credential_configured"] is True
    assert body["knowledge"]["bucket_configured"] is True

    assert body["execution"]["state"] == "disabled"
    assert body["execution"]["in_process_runner"] == "disabled"
    assert body["execution"]["external_worker"] == "unknown"
    assert "/health" in body["execution"]["liveness_scope"]

    assert body["system_ai"]["source"] == "fallback"
    assert body["system_ai"]["state"] == "failed"
    assert body["system_ai"]["degraded"] is True

    assert SERVER_KEY not in response.text
    assert QDRANT_KEY not in response.text
    assert "qdrant.example" not in response.text


def test_diagnostics_report_enabled_runner_without_claiming_a_worker(monkeypatch):
    monkeypatch.setattr(settings, "turn_runner_enabled", True, raising=False)
    policy = SystemAIPolicy(
        config=SystemAIConfig(provider="ollama", model="", temperature=0.5, max_tokens=2048),
        source="environment",
        message="No saved System AI policy is stored; environment defaults are in effect.",
    )
    monkeypatch.setattr(app.state, "container", _container(policy))

    with TestClient(app) as client:
        response = client.get("/api/settings/diagnostics")

    assert response.status_code == 200
    execution = response.json()["execution"]
    assert execution["state"] == "available"
    assert execution["in_process_runner"] == "enabled"
    assert execution["external_worker"] == "unknown"
    assert "cannot be established" in execution["effect"]
