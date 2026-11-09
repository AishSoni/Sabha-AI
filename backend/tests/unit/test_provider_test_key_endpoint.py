"""Provider connectivity probes distinguish keyless local models from
missing hosted credentials (Spec 33 T14)."""

from fastapi.testclient import TestClient

from app.modules.settings.presentation import http as settings_http
from app.modules.settings.presentation import schemas as settings_schemas
from main import app


def test_keyless_ollama_probe_reaches_the_trusted_connection_check(monkeypatch):
    base_url = "http://127.0.0.1:11434"

    async def probe(requested_base_url: str) -> settings_schemas.TestKeyResponse:
        assert requested_base_url == base_url
        return settings_schemas.TestKeyResponse(
            valid=True,
            message="Connected to the configured Ollama endpoint.",
            models=["qwen2.5"],
        )

    monkeypatch.setattr(settings_http, "_test_ollama_connection", probe)

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/test-key",
            json={"provider": "ollama", "base_url": base_url},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["models"] == ["qwen2.5"]


def test_hosted_probe_without_a_key_is_rejected_before_any_network_call(
    monkeypatch,
):
    async def unexpected(api_key: str) -> settings_schemas.TestKeyResponse:
        raise AssertionError("network probe should not run without a key")

    monkeypatch.setattr(settings_http, "_test_openrouter_key", unexpected)

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/test-key",
            json={"provider": "openrouter"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert payload["message"] == "Enter an API key before testing this provider."


def test_blank_hosted_key_is_rejected_before_any_network_call(monkeypatch):
    async def unexpected(api_key: str) -> settings_schemas.TestKeyResponse:
        raise AssertionError("network probe should not run with a blank key")

    monkeypatch.setattr(settings_http, "_test_gemini_key", unexpected)

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/test-key",
            json={"provider": "gemini", "api_key": "   "},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert payload["message"] == "Enter an API key before testing this provider."
