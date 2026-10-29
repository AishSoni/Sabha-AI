"""Clean-checkout replay provisioning (spec-19).

The checkout is what a deployer can actually obtain: tracked files only, no
author-local caches, ignored package inputs, or environment files. This test
validates the approved package and provisions it (plus the small placeholder
package) using only code and content from that checkout, against the real
disposable PostgreSQL and publication path.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg
import pytest

from tests.support.replay import PUBLISHER_LOGIN, READER_LOGIN, login_uri, provision_logins

REPO_ROOT = Path(__file__).resolve().parents[3]
APPROVED_ID = "hdfc-ine001a07rw5"
APPROVED_SHA256 = "5fb2a800c907f4de3be69c4b4b1262e32b1570b0abe03f8819ed783baac9bc82"
PLACEHOLDER_ID = "placeholder-analyst"

PUBLISH_SCRIPT = """
import json
import sys

import psycopg

from app.replay.package import load_package
from scripts.replay_package import publish_package


class MemoryStorage:
    def __init__(self):
        self.objects = {}

    def ensure_bucket(self):
        return None

    def upload(self, path, data, content_type):
        self.objects[path] = data

    def verify(self, path, sha256):
        import hashlib

        assert hashlib.sha256(self.objects[path]).hexdigest() == sha256

    def public_url(self, path):
        return f"https://example.invalid/replay-assets/{path}"

    def delete(self, path):
        self.objects.pop(path, None)


package = load_package(sys.argv[1])
with psycopg.connect(sys.argv[2]) as conn:
    result = publish_package(conn, package, MemoryStorage())
print(json.dumps({
    "package_id": result.package_id,
    "version": result.version,
    "content_sha256": result.content_sha256,
    "status": result.status,
    "assets": result.assets,
}))
"""


def _clone_tracked_tree(destination: Path) -> Path:
    """Clone HEAD with core.autocrlf disabled.

    The package is byte-pinned, so the checkout must reproduce the recorded
    CRLF bytes from ``.gitattributes`` alone. A tarball export ignores eol
    attributes; a real checkout is what a deployer obtains.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "git",
            "-c",
            "core.autocrlf=false",
            "clone",
            "--quiet",
            "--no-hardlinks",
            str(REPO_ROOT),
            str(destination),
        ],
        check=True,
        capture_output=True,
    )
    return destination


def _clean_env(root: Path) -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        not in {
            "PYTHONPATH",
            "VIRTUAL_ENV",
            "CONDA_PREFIX",
            "REPLAY_DATABASE_URL",
            "REPLAY_PACKAGE_ID",
            "REPLAY_PACKAGE_VERSION",
            "REPLAY_PACKAGE_SHA256",
            "SUPABASE_URL",
            "SUPABASE_KEY",
            "SUPABASE_SERVICE_KEY",
        }
    }
    env.update(
        {
            "PYTHONPATH": str(root / "backend"),
            "APP_ENV": "test",
            "REPLAY_ONLY": "true",
        }
    )
    return env


def _run(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *args],
        cwd=root / "backend",
        env=_clean_env(root),
        capture_output=True,
        text=True,
        timeout=180,
    )


@pytest.fixture(scope="module")
def clean_checkout():
    with tempfile.TemporaryDirectory(prefix="sabha-spec19-checkout-") as temp:
        yield _clone_tracked_tree(Path(temp) / "checkout")


def test_approved_and_placeholder_packages_validate_from_the_checkout(
    clean_checkout: Path,
) -> None:
    approved = _run(
        clean_checkout,
        [
            "-m",
            "scripts.replay_package",
            "validate",
            str(clean_checkout / "backend/replay_packages" / APPROVED_ID),
        ],
    )
    assert approved.returncode == 0, approved.stderr
    approved_result = json.loads(approved.stdout)
    assert approved_result["ok"] is True
    assert approved_result["package_id"] == APPROVED_ID
    assert approved_result["version"] == "2"
    assert approved_result["content_sha256"] == APPROVED_SHA256

    placeholder = _run(
        clean_checkout,
        [
            "-m",
            "scripts.replay_package",
            "validate",
            str(clean_checkout / "backend/replay_packages" / PLACEHOLDER_ID),
        ],
    )
    assert placeholder.returncode == 0, placeholder.stderr
    placeholder_result = json.loads(placeholder.stdout)
    assert placeholder_result["ok"] is True
    assert placeholder_result["package_id"] == PLACEHOLDER_ID
    assert placeholder_result["version"] == "1"


def test_checkout_provisions_both_packages_without_local_inputs(
    clean_checkout: Path, disposable_db
) -> None:
    provision_logins(disposable_db)
    publisher_uri = login_uri(disposable_db, PUBLISHER_LOGIN)

    published = []
    for package_id in (APPROVED_ID, PLACEHOLDER_ID):
        completed = _run(
            clean_checkout,
            [
                "-c",
                PUBLISH_SCRIPT,
                str(clean_checkout / "backend/replay_packages" / package_id),
                publisher_uri,
            ],
        )
        assert completed.returncode == 0, completed.stderr
        result = json.loads(completed.stdout)
        assert result["status"] == "published"
        assert result["package_id"] == package_id
        published.append(result)

    assert published[0]["content_sha256"] == APPROVED_SHA256
    assert all(result["assets"] > 0 for result in published)

    with psycopg.connect(login_uri(disposable_db, READER_LOGIN)) as conn:
        rows = conn.execute(
            "SELECT package_id, version, status FROM replay.v_published_package "
            "ORDER BY package_id"
        ).fetchall()
    assert rows == [
        (APPROVED_ID, "2", "published"),
        (PLACEHOLDER_ID, "1", "published"),
    ]
