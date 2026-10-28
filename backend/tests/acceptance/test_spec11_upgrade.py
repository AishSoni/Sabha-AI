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
    INFERENCE_METERED,
    INFERENCE_UNPRICED,
    INFERENCE_ZERO_LOCAL,
    LEGACY_INTERRUPTED_MESSAGE,
    LEGACY_REUPLOAD_MESSAGE,
    PARTICIPANT_EMPTY,
    PARTICIPANT_LEGACY_NULL,
    PARTICIPANT_SNAPSHOT,
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
    assert applied[-1] == "032_replay_package"
    assert len(applied) == 32
    assert phase_one_db.query(
        "SELECT count(*) FROM schema_migrations"
    ) == [(32,)]

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


def test_phase_one_values_survive_the_upgrade_unchanged(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    before = dataset.phase_one_snapshot()

    dataset.apply_target_migrations()

    assert dataset.phase_one_snapshot() == before


def test_unknown_legacy_assignments_are_not_invented(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()

    unknown = dataset.unknown_legacy_assignments_are_marked_unknown()
    assert unknown["participant"]["stack_ids"] is None
    assert unknown["participant"]["generation_policy"] is None
    assert unknown["message"]["effective_generation"] is None

    participants = {
        row[0]: row[1:]
        for row in phase_one_db.query(
            """
            SELECT id::text AS id, stack_ids, generation_policy
            FROM public.ai_participants
            """
        )
    }
    assert participants[PARTICIPANT_EMPTY] == ([], None)
    assert participants[PARTICIPANT_SNAPSHOT] == (
        ["f2000000-0000-4000-8000-000000000002"],
        None,
    )
    assert participants[PARTICIPANT_LEGACY_NULL] == (None, None)
    assert all(
        row[0] is None
        for row in phase_one_db.query(
            "SELECT effective_generation FROM public.messages"
        )
    )


def test_legacy_ledger_keeps_unknown_usage_and_actual_price_kind(phase_one_db) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()

    events = {
        row["id"]: row for row in dataset.read_preserved_history()["inference_events"]
    }
    assert events[INFERENCE_METERED]["usage_kind"] == "unknown"
    assert events[INFERENCE_METERED]["price_kind"] == "metered"
    assert events[INFERENCE_ZERO_LOCAL]["usage_kind"] == "unknown"
    assert events[INFERENCE_ZERO_LOCAL]["price_kind"] == "zero_local"
    assert events[INFERENCE_UNPRICED]["usage_kind"] == "unknown"
    assert events[INFERENCE_UNPRICED]["price_kind"] == "unpriced"
    assert all(event["reported_cost"] is None for event in events.values())


def test_missing_originals_stay_unavailable_and_are_not_reconstructed(
    phase_one_db,
) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()

    revisions = {
        row["document_id"]: row
        for row in dataset.missing_originals_are_marked_unavailable()
    }
    assert revisions[DOCUMENT_INDEXED]["document_status"] == "unavailable"
    assert revisions[DOCUMENT_INDEXED]["revision_status"] == "unavailable"
    assert revisions[DOCUMENT_INDEXED]["error_message"] == LEGACY_REUPLOAD_MESSAGE
    assert revisions[DOCUMENT_PROCESSING]["document_status"] == "failed"
    assert revisions[DOCUMENT_PROCESSING]["revision_status"] == "failed"
    assert revisions[DOCUMENT_PROCESSING]["error_message"] == LEGACY_INTERRUPTED_MESSAGE
    assert revisions[DOCUMENT_FAILED]["document_status"] == "failed"
    assert revisions[DOCUMENT_FAILED]["revision_status"] == "failed"
    assert revisions[DOCUMENT_FAILED]["error_message"] == LEGACY_INTERRUPTED_MESSAGE
    assert all(row["source_key"] is None for row in revisions.values())

    documents = {
        row["id"]: row for row in dataset.read_preserved_history()["documents"]
    }
    assert documents[DOCUMENT_INDEXED]["error_message"] == LEGACY_REUPLOAD_MESSAGE
    assert documents[DOCUMENT_PROCESSING]["error_message"] == LEGACY_INTERRUPTED_MESSAGE
    assert (
        documents[DOCUMENT_FAILED]["error_message"]
        == "Legacy parser rejected the workbook"
    )


def test_direct_roles_cannot_write_and_service_role_keeps_guarded_rpc(
    phase_one_db,
) -> None:
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()

    row = phase_one_db.query(
        """
        SELECT
            has_table_privilege('anon', 'public.meetings', 'INSERT'),
            has_table_privilege('anon', 'public.meetings', 'UPDATE'),
            has_table_privilege('anon', 'public.meetings', 'DELETE'),
            has_table_privilege('authenticated', 'public.meetings', 'INSERT'),
            has_function_privilege(
                'anon',
                'public.create_meeting_transaction(jsonb,jsonb)',
                'EXECUTE'
            ),
            has_function_privilege(
                'service_role',
                'public.create_meeting_transaction(jsonb,jsonb)',
                'EXECUTE'
            )
        """
    )[0]
    assert row == (False, False, False, False, False, True)


def test_upgraded_database_serves_the_final_api_surface() -> None:
    from main import app

    assert len(app.openapi()["paths"]) == 54
