"""Spec-11 Phase 1 dataset and upgrade harness (B5).

These tests seed the untracked Phase 1 schema used by real deployments, then
adopt and apply the target history through the migration runner. The upgrade
assertions themselves live in B6; this slice proves the dataset is complete,
tracked, and repeatable.
"""

from __future__ import annotations

from tests.support.spec11 import (
    DOCUMENT_FAILED,
    DOCUMENT_INDEXED,
    DOCUMENT_PROCESSING,
    UpgradeDataset,
)


def test_phase_one_seed_covers_the_legacy_matrix(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()

    assert phase_one_db.query("SELECT count(*) FROM meetings") == [(4,)]
    assert phase_one_db.query("SELECT count(*) FROM ai_participants") == [(4,)]
    assert phase_one_db.query("SELECT count(*) FROM messages") == [(8,)]
    assert phase_one_db.query("SELECT count(*) FROM documents") == [(5,)]
    assert phase_one_db.query("SELECT count(*) FROM inference_events") == [(3,)]
    assert phase_one_db.query(
        "SELECT to_regclass('public.schema_migrations')"
    ) == [(None,)]


def test_target_history_upgrades_the_seeded_dataset(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()

    applied = dataset.apply_target_migrations()

    assert applied[0] == "000_baseline"
    assert applied[-1] == "028_system_ai_settings"
    assert len(applied) == 28
    assert phase_one_db.query(
        "SELECT count(*) FROM schema_migrations"
    ) == [(28,)]

    history = dataset.read_preserved_history()
    meetings = {row["id"]: row for row in history["meetings"]}
    assert meetings["f3000000-0000-4000-8000-000000000001"]["status"] == "active"
    assert meetings["f3000000-0000-4000-8000-000000000002"]["status"] == "ended"
    assert meetings["f3000000-0000-4000-8000-000000000003"]["status"] == "ended"
    assert meetings["f3000000-0000-4000-8000-000000000004"]["status"] == "active"
    assert meetings["f3000000-0000-4000-8000-000000000001"]["archived_at"] is None
    assert meetings["f3000000-0000-4000-8000-000000000002"]["archived_at"] is None
    assert meetings["f3000000-0000-4000-8000-000000000003"]["archived_at"] is not None
    assert meetings["f3000000-0000-4000-8000-000000000004"]["archived_at"] is not None

    documents = {row["id"]: row for row in history["documents"]}
    assert documents[DOCUMENT_INDEXED]["status"] == "unavailable"
    assert documents[DOCUMENT_PROCESSING]["status"] == "failed"
    assert documents[DOCUMENT_FAILED]["status"] == "failed"


def test_target_history_is_idempotent_after_adoption(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()

    assert dataset.apply_target_migrations() == []
