"""The deployment runner applies the real ordered history atomically."""

from __future__ import annotations

from pathlib import Path

import psycopg
import pytest

from scripts.migrate import (
    BASELINE_PATH,
    BASELINE_VERSION,
    MigrationError,
    adopt_phase_one,
    apply_migrations,
    discover_migrations,
    status,
)


def _write(path: Path, sql: str) -> None:
    path.write_text(sql, encoding="utf-8")


def _temp_history(tmp_path: Path) -> tuple[Path, Path]:
    baseline = tmp_path / "baseline.sql"
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    _write(baseline, "CREATE TABLE baseline_probe (id INTEGER PRIMARY KEY);")
    return baseline, migrations


def test_fresh_install_applies_the_full_real_history(empty_db) -> None:
    applied = apply_migrations(empty_db.uri)

    assert applied[0] == BASELINE_VERSION
    assert applied[-1] == "028_system_ai_settings"
    assert len(applied) == 28

    versions = [
        row[0]
        for row in empty_db.query("SELECT version FROM schema_migrations ORDER BY version")
    ]
    assert versions == applied
    assert empty_db.query("SELECT to_regclass('public.meetings')")[0][0] is not None
    assert (
        empty_db.query("SELECT to_regclass('public.system_ai_settings')")[0][0]
        is not None
    )


def test_rerun_is_a_noop_and_checksums_stay_stable(empty_db) -> None:
    first = apply_migrations(empty_db.uri)
    second = apply_migrations(empty_db.uri)

    assert len(first) == 28
    assert second == []
    assert empty_db.query("SELECT count(*) FROM schema_migrations")[0][0] == 28


def test_changed_applied_migration_fails_visibly(tmp_path, empty_db) -> None:
    baseline, migrations = _temp_history(tmp_path)
    _write(migrations / "001_first.sql", "CREATE TABLE first_probe (id INT);")
    apply_migrations(
        empty_db.uri, baseline_path=baseline, migrations_dir=migrations
    )

    _write(
        migrations / "001_first.sql",
        "CREATE TABLE first_probe (id BIGINT);",
    )

    with pytest.raises(MigrationError, match="checksum mismatch"):
        apply_migrations(
            empty_db.uri, baseline_path=baseline, migrations_dir=migrations
        )


def test_failed_migration_rolls_back_and_is_not_recorded(tmp_path, empty_db) -> None:
    baseline, migrations = _temp_history(tmp_path)
    _write(migrations / "001_first.sql", "CREATE TABLE first_probe (id INT);")
    _write(
        migrations / "002_broken.sql",
        """
        CREATE TABLE broken_probe (id INT);
        INSERT INTO table_that_does_not_exist (id) VALUES (1);
        """,
    )

    with pytest.raises(psycopg.errors.UndefinedTable):
        apply_migrations(
            empty_db.uri, baseline_path=baseline, migrations_dir=migrations
        )

    versions = [
        row[0]
        for row in empty_db.query("SELECT version FROM schema_migrations ORDER BY version")
    ]
    assert versions == [BASELINE_VERSION, "001_first"]
    assert empty_db.query("SELECT to_regclass('public.broken_probe')")[0][0] is None
    assert empty_db.query("SELECT to_regclass('public.first_probe')")[0][0] is not None


def test_target_stops_at_the_requested_version(tmp_path, empty_db) -> None:
    baseline, migrations = _temp_history(tmp_path)
    _write(migrations / "001_first.sql", "CREATE TABLE first_probe (id INT);")
    _write(migrations / "002_second.sql", "CREATE TABLE second_probe (id INT);")

    applied = apply_migrations(
        empty_db.uri,
        baseline_path=baseline,
        migrations_dir=migrations,
        target="001",
    )
    assert applied == [BASELINE_VERSION, "001_first"]
    assert empty_db.query("SELECT to_regclass('public.second_probe')")[0][0] is None

    applied = apply_migrations(
        empty_db.uri,
        baseline_path=baseline,
        migrations_dir=migrations,
        target="002",
    )
    assert applied == ["002_second"]
    assert empty_db.query("SELECT to_regclass('public.second_probe')")[0][0] is not None


def test_untracked_application_schema_is_rejected(empty_db) -> None:
    with empty_db.connect() as conn:
        conn.execute("CREATE TABLE meetings (id INTEGER PRIMARY KEY)")

    with pytest.raises(MigrationError, match="--adopt-phase-one"):
        apply_migrations(empty_db.uri)


def test_status_reports_pending_then_applied(empty_db) -> None:
    pending = status(empty_db.uri)
    assert len(pending) == 28
    assert all(not applied for _, applied in pending)

    apply_migrations(empty_db.uri)

    applied = status(empty_db.uri)
    assert all(applied for _, applied in applied)


def _schema_signature(db) -> tuple:
    columns = db.query(
        """
        SELECT table_name, column_name, data_type, udt_name,
               is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
        ORDER BY table_name, ordinal_position
        """
    )
    functions = db.query(
        """
        SELECT p.proname, pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        ORDER BY 1, 2
        """
    )
    policies = db.query(
        """
        SELECT tablename, policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname
        """
    )
    return columns, functions, policies


def test_adopt_untracked_phase_one_database(phase_one_db) -> None:
    pending = status(phase_one_db.uri)
    assert all(not applied for _, applied in pending)

    adopted = adopt_phase_one(phase_one_db.uri)

    assert adopted[0] == BASELINE_VERSION
    assert adopted[-1] == "028_system_ai_settings"
    assert len(adopted) == 28
    assert phase_one_db.query(
        "SELECT to_regclass('public.system_ai_settings')"
    )[0][0] is not None

    versions = [
        row[0]
        for row in phase_one_db.query(
            "SELECT version FROM schema_migrations ORDER BY version"
        )
    ]
    assert versions == [migration.version for migration in discover_migrations()]
    assert adopt_phase_one(phase_one_db.uri) == []


def test_adoption_rejects_incomplete_phase_one_schema(empty_db) -> None:
    with empty_db.connect() as conn:
        conn.execute(BASELINE_PATH.read_text(encoding="utf-8"))

    with pytest.raises(MigrationError, match="complete Phase 1 schema"):
        adopt_phase_one(empty_db.uri)


def test_adopted_schema_matches_a_fresh_install(empty_db, phase_one_db) -> None:
    apply_migrations(empty_db.uri)
    adopt_phase_one(phase_one_db.uri)

    assert _schema_signature(empty_db) == _schema_signature(phase_one_db)


def test_adoption_rejects_partial_history(phase_one_db) -> None:
    adopt_phase_one(phase_one_db.uri)
    with phase_one_db.connect() as conn:
        conn.execute(
            "DELETE FROM schema_migrations WHERE version = '010_atomic_meeting_close'"
        )

    with pytest.raises(MigrationError, match="partial migration history"):
        adopt_phase_one(phase_one_db.uri)
