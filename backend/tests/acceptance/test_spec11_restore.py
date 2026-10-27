"""Spec-11 restore rehearsal: bytes, ledger replay, and cleanup before reopening."""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import httpx
import pytest
from storage3 import SyncStorageClient

from app.modules.knowledge.application.deletion import CleanupWorker
from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
from app.modules.knowledge.infrastructure.supabase import SupabaseKnowledgeRepository
from scripts.backup import create_backup, export_deletion_events, verify_deletion_ledger
from scripts import restore as restore_module
from scripts.restore import RestoreError, restore_backup
from tests.doubles.storage_api import FakeStorageApi
from tests.doubles.supabase_stub import stub_for
from tests.support.spec11 import MEETING_ACTIVE, UpgradeDataset

pytestmark = pytest.mark.integration

DOCUMENT_ID = "f3500000-0000-4000-8000-000000000001"
REVISION_ID = "f3600000-0000-4000-8000-000000000001"
EVIDENCE_ID = "f3700000-0000-4000-8000-000000000001"
SOURCE_BYTES = b"the original board pack: pricing evidence sentinel"
SOURCE_KEY = f"sources/meeting/{MEETING_ACTIVE}/{DOCUMENT_ID}/{REVISION_ID}/board-pack.txt"
RAW_PASSAGE = "sensitive board-pack passage"


class RecordingVectors:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str]] = []

    async def ensure_collection(self, name):
        return True

    async def delete_revision(self, collection, revision_id):
        self.deleted.append((collection, str(revision_id)))
        return 1

    async def delete_collection(self, collection):
        return True


def _store(fake: FakeStorageApi, *, bucket: str = "sabha-sources") -> SupabaseSourceStore:
    client = httpx.Client(transport=fake.transport())

    def factory() -> SyncStorageClient:
        return SyncStorageClient(
            url="http://storage.local/storage/v1",
            headers={
                "apikey": "service-key",
                "Authorization": "Bearer service-key",
            },
            http_client=client,
        )

    return SupabaseSourceStore(
        url="http://storage.local",
        service_key="service-key",
        bucket=bucket,
        client_factory=factory,
    )


