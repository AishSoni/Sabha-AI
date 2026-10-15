"""P01-TEST01: collection and fast tests need no production env or network.

Merely collecting this suite with required production variables absent proves
the harness isolation (conftest installs dummy settings before app imports).
"""

import os

import pytest

pytestmark = pytest.mark.anyio


async def test_no_production_credentials_required(test_settings):
    from app.core.config import get_settings

    effective = get_settings()
    assert effective.supabase_url == "http://localhost:54321"
    assert effective.supabase_key == "p01-test-anon-key"
    assert "SUPABASE_SERVICE_KEY" not in os.environ or os.environ.get(
        "SUPABASE_SERVICE_KEY", ""
    ).startswith("p01-test")


async def test_app_imports_without_live_env():
    import app.factory
    import app.services.orchestrator
    import app.services.meeting_manager

    assert app.factory.create_app is not None
