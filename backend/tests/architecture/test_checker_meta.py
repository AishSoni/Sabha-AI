"""Meta suite proving the architecture-checker engine itself: red cases
for deliberately forbidden imports (absolute and relative), the
transitive SDK walk, import-time SDK construction, and green cases for
the legal dependency shapes each layer allows.

The spec-03 seed evolved into this checker; these meta tests keep every
added rule honest on synthetic trees before any real modular root
exists.
"""

from pathlib import Path

import pytest

from tests.architecture.checker import (
    LayerPolicy,
    check_file,
    domain_policy,
    capability_policy,
    application_policy,
    scan_sdk_reach,
)


def _build(tmp_path: Path, files: dict[str, str]) -> Path:
    for rel, content in files.items():
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# red: absolute forbidden imports


def test_absolute_sdk_import_is_flagged(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/modules/knowledge/domain/model.py": (
                "from supabase import create_client\n\n\n"
                "def build():\n    return create_client('http://fixture')\n"
            ),
        },
    )
    file_path = root / "app/modules/knowledge/domain/model.py"

    violations = check_file(file_path, domain_policy("app.modules.knowledge.domain"), root, check_reach=False)

    kinds = {v.kind for v in violations}
    assert "forbidden_sdk_import" in kinds, violations
    assert any("supabase" in v.message for v in violations), violations


def test_absolute_legal_imports_pass(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/modules/knowledge/domain/model.py": (
                "from datetime import datetime\n"
                "from typing import List, Optional\n"
                "from pydantic import BaseModel\n"
            ),
        },
    )
    file_path = root / "app/modules/knowledge/domain/model.py"

    violations = check_file(file_path, domain_policy("app.modules.knowledge.domain"), root)

    assert violations == []


# ---------------------------------------------------------------------------
# relative-import resolution


def test_relative_import_is_resolved_and_flags_the_forbidden_chain(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/modules/meetings/domain/policy.py": (
                "from ....platform.database import get_supabase\n"
            ),
        },
    )
    file_path = root / "app/modules/meetings/domain/policy.py"

    violations = check_file(file_path, domain_policy("app.modules.meetings.domain"), root, check_reach=False)

    assert violations, "a four-dot relative import must climb to app.platform.database"
    assert all("app.platform.database" in v.message for v in violations), violations


def test_legal_relative_imports_inside_the_own_domain_pass(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/modules/meetings/domain/types.py": "class Shape:\n    pass\n",
            "app/modules/meetings/domain/policy.py": (
                "from .types import Shape\n"
                "from . import types\n"
            ),
        },
    )

    violations = check_file(
        root / "app/modules/meetings/domain/policy.py",
        domain_policy("app.modules.meetings.domain"),
        root,
    )

    assert violations == []


# ---------------------------------------------------------------------------
# transitive SDK reach


def test_transitive_sdk_reach_walks_in_tree_files(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/platform/database.py": "from supabase import create_client\n",
            "app/services/store.py": (
                "from app.platform.database import get_supabase\n"
            ),
            "app/services/facade.py": (
                "from app.services import store\n"
                "from app.services.store import fetch\n"
            ),
        },
    )
    legacy_style = LayerPolicy(name="legacy-migration", own_prefixes=("app",))

    violations = check_file(root / "app/services/facade.py", legacy_style, root)

    reach = [v for v in violations if v.kind == "sdk_reach_transitive"]
    assert reach, violations
    joined = "\n".join(v.message for v in reach)
    assert "supabase" in joined
    # The chain is proven, not asserted: store -> database carries the SDK.
    assert "app/services/store.py" in joined and "app/platform/database.py" in joined


def test_unresolvable_relative_import_outside_any_package(tmp_path):
    root = _build(
        tmp_path,
        {"main.py": "from .nowhere import nothing\n"},
    )

    violations = check_file(root / "main.py", LayerPolicy(name="entry"), root, check_reach=False)

    assert violations, "a file with no package cannot legally use relative imports"


# ---------------------------------------------------------------------------
# import-time SDK construction


def test_module_level_sdk_construction_is_flagged(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/platform/db.py": (
                "from supabase import create_client\n"
                "CLIENT = create_client('http://fixture')\n"
            ),
        },
    )

    violations = check_file(
        root / "app/platform/db.py",
        LayerPolicy(name="infrastructure", own_prefixes=("app",)),
        root,
        check_reach=False,
    )

    kinds = {v.kind for v in violations}
    assert "sdk_construction_at_import" in kinds, violations


def test_construction_inside_a_function_body_is_not_import_time(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/platform/db.py": (
                "from supabase import create_client\n\n\n"
                "def build():\n    return create_client('http://fixture')\n"
            ),
        },
    )

    violations = check_file(
        root / "app/platform/db.py",
        LayerPolicy(name="infrastructure", own_prefixes=("app",)),
        root,
        check_reach=False,
    )

    assert "sdk_construction_at_import" not in {v.kind for v in violations}, violations
    assert "forbidden_sdk_import" in {v.kind for v in violations}, violations


# ---------------------------------------------------------------------------
# curated cross-module surfaces


def test_cross_module_imports_require_the_public_interface(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/modules/meetings/application/runner.py": "",
        },
    )
    policy = application_policy("meetings")

    assert policy.violation_for("app.modules.knowledge.domain.internal") is not None
    assert policy.violation_for("app.modules.knowledge.public") is None
    assert policy.violation_for("app.modules.meetings.domain.policy") is None


def test_capability_policy_shape(tmp_path):
    root = _build(
        tmp_path,
        {
            "app/capabilities/configuration/service.py": "",
        },
    )
    policy = capability_policy("configuration")
    file_path = root / "app/capabilities/configuration/service.py"

    violations = check_file(file_path, policy, root, check_reach=False)
    assert violations == []  # an empty file is trivially clean

    assert policy.violation_for("app.platform.config") is None
    assert policy.violation_for("app.platform.database") is not None
    assert policy.violation_for("app.services.tools") is not None
    assert policy.violation_for("app.capabilities.configuration.service") is None
    assert policy.violation_for("app.capabilities.inference.contracts") is None
    assert policy.violation_for("app.capabilities.inference.service") is not None
    assert policy.violation_for("fastapi") is not None
    assert policy.violation_for("pydantic") is None
