"""Offline replay package publication (spec-17).

The runtime never stages, seeds, repairs, publishes, migrates, or deletes
packages. This tool is the only writer: it validates a data-only package,
uploads and re-hashes its assets with the offline Storage credential, then
stages every row and flips the package to ``published`` in one transaction.
Reader access is limited to the ``v_published_*`` views.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from app.platform.replay_database import PRIVILEGED_IDENTITIES
from app.replay.package import (
    LoadedPackage,
    PackageIssue,
    load_package,
    validate_package,
)
from app.replay.storage import StoragePublisher, SupabaseStoragePublisher

PROVISIONER_ROLE = "sabha_replay_provisioner"
DEFAULT_BUCKET = "replay-assets"


class PublicationError(RuntimeError):
    """A package cannot be published safely."""

    def __init__(self, message: str, issues: list[PackageIssue] | None = None):
        self.issues = tuple(issues or ())
        super().__init__(message)


@dataclass(frozen=True)
class PublicationResult:
    package_id: str
    version: str
    content_sha256: str
    status: str
    checkpoints: int
    assets: int
    already_published: bool = False


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def bundle_sha256(bundle: Any) -> str:
    return hashlib.sha256(canonical_json(bundle).encode("utf-8")).hexdigest()


def asset_storage_path(package_id: str, version: str, path: str, sha256: str) -> str:
    suffix = Path(path).suffix
    return f"{package_id}/{version}/{sha256}{suffix}"


def assert_provisioner_identity(conn: psycopg.Connection) -> str:
    current_user, is_superuser = conn.execute(
        "SELECT current_user, current_setting('is_superuser')::boolean"
    ).fetchone()
    if is_superuser or current_user in PRIVILEGED_IDENTITIES:
        raise PublicationError(
            "publication must not use a superuser or live backend role"
        )
    if not conn.execute(
        "SELECT pg_has_role(current_user, %s, 'MEMBER')", (PROVISIONER_ROLE,)
    ).fetchone()[0]:
        raise PublicationError(
            f"publication must connect as a member of {PROVISIONER_ROLE} "
            "(python -m scripts.replay_roles --provisioner-login ...)"
        )
    return current_user


def database_url(explicit: str | None = None) -> str:
    url = (explicit or os.environ.get("REPLAY_PROVISIONER_DATABASE_URL", "")).strip()
    if not url:
        raise PublicationError(
            "REPLAY_PROVISIONER_DATABASE_URL is required; publication never "
            "falls back to the live DATABASE_URL"
        )
    return url


def _connect(url: str) -> psycopg.Connection:
    conn = psycopg.connect(url)
    conn.autocommit = False
    return conn


def _existing(conn, package_id: str, version: str):
    return conn.execute(
        "SELECT status, content_sha256 FROM replay.package "
        "WHERE package_id = %s AND version = %s FOR UPDATE",
        (package_id, version),
    ).fetchone()


def _insert_checkpoints(conn, package: LoadedPackage) -> None:
    manifest = package.manifest
    for checkpoint_id in manifest.checkpoints:
        checkpoint = package.checkpoints[checkpoint_id]
        conn.execute(
            """
            INSERT INTO replay.checkpoint
                (package_id, version, checkpoint_id, ordinal, phase, bundle, sha256)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                manifest.package_id,
                manifest.version,
                checkpoint.checkpoint_id,
                checkpoint.ordinal,
                checkpoint.phase,
                Jsonb(checkpoint.model_dump(mode="json")),
                bundle_sha256(checkpoint.model_dump(mode="json")),
            ),
        )


