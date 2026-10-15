"""P01-TEST04: startup/shutdown through the API harness.

Lifespan initializes and closes resources exactly once with no task leaks.
HTTPX clients alone do not run lifespan, so this uses the explicit context.
"""

import asyncio

import pytest

pytestmark = pytest.mark.anyio


async def test_lifespan_startup_and_shutdown(api_app):
    from app.factory import lifespan

    assert getattr(api_app.state, "startup_complete", False) is False
    async with lifespan(api_app):
        assert api_app.state.startup_complete is True
    assert api_app.state.startup_complete is False


async def test_sequential_lifespans_do_not_share_singletons(api_app):
    from app.core import database as db_module
    from app.core import qdrant as qdrant_module
    from app.factory import lifespan

    async with lifespan(api_app):
        db_module._supabase_client = object()
        qdrant_module._client = object()
    assert db_module._supabase_client is None
    assert qdrant_module._client is None


async def test_no_tasks_leak_from_lifespan(api_app):
    from app.factory import lifespan

    before = {t.get_name() for t in asyncio.all_tasks()}
    async with lifespan(api_app):
        pass
    await asyncio.sleep(0)
    leaked = {t.get_name() for t in asyncio.all_tasks()} - before
    assert leaked == set()


async def test_health_and_openapi_shape(api_client, api_app):
    health = await api_client.get("/health")
    assert health.status_code == 200
    paths = [getattr(r, "path", "") for r in api_app.routes]
    assert "/api/meetings" in str(paths) or any("/api/meetings" in p for p in paths)
