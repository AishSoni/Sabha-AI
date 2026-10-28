"""Spec-11 cutover rehearsal: fail part-way, resume, and never promise an unsafe restore.

Deployment is a migration run, not a single switch.  These tests prove the
properties an operator relies on during a maintenance window:

* a migration that fails mid-file leaves no half-applied schema and no
  tracking row, so the deploy stops at a known version;
* rerunning after the fix resumes exactly at the failed step;
* an edited migration file is rejected by checksum instead of silently
  diverging from the deployed schema;
* two deployers serialize on the advisory lock, so only one applies;
* a restore that predates an irreversible redaction cannot be declared
  complete while reconciliation is missing or physical cleanup is unfinished.
"""

from __future__ import annotations

import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import pytest

from scripts.migrate import (
    MIGRATIONS_DIR,
    MigrationError,
    apply_migrations,
    status,
)
from scripts.restore import RestoreError, restore_backup
from test_spec11_restore import (
    EVIDENCE_ID,
    RAW_PASSAGE,
    REVISION_ID,
    _prepare_backup,
    _raw_passage,
    _revision_status,
    _store,
)
from tests.doubles.storage_api import FakeStorageApi

pytestmark = pytest.mark.integration

FAILED_STEP = "020_meeting_closing_schema"
FAILED_STEP_SCHEMA = "public.cutover_probe"


def _history(root: Path) -> Path:
    """Copy the real migration history so a rehearsal can break one file."""
    target = root / "migrations"
    target.mkdir()
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        shutil.copyfile(path, target / path.name)
    return target


def _applied_versions(db) -> list[str]:
    rows = db.query("SELECT version FROM schema_migrations ORDER BY version")
    return [str(row[0]) for row in rows]


def _relation(db, name: str) -> bool:
    return bool(db.query("SELECT to_regclass(%s) IS NOT NULL", (name,))[0][0])


def test_failed_migration_rolls_back_and_resumes_at_the_failed_step(
    empty_db, tmp_path
) -> None:
    migrations = _history(tmp_path)
    step = migrations / f"{FAILED_STEP}.sql"
    original = step.read_text(encoding="utf-8")
    step.write_text(
        original
        + "\nCREATE TABLE public.cutover_probe (id integer);\n"
        + "DO $$ BEGIN RAISE EXCEPTION 'spec11 cutover rehearsal failure'; END $$;\n",
        encoding="utf-8",
    )

    assert all(applied is False for _, applied in status(empty_db.uri, migrations_dir=migrations))

    with pytest.raises(psycopg.errors.RaiseException):
        apply_migrations(empty_db.uri, migrations_dir=migrations)

    # The deploy stops at a known version: everything before the failed step
    # is recorded, the failed step is not.
    versions = _applied_versions(empty_db)
    assert versions[-1] == "019_turn_queue_rpcs"
    assert FAILED_STEP not in versions
    # Mid-file work is rolled back with the migration, not left behind.
    assert _relation(empty_db, FAILED_STEP_SCHEMA) is False
    assert _relation(empty_db, "public.meeting_closings") is False
    assert _relation(empty_db, "public.document_revisions") is False

    # Recovery after the mid-cutover failure: fix the step and rerun.
    step.write_text(original, encoding="utf-8")
    resumed = apply_migrations(empty_db.uri, migrations_dir=migrations)

    assert resumed[0] == FAILED_STEP
    assert resumed[-1] == "030_database_read_isolation"
    assert _relation(empty_db, "public.meeting_closings") is True
    assert _relation(empty_db, "public.document_revisions") is True
    assert all(applied is True for _, applied in status(empty_db.uri, migrations_dir=migrations))


def test_edited_migration_is_rejected_by_checksum_before_touching_schema(
    empty_db, tmp_path
) -> None:
    migrations = _history(tmp_path)
    apply_migrations(empty_db.uri, migrations_dir=migrations)
    before = _applied_versions(empty_db)

    edited = migrations / "021_closing_lifecycle_rpcs.sql"
    edited.write_text(
        edited.read_text(encoding="utf-8") + "\n-- operator edit\n", encoding="utf-8"
    )

    with pytest.raises(MigrationError, match="checksum mismatch"):
        apply_migrations(empty_db.uri, migrations_dir=migrations)
    with pytest.raises(MigrationError, match="checksum mismatch"):
        status(empty_db.uri, migrations_dir=migrations)

    assert _applied_versions(empty_db) == before


