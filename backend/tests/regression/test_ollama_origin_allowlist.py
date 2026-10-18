"""Regression: Ollama settings endpoints must only contact trusted configured
destinations (`network_spy` fixture contract).

Evidence: app/api/settings.py hands a user-supplied `base_url` straight to
httpx (fetch models + test-key), letting anyone make the server issue requests
to arbitrary internal endpoints. Fix enforces a trusted configured-origin
allowlist before any request, pins DNS resolution classes, and never follows
redirects. localhost:11434 stays reachable when explicitly configured.
"""

import socket

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import settings as settings_api
from app.core import config as config_module
from main import app

EVIL_URL = "http://169.254.169.254/latest/meta-data"
TRUSTED_LOCAL = "http://localhost:11434"


@pytest.fixture()
def ollama_env(monkeypatch):
    """network_spy: records every outbound attempt the settings module makes.

    The app under test gets an httpx.AsyncClient whose transport is the spy,
    so no real network i/o ever happens and unapproved destinations are
    observable. With no gate in place the spy will catch the bug.
    """

    spy_requests: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        spy_requests.append((request.method, str(request.url)))
        if "redirect" in str(request.url):
            return httpx.Response(302, headers={"location": EVIL_URL}, text="")
        return httpx.Response(200, json={"models": [{"name": "fixture-model"}]})

    def spy_client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(settings_api, "_ollama_client", spy_client_factory)
    client = TestClient(app)
    return {"client": client, "spy": spy_requests, "monkeypatch": monkeypatch}


def test_fetch_models_rejects_untrusted_destination(ollama_env):
    response = ollama_env["client"].post(
        "/api/settings/models",
        json={"provider": "ollama", "base_url": EVIL_URL},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["success"] is False
    assert "trusted" in body["message"].lower()
    # network_spy contract: the server must never even attempt the request.
    assert ollama_env["spy"] == [], f"requests reached unapproved destination: {ollama_env['spy']}"


def test_test_key_rejects_untrusted_destination(ollama_env):
    response = ollama_env["client"].post(
        "/api/settings/test-key",
        json={"provider": "ollama", "api_key": "", "base_url": EVIL_URL},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["valid"] is False
    assert "trusted" in body["message"].lower()
    assert ollama_env["spy"] == [], f"requests reached unapproved destination: {ollama_env['spy']}"


def test_configured_localhost_origin_is_allowed_and_spied(ollama_env):
    response = ollama_env["client"].post(
        "/api/settings/models",
        json={"provider": "ollama"},  # falls back to configured ollama_base_url
    )
    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True, body["message"]
    assert [m["name"] for m in body["models"]] == ["fixture-model"]
    assert ollama_env["spy"] == [("GET", f"{TRUSTED_LOCAL}/api/tags")]


def test_dns_rebinding_to_metadata_address_is_blocked(ollama_env):
    # The hostname itself is on the allowlist, but it resolves to a
    # link-local/metadata address — the resolved DNS must be rejected.
    ollama_env["monkeypatch"].setattr(
        config_module.settings, "ollama_allowed_origins", "http://ollama.internal:11434"
    )

    def rebinding_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", port))]

    ollama_env["monkeypatch"].setattr(socket, "getaddrinfo", rebinding_getaddrinfo)

    response = ollama_env["client"].post(
        "/api/settings/models",
        json={"provider": "ollama", "base_url": "http://ollama.internal:11434"},
    )
    body = response.json()
    assert body["success"] is False
    assert "trusted" in body["message"].lower()
    assert ollama_env["spy"] == [], f"rebound destination was contacted: {ollama_env['spy']}"


def test_redirects_are_not_followed_to_unapproved_destinations(ollama_env):
    # A trusted origin that answers 302 -> evil must not cause a second hop.
    response = ollama_env["client"].post(
        "/api/settings/models",
        json={"provider": "ollama", "base_url": f"{TRUSTED_LOCAL}/redirect"},
    )
    body = response.json()
    assert response.status_code == 200
    origins = [url.split("/api/tags")[0] for _, url in ollama_env["spy"]]
    assert EVIL_URL not in " ".join(origins)
    assert body["success"] is False  # a redirect is not a healthy model list
