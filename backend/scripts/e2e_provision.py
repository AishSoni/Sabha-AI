"""Provision a disposable replay database for the browser slice.

Creates (or replaces) a local Postgres database through ``pgserver``, applies
the real migration chain, provisions the isolated replay roles, and publishes
the placeholder package with the offline provisioner identity. It prints a
JSON environment block consumed by the Playwright global setup.

Run from ``backend/``:

    python scripts/e2e_provision.py --json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOME = os.environ.get(
    "SABHA_TEST_PG_HOME", r"C:\conda_tmp\opencode\sabha-test-pg"
)
DB_NAME = "sabha_replay_e2e"
READER_LOGIN = "sabha_replay_e2e_reader"
PUBLISHER_LOGIN = "sabha_replay_e2e_publisher"

AUTH_STUB_SQL = """
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOSUPERUSER NOBYPASSRLS NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOSUPERUSER BYPASSRLS NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
"""


def login_uri(uri: str, role: str) -> str:
    parts = urlsplit(uri)
    host = parts.hostname or "127.0.0.1"
    port = f":{parts.port}" if parts.port else ""
    return urlunsplit(parts._replace(netloc=f"{role}@{host}{port}"))


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def ensure_bucket(self) -> None:
        return None

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self.objects[path] = data

    def verify(self, path: str, sha256: str) -> None:
        assert hashlib.sha256(self.objects[path]).hexdigest() == sha256

    def public_url(self, path: str) -> str:
        return f"https://example.invalid/replay-assets/{path}"

    def delete(self, path: str) -> None:
        self.objects.pop(path, None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--env-out", default="")
    parser.add_argument("--port", type=int, default=8123)
    parser.add_argument("--home", default=DEFAULT_HOME)
    parser.add_argument(
        "--package",
        default=os.environ.get(
            "REPLAY_PACKAGE_DIR",
            str(BACKEND_ROOT / "replay_packages" / "hdfc-ine001a07rw5"),
        ),
    )
    args = parser.parse_args(argv)

    os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
    os.environ.setdefault("SUPABASE_KEY", "fixture-anon-key")
    os.environ.setdefault("SUPABASE_SERVICE_KEY", "fixture-service-key")

    import pgserver
    import psycopg

    from app.replay.package import load_package
    from scripts.migrate import apply_migrations
    from scripts.replay_package import publish_package
    from scripts.replay_roles import provision

    server = pgserver.get_server(args.home)
    base_uri = server.get_uri()
    admin = psycopg.connect(base_uri, autocommit=True)
    admin.execute(f'DROP DATABASE IF EXISTS "{DB_NAME}" WITH (FORCE)')
    admin.execute(f'CREATE DATABASE "{DB_NAME}"')
    admin.close()

    db_uri = urlsplit(base_uri)
    database_uri = urlunsplit(db_uri._replace(path=f"/{DB_NAME}"))
    with psycopg.connect(database_uri, autocommit=True) as conn:
        conn.execute(AUTH_STUB_SQL)
        provision(
            conn,
            reader_login=READER_LOGIN,
            provisioner_login=PUBLISHER_LOGIN,
        )
    apply_migrations(database_uri)

    package = load_package(Path(args.package))
    with psycopg.connect(login_uri(database_uri, PUBLISHER_LOGIN)) as conn:
        publish_package(conn, package, MemoryStorage())

    env = {
        "REPLAY_ONLY": "true",
        "REPLAY_DATABASE_URL": login_uri(database_uri, READER_LOGIN),
        "REPLAY_PACKAGE_ID": package.manifest.package_id,
        "REPLAY_PACKAGE_VERSION": package.manifest.version,
        "REPLAY_PACKAGE_SHA256": package.content_sha256,
        "REPLAY_STREAM_MAX_PER_CLIENT": "4",
        "CORS_ORIGINS": '["http://127.0.0.1:3100"]',
        "MEETING_ID": package.manifest.meeting_id,
    }
    if args.env_out:
        Path(args.env_out).write_text(json.dumps(env), encoding="utf-8")
    if args.serve:
        os.environ.update(env)
        from app.platform.config import settings

        settings.replay_only = True
        settings.replay_database_url = env["REPLAY_DATABASE_URL"]
        settings.replay_package_id = env["REPLAY_PACKAGE_ID"]
        settings.replay_package_version = env["REPLAY_PACKAGE_VERSION"]
        settings.replay_package_sha256 = env["REPLAY_PACKAGE_SHA256"]
        settings.replay_stream_max_per_client = 4
        settings.cors_origins = ["http://127.0.0.1:3100"]
        import uvicorn

        from main import app

        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
        return 0
    if args.json:
        print(json.dumps(env))
    else:
        for key, value in env.items():
            print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