def test_two_deployers_serialize_on_the_advisory_lock(empty_db, tmp_path) -> None:
    baseline = tmp_path / "baseline.sql"
    baseline.write_text("CREATE TABLE base_step (id integer);\n", encoding="utf-8")
    migrations = tmp_path / "small-migrations"
    migrations.mkdir()
    (migrations / "002_second_step.sql").write_text(
        "CREATE TABLE second_step (id integer);\n", encoding="utf-8"
    )
    (migrations / "003_third_step.sql").write_text(
        "CREATE TABLE third_step (id integer);\n", encoding="utf-8"
    )

    def deploy() -> list[str]:
        return apply_migrations(
            empty_db.uri, baseline_path=baseline, migrations_dir=migrations
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [future.result() for future in [pool.submit(deploy), pool.submit(deploy)]]

    expected = ["000_baseline", "002_second_step", "003_third_step"]
    assert sorted(results, key=len) == [[], expected]
    assert _applied_versions(empty_db) == expected


class _DeleteFailingStore:
    """Source bytes restore, but physical deletion is unavailable."""

    def __init__(self, inner):
        self._inner = inner

    def ensure_ready(self) -> None:
        self._inner.ensure_ready()

    def put(self, *args, **kwargs):
        return self._inner.put(*args, **kwargs)

    def download(self, key, *, max_bytes):
        return self._inner.download(key, max_bytes=max_bytes)

    def exists(self, key):
        return self._inner.exists(key)

    def delete(self, key):
        raise RuntimeError("source store unavailable during maintenance window")

    def list_prefix(self, prefix, *, limit=100, recursive=False):
        return self._inner.list_prefix(prefix, limit=limit, recursive=recursive)


class _DeleteFailingVectors:
    async def ensure_collection(self, name):
        return True

    async def delete_revision(self, collection, revision_id):
        raise RuntimeError("vector projection unavailable during maintenance window")

    async def delete_collection(self, collection):
        raise RuntimeError("vector projection unavailable during maintenance window")


def _cleanup_with(db, store, vectors):
    import asyncio

    from app.modules.knowledge.application.deletion import CleanupWorker
    from app.modules.knowledge.infrastructure.supabase import SupabaseKnowledgeRepository
    from tests.doubles.supabase_stub import stub_for

    worker = CleanupWorker(
        persistence=SupabaseKnowledgeRepository(lambda: stub_for(db)),
        source_store=store,
        vectors=vectors,
    )
    return lambda: asyncio.run(worker.run(limit=100))


def test_restore_never_promises_to_undo_an_irreversible_redaction(
    phase_one_db, empty_db, tmp_path
) -> None:
    backup_dir, fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    fake = FakeStorageApi("sabha-sources")
    marker = tmp_path / "restore-complete.json"

    # 1) Restoring without reconciliation is refused outright.
    with pytest.raises(RestoreError, match="cleanup callback"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_store(fake),
            ledger_path=fresh_ledger,
            cleanup=None,
            marker_path=marker,
        )
    assert marker.exists() is False
    # Replay already closed eligibility before anyone could reopen retrieval.
    assert _revision_status(empty_db, REVISION_ID) == "revoked"
    assert _raw_passage(empty_db, EVIDENCE_ID) is None

    # 2) A replay that cannot drain physical cleanup must not report success.
    with pytest.raises(RestoreError, match="cleanup intents remain unresolved"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_DeleteFailingStore(_store(fake)),
            ledger_path=fresh_ledger,
            cleanup=_cleanup_with(
                empty_db,
                _DeleteFailingStore(_store(fake)),
                _DeleteFailingVectors(),
            ),
            marker_path=marker,
        )
    assert marker.exists() is False
    assert _revision_status(empty_db, REVISION_ID) == "revoked"
    assert _raw_passage(empty_db, EVIDENCE_ID) is None

    # 3) Only a fully reconciled restore may be marked complete, and it still
    #    cannot bring the redacted passage back.
    class _RecordingVectors:
        async def ensure_collection(self, name):
            return True

        async def delete_revision(self, collection, revision_id):
            return 1

        async def delete_collection(self, collection):
            return True

    result = restore_backup(
        backup_dir,
        empty_db.uri,
        source_store=_store(fake),
        ledger_path=fresh_ledger,
        cleanup=_cleanup_with(empty_db, _store(fake), _RecordingVectors()),
        marker_path=marker,
    )

    assert result["complete"] is True
    assert marker.is_file()
    assert result["replay"]["revoked_events"] >= 1
    assert _revision_status(empty_db, REVISION_ID) == "revoked"
    assert _raw_passage(empty_db, EVIDENCE_ID) is None
    assert RAW_PASSAGE not in marker.read_text(encoding="utf-8")
