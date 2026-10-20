"""Route composition contract for the activation slice (spec-04).

The composed activation route must reach the module use case through the
container's injected port. Until the cutover commit removes the legacy
duplicate in ``app/api/personas.py``, the legacy route shadows this one on
first match, so the call-through assertions stay red; the 503 mapping is
red in both phases until the safe-error translation lands.

Red until ``app.bootstrap`` exists: the import fails at collection.
"""

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import Container, create_app
from app.modules.persona_catalog.application.contracts import PromptCatalogUnavailable

PERSONA_ID = "11111111-1111-4111-8111-111111111111"
REFUSED_VERSION = 999

LEAK_FORBIDDEN = ("supabase", "postgrest", "psycopg", "traceback", "sql")


class FakePromptCatalog:
    """Container-grade port double for the HTTP workflow tests."""

    def __init__(self, refused_version=REFUSED_VERSION, exception=None):
        self.refused_version = refused_version
        self.exception = exception
        self.calls = []

    async def activate_prompt_version(self, persona_id, version):
        self.calls.append((persona_id, version))
        if self.exception is not None:
            raise self.exception
        return version != self.refused_version


def _client(monkeypatch, catalog) -> TestClient:
    return TestClient(create_app(Container(prompt_catalog=catalog)))


def test_activation_route_reaches_the_injected_use_case(monkeypatch):
    catalog = FakePromptCatalog()
    with _client(monkeypatch, catalog) as client:
        response = client.post(
            f"/api/personas/{PERSONA_ID}/prompts/2/activate"
        )
    assert response.status_code == 200, response.text
    assert response.json() == {"message": "Version 2 activated"}
    assert catalog.calls == [(PERSONA_ID, 2)], catalog.calls


def test_activation_route_refusal_maps_to_the_legacy_404(monkeypatch):
    catalog = FakePromptCatalog()
    with _client(monkeypatch, catalog) as client:
        response = client.post(
            f"/api/personas/{PERSONA_ID}/prompts/{REFUSED_VERSION}/activate"
        )
    assert response.status_code == 404, response.text
    assert response.json() == {"detail": "Prompt version not found"}
    assert catalog.calls == [(PERSONA_ID, REFUSED_VERSION)], catalog.calls


def test_activation_route_infrastructure_failure_maps_to_safe_503(monkeypatch):
    catalog = FakePromptCatalog(
        exception=PromptCatalogUnavailable(
            "supabase PostgrestAPIError: relation does not exist"
        )
    )
    with _client(monkeypatch, catalog) as client:
        response = client.post(
            f"/api/personas/{PERSONA_ID}/prompts/2/activate"
        )
    assert response.status_code == 503, response.text
    body = response.text.lower()
    for leak in LEAK_FORBIDDEN:
        assert leak not in body, (leak, body)
