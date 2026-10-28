"""Shared replay test fixtures: roles, publication, and a fake asset bucket."""

from __future__ import annotations

import hashlib
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from app.replay.package import load_package
from app.replay.storage import StorageError
from scripts.replay_package import publish_package
from scripts.replay_roles import provision

READER_LOGIN = "sabha_replay_test_reader"
PUBLISHER_LOGIN = "sabha_replay_test_publisher"

BACKEND = Path(__file__).resolve().parents[2]
PLACEHOLDER = BACKEND / "replay_packages" / "placeholder-analyst"


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.bucket = False
        self.fail_verify = False

    def ensure_bucket(self) -> None:
        self.bucket = True

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self.objects[path] = data

    def verify(self, path: str, sha256: str) -> None:
        if self.fail_verify:
            raise StorageError("verification failed")
        assert hashlib.sha256(self.objects[path]).hexdigest() == sha256

    def public_url(self, path: str) -> str:
        return f"https://storage.test/replay-assets/{path}"

    def delete(self, path: str) -> None:
        self.objects.pop(path, None)


def login_uri(db, role: str) -> str:
    parts = urlsplit(db.uri)
    host = parts.hostname or "127.0.0.1"
    port = f":{parts.port}" if parts.port else ""
    return urlunsplit(parts._replace(netloc=f"{role}@{host}{port}"))


def provision_logins(db) -> None:
    with db.connect() as conn:
        provision(conn, reader_login=READER_LOGIN, provisioner_login=PUBLISHER_LOGIN)


def publish_placeholder(db, storage: FakeStorage | None = None) -> FakeStorage:
    storage = storage or FakeStorage()
    import psycopg

    with psycopg.connect(login_uri(db, PUBLISHER_LOGIN)) as conn:
        publish_package(conn, load_package(PLACEHOLDER), storage)
    return storage


def publish_dir(db, root: Path, storage: FakeStorage | None = None) -> FakeStorage:
    storage = storage or FakeStorage()
    import psycopg

    with psycopg.connect(login_uri(db, PUBLISHER_LOGIN)) as conn:
        publish_package(conn, load_package(root), storage)
    return storage
