"""Final spec-11 architecture and entry-point checks.

The cutover is complete when the old packages are gone, every public API
route is owned by a module, the composition root is not imported back into
the application layers, and both process entry points still resolve through
``app.bootstrap``.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

import pytest

from main import app

pytestmark = pytest.mark.architecture

BACKEND_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = BACKEND_ROOT / "app"

LEGACY_PACKAGES = ("api", "services", "models", "llm", "core")
SDK_ROOTS = {"fastapi", "supabase", "qdrant_client", "openai", "cohere", "anthropic"}


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def _python_sources(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return [
        path
        for path in root.rglob("*.py")
        if "__pycache__" not in path.parts
    ]


def test_legacy_packages_have_no_python_sources():
    offenders = {
        package: [
            path.relative_to(BACKEND_ROOT).as_posix()
            for path in _python_sources(APP_ROOT / package)
        ]
        for package in LEGACY_PACKAGES
    }
    assert {key: value for key, value in offenders.items() if value} == {}


def test_no_code_imports_a_legacy_package():
    callers: list[str] = []
    for base in (APP_ROOT, BACKEND_ROOT / "tests"):
        for path in _python_sources(base):
            modules = _imported_modules(path)
            if any(
                module == f"app.{package}"
                or module.startswith(f"app.{package}.")
                for module in modules
                for package in LEGACY_PACKAGES
            ):
                callers.append(path.relative_to(BACKEND_ROOT).as_posix())
    assert callers == []


def test_every_api_route_is_owned_by_a_module():
    assert app.routes
    unowned = []
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api"):
            continue
        endpoint = getattr(route, "endpoint", None)
        module = getattr(endpoint, "__module__", "")
        if not module.startswith(("app.modules.", "app.replay.")):
            unowned.append((path, module))
    assert unowned == []


def test_application_layers_do_not_import_the_composition_root():
    offenders = []
    for layer in (APP_ROOT / "modules", APP_ROOT / "capabilities", APP_ROOT / "platform"):
        for path in _python_sources(layer):
            if any(
                module == "app.bootstrap" or module.startswith("app.bootstrap.")
                for module in _imported_modules(path)
            ):
                offenders.append(path.relative_to(BACKEND_ROOT).as_posix())
    assert offenders == []


def test_public_facades_expose_no_http_or_sdk_dependency():
    offenders = []
    for public in _python_sources(APP_ROOT / "modules"):
        if public.name != "public.py":
            continue
        module_name = public.parent.name
        for imported in _imported_modules(public):
            if imported.startswith(f"app.modules.{module_name}.presentation"):
                offenders.append(f"{public}: {imported}")
            if imported.split(".")[0] in SDK_ROOTS:
                offenders.append(f"{public}: {imported}")
    assert offenders == []


def test_main_entrypoint_stays_thin():
    source = (BACKEND_ROOT / "main.py").read_text(encoding="utf-8")
    assert "from app.bootstrap import create_app" in source
    assert "app = create_app()" in source
    assert "include_router" not in source
    assert "@app." not in source
    assert app.title == "Sabha API"


def test_worker_entrypoint_uses_the_same_composition_root():
    import worker

    source = (BACKEND_ROOT / "worker.py").read_text(encoding="utf-8")
    assert "from app.bootstrap import Container" in source
    assert "Container.production()" in source
    assert "await runner.start()" in source
    assert "await runner.stop()" in source
    assert inspect.iscoroutinefunction(worker._main)


@pytest.mark.asyncio
async def test_worker_fails_loudly_when_the_runner_is_disabled(monkeypatch):
    import worker

    class DisabledContainer:
        turn_runner = None

    monkeypatch.setattr(
        worker.Container,
        "production",
        classmethod(lambda cls: DisabledContainer()),
    )
    with pytest.raises(SystemExit, match="Turn runner is disabled"):
        await worker._main()
