"""Spec-11 clean-checkout and entry-point rehearsal.

The full frontend install/build is intentionally a standalone command
(``python -m scripts.rehearse_clean_checkout``) because it downloads the npm
dependency tree.  These tests pin the archive contract and the real backend
entry points; the deployment record includes the full command output.
"""

from __future__ import annotations

import socket
import sys
import tempfile
from pathlib import Path

import pytest

from scripts.rehearse_clean_checkout import (
    REQUIRED_TRACKED_FILES,
    audit_checkout,
    backend_smoke,
    extract_checkout,
    start_backend,
)


@pytest.fixture(scope="module")
def checkout_root() -> Path:
    """Extract one pristine checkout for all rehearsal assertions."""
    with tempfile.TemporaryDirectory(prefix="sabha-clean-checkout-") as temp:
        yield extract_checkout(Path(temp) / "checkout")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_clean_archive_has_only_tracked_runtime_files(checkout_root: Path) -> None:
    root = checkout_root

    report = audit_checkout(root)

    assert report["required_files"] == len(REQUIRED_TRACKED_FILES)
    assert report["forbidden_entries"] == 0
    assert not (root / "frontend" / "next-env.d.ts").exists()
    assert not (root / "frontend" / "node_modules").exists()
    assert not (root / ".env").exists()
    assert not (root / "HOSTED_STORAGE_VERIFICATION.md").exists()


def test_clean_checkout_imports_final_entry_points(checkout_root: Path) -> None:
    result = backend_smoke(checkout_root, python=sys.executable)

    assert result == {"paths": 57, "worker_main": True}


def test_clean_checkout_serves_the_health_endpoint(checkout_root: Path) -> None:
    result = start_backend(checkout_root, python=sys.executable, port=_free_port())

    assert result["health"] == {"status": "healthy"}
    assert result["root"] == {"message": "Sabha API", "version": "0.1.0"}
