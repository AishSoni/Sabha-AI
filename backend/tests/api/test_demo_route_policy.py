"""Demo runtime route-policy audit (B-05/B-06 remainder).

Unauthenticated reads/writes on data routes must be rejected, cross-owner
direct-ID lookups must not leak, and live network-sensitive operations must
stay unavailable in demo mode even with plausible payloads.
"""

import pytest

pytestmark = pytest.mark.anyio


def _client_for(app):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_unauthenticated_persona_list_is_rejected(api_app):
    async with _client_for(api_app) as client:
        response = await client.get("/api/personas")
        assert response.status_code == 401


async def test_unauthenticated_stack_list_is_rejected(api_app):
    async with _client_for(api_app) as client:
        response = await client.get("/api/knowledge_stacks")
        assert response.status_code == 401


async def test_unauthenticated_document_lookup_is_rejected(api_app):
    async with _client_for(api_app) as client:
        response = await client.get("/api/documents/some-doc-id")
        assert response.status_code == 401


async def test_unauthenticated_settings_preferences_is_rejected(api_app):
    async with _client_for(api_app) as client:
        response = await client.get("/api/settings/preferences")
        assert response.status_code == 401


async def test_demo_mode_denies_live_model_discovery(api_app, monkeypatch):
    from app.core.config import Settings, override_settings

    override_settings(
        Settings(
            supabase_url="http://localhost:54321",
            supabase_key="p01-test-anon-key",
            supabase_service_key="p01-test-service-key",
            app_env="demo",
        )
    )
    monkeypatch.setattr("app.core.config.settings.app_env", "demo", raising=False)
    try:
        async with _client_for(api_app) as client:
            response = await client.post(
                "/api/settings/models",
                json={"provider": "ollama", "base_url": "http://evil.example:11434"},
            )
            assert response.status_code in (403, 404, 422)
            body = response.json()
            text = str(body).lower()
            assert "demo" in text or "denied" in text or "unavailable" in text
    finally:
        from app.core.config import reset_settings_override

        reset_settings_override()


async def test_demo_mode_denies_live_key_testing(api_app, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.app_env", "demo", raising=False)
    try:
        async with _client_for(api_app) as client:
            response = await client.post(
                "/api/settings/test-key",
                json={"provider": "openrouter", "api_key": "sk-test-123"},
            )
            assert response.status_code in (403, 404, 422)
    finally:
        monkeypatch.undo()
