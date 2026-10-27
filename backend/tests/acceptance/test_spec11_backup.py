"""Spec-11 backup rehearsal: SQL dump plus actual source bytes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx
import pytest
from storage3 import SyncStorageClient

from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
from scripts.backup import (
    BackupError,
    BackupVerificationError,
    create_backup,
    verify_backup,
)
from tests.doubles.storage_api import FakeStorageApi
from tests.support.spec11 import MEETING_ACTIVE, UpgradeDataset

pytestmark = pytest.mark.integration

DOCUMENT_ID = "f3500000-0000-4000-8000-000000000001"
REVISION_ID = "f3600000-0000-4000-8000-000000000001"
SOURCE_BYTES = b"the original board pack: pricing evidence sentinel"
SOURCE_KEY = f"sources/meeting/{MEETING_ACTIVE}/{DOCUMENT_ID}/{REVISION_ID}/board-pack.txt"


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


def test_backup_contains_sql_and_actual_source_bytes(phase_one_db, tmp_path):
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()
    _seed_source_backed_revision(phase_one_db)

    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", SOURCE_KEY, SOURCE_BYTES)
    store = _store(fake)

    backup_dir = tmp_path / "backup"
    manifest = create_backup(phase_one_db.uri, backup_dir, source_store=store, label="spec11")

    assert manifest["dump"]["size"] > 0
    assert manifest["row_counts"]["document_revisions"] == 6
    assert manifest["row_counts"]["meetings"] == 4
    assert len(manifest["source_objects"]) == 1
    entry = manifest["source_objects"][0]
    assert entry["key"] == SOURCE_KEY
    assert entry["sha256"] == hashlib.sha256(SOURCE_BYTES).hexdigest()
    assert (backup_dir / entry["path"]).read_bytes() == SOURCE_BYTES

    verified = verify_backup(backup_dir)
    assert verified["dump"]["sha256"] == manifest["dump"]["sha256"]
    assert "service-key" not in (backup_dir / "manifest.json").read_text()
    assert phase_one_db.uri not in (backup_dir / "manifest.json").read_text()


def test_backup_fails_when_a_referenced_source_object_is_missing(phase_one_db, tmp_path):
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()
    _seed_source_backed_revision(phase_one_db)

    fake = FakeStorageApi("sabha-sources")
    store = _store(fake)

    with pytest.raises(BackupError, match="cannot back up source object"):
        create_backup(phase_one_db.uri, tmp_path / "missing", source_store=store)


def test_verify_backup_fails_closed_on_corrupt_source_bytes(phase_one_db, tmp_path):
    dataset = UpgradeDataset(phase_one_db)
    dataset.seed_phase_one_data()
    dataset.apply_target_migrations()
    _seed_source_backed_revision(phase_one_db)

    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", SOURCE_KEY, SOURCE_BYTES)
    backup_dir = tmp_path / "backup"
    create_backup(phase_one_db.uri, backup_dir, source_store=_store(fake))

    source_file = backup_dir / "source" / Path(*SOURCE_KEY.split("/"))
    source_file.write_bytes(b"x" * len(SOURCE_BYTES))
    with pytest.raises(BackupVerificationError, match="checksum"):
        verify_backup(backup_dir)
