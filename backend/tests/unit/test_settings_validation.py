"""Configuration values that select runtime behavior must be explicit."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.platform.config import Settings


def _settings(**overrides: str) -> Settings:
    return Settings(
        _env_file=None,
        supabase_url="http://127.0.0.1:54321",
        supabase_key="test-key",
        **overrides,
    )


def test_supported_values_are_accepted_and_normalized() -> None:
    settings = _settings(
        runtime_mode="HOSTED",
        default_llm_provider="OLLAMA",
        embedding_provider="Gemini",
    )

    assert settings.runtime_mode == "hosted"
    assert settings.default_llm_provider == "ollama"
    assert settings.embedding_provider == "gemini"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("runtime_mode", ""),
        ("runtime_mode", "production"),
        ("default_llm_provider", ""),
        ("default_llm_provider", "anthropic"),
        ("embedding_provider", ""),
        ("embedding_provider", "voyage"),
    ],
)
def test_unsupported_values_fail_visibly(field: str, value: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        _settings(**{field: value})

    message = str(exc_info.value)
    assert field in message
    assert "must be one of" in message
