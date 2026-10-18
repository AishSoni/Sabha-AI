"""Regression: browser-supplied generation settings must actually reach the
LLM provider for an AI participant turn (finding: settings ignored by
generation), while BYOK keys ride a per-request header and never become
server state.

Contract under test:
- POST /api/meetings/{id}/turn (and /turn/stream) may carry `provider`
  overrides (model, temperature, max_tokens, base_url) and an
  `X-Provider-Key` header derived from the browser vault.
- The orchestrator merges those overrides over the participant's persisted
  provider_config (B4 snapshot) and hands the merged set to get_provider.
- With no browser key and no server key, cloud-provider turns fail with a
  clear validation error instead of silently proceeding.
"""

import pytest
from fastapi.testclient import TestClient

from test_tool_continuation_loop import (  # noqa: F401  (fixture re-export)
    MEETING_ID,
    PARTICIPANT_ID,
    turn_env,
)

import app.llm as llm_module
import app.services.orchestrator as orchestrator_module
from app.llm.base import LLMResponse, StreamEvent, StreamEventType
from main import app

BYOK_KEY = "fixture-byok-key"
REQUEST_TEMPERATURE = 0.9
REQUEST_MAX_TOKENS = 777


class ConstructionRecorder:
    """Captures exactly how get_provider was called, then returns a
    ScriptedProvider wired to record the provider-side call."""

    def __init__(self):
        self.cases = []
        self.providers = []
        self.responses = []
        self.scripts = []

    def factory(self, provider_name=None, model=None, api_key=None, base_url=None):
        self.cases.append(
            {
                "provider_name": provider_name,
                "model": model,
                "api_key": api_key,
                "base_url": base_url,
            }
        )
        from tests.doubles.providers import ScriptedProvider

        provider = ScriptedProvider(responses=self.responses)
        provider.scripts = self.scripts
        self.providers.append(provider)
        return provider

    def install(self, monkeypatch):
        monkeypatch.setattr(orchestrator_module, "get_provider", self.factory)
        # execute_turn_streaming re-imports get_provider inside the method
        # body, so the source module must be patched too.
        monkeypatch.setattr(llm_module, "get_provider", self.factory)
        return self


def _final_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        tool_calls=[],
        finish_reason="stop",
        usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    )


def test_turn_forwards_request_settings_with_byok_header(turn_env, monkeypatch):
    recorder = ConstructionRecorder().install(monkeypatch)
    recorder.responses = [_final_response("Answer with browser settings.")]

    client = TestClient(app)
    response = client.post(
        f"/api/meetings/{MEETING_ID}/turn",
        json={
            "participant_id": PARTICIPANT_ID,
            "provider": {
                "provider": "gemini",
                "model": "fixture-model",
                "temperature": REQUEST_TEMPERATURE,
                "max_tokens": REQUEST_MAX_TOKENS,
            },
        },
        headers={"X-Provider-Key": BYOK_KEY},
    )

    assert response.status_code == 200, response.text
    assert len(recorder.cases) == 1, recorder.cases
    case = recorder.cases[0]
    assert case["provider_name"] == "gemini"
    assert case["model"] == "fixture-model"
    assert case["api_key"] == BYOK_KEY
    assert case["base_url"] is None

    # The request overrides reach the provider call itself, not just
    # construction; the participant's own config (0.2 / 1234) loses.
    call = recorder.providers[0].calls[0]
    assert call["temperature"] == REQUEST_TEMPERATURE
    assert call["max_tokens"] == REQUEST_MAX_TOKENS
    assert response.json()["message"]["content"] == "Answer with browser settings."


async def test_turn_requires_key_for_cloud_provider_without_any(turn_env):
    from app.services.orchestrator import MissingProviderKeyError

    orchestrator = turn_env["orchestrator"]
    from app.models import RequestProviderSettings

    with pytest.raises(MissingProviderKeyError) as excinfo:
        await orchestrator.execute_turn(
            MEETING_ID,
            PARTICIPANT_ID,
            provider_settings=RequestProviderSettings(provider="gemini"),
        )

    # The message must tell the operator both remedies.
    assert "api key" in str(excinfo.value).lower()
    assert "gemini" in str(excinfo.value).lower()


def test_turn_route_maps_missing_key_to_422(turn_env, monkeypatch):
    ConstructionRecorder().install(monkeypatch)

    client = TestClient(app)
    response = client.post(
        f"/api/meetings/{MEETING_ID}/turn",
        json={
            "participant_id": PARTICIPANT_ID,
            "provider": {"provider": "gemini", "model": "fixture-model"},
        },
        # No X-Provider-Key header and the synthetic env has no server key.
    )

    assert response.status_code == 422, response.text
    assert "api key" in response.json()["detail"].lower()


async def test_orchestrator_resolution_honors_local_base_url(turn_env, monkeypatch):
    """Local providers take request base_url overrides without any key gate."""
    recorder = ConstructionRecorder().install(monkeypatch)
    recorder.responses = [_final_response("Local probe answered.")]
    provider = recorder.providers  # populated on construction

    orchestrator = turn_env["orchestrator"]
    from app.models import RequestProviderSettings

    response = await orchestrator.execute_turn(
        MEETING_ID,
        PARTICIPANT_ID,
        provider_settings=RequestProviderSettings(
            provider="ollama", base_url="http://127.0.0.1:11435"
        ),
    )

    assert response.message.content == "Local probe answered."
    assert recorder.cases[-1]["provider_name"] == "ollama"
    assert recorder.cases[-1]["base_url"] == "http://127.0.0.1:11435"
    assert recorder.cases[-1]["api_key"] is None
    assert provider, "no provider ever constructed"


def test_turn_without_provider_field_falls_back_to_participant_config(
    turn_env, monkeypatch
):
    """Anchor: the pre-existing path (no request overrides) keeps working."""
    recorder = ConstructionRecorder().install(monkeypatch)
    recorder.responses = [_final_response("Fallback answer.")]

    client = TestClient(app)
    response = client.post(
        f"/api/meetings/{MEETING_ID}/turn",
        json={"participant_id": PARTICIPANT_ID},
    )

    assert response.status_code == 200, response.text
    case = recorder.cases[-1]
    # Participant config is empty strings -> provider falls back to the
    # server default (synthetic env pins ollama).
    assert case["provider_name"] == "ollama"
    assert case["model"] is None
    assert case["api_key"] is None

    call = recorder.providers[-1].calls[0]
    assert call["temperature"] == 0.2
    assert call["max_tokens"] == 1234


def test_stream_turn_forwards_request_settings_with_byok_header(
    turn_env, monkeypatch
):
    recorder = ConstructionRecorder().install(monkeypatch)
    recorder.scripts = [
        [
            StreamEvent(type=StreamEventType.TEXT, content="Streamed with settings."),
            StreamEvent(
                type=StreamEventType.DONE,
                usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            ),
        ]
    ]

    client = TestClient(app)
    with client.stream(
        "POST",
        f"/api/meetings/{MEETING_ID}/turn/stream",
        json={
            "participant_id": PARTICIPANT_ID,
            "provider": {"provider": "gemini", "model": "fixture-model"},
        },
        headers={"X-Provider-Key": BYOK_KEY},
    ) as response:
        assert response.status_code == 200
        for _line in response.iter_lines():
            pass  # drain the SSE body so the route generator runs to the end

    assert recorder.cases, "streaming turn never constructed a provider"
    case = recorder.cases[0]
    assert case["provider_name"] == "gemini"
    assert case["model"] == "fixture-model"
    assert case["api_key"] == BYOK_KEY
