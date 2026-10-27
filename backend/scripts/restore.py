"""Restore a Sabha backup and reconcile deletions before reopening retrieval.

The SQL dump is only one half of a restore: it may predate deletions and
redactions. The separately retained append-only ledger is replayed after the
dump, then cleanup drains every physical-removal intent. A restore only
succeeds after both steps complete and no unresolved intents remain.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import io
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import psycopg

from scripts.backup import (
    BACKUP_FORMAT,
    DELETION_EVENTS_NAME,
    BackupError,
    BackupVerificationError,
    find_pg_binary,
    verify_backup,
    verify_deletion_ledger,
)

DEFAULT_MAX_SOURCE_BYTES = 100 * 1024 * 1024


class RestoreError(RuntimeError):
    """A restore could not be completed safely."""


class RestoreVerificationError(RestoreError):
    """A restore input is incomplete, missing, or does not match its manifest."""


def _run(command: list[str], action: str) -> None:
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RestoreError(action + ": " + (completed.stderr.strip() or "failed"))


def _load_ledger(
    destination: Path,
    manifest: dict[str, Any],
    ledger_path: str | Path | None,
) -> dict[str, Any]:
    if ledger_path is not None:
        return verify_deletion_ledger(ledger_path)

    entry = manifest.get("deletion_events") or {}
    path = destination / str(entry.get("path") or DELETION_EVENTS_NAME)
    if not path.is_file():
        raise RestoreVerificationError("backup has no deletion ledger")
    ledger = verify_deletion_ledger(path)
    ledger_row_count = ledger.get("row_count")
    manifest_row_count = entry.get("row_count")
    if (
        ledger_row_count is None
        or manifest_row_count is None
        or int(ledger_row_count) != int(manifest_row_count)
    ):
        raise RestoreVerificationError("deletion ledger row count changed")
    if ledger.get("events_sha256") != entry.get("events_sha256"):
        raise RestoreVerificationError("deletion ledger checksum changed")
    return ledger


def _restore_dump(
    destination: Path,
    manifest: dict[str, Any],
    database_url: str,
    pg_restore: str | Path | None,
) -> None:
    dump_entry = manifest.get("dump") or {}
    dump_path = destination / str(dump_entry.get("path") or "database.dump")
    if not dump_path.is_file():
        raise RestoreVerificationError("backup dump is missing")
    binary = Path(pg_restore) if pg_restore else find_pg_binary("pg_restore")
    _run(
        [
            str(binary),
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "--dbname",
            database_url,
            str(dump_path),
        ],
        "pg_restore failed",
    )


def _restore_source_objects(
    destination: Path,
    manifest: dict[str, Any],
    source_store: Any,
    *,
    max_source_bytes: int,
) -> list[str]:
    restored: list[str] = []
    source_store.ensure_ready()
    for entry in manifest.get("source_objects") or []:
        key = str(entry.get("key") or "")
        path = destination / str(entry.get("path") or "")
        if not path.is_file():
            raise RestoreVerificationError(f"source object {key!r} is missing")
        payload = path.read_bytes()
        if len(payload) != int(entry.get("size") or -1):
            raise RestoreVerificationError(
                f"source object {key!r} size does not match the manifest"
            )
        if hashlib.sha256(payload).hexdigest() != entry.get("sha256"):
            raise RestoreVerificationError(
                f"source object {key!r} checksum does not match the manifest"
            )
        if len(payload) > max_source_bytes:
            raise RestoreVerificationError(
                f"source object {key!r} exceeds the restore byte budget"
            )
        source_store.put(
            key,
            io.BytesIO(payload),
            content_type="application/octet-stream",
            max_bytes=max_source_bytes,
        )
        restored.append(key)
    return restored


def _insert_events(
    conn: psycopg.Connection, events: list[dict[str, Any]]
) -> int:
    if not events:
        return 0
    exists = conn.execute(
        "SELECT to_regclass('public.knowledge_deletion_events') IS NOT NULL"
    ).fetchone()
    if not exists or not exists[0]:
        raise RestoreVerificationError(
            "backup has deletion events but no deletion ledger table"
        )
    inserted = 0
    for event in events:
        result = conn.execute(
            """
            INSERT INTO public.knowledge_deletion_events (
                id, event_kind, target_id, document_id, revision_id,
                source_key, reason, occurred_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (event_kind, target_id) DO NOTHING
            """,
            (
                event.get("id"),
                event.get("event_kind"),
                event.get("target_id"),
                event.get("document_id"),
                event.get("revision_id"),
                event.get("source_key"),
                event.get("reason"),
                event.get("occurred_at"),
            ),
        )
        inserted += int(result.rowcount or 0)
    return inserted


def _replay_deletions(conn: psycopg.Connection) -> dict[str, Any]:
    row = conn.execute(
        "SELECT public.knowledge_replay_deletion_events(%s)",
        ("1970-01-01T00:00:00+00:00",),
    ).fetchone()
    return (row[0] if row else {}) or {}


def _drain_cleanup(cleanup: Callable[[], Any]) -> Any:
    result = cleanup()
    if inspect.isawaitable(result):
        return asyncio.run(result)
    return result


def _unresolved_cleanup(conn: psycopg.Connection) -> int:
    row = conn.execute(
        "SELECT count(*) FROM public.knowledge_cleanup WHERE resolved_at IS NULL"
    ).fetchone()
    return int(row[0]) if row else 0


def restore_backup(
    backup_dir: str | Path,
    database_url: str,
    *,
    source_store: Any,
    pg_restore: str | Path | None = None,
    ledger_path: str | Path | None = None,
    cleanup: Callable[[], Any] | None = None,
    marker_path: str | Path | None = None,
    max_source_bytes: int = DEFAULT_MAX_SOURCE_BYTES,
) -> dict[str, Any]:
    """Restore dump + bytes, replay the ledger, and drain cleanup.

    ``ledger_path`` is the independently retained ledger that includes
    deletions after the dump was taken. If omitted, the ledger stored with the
    backup is used. The function never returns success while cleanup intents
    remain unresolved.
    """
    destination = Path(backup_dir)
    try:
        manifest = verify_backup(destination)
    except BackupError as exc:
        raise RestoreVerificationError(str(exc)) from exc
    if manifest.get("format") != BACKUP_FORMAT:
        raise RestoreVerificationError("unsupported backup format")

    ledger = _load_ledger(destination, manifest, ledger_path)
    _restore_dump(destination, manifest, database_url, pg_restore)
    restored_sources = _restore_source_objects(
        destination,
        manifest,
        source_store,
        max_source_bytes=max_source_bytes,
    )

    with psycopg.connect(database_url, autocommit=True) as conn:
        inserted = _insert_events(conn, ledger.get("events") or [])
        replay = _replay_deletions(conn)

    if cleanup is None:
        raise RestoreError(
            "restore requires a cleanup callback; retrieval must not reopen "
            "while deletion intents are pending"
        )
    cleanup_result = _drain_cleanup(cleanup)

    with psycopg.connect(database_url, autocommit=True) as conn:
        unresolved = _unresolved_cleanup(conn)

    if unresolved:
        raise RestoreError(
            f"restore is incomplete: {unresolved} cleanup intents remain unresolved"
        )

    result = {
        "complete": True,
        "database": manifest.get("database"),
        "deletion_events": int(ledger.get("row_count") or 0),
        "inserted_events": inserted,
        "replay": replay,
        "source_objects": restored_sources,
        "cleanup": cleanup_result,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if marker_path is not None:
        target = Path(marker_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return result
