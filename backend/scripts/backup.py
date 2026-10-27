"""Create and verify byte-inclusive Sabha backups.

A backup is a PostgreSQL custom-format dump plus every original source object
referenced by a live document revision. The manifest records hashes and row
counts so a restore can prove it is consuming the same bytes that were saved.
Source objects are read through the configured ``SourceStore`` adapter; the
manifest never contains credentials or a credentialed database URL.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import psycopg
from psycopg import sql

BACKUP_FORMAT = "sabha-backup/2"
MANIFEST_NAME = "manifest.json"
DUMP_NAME = "database.dump"
SOURCE_DIR = "source"
DELETION_EVENTS_NAME = "deletion_events.json"
LEDGER_FORMAT = "sabha-deletion-ledger/1"
DEFAULT_MAX_SOURCE_BYTES = 100 * 1024 * 1024


class BackupError(RuntimeError):
    """A backup could not be created completely."""


class BackupVerificationError(BackupError):
    """A backup is missing or does not match its manifest."""


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_pg_binary(name: str = "pg_dump") -> Path:
    """Locate a PostgreSQL client binary without assuming an author-local PATH."""
    configured = os.environ.get("SABHA_PG_BIN")
    if configured:
        candidate = Path(configured) / (f"{name}.exe" if os.name == "nt" else name)
        if candidate.is_file():
            return candidate
        candidate = Path(configured)
        if candidate.is_file():
            return candidate
        raise BackupError(f"{name} was not found in SABHA_PG_BIN={configured!r}")

    found = shutil.which(name)
    if found:
        return Path(found)

    try:
        import pgserver  # type: ignore[import-not-found]
    except ImportError:
        pgserver = None  # type: ignore[assignment]
    if pgserver is not None:
        bundled = (
            Path(pgserver.__file__).resolve().parent
            / "pginstall"
            / "bin"
            / (f"{name}.exe" if os.name == "nt" else name)
        )
        if bundled.is_file():
            return bundled

    raise BackupError(
        f"{name} was not found; install PostgreSQL client tools or set SABHA_PG_BIN"
    )


def _source_path(source_dir: Path, key: str) -> Path:
    """Map a storage key to a safe relative path inside the backup."""
    parts = PurePosixPath(key.lstrip("/")).parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise BackupError(f"source key {key!r} is not a safe relative path")
    return source_dir.joinpath(*parts)


def _public_tables(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
        """
    ).fetchall()
    return [str(row[0]) for row in rows]


def _row_counts(conn: psycopg.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in _public_tables(conn):
        row = conn.execute(
            sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(table))
        ).fetchone()
        counts[table] = int(row[0]) if row else 0
    return counts