def _insert_tapes(conn, package: LoadedPackage) -> None:
    manifest = package.manifest
    for tape_id in manifest.tapes:
        tape = package.tapes[tape_id]
        conn.execute(
            """
            INSERT INTO replay.turn_tape
                (package_id, version, tape_id, meeting_id, operation_id,
                 participant_id, request_key, initial_checkpoint,
                 completed_checkpoint)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                manifest.package_id,
                manifest.version,
                tape.tape_id,
                tape.meeting_id,
                tape.operation_id,
                tape.participant_id,
                tape.request_key,
                tape.initial_checkpoint,
                tape.completed_checkpoint,
            ),
        )
        for event in tape.events:
            conn.execute(
                """
                INSERT INTO replay.turn_event
                    (package_id, version, tape_id, event_id, sequence, type,
                     payload, delay_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    manifest.package_id,
                    manifest.version,
                    tape.tape_id,
                    event.event_id,
                    event.sequence,
                    event.type,
                    Jsonb(event.payload),
                    event.delay_ms,
                ),
            )

    for tape_id in manifest.closing_tapes:
        tape = package.closing_tapes[tape_id]
        conn.execute(
            """
            INSERT INTO replay.closing_tape
                (package_id, version, tape_id, meeting_id, closing_id,
                 initial_checkpoint, completed_checkpoint)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                manifest.package_id,
                manifest.version,
                tape.tape_id,
                tape.meeting_id,
                tape.closing_id,
                tape.initial_checkpoint,
                tape.completed_checkpoint,
            ),
        )
        for event in tape.events:
            conn.execute(
                """
                INSERT INTO replay.closing_event
                    (package_id, version, tape_id, event_id, sequence, item_id,
                     kind, payload, delay_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    manifest.package_id,
                    manifest.version,
                    tape.tape_id,
                    event.event_id,
                    event.sequence,
                    event.item_id,
                    event.kind,
                    Jsonb(
                        {
                            "text": event.text,
                            "provisional": event.provisional,
                            "terminal": event.terminal,
                            "result": event.result,
                            "subject_id": event.subject_id,
                        }
                    ),
                    event.delay_ms,
                ),
            )


def _insert_retrieval(conn, package: LoadedPackage) -> None:
    manifest = package.manifest
    for retrieval_key in manifest.retrieval:
        record = package.retrievals[retrieval_key]
        conn.execute(
            """
            INSERT INTO replay.retrieval_record
                (package_id, version, retrieval_key, meeting_id, participant_id,
                 scope, stack_id, query, hits)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                manifest.package_id,
                manifest.version,
                record.retrieval_key,
                record.meeting_id,
                record.participant_id,
                record.scope,
                record.stack_id,
                record.query,
                Jsonb([hit.model_dump(mode="json") for hit in record.hits]),
            ),
        )


def _insert_assets(
    conn,
    package: LoadedPackage,
    storage: StoragePublisher,
) -> int:
    manifest = package.manifest
    count = 0
    for record in package.assets.assets:
        path = asset_storage_path(
            manifest.package_id, manifest.version, record.path, record.sha256
        )
        conn.execute(
            """
            INSERT INTO replay.asset
                (package_id, version, asset_id, storage_path, media_type,
                 sha256, size_bytes, locator, public_url, source, capture_date,
                 rights, authored, public_demo, extraction)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                manifest.package_id,
                manifest.version,
                record.asset_id,
                path,
                record.media_type,
                record.sha256,
                record.size,
                record.locator,
                storage.public_url(path),
                record.source,
                record.capture_date,
                record.rights,
                record.authored,
                record.public_demo,
                record.extraction,
            ),
        )
        count += 1
    return count


