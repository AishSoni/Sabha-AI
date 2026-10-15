"""Demo scaffold contract validation (synthetic only, no real bond)."""

import pytest
from pydantic import ValidationError

from app.infrastructure.demo.manifest import (
    DemoSession,
    ScenarioAction,
    ScenarioManifest,
    SourceProvenance,
)


def _manifest(**overrides):
    base = {
        "schema_version": "1",
        "scenario_id": "synthetic-smoke-scaffold",
        "content_version": 1,
        "scenario_revision": 1,
        "synthetic_only": True,
        "instrument_ref": "SYNTHETIC-TEST-INSTRUMENT",
        "source_snapshot_date": "2026-01-01",
        "allowed_actions": ["synthetic_smoke"],
    }
    base.update(overrides)
    return ScenarioManifest(**base)


def test_accepts_synthetic_manifest():
    m = _manifest()
    assert m.scenario_id == "synthetic-smoke-scaffold"
    assert m.synthetic_only is True


def test_rejects_real_journey_scenario():
    with pytest.raises(ValidationError, match="owned by Phase 10"):
        _manifest(scenario_id="indian-corporate-bond-review")


def test_rejects_non_synthetic_scenario_id():
    with pytest.raises(ValidationError, match="synthetic-"):
        _manifest(scenario_id="my-custom-demo")


def test_rejects_real_instrument_ref():
    with pytest.raises(ValidationError, match="SYNTHETIC-"):
        _manifest(instrument_ref="INE123456789")


def test_rejects_malformed_revision():
    with pytest.raises(ValidationError):
        _manifest(scenario_revision=0)


def test_source_requires_synthetic_id_and_hash():
    good = SourceProvenance(
        source_id="synthetic-fixture-v1",
        title="Synthetic fixture",
        publisher="scaffold",
        content_hash="abc12345",
        snapshot_date="2026-01-01",
    )
    assert good.visibility == "shared"
    with pytest.raises(ValidationError, match="synthetic-"):
        SourceProvenance(
            source_id="instrument-terms-v1",
            title="Real terms",
            publisher="exchange",
            content_hash="abc12345",
            snapshot_date="2026-01-01",
        )


def test_session_and_action_shapes():
    s = DemoSession(
        session_id="synthetic-session-1",
        generation=1,
        scenario_revision=1,
        scenario_id="synthetic-smoke-scaffold",
    )
    assert s.generation == 1
    with pytest.raises(ValidationError):
        DemoSession(
            session_id="x",
            generation=0,
            scenario_revision=1,
            scenario_id="synthetic-smoke-scaffold",
        )
    a = ScenarioAction(
        action_id="synthetic_smoke", scenario_revision=1, idempotency_key="key-12345"
    )
    assert a.action_id == "synthetic_smoke"
