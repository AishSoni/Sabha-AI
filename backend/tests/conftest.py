"""Phase 01 (P01-T02/P01-T04) backend test isolation.

Sets dummy credentials BEFORE any app import so collection never requires
production env or network. Resets settings overrides and client singletons
between tests. Single async convention: AnyIO + asyncio.
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "p01-test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "p01-test-service-key")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")

import socket

import pytest

from app.core.config import (
    Settings,
    override_settings,
    reset_settings_override,
)
from app.core.database import reset_supabase_client
from app.core.qdrant import reset_qdrant_client


@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    return request.param


def _dummy_settings() -> Settings:
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_key="p01-test-anon-key",
        supabase_service_key="p01-test-service-key",
    )


@pytest.fixture
def test_settings():
    """Dummy settings with no live credentials."""
    return _dummy_settings()


@pytest.fixture(autouse=True)
def _isolate_settings_and_singletons(test_settings):
    """Install dummy settings override; clear singletons before and after."""
    from app.modules.meetings.store import reset_shared_turn_store

    override_settings(test_settings)
    reset_supabase_client()
    reset_qdrant_client()
    reset_shared_turn_store()
    try:
        yield
    finally:
        reset_shared_turn_store()
        reset_supabase_client()
        reset_qdrant_client()
        reset_settings_override()


@pytest.fixture(autouse=True)
def _no_unexpected_network(request):
    """Fail fast tests on unexpected outbound socket connections.

    Integration-marked tests opt out and use explicit isolated endpoints.
    """
    if "integration" in request.keywords:
        yield
        return
    real_connect = socket.socket.connect

    def _blocked(self, *args, **kwargs):
        # Windows ProactorEventLoop builds its self-pipe via
        # socketpair()->connect(("127.0.0.1", port)); loopback is not
        # external traffic and must stay usable under the guard.
        try:
            peer = args[0] if args else kwargs.get("address")
            host = peer[0] if isinstance(peer, tuple) else ""
        except Exception:
            host = ""
        if host in ("127.0.0.1", "::1", "localhost"):
            return real_connect(self, *args, **kwargs)
        raise RuntimeError(
            "P01 network guard: unregistered external connection blocked "
            f"(args={args!r}). Register an isolated endpoint or double instead."
        )

    socket.socket.connect = _blocked
    try:
        yield
    finally:
        socket.socket.connect = real_connect


@pytest.fixture
def api_app(test_settings):
    """FastAPI app built on dummy settings with no lifespan network I/O."""
    from app.factory import create_app

    return create_app()


@pytest.fixture
def api_client(api_app):
    """HTTPX ASGI client. Lifespan is exercised explicitly in TEST04."""
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(
        transport=ASGITransport(app=api_app), base_url="http://test"
    )


@pytest.fixture
def actor_headers():
    """Trusted-actor headers threaded into API tests.

    Meeting/child routes enforce ownership (Phase 04); the tests supply the
    caller identity here since bodies never establish identity.
    """
    return {"X-Test-Actor": "actor-a"}
