"""Spec 11: the shipped setup example must be a working configuration.

A fresh operator copies ``.env.example`` and fills in real credentials. If the
example contains a variable ``Settings`` does not accept, or an invalid value
shape, the first start fails before any Sabha code runs. These checks keep the
documented setup honest without contacting a provider.
"""

from __future__ import annotations

from pathlib import Path

from app.platform.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE = REPO_ROOT / ".env.example"


def _assignments(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        pairs.append((key.strip(), value.strip()))
    return pairs


def test_shipped_env_example_loads_as_settings():
    settings = Settings(_env_file=EXAMPLE)

    assert settings.runtime_mode == "local"
    assert settings.cors_origins == ["http://localhost:3000"]
    assert settings.knowledge_bucket == "knowledge-sources"
    assert settings.turn_max_queued_per_meeting == 10
    assert settings.closing_attempt_lease_seconds == 120


def test_env_example_only_names_settings_fields():
    known = {name.upper() for name in Settings.model_fields}
    documented = {key for key, _ in _assignments(EXAMPLE)}

    assert sorted(documented - known) == []
