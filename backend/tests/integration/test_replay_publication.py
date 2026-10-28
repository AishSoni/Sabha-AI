"""Integration: offline publication and the runtime reader boundary (spec-17)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest

from app.replay.package import load_package
from app.replay.package.loader import compute_content_sha256
from app.replay.storage import StorageError
from scripts.replay_package import (
    PublicationError,
    activate_package,
    assert_provisioner_identity,
    list_packages,
    publish_package,
    retire_package,
)
from scripts.replay_roles import provision
BACKEND = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = BACKEND / "replay_packages" / "placeholder-analyst"
FIXTURE_V1 = BACKEND / "tests" / "fixtures" / "replay" / "fixture-minimal"
FIXTURE_V2 = BACKEND / "tests" / "fixtures" / "replay" / "fixture-minimal-v2"

READER_LOGIN = "sabha_replay_test_reader"
PUBLISHER_LOGIN = "sabha_replay_test_publisher"


def _login_uri(db, role: str) -> str:
    parts = urlsplit(db.uri)
    host = parts.hostname or "127.0.0.1"
    port = f":{parts.port}" if parts.port else ""
    return urlunsplit(parts._replace(netloc=f"{role}@{host}{port}"))


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.bucket = False
        self.fail_verify = False
        self.public_base = "https://storage.test/replay-assets"

    def ensure_bucket(self) -> None:
        self.bucket = True

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self.objects[path] = (data, content_type)

    def verify(self, path: str, sha256: str) -> None:
        if self.fail_verify:
            raise StorageError("verification failed")
        import hashlib

        data, _ = self.objects[path]
        assert hashlib.sha256(data).hexdigest() == sha256

    def public_url(self, path: str) -> str:
        return f"{self.public_base}/{path}"

    def delete(self, path: str) -> None:
        self.objects.pop(path, None)


@pytest.fixture()
def replay_db(disposable_db):
    with disposable_db.connect() as conn:
        provision(
            conn,
            reader_login=READER_LOGIN,
            provisioner_login=PUBLISHER_LOGIN,
        )
    return disposable_db


def _publisher(db):
    return psycopg.connect(_login_uri(db, PUBLISHER_LOGIN))


def _reader(db):
    return psycopg.connect(_login_uri(db, READER_LOGIN), autocommit=True)


def _refinalize(root: Path) -> None:
    files = {
        path.relative_to(root).as_posix(): __import__("hashlib").sha256(
            path.read_bytes()
        ).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["content_sha256"] = compute_content_sha256(files, manifest)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def test_publication_exposes_only_published_views_to_the_reader(replay_db) -> None:
    storage = FakeStorage()
    package = load_package(PACKAGE_ROOT)
    with _publisher(replay_db) as conn:
        result = publish_package(conn, package, storage)

    assert result.status == "published"
    assert result.checkpoints == 4
    assert result.assets == 1
    assert storage.bucket is True
    assert len(storage.objects) == 1

    with _reader(replay_db) as reader:
        assert reader.execute(
            "SELECT count(*) FROM replay.v_published_package"
        ).fetchone() == (1,)
        assert reader.execute(
            "SELECT count(*) FROM replay.v_published_checkpoint"
        ).fetchone() == (4,)
        assert reader.execute(
            "SELECT count(*) FROM replay.v_published_turn_event"
        ).fetchone() == (8,)
        assert reader.execute(
            "SELECT count(*) FROM replay.v_published_closing_event"
        ).fetchone() == (4,)
        assert reader.execute(
            "SELECT active_version FROM replay.v_package_registry"
        ).fetchone() == ("1",)
        public_url = reader.execute(
            "SELECT public_url FROM replay.v_published_asset"
        ).fetchone()[0]
        assert public_url.startswith("https://storage.test/replay-assets/")

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            reader.execute("SELECT count(*) FROM replay.package")

    # A staged row is invisible even to an independent reader.
    with replay_db.connect() as admin:
        admin.execute(
            """
            INSERT INTO replay.package
                (package_id, version, schema_version, read_version,
                 event_version, content_sha256, meeting_id, title, as_of,
                 label, manifest, status)
            VALUES ('staged-only', '1', 1, 1, 1, %s, 'm', 't', '2026-01-01',
                    'l', '{}'::jsonb, 'staged')
            """,
            ("a" * 64,),
        )
    with _reader(replay_db) as reader:
        assert reader.execute(
            "SELECT count(*) FROM replay.v_published_package"
        ).fetchone() == (1,)


def test_publication_stages_nothing_when_asset_verification_fails(replay_db) -> None:
    storage = FakeStorage()
    storage.fail_verify = True
    package = load_package(PACKAGE_ROOT)
    with _publisher(replay_db) as conn:
        with pytest.raises(StorageError):
            publish_package(conn, package, storage)
        conn.rollback()

    with replay_db.connect() as admin:
        assert admin.execute("SELECT count(*) FROM replay.package").fetchone() == (0,)
        assert admin.execute(
            "SELECT count(*) FROM replay.package_registry"
        ).fetchone() == (0,)


def test_republish_is_idempotent_and_content_is_immutable(
    replay_db, tmp_path
) -> None:
    storage = FakeStorage()
    package = load_package(PACKAGE_ROOT)
    with _publisher(replay_db) as conn:
        first = publish_package(conn, package, storage)
        second = publish_package(conn, load_package(PACKAGE_ROOT), storage)
    assert first.already_published is False
    assert second.already_published is True

    import shutil

    tampered_root = tmp_path / "tampered"
    shutil.copytree(PACKAGE_ROOT, tampered_root)
    manifest_path = tampered_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["title"] = "A different package at the same version"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    _refinalize(tampered_root)

    with _publisher(replay_db) as conn:
        with pytest.raises(PublicationError):
            publish_package(conn, load_package(tampered_root), storage)
        conn.rollback()


def test_activation_and_retirement_keep_pinned_versions_readable(replay_db) -> None:
    storage = FakeStorage()
    with _publisher(replay_db) as conn:
        publish_package(conn, load_package(FIXTURE_V1), storage)
        publish_package(conn, load_package(FIXTURE_V2), storage)
        activate_package(conn, "fixture-minimal", "2")
        retire_package(conn, "fixture-minimal", "1")
        packages = list_packages(conn)
        with pytest.raises(PublicationError):
            retire_package(conn, "fixture-minimal", "2")

    assert [(row["version"], row["status"]) for row in packages] == [
        ("1", "retired"),
        ("2", "published"),
    ]
    assert packages[1]["active_version"] == "2"

    with _reader(replay_db) as reader:
        versions = [
            row[0]
            for row in reader.execute(
                "SELECT version FROM replay.v_published_package ORDER BY version"
            ).fetchall()
        ]
        assert versions == ["1", "2"]
        assert reader.execute(
            "SELECT active_version FROM replay.v_package_registry"
        ).fetchone() == ("2",)


def test_publication_refuses_an_admin_identity(replay_db) -> None:
    with replay_db.connect() as admin:
        with pytest.raises(PublicationError):
            assert_provisioner_identity(admin)


BASE_TABLES = (
    "package",
    "package_registry",
    "checkpoint",
    "turn_tape",
    "turn_event",
    "closing_tape",
    "closing_event",
    "retrieval_record",
    "asset",
)

PUBLISHED_VIEWS = (
    "v_published_package",
    "v_published_checkpoint",
    "v_published_turn_tape",
    "v_published_turn_event",
    "v_published_closing_tape",
    "v_published_closing_event",
    "v_published_retrieval",
    "v_published_asset",
    "v_package_registry",
)


def test_reader_matrix_covers_every_replay_object(replay_db) -> None:
    with _publisher(replay_db) as conn:
        publish_package(conn, load_package(PACKAGE_ROOT), FakeStorage())

    with _reader(replay_db) as reader:
        for table in BASE_TABLES:
            assert reader.execute(
                "SELECT has_table_privilege(current_user, %s, 'SELECT')",
                (f"replay.{table}",),
            ).fetchone() == (False,), table
        for view in PUBLISHED_VIEWS:
            assert reader.execute(
                "SELECT has_table_privilege(current_user, %s, 'SELECT')",
                (f"replay.{view}",),
            ).fetchone() == (True,), view
            assert reader.execute(
                "SELECT has_table_privilege(current_user, %s, 'INSERT')",
                (f"replay.{view}",),
            ).fetchone() == (False,), view
            reader.execute(f"SELECT * FROM replay.{view} LIMIT 0")


def test_tracked_package_needs_no_ignored_inputs() -> None:
    if shutil.which("git") is None:
        pytest.skip("git is not available")
    repo = BACKEND.parent
    tracked = set(
        subprocess.check_output(
            ["git", "ls-files", "--", "backend/replay_packages"],
            cwd=repo,
            text=True,
        ).splitlines()
    )
    files = {
        path.relative_to(repo).as_posix()
        for path in (repo / "backend" / "replay_packages").rglob("*")
        if path.is_file()
    }
    assert files
    assert files <= tracked, sorted(files - tracked)