def publish_package(
    conn: psycopg.Connection,
    package: LoadedPackage,
    storage: StoragePublisher,
    *,
    activate_if_unset: bool = True,
) -> PublicationResult:
    issues = validate_package(package)
    if issues:
        raise PublicationError(
            "package validation failed", issues=list(issues)
        )
    manifest = package.manifest

    existing = _existing(conn, manifest.package_id, manifest.version)
    if existing is not None:
        status, content_hash = existing
        if status in ("published", "retired"):
            if content_hash != package.content_sha256:
                raise PublicationError(
                    "a published package version cannot be replaced with "
                    "different content; publish a new version"
                )
            for record in package.assets.assets:
                path = asset_storage_path(
                    manifest.package_id,
                    manifest.version,
                    record.path,
                    record.sha256,
                )
                storage.verify(path, record.sha256)
            conn.rollback()
            return PublicationResult(
                package_id=manifest.package_id,
                version=manifest.version,
                content_sha256=package.content_sha256,
                status=status,
                checkpoints=len(manifest.checkpoints),
                assets=len(package.assets.assets),
                already_published=True,
            )
        conn.execute(
            "DELETE FROM replay.package WHERE package_id = %s AND version = %s",
            (manifest.package_id, manifest.version),
        )

    storage.ensure_bucket()
    for record in package.assets.assets:
        path = asset_storage_path(
            manifest.package_id, manifest.version, record.path, record.sha256
        )
        storage.upload(path, package.asset_bytes[record.path], record.media_type)
        storage.verify(path, record.sha256)

    conn.execute(
        """
        INSERT INTO replay.package
            (package_id, version, schema_version, read_version, event_version,
             content_sha256, meeting_id, title, as_of, label, manifest, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'staged')
        """,
        (
            manifest.package_id,
            manifest.version,
            manifest.schema_version,
            manifest.read_version,
            manifest.event_version,
            package.content_sha256,
            manifest.meeting_id,
            manifest.title,
            manifest.as_of,
            manifest.label,
            Jsonb(manifest.model_dump(mode="json")),
        ),
    )
    _insert_checkpoints(conn, package)
    _insert_tapes(conn, package)
    _insert_retrieval(conn, package)
    asset_count = _insert_assets(conn, package, storage)

    conn.execute(
        "UPDATE replay.package SET status = 'published', published_at = now() "
        "WHERE package_id = %s AND version = %s",
        (manifest.package_id, manifest.version),
    )
    if activate_if_unset:
        conn.execute(
            """
            INSERT INTO replay.package_registry (package_id, active_version)
            VALUES (%s, %s)
            ON CONFLICT (package_id) DO NOTHING
            """,
            (manifest.package_id, manifest.version),
        )
    conn.commit()

    return PublicationResult(
        package_id=manifest.package_id,
        version=manifest.version,
        content_sha256=package.content_sha256,
        status="published",
        checkpoints=len(manifest.checkpoints),
        assets=asset_count,
    )


def activate_package(conn: psycopg.Connection, package_id: str, version: str) -> None:
    row = conn.execute(
        "SELECT status FROM replay.package WHERE package_id = %s AND version = %s",
        (package_id, version),
    ).fetchone()
    if row is None or row[0] != "published":
        raise PublicationError("only a published package version can be activated")
    conn.execute(
        """
        INSERT INTO replay.package_registry (package_id, active_version, updated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (package_id)
        DO UPDATE SET active_version = EXCLUDED.active_version, updated_at = now()
        """,
        (package_id, version),
    )
    conn.commit()


def retire_package(conn: psycopg.Connection, package_id: str, version: str) -> None:
    row = conn.execute(
        "SELECT status FROM replay.package WHERE package_id = %s AND version = %s",
        (package_id, version),
    ).fetchone()
    if row is None:
        raise PublicationError("package version not found")
    if conn.execute(
        "SELECT active_version FROM replay.package_registry WHERE package_id = %s",
        (package_id,),
    ).fetchone() == (version,):
        raise PublicationError(
            "the active package version cannot be retired; activate another "
            "published version first"
        )
    if row[0] == "retired":
        return
    conn.execute(
        "UPDATE replay.package SET status = 'retired', retired_at = now() "
        "WHERE package_id = %s AND version = %s",
        (package_id, version),
    )
    conn.commit()


