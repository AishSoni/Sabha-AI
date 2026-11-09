"""Settings probe failures must stay useful without echoing credentials.

Spec-33 requires safe discovery/test diagnostics. Gemini carries its key in a
request header, but transport errors still contain the full request URL; those
details must never cross the API boundary.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.modules.settings.presentation import http as settings_http
from main import app

SECRET = "sk-live-super-secret"


def _status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request(
        "GET",
        f"https://generativelanguage.googleapis.com/v1beta/models?key={SECRET}",
    )
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError(
        f"provider rejected {request.url}",
        request=request,
        response=response,
    )


def test_model_discovery_failure_does_not_echo_the_provider_key(monkeypatch):
    async def fail(api_key: str):
        raise _status_error(500)

    monkeypatch.setattr(settings_http, "_fetch_gemini_models", fail)

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/models",
            json={"provider": "gemini", "api_key": SECRET},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "success": False,
        "models": [],
        "message": "Model discovery failed with HTTP 500.",
    }
    assert SECRET not in response.text
    assert "generativelanguage" not in response.text


def test_connection_test_failure_does_not_echo_the_provider_key(monkeypatch):
    async def fail(api_key: str):
        raise _status_error(500)

    monkeypatch.setattr(settings_http, "_test_gemini_key", fail)

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/test-key",
            json={"provider": "gemini", "api_key": SECRET},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert payload["message"] == "Connection test failed with HTTP 500."
    assert SECRET not in response.text
    assert "generativelanguage" not in response.text


def test_untrusted_ollama_origin_does_not_echo_embedded_credentials():
    embedded = "http://user:super-secret@127.0.0.1:11434"

    with TestClient(app) as client:
        response = client.post(
            "/api/settings/test-key",
            json={"provider": "ollama", "api_key": "unused", "base_url": embedded},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert "trusted" in payload["message"].lower()
    assert "super-secret" not in response.text
    assert embedded not in response.text


def test_gemini_probe_sends_the_key_in_a_header(monkeypatch):
    captured: dict[str, object] = {}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            request = httpx.Request("GET", url)
            return httpx.Response(
                200,
                request=request,
                json={"models": []},
            )

    monkeypatch.setattr(settings_http.httpx, "AsyncClient", lambda: _Client())

    import asyncio

    asyncio.run(settings_http._fetch_gemini_models(SECRET))

    assert captured["url"] == "https://generativelanguage.googleapis.com/v1beta/models"
    assert captured["headers"] == {"x-goog-api-key": SECRET}
    assert SECRET not in str(captured["url"])
