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

BACKUP_FORMAT = "sabha-backup/1"
MANIFEST_NAME = "manifest.json"
DUMP_NAME = "database.dump"
SOURCE_DIR = "source"
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
    parser.add_argument("--output", required=True, type=Path, help="backup directory")
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
    args = parser.parse_args(argv)

    try:
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