def list_packages(conn: psycopg.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT p.package_id, p.version, p.status, p.content_sha256, p.title,
               p.published_at, p.retired_at, r.active_version
        FROM replay.package p
        LEFT JOIN replay.package_registry r USING (package_id)
        ORDER BY p.package_id, p.version
        """
    ).fetchall()
    return [
        {
            "package_id": row[0],
            "version": row[1],
            "status": row[2],
            "content_sha256": row[3],
            "title": row[4],
            "published_at": row[5].isoformat() if row[5] else None,
            "retired_at": row[6].isoformat() if row[6] else None,
            "active_version": row[7],
        }
        for row in rows
    ]


def prune_retired(
    conn: psycopg.Connection,
    storage: StoragePublisher,
    *,
    older_than_days: int,
) -> list[dict[str, str]]:
    """Remove retired versions past the retention window.

    The deletion is explicit: active versions cannot be retired, and a registry
    row still referencing a version makes the delete fail instead of stranding
    a pinned run. Asset objects are deleted after the database commit.
    """
    if older_than_days < 0:
        raise PublicationError("retention window must be non-negative")
    rows = conn.execute(
        """
        SELECT package_id, version
        FROM replay.package
        WHERE status = 'retired'
          AND retired_at IS NOT NULL
          AND retired_at < now() - make_interval(days => %s)
        ORDER BY package_id, version
        """,
        (older_than_days,),
    ).fetchall()
    pruned: list[dict[str, str]] = []
    asset_paths: list[str] = []
    for package_id, version in rows:
        asset_paths.extend(
            row[0]
            for row in conn.execute(
                "SELECT storage_path FROM replay.asset "
                "WHERE package_id = %s AND version = %s",
                (package_id, version),
            ).fetchall()
        )
        conn.execute(
            "DELETE FROM replay.package WHERE package_id = %s AND version = %s",
            (package_id, version),
        )
        pruned.append({"package_id": package_id, "version": version})
    conn.commit()
    for path in asset_paths:
        try:
            storage.delete(path)
        except Exception:
            # The database is authoritative; an orphan object is cleaned up by
            # a later operator pass rather than resurrecting the package.
            pass
    return pruned


def _storage_from_env() -> SupabaseStoragePublisher:
    url = os.environ.get("REPLAY_STORAGE_URL") or os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("REPLAY_STORAGE_SERVICE_KEY", "")
    bucket = os.environ.get("REPLAY_ASSET_BUCKET", DEFAULT_BUCKET)
    return SupabaseStoragePublisher(url, service_key, bucket)


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, default=str))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--bucket", default=os.environ.get("REPLAY_ASSET_BUCKET", DEFAULT_BUCKET))
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("path")
    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("path")
    publish_parser.add_argument("--activate", action="store_true")
    activate_parser = subparsers.add_parser("activate")
    activate_parser.add_argument("package_id")
    activate_parser.add_argument("version")
    retire_parser = subparsers.add_parser("retire")
    retire_parser.add_argument("package_id")
    retire_parser.add_argument("version")
    prune_parser = subparsers.add_parser("prune")
    prune_parser.add_argument("--older-than-days", type=int, default=30)
    subparsers.add_parser("list")
    args = parser.parse_args(argv)

    try:
        package = None
        if args.command in ("validate", "publish"):
            package = load_package(args.path)
            issues = validate_package(package)
            if issues:
                _print(
                    {
                        "ok": False,
                        "issues": [issue.render() for issue in issues],
                    }
                )
                return 1
            if args.command == "validate":
                _print(
                    {
                        "ok": True,
                        "package_id": package.manifest.package_id,
                        "version": package.manifest.version,
                        "content_sha256": package.content_sha256,
                    }
                )
                return 0

        url = database_url(args.database_url)
        with _connect(url) as conn:
            assert_provisioner_identity(conn)
            if args.command == "publish":
                storage = _storage_from_env()
                result = publish_package(
                    conn,
                    package,
                    storage,
                    activate_if_unset=not args.activate,
                )
                if args.activate:
                    activate_package(conn, result.package_id, result.version)
                _print({"ok": True, **result.__dict__})
            elif args.command == "activate":
                activate_package(conn, args.package_id, args.version)
                _print({"ok": True})
            elif args.command == "retire":
                retire_package(conn, args.package_id, args.version)
                _print({"ok": True})
            elif args.command == "prune":
                pruned = prune_retired(
                    conn,
                    _storage_from_env(),
                    older_than_days=args.older_than_days,
                )
                _print({"ok": True, "pruned": pruned})
            else:
                _print({"ok": True, "packages": list_packages(conn)})
        return 0
    except PublicationError as exc:
        _print(
            {
                "ok": False,
                "error": str(exc),
                "issues": [issue.render() for issue in exc.issues],
            }
        )
        return 1
    except (psycopg.Error, OSError, ValueError) as exc:
        _print({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