def _seed_source_backed_revision(db) -> None:
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO public.documents (
                id, meeting_id, file_name, file_type, file_size_bytes,
                status, chunk_count
            ) VALUES (%s, %s, 'board-pack.txt', 'text/plain', %s, 'ready', 1)
            """,
            (DOCUMENT_ID, MEETING_ACTIVE, len(SOURCE_BYTES)),
        )
        conn.execute(
            """
            INSERT INTO public.document_revisions (
                id, document_id, revision_number, status, source_key,
                source_sha256, source_size_bytes, file_type,
                qdrant_collection, chunk_count, published_at
            ) VALUES (%s, %s, 1, 'ready', %s, %s, %s, 'text/plain',
                      'meeting_' || %s || '_shared', 1, NOW())
            """,
            (
                REVISION_ID,
                DOCUMENT_ID,
                SOURCE_KEY,
                hashlib.sha256(SOURCE_BYTES).hexdigest(),
                len(SOURCE_BYTES),
                MEETING_ACTIVE,
            ),
        )
        conn.execute(
            """
            INSERT INTO public.retrieved_passage_evidence (
                id, meeting_id, document_id, revision_id, source_name,
                raw_passage, score
            ) VALUES (%s, %s, %s, %s, 'board-pack.txt', %s, 0.9)
            """,
            (EVIDENCE_ID, MEETING_ACTIVE, DOCUMENT_ID, REVISION_ID, RAW_PASSAGE),
        )


def _prepare_backup(db, tmp_path: Path):
    dataset = UpgradeDataset(db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()
    _seed_source_backed_revision(db)

    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", SOURCE_KEY, SOURCE_BYTES)
    backup_dir = tmp_path / "backup"
    create_backup(db.uri, backup_dir, source_store=_store(fake), label="spec11")

    with db.connect() as conn:
        conn.execute(
            "SELECT public.knowledge_revoke_document(%s, %s)",
            (DOCUMENT_ID, "spec11 restore rehearsal"),
        )
        conn.execute(
            "SELECT public.knowledge_redact_evidence(%s, %s)",
            (REVISION_ID, "spec11 restore rehearsal"),
        )

    fresh_ledger = tmp_path / "fresh-ledger.json"
    export_deletion_events(db.uri, fresh_ledger)
    return backup_dir, fresh_ledger


def _cleanup(target_db, fake: FakeStorageApi, vectors: RecordingVectors):
    repository = SupabaseKnowledgeRepository(lambda: stub_for(target_db))
    worker = CleanupWorker(
        persistence=repository,
        source_store=_store(fake),
        vectors=vectors,
    )
    return lambda: asyncio.run(worker.run(limit=100))


def _document_status(db, document_id: str) -> str | None:
    rows = db.query("SELECT status FROM public.documents WHERE id = %s", (document_id,))
    return str(rows[0][0]) if rows else None


def _revision_status(db, revision_id: str) -> str | None:
    rows = db.query(
        "SELECT status FROM public.document_revisions WHERE id = %s", (revision_id,)
    )
    return str(rows[0][0]) if rows else None


def _raw_passage(db, evidence_id: str) -> str | None:
    rows = db.query(
        "SELECT raw_passage FROM public.retrieved_passage_evidence WHERE id = %s",
        (evidence_id,),
    )
    return rows[0][0] if rows else None


def test_stale_backup_ledger_can_resurrect_deleted_knowledge(phase_one_db, empty_db, tmp_path):
    backup_dir, _fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    fake = FakeStorageApi("sabha-sources")
    vectors = RecordingVectors()

    result = restore_backup(
        backup_dir,
        empty_db.uri,
        source_store=_store(fake),
        cleanup=_cleanup(empty_db, fake, vectors),
    )

    assert result["complete"] is True
    assert _document_status(empty_db, DOCUMENT_ID) == "ready"
    assert _revision_status(empty_db, REVISION_ID) == "ready"
    assert _raw_passage(empty_db, EVIDENCE_ID) == RAW_PASSAGE


def test_fresh_ledger_revokes_and_redacts_before_restore_completes(phase_one_db, empty_db, tmp_path):
    backup_dir, fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    fake = FakeStorageApi("sabha-sources")
    vectors = RecordingVectors()

    result = restore_backup(
        backup_dir,
        empty_db.uri,
        source_store=_store(fake),
        ledger_path=fresh_ledger,
        cleanup=_cleanup(empty_db, fake, vectors),
    )

    assert result["complete"] is True
    assert result["inserted_events"] == 2
    assert _document_status(empty_db, DOCUMENT_ID) == "revoked"
    assert _revision_status(empty_db, REVISION_ID) == "revoked"
    assert _raw_passage(empty_db, EVIDENCE_ID) is None
    assert SOURCE_KEY not in fake.keys("sabha-sources")
    assert vectors.deleted == [("meeting_" + MEETING_ACTIVE + "_shared", REVISION_ID)]
    unresolved = empty_db.query(
        "SELECT count(*) FROM public.knowledge_cleanup WHERE resolved_at IS NULL"
    )
    assert unresolved[0][0] == 0


def test_restore_fails_closed_when_the_ledger_is_missing_or_tampered(phase_one_db, empty_db, tmp_path):
    backup_dir, _fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    ledger = backup_dir / "deletion_events.json"
    ledger.write_text("{not-json", encoding="utf-8")

    with pytest.raises(RestoreError, match="ledger"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_store(FakeStorageApi("sabha-sources")),
            cleanup=lambda: None,
        )

    ledger.unlink()
    with pytest.raises(RestoreError, match="ledger"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_store(FakeStorageApi("sabha-sources")),
            cleanup=lambda: None,
        )


def test_restore_fails_closed_when_source_bytes_are_missing_or_tampered(phase_one_db, empty_db, tmp_path):
    backup_dir, _fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    source_file = backup_dir / "source" / Path(*SOURCE_KEY.split("/"))

    source_file.write_bytes(b"x" * len(SOURCE_BYTES))
    with pytest.raises(RestoreError, match="checksum"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_store(FakeStorageApi("sabha-sources")),
            cleanup=lambda: None,
        )

    source_file.unlink()
    with pytest.raises(RestoreError, match="missing"):
        restore_backup(
            backup_dir,
            empty_db.uri,
            source_store=_store(FakeStorageApi("sabha-sources")),
            cleanup=lambda: None,
        )


class _CliLifecycle:
    """Stands in for the production Knowledge composition the CLI builds."""

    def __init__(self, store, worker):
        self.source_store = store
        self._worker = worker

    async def run_cleanup(self, *, limit=50):
        return await self._worker.run(limit=limit)


def test_operator_restore_cli_drains_cleanup_before_reporting_success(
    phase_one_db, empty_db, tmp_path, monkeypatch
):
    backup_dir, fresh_ledger = _prepare_backup(phase_one_db, tmp_path)
    fake = FakeStorageApi("sabha-sources")
    store = _store(fake)
    worker = CleanupWorker(
        persistence=SupabaseKnowledgeRepository(lambda: stub_for(empty_db)),
        source_store=store,
        vectors=RecordingVectors(),
    )
    monkeypatch.setattr(
        restore_module,
        "_production_lifecycle",
        lambda: _CliLifecycle(store, worker),
    )

    marker = tmp_path / "restore-complete.json"
    exit_code = restore_module.main(
        [
            "--backup",
            str(backup_dir),
            "--database-url",
            empty_db.uri,
            "--ledger",
            str(fresh_ledger),
            "--marker",
            str(marker),
        ]
    )

    assert exit_code == 0
    payload = json.loads(marker.read_text(encoding="utf-8"))
    assert payload["complete"] is True
    assert payload["cleanup"]["resolved"] >= 2
    assert _revision_status(empty_db, REVISION_ID) == "revoked"
    assert _raw_passage(empty_db, EVIDENCE_ID) is None
    assert SOURCE_KEY not in fake.keys("sabha-sources")


def test_operator_restore_cli_refuses_to_guess_a_database(tmp_path, capsys):
    exit_code = restore_module.main(["--backup", str(tmp_path)])

    assert exit_code == 1
    assert "--database-url or DATABASE_URL is required" in capsys.readouterr().err


def test_operator_exports_the_ledger_outside_the_backup(phase_one_db, tmp_path, capsys):
    from scripts import backup as backup_module

    _prepare_backup(phase_one_db, tmp_path)
    ledger_path = tmp_path / "ledgers" / "deletion-events.json"
    exit_code = backup_module.main(
        [
            "--export-ledger",
            str(ledger_path),
            "--database-url",
            phase_one_db.uri,
        ]
    )

    assert exit_code == 0
    ledger = verify_deletion_ledger(ledger_path)
    assert ledger["row_count"] >= 1
    assert "Deletion ledger written" in capsys.readouterr().out
