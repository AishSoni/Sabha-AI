"""Characterization of the no-sign-in access doctrine (spec-03 C1 gap).

The reference contracts require completely no-sign-in access: a fresh visitor
needs neither accounts nor Auth bootstrap, hosted or local. The write side of
the demo mode has its own guard (`tests/regression/test_demo_write_guard.py`;
guard metadata carries guard_id=spec-03.no-sign-in/06). This suite records the
ACCESS side of the same doctrine with two kinds of executable evidence:

1. Source level: the backend never installs an authentication dependency —
   no FastAPI security parameters, no token verification helpers, no Supabase
   auth calls anywhere under app/ or main.py.
2. Runtime level: with nothing configured, the live app serves reads and
   accepts writes for a completely bare client (no Authorization header, no
  cookies, no sign-up first): health, meeting list/detail, persona list,
   knowledge stacks, provider settings, per-meeting document list, plus a
   fresh meeting created end-to-end and a follow-up conversation message.

Read-only doctrine note: seeded conversation messages are only ever written by
the visitor-facing POST routes below — no seed helper bypasses the API here,
so the sweep stays honest about what a fresh visitor can do.
"""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import psycopg
from main import app
from tests.doubles.supabase_stub import stub_for

BACKEND_ROOT = Path(__file__).resolve().parents[2]

PERSONA_ID = "33333333-3333-4333-8333-333333333333"

FORBIDDEN_TOKENS = (
    "Security(",
    "APIRouter(dependencies",
    "get_current_user",
    "verify_token",
    "verify_jwt",
    "require_auth",
    "supabase.auth",
    ".auth.getUser",       # the JS shape is caught on the frontend side; here for symmetry
)

# Spec-04 composition retrieves injected use cases with plain FastAPI
# dependencies, so a bare ``Depends(`` is no longer proof of an auth gate by
# itself. A dependency is auth-shaped when its callable name carries any of
# these fragments; ``Depends(build_use_case)`` and friends stay allowed.
AUTH_SHAPED_DEPENDENCY = r"Depends\(\s*([A-Za-z_][A-Za-z0-9_.]*)"
AUTH_DEPENDENCY_FRAGMENTS = (
    "auth",
    "credential",
    "jwt",
    "permission",
    "session",
    "security",
    "token",
    "user",
)

AUTH_PATH_FRAGMENTS = ("login", "signin", "signup", "register", "logout", "callback", "token")

READ_PATHS = (
    "/health",
    "/api/meetings",
    "/api/personas",
    "/api/knowledge_stacks",
    "/api/settings/providers",
)


def code_lines(path: Path) -> list[str]:
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        code = line.split("#", 1)[0]
        if code.strip():
            lines.append(code)
    return lines


def forbidden_auth_usage(paths) -> list[str]:
    """Reuse the same scan logic for app sources and for the sandbox probe."""
    hits = []
    auth_dependency = re.compile(AUTH_SHAPED_DEPENDENCY)
    for path in paths:
        for line in code_lines(path):
            if any(token in line for token in FORBIDDEN_TOKENS):
                hits.append(f"{path.name}: {line.strip()}")
                continue
            match = auth_dependency.search(line)
            if match:
                callable_name = match.group(1).split(".")[-1].lower()
                if any(fragment in callable_name for fragment in AUTH_DEPENDENCY_FRAGMENTS):
                    hits.append(f"{path.name}: {line.strip()}")
    return hits


def test_sources_install_no_authentication_dependency():
    app_sources = list((BACKEND_ROOT / "app").rglob("*.py"))
    app_sources.append(BACKEND_ROOT / "main.py")

    hits = forbidden_auth_usage(app_sources)
    assert hits == [], f"auth dependency found: {hits}"


def test_route_table_has_no_login_or_token_surface():
    paths = {getattr(route, "path", "") for route in app.routes}
    paths.discard("")
    offending = sorted(p for p in paths if any(frag in p.lower() for frag in AUTH_PATH_FRAGMENTS))
    assert offending == []
    assert len(paths) > 10  # non-vacuous: the app really mounts an API surface


