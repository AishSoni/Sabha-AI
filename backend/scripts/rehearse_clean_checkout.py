"""Rehearse the spec-11 clean-checkout deployment path.

The rehearsal deliberately starts from ``git archive`` rather than the working
tree.  That proves the runtime does not depend on author-local caches
(``node_modules``, ``.next``, virtualenvs), ignored environment files, or
untracked seed documents.

Examples::

    python -m scripts.rehearse_clean_checkout --skip-frontend
    python -m scripts.rehearse_clean_checkout

The frontend phase runs ``npm ci``, regenerates the OpenAPI types, runs the
test suite, builds, and starts the production server.  The backend phase
imports the real ``main:app`` and ``worker`` entry points from the extracted
archive.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

REQUIRED_TRACKED_FILES = (
    ".env.example",
    "README.md",
    "backend/main.py",
    "backend/worker.py",
    "backend/requirements.txt",
    "backend/supabase_schema.sql",
    "backend/migrations/028_system_ai_settings.sql",
    "backend/migrations/029_internal_table_rls.sql",
    "backend/migrations/030_database_read_isolation.sql",
    "backend/migrations/031_pdf_extraction_provenance.sql",
    "backend/scripts/migrate.py",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/tests/fixtures/openapi.json",
)

FORBIDDEN_CHECKOUT_ENTRIES = (
    ".env",
    ".env.local",
    "frontend/.env",
    "frontend/.env.local",
    "frontend/node_modules",
    "frontend/.next",
    "frontend/next-env.d.ts",
    "backend/venv",
    "HOSTED_STORAGE_VERIFICATION.md",
)


class RehearsalError(RuntimeError):
    """A clean-checkout assertion or command failed."""


def _run(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    timeout: int = 900,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        raise RehearsalError(
            f"{' '.join(command)} failed with {completed.returncode}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed


def _safe_extract(archive: tarfile.TarFile, destination: Path) -> None:
    destination = destination.resolve()
    for member in archive.getmembers():
        target = (destination / member.name).resolve()
        if destination != target and destination not in target.parents:
            raise RehearsalError(f"archive member escapes destination: {member.name}")
    archive.extractall(destination, filter="data")


def extract_checkout(destination: Path, *, ref: str = "HEAD") -> Path:
    """Extract the tracked tree at ``ref`` into an empty directory."""
    if destination.exists() and any(destination.iterdir()):
        raise RehearsalError(f"destination is not empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)

    archive_bytes = subprocess.run(
        ["git", "archive", "--format=tar", ref],
        cwd=str(REPO_ROOT),
        check=True,
        capture_output=True,
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive_bytes)) as archive:
        _safe_extract(archive, destination)
    return destination


def audit_checkout(root: Path) -> dict[str, object]:
    """Assert the archive contains the deployable files and no local state."""
    missing = [name for name in REQUIRED_TRACKED_FILES if not (root / name).is_file()]
    if missing:
        raise RehearsalError(f"clean checkout is missing: {', '.join(missing)}")

    forbidden = [
        name
        for name in FORBIDDEN_CHECKOUT_ENTRIES
        if (root / name).exists()
    ]
    if forbidden:
        raise RehearsalError(
            "clean checkout contains local-only state: " + ", ".join(forbidden)
        )

    return {
        "required_files": len(REQUIRED_TRACKED_FILES),
        "forbidden_entries": 0,
    }


def _clean_env(root: Path, *, python_path: bool = True) -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        not in {
            "PYTHONPATH",
            "VIRTUAL_ENV",
            "CONDA_PREFIX",
            "SUPABASE_URL",
            "SUPABASE_KEY",
            "SUPABASE_SERVICE_KEY",
            "SUPABASE_AUTH_PUBLISHABLE_KEY",
            "OPERATOR_USER_ID",
            "OPENROUTER_API_KEY",
            "GEMINI_API_KEY",
            "COHERE_API_KEY",
            "OPENAI_API_KEY",
        }
    }
    if python_path:
        env["PYTHONPATH"] = str(root / "backend")
    env.update(
        {
            "SUPABASE_URL": "http://127.0.0.1:54321",
            "SUPABASE_KEY": "clean-checkout-anon-key",
            "SUPABASE_SERVICE_KEY": "clean-checkout-service-key",
            "SUPABASE_AUTH_PUBLISHABLE_KEY": "clean-checkout-publishable-key",
            "OPERATOR_USER_ID": "11111111-1111-4111-8111-111111111111",
            "DEFAULT_LLM_PROVIDER": "ollama",
            "RUNTIME_MODE": "local",
            "TURN_RUNNER_ENABLED": "false",
            "APP_ENV": "test",
            "NEXT_TELEMETRY_DISABLED": "1",
            "CI": "1",
        }
    )
    return env


def backend_smoke(root: Path, *, python: str) -> dict[str, object]:
    """Import the final entry points from the extracted archive."""
    script = (
        "import json, main, worker\n"
        "print(json.dumps({'paths': len(main.app.openapi()['paths']), "
        "'worker_main': callable(worker._main)}))\n"
    )
    completed = _run(
        [python, "-c", script],
        cwd=root,
        env=_clean_env(root),
        timeout=120,
    )
    result = json.loads(completed.stdout.strip())
    if result.get("paths") != 56:
        raise RehearsalError(f"unexpected OpenAPI path count: {result}")
    if not result.get("worker_main"):
        raise RehearsalError("worker._main is not callable")
    return result


def start_backend(root: Path, *, python: str, port: int = 8765) -> dict[str, object]:
    env = _clean_env(root)
    log = tempfile.NamedTemporaryFile(
        prefix="sabha-backend-", suffix=".log", delete=False
    )
    process = subprocess.Popen(
        [python, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(root),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for_http(f"http://127.0.0.1:{port}/health", timeout=90)
        health = _get_json(f"http://127.0.0.1:{port}/health")
        root_response = _get_json(f"http://127.0.0.1:{port}/")
        return {"health": health, "root": root_response}
    except Exception as exc:
        log.flush()
        output = Path(log.name).read_text(encoding="utf-8", errors="replace")[-8000:]
        raise RehearsalError(f"backend server failed: {exc}\n{output}") from exc
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        log.close()
        try:
            Path(log.name).unlink(missing_ok=True)
        except OSError:
            pass


def frontend_smoke(root: Path) -> dict[str, object]:
    frontend = root / "frontend"
    npm = shutil.which("npm")
    if npm is None:
        raise RehearsalError("npm is not available")

    _run([npm, "ci", "--no-audit", "--no-fund"], cwd=frontend, timeout=1200)
    _run([npm, "run", "sync:openapi"], cwd=frontend, timeout=300)
    _run([npm, "test"], cwd=frontend, timeout=900)
    _run([npm, "run", "build"], cwd=frontend, timeout=900)

    generated = frontend / "src" / "shared" / "api" / "generated.ts"
    if not generated.is_file():
        raise RehearsalError("OpenAPI type generation did not produce generated.ts")
    if not (frontend / "next-env.d.ts").is_file():
        raise RehearsalError("Next build did not regenerate next-env.d.ts")
    return {"generated_types": True, "build": True}


def start_frontend(root: Path, *, port: int = 3100) -> dict[str, object]:
    frontend = root / "frontend"
    npm = shutil.which("npm")
    if npm is None:
        raise RehearsalError("npm is not available")
    env = _clean_env(root, python_path=False)
    log = tempfile.NamedTemporaryFile(
        prefix="sabha-frontend-", suffix=".log", delete=False
    )
    process = subprocess.Popen(
        [npm, "start", "--", "-p", str(port)],
        cwd=str(frontend),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for_http(f"http://127.0.0.1:{port}/", timeout=90)
        return {"started": True, "url": f"http://127.0.0.1:{port}/"}
    except Exception as exc:
        log.flush()
        output = Path(log.name).read_text(encoding="utf-8", errors="replace")[-8000:]
        raise RehearsalError(f"frontend server failed: {exc}\n{output}") from exc
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        log.close()
        try:
            Path(log.name).unlink(missing_ok=True)
        except OSError:
            pass


def _wait_for_http(url: str, *, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise RehearsalError(f"{url} did not become ready: {last_error}")


def _get_json(url: str) -> object:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def rehearse(
    *,
    ref: str = "HEAD",
    workdir: Path | None = None,
    python: str = sys.executable,
    skip_frontend: bool = False,
    serve: bool = False,
) -> dict[str, object]:
    temp = Path(tempfile.mkdtemp(prefix="sabha-clean-checkout-"))
    try:
        root = extract_checkout(temp, ref=ref)
        report: dict[str, object] = {
            "ref": ref,
            "checkout": str(root),
            "python": python,
            "audit": audit_checkout(root),
        }
        report["backend"] = backend_smoke(root, python=python)
        if serve:
            report["backend_http"] = start_backend(root, python=python)
        if not skip_frontend:
            report["frontend"] = frontend_smoke(root)
            if serve:
                report["frontend_http"] = start_frontend(root)
        return report
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--workdir", type=Path, default=None)
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args(argv)

    if args.workdir is not None:
        root = extract_checkout(args.workdir, ref=args.ref)
        report: dict[str, object] = {
            "ref": args.ref,
            "checkout": str(root),
            "audit": audit_checkout(root),
        }
        report["backend"] = backend_smoke(root, python=args.python)
        if not args.skip_frontend:
            report["frontend"] = frontend_smoke(root)
    else:
        report = rehearse(
            ref=args.ref,
            python=args.python,
            skip_frontend=args.skip_frontend,
            serve=args.serve,
        )

    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
