"""Apply Sabha's ordered SQL history to a PostgreSQL database.

The baseline schema is the first migration (``000_baseline``); numbered
files in ``backend/migrations`` follow in lexical order. Every migration and
its tracking row commit atomically, and the whole run is serialized with a
Postgres advisory lock so two deployers cannot interleave DDL.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import psycopg


BACKEND_ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = BACKEND_ROOT / "supabase_schema.sql"
MIGRATIONS_DIR = BACKEND_ROOT / "migrations"
BASELINE_VERSION = "000_baseline"
TRACKING_TABLE = "schema_migrations"
LOCK_KEY = 0x5AB4A  # arbitrary, stable application-wide lock id


class MigrationError(RuntimeError):
    """A migration cannot be applied safely."""


@dataclass(frozen=True)
class Migration:
    version: str
    path: Path

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.path.read_bytes()).hexdigest()


@dataclass(frozen=True)
class AppliedMigration:
    version: str
    checksum: str
    applied_at: object
    execution_ms: int


def discover_migrations(
    *,
    baseline_path: Path = BASELINE_PATH,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> list[Migration]:
    """Return baseline plus numbered migrations in application order."""
    migrations = [Migration(BASELINE_VERSION, baseline_path)]
    files = sorted(
        path
        for path in migrations_dir.glob("*.sql")
        if path.is_file() and path.stem[:1].isdigit()
    )
    for path in files:
        migrations.append(Migration(path.stem, path))
    versions = [migration.version for migration in migrations]
    if len(versions) != len(set(versions)):
        raise MigrationError("duplicate migration versions in the history")
    return migrations


def _tracking_table_exists(conn: psycopg.Connection) -> bool:
    row = conn.execute(
        "SELECT to_regclass(%s) IS NOT NULL", (f"public.{TRACKING_TABLE}",)
    ).fetchone()
    return bool(row and row[0])


def _ensure_tracking_table(conn: psycopg.Connection) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {TRACKING_TABLE} (
            version TEXT PRIMARY KEY,
            checksum TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            execution_ms INTEGER NOT NULL
        )
        """
    )


def _applied(conn: psycopg.Connection) -> dict[str, AppliedMigration]:
    if not _tracking_table_exists(conn):
        return {}
    rows = conn.execute(
        f"SELECT version, checksum, applied_at, execution_ms "
        f"FROM {TRACKING_TABLE} ORDER BY version"
    ).fetchall()
    return {
        row[0]: AppliedMigration(
            version=row[0],
            checksum=row[1],
            applied_at=row[2],
            execution_ms=row[3],
        )
        for row in rows
    }


def _application_tables_exist(conn: psycopg.Connection) -> bool:
    row = conn.execute(
        """
        SELECT to_regclass('public.meetings') IS NOT NULL
            OR to_regclass('public.ai_participants') IS NOT NULL
            OR to_regclass('public.messages') IS NOT NULL
        """
    ).fetchone()
    return bool(row and row[0])


def _verify_applied(
    applied: dict[str, AppliedMigration], migrations: list[Migration]
) -> None:
    by_version = {migration.version: migration for migration in migrations}
    for version, record in applied.items():
        migration = by_version.get(version)
        if migration is None:
            raise MigrationError(
                f"applied migration {version} is missing from the repository"
            )
        if migration.checksum != record.checksum:
            raise MigrationError(
                f"checksum mismatch for applied migration {version}; "
                "the migration file changed after it was applied"
            )


def _target_index(migrations: list[Migration], target: str | None) -> int | None:
    if target is None:
        return None
    normalized = target.strip()
    for index, migration in enumerate(migrations):
        if migration.version == normalized or migration.version.startswith(
            f"{normalized}_"
        ):
            return index
    raise MigrationError(f"unknown migration target: {target}")


def _insert_applied(
    conn: psycopg.Connection, migration: Migration, execution_ms: int
) -> None:
    conn.execute(
        f"INSERT INTO {TRACKING_TABLE} "
        "(version, checksum, applied_at, execution_ms) "
        "VALUES (%s, %s, now(), %s)",
        (migration.version, migration.checksum, execution_ms),
    )


def status(
    database_url: str,
    *,
    baseline_path: Path = BASELINE_PATH,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> list[tuple[Migration, bool]]:
    """Return every migration and whether it is recorded as applied."""
    migrations = discover_migrations(
        baseline_path=baseline_path, migrations_dir=migrations_dir
    )
    with psycopg.connect(database_url) as conn:
        applied = _applied(conn)
    _verify_applied(applied, migrations)
    return [(migration, migration.version in applied) for migration in migrations]


def apply_migrations(
    database_url: str,
    *,
    baseline_path: Path = BASELINE_PATH,
    migrations_dir: Path = MIGRATIONS_DIR,
    target: str | None = None,
) -> list[str]:
    """Apply pending migrations through ``target`` and return their versions."""
    migrations = discover_migrations(
        baseline_path=baseline_path, migrations_dir=migrations_dir
    )
    target_index = _target_index(migrations, target)
    applied_versions: list[str] = []

    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_KEY,))
        try:
            _ensure_tracking_table(conn)
            applied = _applied(conn)
            _verify_applied(applied, migrations)

            for index, migration in enumerate(migrations):
                if target_index is not None and index > target_index:
                    break
                if migration.version in applied:
                    continue
                if (
                    migration.version == BASELINE_VERSION
                    and _application_tables_exist(conn)
                ):
                    raise MigrationError(
                        "database contains application tables but no migration "
                        "history; use --adopt-phase-one or start from an empty "
                        "database"
                    )
                started = time.monotonic()
                with conn.transaction():
                    conn.execute(migration.path.read_text(encoding="utf-8"))
                    elapsed_ms = int((time.monotonic() - started) * 1000)
                    _insert_applied(conn, migration, elapsed_ms)
                applied_versions.append(migration.version)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,))

    return applied_versions


def _status_text(
    database_url: str,
    *,
    baseline_path: Path = BASELINE_PATH,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> str:
    rows = status(
        database_url,
        baseline_path=baseline_path,
        migrations_dir=migrations_dir,
    )
    lines = ["version                         state"]
    for migration, is_applied in rows:
        lines.append(
            f"{migration.version:<30} {'applied' if is_applied else 'pending'}"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL connection URL (defaults to DATABASE_URL)",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="print applied and pending migrations without changing the database",
    )
    parser.add_argument(
        "--to",
        default=None,
        help="apply only through this version or numeric prefix",
    )
    parser.add_argument(
        "--migrations-dir",
        type=Path,
        default=MIGRATIONS_DIR,
        help="directory containing numbered .sql migrations",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=BASELINE_PATH,
        help="baseline schema file recorded as 000_baseline",
    )
    args = parser.parse_args(argv)

    database_url = args.database_url or __import__("os").environ.get("DATABASE_URL")
    if not database_url:
        parser.error("--database-url or DATABASE_URL is required")

    try:
        if args.status:
            print(
                _status_text(
                    database_url,
                    baseline_path=args.baseline,
                    migrations_dir=args.migrations_dir,
                )
            )
            return 0
        applied = apply_migrations(
            database_url,
            baseline_path=args.baseline,
            migrations_dir=args.migrations_dir,
            target=args.to,
        )
    except MigrationError as exc:
        print(f"migration failed: {exc}", file=sys.stderr)
        return 1

    if applied:
        print(f"applied {len(applied)} migration(s): {', '.join(applied)}")
    else:
        print("database is up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