def test_scanner_would_catch_an_auth_dependency():
    """The source sweep is proven non-vacuous: the same probe flags a planted
    auth dependency."""
    sandbox = BACKEND_ROOT / ".sandbox_probe"
    sandbox.mkdir(exist_ok=True)
    (sandbox / "bad.py").write_text('def get_user():\n    return verify_token(request)  # planted\n', encoding="utf-8")
    try:
        hits = forbidden_auth_usage([sandbox / "bad.py"])
    finally:
        (sandbox / "bad.py").unlink()
        sandbox.rmdir()
    assert hits, "probe must reproduce the planted token"


def seed_persona(db) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO personas (id, name, subtitle, color) VALUES (%s, %s, %s, %s)",
            (PERSONA_ID, "Open Questioner", "Fresh-visitor probe", "#22c55e"),
        )


@pytest.fixture()
def sweep_env(disposable_db, monkeypatch):
    def _stub():
        return stub_for(disposable_db)

    monkeypatch.setattr("app.services.meeting_manager.get_supabase", _stub)
    monkeypatch.setattr("app.services.recovery.get_supabase", _stub)
    monkeypatch.setattr("app.services.vector_cleanup.get_supabase", _stub)
    # Persona/knowledge/document API surfaces own their own database
    # construction sites (read remaining patch usage during cutover).
    monkeypatch.setattr("app.api.knowledge_stacks.get_supabase", _stub)
    monkeypatch.setattr("app.api.documents.get_supabase", _stub)
    return disposable_db


def assert_no_auth_challenge(response) -> None:
    """No request in the sweep may be turned away by a credential challenge."""
    assert response.status_code not in (401, 403), f"auth challenge at {response.request.url}"
    assert "www-authenticate" not in {k.lower() for k in response.headers}


def test_bare_client_reads_every_public_surface(sweep_env):
    seed_persona(sweep_env)

    with TestClient(app) as client:
        for path in READ_PATHS:
            assert_no_auth_challenge(client.get(path))

        meeting_id = ""
        response = client.post(
            "/api/meetings",
            json={"name": "Visitor probe", "agenda": "Nothing to sign in for", "persona_ids": [PERSONA_ID]},
        )
        assert_no_auth_challenge(response)
        meeting_id = response.json()["id"]

        detail = client.get(f"/api/meetings/{meeting_id}")
        assert_no_auth_challenge(detail)
        assert detail.json()["participants"], "persona materialized as participant without any account"

        documents = client.get(f"/api/documents/meeting/{meeting_id}")
        assert_no_auth_challenge(documents)
        assert documents.json() == []

        disagreements = client.get(f"/api/meetings/{meeting_id}/disagreements")
        assert_no_auth_challenge(disagreements)

        consensus = client.get(f"/api/meetings/{meeting_id}/consensus")
        assert_no_auth_challenge(consensus)

    msgs = sweep_env.query(
        "SELECT COUNT(*) FROM meetings WHERE id = %s", (meeting_id,)
    )
    assert msgs[0][0] == 1  # the visitor-created meeting is the only state touched


def test_bare_client_writes_a_conversation_message_without_signing_in(sweep_env, monkeypatch):
    seed_persona(sweep_env)

    with TestClient(app) as client:
        created = client.post(
            "/api/meetings",
            json={"name": "Message probe", "persona_ids": [PERSONA_ID]},
        )
        assert_no_auth_challenge(created)
        meeting_id = created.json()["id"]

        posted = client.post(
            f"/api/meetings/{meeting_id}/message",
            json={"content": "Is anything gated behind sign-in?"},
        )
        assert_no_auth_challenge(posted)
        assert posted.json()["content"] == "Is anything gated behind sign-in?"

        listed = client.get("/api/meetings")
        assert_no_auth_challenge(listed)
        assert meeting_id in [m["id"] for m in listed.json()]

    rows = sweep_env.query(
        "SELECT content, sender_type FROM messages WHERE meeting_id = %s ORDER BY created_at",
        (meeting_id,),
    )
    assert [r[1] for r in rows][-1] == "user"
    assert rows[-1][0] == "Is anything gated behind sign-in?"
