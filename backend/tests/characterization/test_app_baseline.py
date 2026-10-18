"""Characterization baseline captured BEFORE any Spec 01 fix.

Prerequisite per the spec: record a reproducible characterization baseline of
supported behavior, not an assumed green suite, and do not freeze the bugs
under review. These tests only pin the already-supported public surface.
"""

import pytest
from fastapi.testclient import TestClient

from main import app


def test_health_endpoint_responds():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_root_endpoint_identifies_api():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Sabha API"


def test_routers_are_mounted_on_expected_prefixes():
    paths = {getattr(route, "path", "") for route in app.routes}
    mounted = [p for p in paths if p.startswith("/api/")]
    assert mounted, "expected at least /api/* routers to be mounted"
    assert any(p.startswith("/api/meetings") for p in mounted)
    assert any(p.startswith("/api/personas") for p in mounted)


async def test_async_test_runner_is_active():
    # Proves pytest-asyncio is wired up (asyncio_mode=auto): a failing async
    # runner would make this test error out.
    import asyncio

    await asyncio.sleep(0)
    assert True
