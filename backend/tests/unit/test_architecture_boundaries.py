"""Architectural import boundaries for domain modules.

Domain rules must not import FastAPI, Supabase, Qdrant, HTTP clients,
provider adapters, or mutable global clients. Application code owns
orchestration; infrastructure implements injected ports.
"""

from pathlib import Path

DOMAIN_FILES = [
    "app/modules/meetings/domain.py",
    "app/modules/meetings/policies.py",
    "app/modules/meetings/ports.py",
    "app/modules/knowledge/policy.py",
    "app/modules/personas/prompts.py",
    "app/modules/personas/config.py",
    "app/modules/access/actors.py",
]

FORBIDDEN_SUBSTRINGS = [
    "from fastapi",
    "import fastapi",
    "from supabase",
    "import supabase",
    "from qdrant_client",
    "import qdrant_client",
    "import httpx",
    "from httpx",
    "import requests",
    "from requests",
    "from app.llm.",
    "from app.services.",
    "import app.services",
    "get_supabase",
    "get_qdrant_client",
    "get_settings",
    "from app.core.config import settings",
]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_domain_modules_respect_import_boundaries():
    root = _repo_root()
    violations: list[str] = []
    for rel in DOMAIN_FILES:
        path = root / rel
        text = path.read_text(encoding="utf-8")
        for forbidden in FORBIDDEN_SUBSTRINGS:
            if forbidden in text:
                violations.append(f"{rel} contains forbidden import {forbidden!r}")
    assert not violations, "; ".join(violations)


def test_boundary_check_rejects_deliberate_violation(tmp_path):
    sample = tmp_path / "sample_domain.py"
    sample.write_text(
        "from fastapi import APIRouter\nfrom app.services.vector_store import VectorStoreManager\n",
        encoding="utf-8",
    )
    text = sample.read_text(encoding="utf-8")
    hits = [f for f in FORBIDDEN_SUBSTRINGS if f in text]
    assert hits, "boundary check must flag domain-to-provider/HTTP imports"
    assert any("fastapi" in h for h in hits)
