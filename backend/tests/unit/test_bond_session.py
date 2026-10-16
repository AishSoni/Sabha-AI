"""Bond session lifecycle: the single approved scenario issues; others refuse."""

import pytest

from app.infrastructure.demo import errors
from app.infrastructure.demo.manifest import REAL_SCENARIO_ID
from app.infrastructure.demo.runtime import DemoSessionStore, InMemoryGateway

pytestmark = pytest.mark.anyio


def _store():
    return DemoSessionStore(gateway=InMemoryGateway())


def test_real_scenario_issues_with_pinned_revision():
    store = _store()
    view, token = store.issue(
        scenario_id=REAL_SCENARIO_ID, scenario_revision=1, creation_key="k"
    )
    assert view.scenario_id == REAL_SCENARIO_ID
    assert view.generation == 1
    assert token
    assert store.get_by_token(token).session_id == view.session_id


def test_unknown_scenario_still_rejected():
    store = _store()
    with pytest.raises(Exception):
        store.issue(
            scenario_id="custom-live-demo", scenario_revision=1, creation_key="k"
        )
    with pytest.raises(errors.SessionNotFound):
        store.get_by_token("bogus-token")
