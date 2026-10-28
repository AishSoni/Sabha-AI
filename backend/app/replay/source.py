"""Package-backed replay source (spec-17).

Every selector below is a bound SQL parameter from an allowlisted manifest
value; package data never becomes an identifier, a workspace id, or a route.
The reader connection is the strict spec-12 identity and is opened once per
operation. The runtime never writes, never stages, and never falls back to the
live container.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import psycopg
from pydantic import ValidationError

from app.platform.replay_database import (
    ReplayReaderError,
    connect_replay_reader,
)
from app.replay.package.model import (
    SUPPORTED_EVENT_VERSIONS,
    SUPPORTED_READ_VERSIONS,
    SUPPORTED_SCHEMA_VERSIONS,
    Checkpoint,
    Manifest,
)

SELECTOR = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class ReplaySourceError(RuntimeError):
    """Base class for safe replay-source failures."""


class ReplayNotConfigured(ReplaySourceError):
    pass


class ReplayPackageUnavailable(ReplaySourceError):
    pass


class ReplayVersionRetired(ReplaySourceError):
    pass


class ReplaySelectorInvalid(ReplaySourceError):
    pass


@dataclass(frozen=True)
class PublishedPackage:
    package_id: str
    version: str
    content_sha256: str
    meeting_id: str
    label: str
    title: str
    as_of: str
    status: str
    manifest: Manifest
    checkpoints: tuple[Checkpoint, ...]
    assets: tuple[dict[str, Any], ...] = ()
    tapes: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True)
class TapeRecord:
    tape_id: str
    meeting_id: str
    operation_id: str
    participant_id: str
    request_key: str
    initial_checkpoint: str
    completed_checkpoint: str
    events: tuple[dict[str, Any], ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ClosingTapeRecord:
    tape_id: str
    meeting_id: str
    closing_id: str
    initial_checkpoint: str
    completed_checkpoint: str
    events: tuple[dict[str, Any], ...] = field(default_factory=tuple)


def _selector(value: str | None, name: str) -> str | None:
    if value is None:
        return None
    if not SELECTOR.fullmatch(value):
        raise ReplaySelectorInvalid(f"invalid {name} selector")
    return value


def _sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode(
            "utf-8"
        )
    ).hexdigest()


class ReplaySource:
    """Read-only access to published package rows."""

    def __init__(
        self,
        connect: Callable[[], psycopg.Connection] = connect_replay_reader,
        *,
        max_concurrency: int = 8,
        max_tape_events: int = 500,
    ) -> None:
        self._connect = connect
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._max_tape_events = max_tape_events

    async def _run(self, operation: Callable[[psycopg.Connection], Any]) -> Any:
        async with self._semaphore:
            return await asyncio.to_thread(self._run_sync, operation)

    def _run_sync(self, operation):
        try:
            connection = self._connect()
        except ReplayReaderError as exc:
            raise ReplayPackageUnavailable(str(exc)) from exc
        except psycopg.Error as exc:
            raise ReplayPackageUnavailable(
                "the replay package store is unavailable"
            ) from exc
        try:
            return operation(connection)
        except psycopg.Error as exc:
            raise ReplayPackageUnavailable(
                "the replay package store is unavailable"
            ) from exc
        finally:
            connection.close()

    async def resolve_package(
        self, package_id: str | None, version: str | None
    ) -> PublishedPackage:
        package_id = _selector(package_id, "package")
        version = _selector(version, "version")

        def operation(conn: psycopg.Connection):
            selected_package = package_id
            selected_version = version
            if selected_version is None:
                row = conn.execute(
                    "SELECT package_id, active_version FROM replay.v_package_registry "
                    "WHERE package_id = %s",
                    (selected_package,),
                ).fetchone()
                if row is None:
                    return None
                selected_package, selected_version = row
            row = conn.execute(
                """
                SELECT package_id, version, content_sha256, meeting_id, title,
                       label, as_of, status, manifest
                FROM replay.v_published_package
                WHERE package_id = %s AND version = %s
                """,
                (selected_package, selected_version),
            ).fetchone()
            if row is None:
                return None
            checkpoints = conn.execute(
                """
                SELECT checkpoint_id, ordinal, phase, bundle, sha256
                FROM replay.v_published_checkpoint
                WHERE package_id = %s AND version = %s
                ORDER BY ordinal
                """,
                (selected_package, selected_version),
            ).fetchall()
            assets = conn.execute(
                """
                SELECT asset_id, storage_path, media_type, sha256, size_bytes,
                       locator, public_url, source, capture_date, rights,
                       authored, public_demo, extraction
                FROM replay.v_published_asset
                WHERE package_id = %s AND version = %s
                ORDER BY asset_id
                """,
                (selected_package, selected_version),
            ).fetchall()
            tapes = conn.execute(
                """
                SELECT tape_id, operation_id, participant_id, initial_checkpoint,
                       completed_checkpoint
                FROM replay.v_published_turn_tape
                WHERE package_id = %s AND version = %s
                ORDER BY tape_id
                """,
                (selected_package, selected_version),
            ).fetchall()
            return row, checkpoints, assets, tapes

        result = await self._run(operation)
        if result is None:
            raise ReplayPackageUnavailable("the requested package is not published")
        row, checkpoint_rows, asset_rows, tape_rows = result
        (
            package_id,
            version,
            content_sha256,
            meeting_id,
            title,
            label,
            as_of,
            status,
            manifest_payload,
        ) = row

        try:
            manifest = Manifest.model_validate(manifest_payload)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("the package manifest is corrupt") from exc

        if (
            manifest.package_id != package_id
            or manifest.version != version
            or manifest.meeting_id != meeting_id
        ):
            raise ReplayPackageUnavailable("the package identity is inconsistent")
        if manifest.content_sha256 != content_sha256:
            raise ReplayPackageUnavailable("the package content hash is inconsistent")
        if manifest.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
            raise ReplayPackageUnavailable("the package schema version is unsupported")
        if manifest.read_version not in SUPPORTED_READ_VERSIONS:
            raise ReplayPackageUnavailable("the package read version is unsupported")
        if manifest.event_version not in SUPPORTED_EVENT_VERSIONS:
            raise ReplayPackageUnavailable("the package event version is unsupported")

        file_hashes: dict[str, str] = {}
        checkpoints: list[Checkpoint] = []
        for (
            checkpoint_id,
            ordinal,
            phase,
            bundle,
            sha,
        ) in checkpoint_rows:
            if _sha256(bundle) != sha:
                raise ReplayPackageUnavailable("a checkpoint failed its hash check")
            try:
                checkpoint = Checkpoint.model_validate(bundle)
            except ValidationError as exc:
                raise ReplayPackageUnavailable("a checkpoint is corrupt") from exc
            if (
                checkpoint.checkpoint_id != checkpoint_id
                or checkpoint.ordinal != ordinal
                or checkpoint.phase != phase
                or checkpoint.meeting_id != meeting_id
            ):
                raise ReplayPackageUnavailable("a checkpoint identity is inconsistent")
            checkpoints.append(checkpoint)
            file_hashes[f"checkpoints/{checkpoint_id}.json"] = _sha256(bundle)

        first = checkpoints[0] if checkpoints else None
        if first is None or first.checkpoint_id != manifest.initial_checkpoint:
            raise ReplayPackageUnavailable("the initial checkpoint is missing")

        assets = tuple(
            {
                "asset_id": asset[0],
                "storage_path": asset[1],
                "media_type": asset[2],
                "sha256": asset[3],
                "size": asset[4],
                "locator": asset[5],
                "public_url": asset[6],
                "source": asset[7],
                "capture_date": asset[8].isoformat() if asset[8] else None,
                "rights": asset[9],
                "authored": asset[10],
                "public_demo": asset[11],
                "extraction": asset[12],
            }
            for asset in asset_rows
        )

        return PublishedPackage(
            package_id=package_id,
            version=version,
            content_sha256=content_sha256,
            meeting_id=meeting_id,
            label=label,
            title=title,
            as_of=as_of.isoformat() if hasattr(as_of, "isoformat") else str(as_of),
            status=status,
            manifest=manifest,
            checkpoints=tuple(checkpoints),
            assets=assets,
            tapes=tuple(
                {
                    "tape_id": tape[0],
                    "operation_id": tape[1],
                    "participant_id": tape[2],
                    "initial_checkpoint": tape[3],
                    "completed_checkpoint": tape[4],
                }
                for tape in tape_rows
            ),
        )

    async def read_checkpoint(
        self, package_id: str, version: str, checkpoint_id: str
    ) -> Checkpoint:
        package_id = _selector(package_id, "package")
        version = _selector(version, "version")
        checkpoint_id = _selector(checkpoint_id, "checkpoint")

        def operation(conn: psycopg.Connection):
            return conn.execute(
                """
                SELECT bundle, sha256
                FROM replay.v_published_checkpoint
                WHERE package_id = %s AND version = %s AND checkpoint_id = %s
                """,
                (package_id, version, checkpoint_id),
            ).fetchone()

        row = await self._run(operation)
        if row is None:
            raise ReplayPackageUnavailable("the requested checkpoint is not published")
        bundle, sha = row
        if _sha256(bundle) != sha:
            raise ReplayPackageUnavailable("the checkpoint failed its hash check")
        try:
            return Checkpoint.model_validate(bundle)
        except ValidationError as exc:
            raise ReplayPackageUnavailable("the checkpoint is corrupt") from exc

    async def read_tape(
        self, package_id: str, version: str, operation_id: str
    ) -> TapeRecord:
        package_id = _selector(package_id, "package")
        version = _selector(version, "version")
        operation_id = _selector(operation_id, "operation")

        def operation(conn: psycopg.Connection):
            tape = conn.execute(
                """
                SELECT tape_id, meeting_id, operation_id, participant_id,
                       request_key, initial_checkpoint, completed_checkpoint
                FROM replay.v_published_turn_tape
                WHERE package_id = %s AND version = %s AND operation_id = %s
                """,
                (package_id, version, operation_id),
            ).fetchone()
            if tape is None:
                return None
            events = conn.execute(
                """
                SELECT event_id, sequence, type, payload, delay_ms
                FROM replay.v_published_turn_event
                WHERE package_id = %s AND version = %s AND tape_id = %s
                ORDER BY sequence
                LIMIT %s
                """,
                (package_id, version, tape[0], self._max_tape_events),
            ).fetchall()
            return tape, events

        result = await self._run(operation)
        if result is None:
            raise ReplayPackageUnavailable("the requested turn is not recorded")
        tape, events = result
        return TapeRecord(
            tape_id=tape[0],
            meeting_id=tape[1],
            operation_id=tape[2],
            participant_id=tape[3],
            request_key=tape[4],
            initial_checkpoint=tape[5],
            completed_checkpoint=tape[6],
            events=tuple(
                {
                    "id": event[0],
                    "sequence": event[1],
                    "type": event[2],
                    "payload": event[3] or {},
                    "delay_ms": event[4],
                    "operation_id": tape[2],
                    "meeting_id": tape[1],
                }
                for event in events
            ),
        )

    async def read_closing_tape(
        self, package_id: str, version: str, closing_id: str
    ) -> ClosingTapeRecord:
        package_id = _selector(package_id, "package")
        version = _selector(version, "version")
        closing_id = _selector(closing_id, "closing")

        def operation(conn: psycopg.Connection):
            tape = conn.execute(
                """
                SELECT tape_id, meeting_id, closing_id, initial_checkpoint,
                       completed_checkpoint
                FROM replay.v_published_closing_tape
                WHERE package_id = %s AND version = %s AND closing_id = %s
                """,
                (package_id, version, closing_id),
            ).fetchone()
            if tape is None:
                return None
            events = conn.execute(
                """
                SELECT event_id, sequence, item_id, kind, payload, delay_ms
                FROM replay.v_published_closing_event
                WHERE package_id = %s AND version = %s AND tape_id = %s
                ORDER BY sequence
                LIMIT %s
                """,
                (package_id, version, tape[0], self._max_tape_events),
            ).fetchall()
            return tape, events

        result = await self._run(operation)
        if result is None:
            raise ReplayPackageUnavailable("the requested closing is not recorded")
        tape, events = result
        return ClosingTapeRecord(
            tape_id=tape[0],
            meeting_id=tape[1],
            closing_id=tape[2],
            initial_checkpoint=tape[3],
            completed_checkpoint=tape[4],
            events=tuple(
                {
                    "id": event[0],
                    "sequence": event[1],
                    "item_id": event[2],
                    "kind": event[3],
                    "payload": event[4] or {},
                    "delay_ms": event[5],
                }
                for event in events
            ),
        )

    async def read_asset(
        self, package_id: str, version: str, asset_id: str
    ) -> dict[str, Any] | None:
        package_id = _selector(package_id, "package")
        version = _selector(version, "version")
        asset_id = _selector(asset_id, "asset")

        def operation(conn: psycopg.Connection):
            return conn.execute(
                """
                SELECT asset_id, storage_path, media_type, sha256, size_bytes,
                       locator, public_url, source, capture_date, rights,
                       authored, public_demo, extraction
                FROM replay.v_published_asset
                WHERE package_id = %s AND version = %s AND asset_id = %s
                """,
                (package_id, version, asset_id),
            ).fetchone()

        row = await self._run(operation)
        if row is None:
            return None
        return {
            "asset_id": row[0],
            "storage_path": row[1],
            "media_type": row[2],
            "sha256": row[3],
            "size": row[4],
            "locator": row[5],
            "public_url": row[6],
            "source": row[7],
            "capture_date": row[8].isoformat() if row[8] else None,
            "rights": row[9],
            "authored": row[10],
            "public_demo": row[11],
            "extraction": row[12],
        }
