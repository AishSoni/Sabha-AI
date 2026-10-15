"""P01-TEST07: integration setup rejects non-test targets; teardown is scoped."""

import pytest

from tests.integration.safety import OwnedResources, require_test_target


@pytest.mark.integration
def test_rejects_production_targets():
    with pytest.raises(RuntimeError, match="non-test target"):
        require_test_target("https://xyzcompany.supabase.co", kind="database")
    with pytest.raises(RuntimeError, match="non-test target"):
        require_test_target("https://qdrant.production.example.com:6333", kind="qdrant")


@pytest.mark.integration
def test_accepts_isolated_test_targets():
    assert require_test_target("http://localhost:54321") == "http://localhost:54321"
    assert require_test_target("sabha-test-db") == "sabha-test-db"


@pytest.mark.integration
def test_teardown_removes_only_owned_resources():
    existing = {"keep-me", "p01-owns-1"}
    owned = OwnedResources()
    owned.own_collection("p01-owns-1")
    removed = owned.release_all(drop_collection=existing.discard)
    assert removed == {"collections": ["p01-owns-1"], "tables": []}
    assert existing == {"keep-me"}


@pytest.mark.integration
def test_fake_embedding_dimension_contract():
    dim = 768  # must match Settings.embedding_dimension for the fixture
    from app.core.config import get_settings

    assert get_settings().embedding_dimension == dim