def _source_keys(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT DISTINCT source_key
        FROM public.document_revisions
        WHERE source_key IS NOT NULL
          AND status <> 'revoked'
        ORDER BY source_key
        """
    ).fetchall()
    return [str(row[0]) for row in rows]


def _events_sha256(events: list[dict[str, Any]]) -> str:
    canonical = json.dumps(events, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _ledger_document(events: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "format": LEDGER_FORMAT,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "row_count": len(events),
        "events": events,
        "events_sha256": _events_sha256(events),
    }


def _deletion_events(conn: psycopg.Connection) -> list[dict[str, Any]]:
    exists = conn.execute(
        "SELECT to_regclass('public.knowledge_deletion_events') IS NOT NULL"
    ).fetchone()
    if not exists or not exists[0]:
        return []
    rows = conn.execute(
        """
        SELECT id, event_kind, target_id, document_id, revision_id,
               source_key, reason, occurred_at
        FROM public.knowledge_deletion_events
        ORDER BY occurred_at, id
        """
    ).fetchall()
    events: list[dict[str, Any]] = []
    for row in rows:
        occurred_at = row[7]
        events.append(
            {
                "id": str(row[0]),
                "event_kind": row[1],
                "target_id": str(row[2]),
                "document_id": str(row[3]) if row[3] is not None else None,
                "revision_id": str(row[4]) if row[4] is not None else None,
                "source_key": row[5],
                "reason": row[6],
                "occurred_at": (
                    occurred_at.isoformat()
                    if hasattr(occurred_at, "isoformat")
                    else str(occurred_at)
                ),
            }
        )
    return events


def export_deletion_events(database_url: str, output: str | Path) -> dict[str, Any]:
    """Write the append-only deletion ledger outside the SQL dump."""
    with psycopg.connect(database_url) as conn:
        events = _deletion_events(conn)
    ledger = _ledger_document(events)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return ledger


def verify_deletion_ledger(path: str | Path) -> dict[str, Any]:
    """Verify a deletion ledger's own integrity, or fail closed."""
    ledger_path = Path(path)
    try:
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BackupVerificationError(
            f"missing deletion ledger: {ledger_path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise BackupVerificationError(
            f"invalid deletion ledger: {exc}"
        ) from exc

    if ledger.get("format") != LEDGER_FORMAT:
        raise BackupVerificationError(
            f"unsupported deletion ledger format {ledger.get('format')!r}"
        )
    events = ledger.get("events")
    if not isinstance(events, list):
        raise BackupVerificationError("deletion ledger events must be a list")
    row_count = ledger.get("row_count")
    if row_count is None or int(row_count) != len(events):
        raise BackupVerificationError("deletion ledger row count does not match")
    if _events_sha256(events) != ledger.get("events_sha256"):
        raise BackupVerificationError("deletion ledger event checksum does not match")
    return ledger


def _database_name(database_url: str) -> str | None:
    try:
        import urllib.parse

        return urllib.parse.urlsplit(database_url).path.lstrip("/") or None
    except ValueError:
        return None


def create_backup(
    database_url: str,
    output_dir: str | Path,
    *,
    source_store: Any,
    pg_dump: str | Path | None = None,
    label: str | None = None,
    max_source_bytes: int = DEFAULT_MAX_SOURCE_BYTES,
) -> dict[str, Any]:
    """Write ``output_dir`` and return its manifest.

    The caller must provide a ``SourceStore`` implementation. Source bytes are
    downloaded through that adapter, not copied from a local cache.
    """
    destination = Path(output_dir)
    if destination.exists() and any(destination.iterdir()):
        raise BackupError(f"backup directory {destination} is not empty")
    destination.mkdir(parents=True, exist_ok=True)
    dump_path = destination / DUMP_NAME
    source_dir = destination / SOURCE_DIR
    source_dir.mkdir()

    dump_binary = Path(pg_dump) if pg_dump else find_pg_binary("pg_dump")
    completed = subprocess.run(
        [
            str(dump_binary),
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            "--file",
            str(dump_path),
            database_url,
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise BackupError(
            "pg_dump failed: " + (completed.stderr.strip() or "unknown error")
        )
    if not dump_path.is_file() or dump_path.stat().st_size == 0:
        raise BackupError("pg_dump did not produce a dump file")

    with psycopg.connect(database_url) as conn:
        row_counts = _row_counts(conn)
        source_keys = _source_keys(conn)
        deletion_events = _deletion_events(conn)

    deletion_events_path = destination / DELETION_EVENTS_NAME
    deletion_events_path.write_text(
        json.dumps(_ledger_document(deletion_events), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    source_store.ensure_ready()
    source_entries: list[dict[str, Any]] = []
    for key in source_keys:
        object_path = _source_path(source_dir, key)
        object_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            payload = source_store.download(key, max_bytes=max_source_bytes)
        except Exception as exc:
            raise BackupError(
                f"cannot back up source object {key!r}: {exc}"
            ) from exc
        object_path.write_bytes(payload)
        source_entries.append(
            {
                "key": key,
                "path": object_path.relative_to(destination).as_posix(),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "size": len(payload),
            }
        )

    manifest: dict[str, Any] = {
        "format": BACKUP_FORMAT,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "label": label,
        "database": {"name": _database_name(database_url)},
        "dump": {
            "path": DUMP_NAME,
            "sha256": _sha256_file(dump_path),
            "size": dump_path.stat().st_size,
        },
        "row_counts": row_counts,
        "deletion_events": {
            "path": DELETION_EVENTS_NAME,
            "sha256": _sha256_file(deletion_events_path),
            "size": deletion_events_path.stat().st_size,
            "row_count": len(deletion_events),
            "events_sha256": _events_sha256(deletion_events),
        },
        "source_objects": source_entries,
    }
    (destination / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def verify_backup(backup_dir: str | Path) -> dict[str, Any]:
    """Verify every file named by a backup manifest, or fail closed."""
    destination = Path(backup_dir)
    manifest_path = destination / MANIFEST_NAME
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BackupVerificationError(f"missing backup manifest: {manifest_path}") from exc
    except json.JSONDecodeError as exc:
        raise BackupVerificationError(f"invalid backup manifest: {exc}") from exc

    if manifest.get("format") != BACKUP_FORMAT:
        raise BackupVerificationError(
            f"unsupported backup format {manifest.get('format')!r}"
        )

    dump = manifest.get("dump") or {}
    dump_path = destination / str(dump.get("path") or "")
    if not dump_path.is_file():
        raise BackupVerificationError("backup dump is missing")
    if dump_path.stat().st_size != int(dump.get("size") or -1):
        raise BackupVerificationError("backup dump size does not match the manifest")
    if _sha256_file(dump_path) != dump.get("sha256"):
        raise BackupVerificationError("backup dump checksum does not match the manifest")

    ledger_entry = manifest.get("deletion_events") or {}
    ledger_path = destination / str(ledger_entry.get("path") or "")
    if not ledger_path.is_file():
        raise BackupVerificationError("deletion ledger is missing from the backup")
    if ledger_path.stat().st_size != int(ledger_entry.get("size") or -1):
        raise BackupVerificationError("deletion ledger size does not match the manifest")
    if _sha256_file(ledger_path) != ledger_entry.get("sha256"):
        raise BackupVerificationError(
            "deletion ledger checksum does not match the manifest"
        )
    ledger = verify_deletion_ledger(ledger_path)
    ledger_row_count = ledger.get("row_count")
    manifest_row_count = ledger_entry.get("row_count")
    if (
        ledger_row_count is None
        or manifest_row_count is None
        or int(ledger_row_count) != int(manifest_row_count)
    ):
        raise BackupVerificationError(
            "deletion ledger row count does not match the manifest"
        )
    if ledger.get("events_sha256") != ledger_entry.get("events_sha256"):
        raise BackupVerificationError(
            "deletion ledger event checksum does not match the manifest"
        )

    for entry in manifest.get("source_objects") or []:
        path = destination / str(entry.get("path") or "")
        if not path.is_file():
            raise BackupVerificationError(
                f"source object {entry.get('key')!r} is missing from the backup"
            )
        if path.stat().st_size != int(entry.get("size") or -1):
            raise BackupVerificationError(
                f"source object {entry.get('key')!r} size does not match the manifest"
            )
        if _sha256_file(path) != entry.get("sha256"):
            raise BackupVerificationError(
                f"source object {entry.get('key')!r} checksum does not match the manifest"
            )
    return manifest


def _source_store_from_settings():
    from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
    from app.platform.config import settings

    if not settings.supabase_service_key:
        raise BackupError(
            "SUPABASE_SERVICE_KEY is required to back up original source bytes"
        )
    return SupabaseSourceStore(
        url=settings.supabase_url,
        service_key=settings.supabase_service_key,
        bucket=settings.knowledge_bucket,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL connection URL (defaults to DATABASE_URL)",
    )
    parser.add_argument("--output", type=Path, help="backup directory")
    parser.add_argument("--label", default=None, help="human-readable backup label")
    parser.add_argument(
        "--pg-dump",
        default=None,
        help="path to pg_dump (defaults to PATH, SABHA_PG_BIN, or pgserver)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="verify an existing backup instead of creating one",
    )
    parser.add_argument(
        "--export-ledger",
        type=Path,
        default=None,
        help=(
            "write the append-only deletion ledger outside the backup; keep it "
            "across backup rotations so a restore cannot resurrect deletions"
        ),
    )
    args = parser.parse_args(argv)

    try:
        if args.export_ledger is not None:
            database_url = args.database_url or os.environ.get("DATABASE_URL")
            if not database_url:
                raise BackupError("--database-url or DATABASE_URL is required")
            ledger = export_deletion_events(database_url, args.export_ledger)
            print(
                f"Deletion ledger written: {ledger['row_count']} events, "
                f"sha256 {ledger['events_sha256']}"
            )
            return 0
        if not args.output:
            raise BackupError("--output is required")
        if args.verify:
            manifest = verify_backup(args.output)
            print(
                f"Backup verified: {len(manifest.get('source_objects') or [])} "
                f"source objects, {manifest['dump']['size']} dump bytes"
            )
            return 0
        database_url = args.database_url or os.environ.get("DATABASE_URL")
        if not database_url:
            raise BackupError("--database-url or DATABASE_URL is required")
        manifest = create_backup(
            database_url,
            args.output,
            source_store=_source_store_from_settings(),
            pg_dump=args.pg_dump,
            label=args.label,
        )
        print(
            f"Backup written: {len(manifest['source_objects'])} source objects, "
            f"{len(manifest['row_counts'])} tables, {manifest['dump']['size']} dump bytes"
        )
        return 0
    except BackupError as exc:
        print(f"backup error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
