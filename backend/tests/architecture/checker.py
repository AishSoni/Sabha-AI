"""AST-based import-boundary checker for the spec-03 architecture
contracts.

The checker answers three questions about one file at a time:

1. **Import roots** — every import (absolute and relative, including the
   module implied by ``from X import name``) is resolved to a full module
   path; SDK roots and the readable ``app.*`` surface of a layer policy
   decide whether it is legal.
2. **Import-time construction** — SDK client constructors called while a
   module is imported (module level, outside function bodies) are
   flagged; construction must belong to lifecycle/composition code.
3. **Transitive reach** — walking the in-tree import graph from the file
   under test, report any file that directly imports a forbidden SDK,
   with the chain that proves how domain code reaches it.

Layer policies are explicit: each returns the readable surface for one
kind of root (modules/*/domain, modules/*/application, capabilities/*).
Policies are deliberately stricter than the legacy tree — the legacy
anchors are recorded by the boundary tests, not excused here.
"""

import ast
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

# SDK roots that must never appear in domain/application/capability code.
# fastapi/supabase/qdrant_client are the spec-03 seed set; openai, cohere
# and anthropic are the declared provider SDKs (selected provider SDK
# extension — the provider layer itself goes through plain httpx, which
# stays allowed because transport is not a domain concern).
FORBIDDEN_SDK_ROOTS = frozenset(
    {"fastapi", "supabase", "qdrant_client", "openai", "cohere", "anthropic"}
)

# SDK client constructors whose module-level call means the SDK builds
# state at import time.
SDK_CONSTRUCTOR_NAMES = frozenset(
    {
        "create_client",      # supabase
        "QdrantClient",       # qdrant_client
        "AsyncQdrantClient",  # qdrant_client
        "OpenAI",             # openai
        "AsyncOpenAI",        # openai
        "Client",             # cohere legacy client name
        "ClientV2",           # cohere current client name
    }
)

MODULE_ROOTS = ("meetings", "persona_catalog", "knowledge")
CAPABILITIES = ("configuration", "inference", "runtime")


@dataclass(frozen=True)
class LayerPolicy:
    """The readable surface of one architecture layer."""

    name: str
    own_prefixes: Tuple[str, ...] = ()
    app_readable: Tuple[str, ...] = ()
    public_interfaces: Tuple[str, ...] = ()
    capability_contracts: Tuple[str, ...] = ()
    extra_roots: frozenset = frozenset({"pydantic"})

    def violation_for(self, target: str) -> Optional[str]:
        if not target:
            return None
        root = target.split(".")[0]
        if root in sys.stdlib_module_names:
            return None
        if root in FORBIDDEN_SDK_ROOTS:
            return f"SDK root '{root}' is forbidden in {self.name}"
        if root == "app":
            if target.startswith(self.own_prefixes):
                return None
            if target.startswith(self.app_readable):
                return None
            if target.startswith(self.public_interfaces):
                return None
            if target.startswith(self.capability_contracts):
                return None
            return f"'{target}' is outside the readable surface of {self.name}"
        if root in self.extra_roots:
            return None
        return (
            f"third-party root '{root}' is outside the allowed set of {self.name} "
            f"(allowed extra roots: {sorted(self.extra_roots)})"
        )


def domain_policy(domain_package: str) -> LayerPolicy:
    """modules/<m>/domain: pure decision code — stdlib and pydantic data
    types, plus its own domain subtree only. Sibling layers of the same
    module (infrastructure, presentation) are NOT readable from here."""
    return LayerPolicy(
        name="modules/*/domain",
        own_prefixes=(domain_package, f"{domain_package}."),
        app_readable=(),
        public_interfaces=(),
    )


def application_policy(own_module: str) -> LayerPolicy:
    """modules/<own>/application: own module subtree, curated public
    interfaces of other modules, and NO infrastructure reach."""
    others = tuple(
        f"app.modules.{other}.public" for other in MODULE_ROOTS if other != own_module
    )
    return LayerPolicy(
        name=f"modules/{own_module}/application",
        own_prefixes=(f"app.modules.{own_module}",),
        app_readable=(),
        public_interfaces=others,
    )


def capability_policy(own_capability: str) -> LayerPolicy:
    """capabilities/<own>: own subtree plus platform config plus the
    contracts of sibling capabilities. No services, no database, no
    SDKs."""
    contracts = tuple(
        f"app.capabilities.{other}.contracts"
        for other in CAPABILITIES
        if other != own_capability
    )
    return LayerPolicy(
        name=f"capabilities/{own_capability}",
        own_prefixes=(f"app.capabilities.{own_capability}",),
        app_readable=("app.platform.config",),
        capability_contracts=contracts,
    )


@dataclass(frozen=True)
class ImportViolation:
    file: str
    line: int
    kind: str
    message: str

    def __str__(self) -> str:
        return f"{self.file}:{self.line} [{self.kind}] {self.message}"


@dataclass(frozen=True)
class ResolvedImport:
    module_path: str   # full dotted path of the imported module
    bound_name: str    # alias bound, or "" for plain/dotted module imports
    line: int


@dataclass(frozen=True)
class ReachHit:
    sdk_root: str
    chain: Tuple[str, ...]  # relative file paths after the entry file

    def render(self) -> str:
        return f"SDK '{self.sdk_root}' via " + " -> ".join(self.chain)


def parse_file(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"))


def package_of(file_path: Path, project_root: Path) -> str:
    """The dotted package used to resolve relative imports from this file:
    for ``app/llm/__init__.py`` -> ``app.llm``, for
    ``app/services/orchestrator.py`` -> ``app.services``."""
    parts = file_path.resolve().relative_to(project_root.resolve()).with_suffix("").parts
    return ".".join(parts[:-1])


def rel_path(path: Path, project_root: Path) -> str:
    return str(path.resolve().relative_to(project_root.resolve())).replace("\\", "/")


def iter_resolved_imports(tree: ast.AST, package: str) -> Iterable[ResolvedImport]:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield ResolvedImport(alias.name, "", node.lineno)
        elif isinstance(node, ast.ImportFrom):
            if node.module == "__future__":
                continue
            if node.level and not package:
                yield ResolvedImport(
                    "<unresolvable:relative-import-outside-package>",
                    "",
                    node.lineno,
                )
                continue
            target = _resolve_from_target(package, node.level, node.module)
            for alias in node.names:
                if alias.name == "*":
                    yield ResolvedImport(target, "", node.lineno)
                else:
                    yield ResolvedImport(target, alias.name, node.lineno)


def _resolve_from_target(package: str, level: int, module: Optional[str]) -> str:
    if not level:
        return module or ""
    parts = package.split(".") if package else []
    # Canonical resolution: one dot stays inside the current package; each
    # extra dot climbs one package higher.
    climb = level - 1
    if climb > len(parts):
        raise ValueError(
            f"relative import of level {level} escapes beyond top-level package"
        )
    base = parts[: len(parts) - climb] if climb else parts
    if module:
        base = [*base, *module.split(".")]
    return ".".join(base)


def direct_sdk_roots(path: Path, project_root: Path) -> List[str]:
    """SDK roots imported directly by one file."""
    tree = parse_file(path)
    roots = []
    for resolved in iter_resolved_imports(tree, package_of(path, project_root)):
        root = resolved.module_path.split(".")[0] if resolved.module_path else ""
        if root in FORBIDDEN_SDK_ROOTS and root not in roots:
            roots.append(root)
    return roots


def resolve_module_file(project_root: Path, module_path: str) -> Optional[Path]:
    parts = module_path.split(".")
    for size in range(len(parts), 0, -1):
        base = project_root.joinpath(*parts[:size])
        candidate = base.with_suffix(".py")
        if candidate.is_file():
            return candidate
        package_init = base / "__init__.py"
        if package_init.is_file():
            return package_init
    return None


def module_level_constructors(tree: ast.AST) -> List[Tuple[int, str]]:
    """Constructor calls that run while the module body is imported.

    Walks only the module's top-level statements, skipping everything
    nested inside function/class bodies (lazy construction inside a
    function is a lifecycle decision, not an import-time side effect).
    """

    def _walk_upper_frames(node: ast.AST):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            yield child
            yield from _walk_upper_frames(child)

    found = []
    for stmt in tree.body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        for node in _walk_upper_frames(stmt):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name):
                    name = func.id
                elif isinstance(func, ast.Attribute):
                    name = func.attr
                else:
                    name = ""
                if name in SDK_CONSTRUCTOR_NAMES:
                    found.append((node.lineno, name))
    return found


def scan_sdk_reach(
    entry: Path,
    project_root: Path,
    max_depth: int = 12,
) -> List[ReachHit]:
    """Walk the in-tree import graph from `entry` and report every file
    that directly imports a forbidden SDK, with the chain from entry."""

    def in_tree_imports(path: Path) -> List[Tuple[str, str]]:
        tree = parse_file(path)
        package = package_of(path, project_root)
        resolved: List[Tuple[str, str]] = []
        for item in iter_resolved_imports(tree, package):
            if not item.module_path or not item.module_path.startswith("app"):
                continue
            resolved.append((item.module_path, item.bound_name))
        return resolved

    hits: List[ReachHit] = []
    seen = {entry.resolve()}
    frontier = deque([(entry, ())])
    while frontier and len(hits) < 20:
        path, chain = frontier.popleft()
        if len(chain) > max_depth:
            continue
        for target, bound_name in in_tree_imports(path):
            module_paths = [target]
            if bound_name and bound_name != "*":
                module_paths.append(f"{target}.{bound_name}")
            for module_path in module_paths:
                target_file = resolve_module_file(project_root, module_path)
                if target_file is None or target_file.resolve() in seen:
                    continue
                seen.add(target_file.resolve())
                next_chain = chain + (rel_path(target_file, project_root),)
                for sdk_root in direct_sdk_roots(target_file, project_root):
                    hits.append(ReachHit(sdk_root, next_chain))
                frontier.append((target_file, next_chain))
    return hits


def check_file(
    path: Path,
    policy: LayerPolicy,
    project_root: Path,
    check_reach: bool = True,
) -> List[ImportViolation]:
    """Full per-file check: import roots, import-time construction, and
    the transitive SDK walk."""
    relative = rel_path(path, project_root)
    violations: List[ImportViolation] = []
    tree = parse_file(path)
    package = package_of(path, project_root)

    for item in iter_resolved_imports(tree, package):
        candidates = [item.module_path]
        if item.bound_name and item.bound_name != "*":
            candidates.append(f"{item.module_path}.{item.bound_name}")
        for candidate in candidates:
            reason = policy.violation_for(candidate)
            if reason:
                kind = "forbidden_sdk_import" if "SDK root" in reason else "out_of_layer"
                violations.append(
                    ImportViolation(relative, item.line, kind, f"{reason} (imported as '{candidate}')")
                )
                break

    for line, ctor_name in module_level_constructors(tree):
        violations.append(
            ImportViolation(
                relative,
                line,
                "sdk_construction_at_import",
                f"'{ctor_name}(...)' runs while the module is imported; construct "
                "SDK clients in lifecycle code instead",
            )
        )

    if check_reach:
        for hit in scan_sdk_reach(path, project_root):
            violations.append(
                ImportViolation(
                    relative,
                    0,
                    "sdk_reach_transitive",
                    f"{hit.render()} — a forbidden SDK is reachable from this file",
                )
            )
    return violations


def modular_roots(project_root: Path) -> List[Tuple[Path, LayerPolicy]]:
    """Enumerate the target-tree roots that exist with their layer
    policies: modules/*/domain, modules/*/application, capabilities/*/."""
    found: List[Tuple[Path, LayerPolicy]] = []
    modules_dir = project_root / "app" / "modules"
    if modules_dir.is_dir():
        for module_dir in sorted(modules_dir.iterdir()):
            if not module_dir.is_dir():
                continue
            domain = module_dir / "domain"
            if domain.is_dir():
                for py in sorted(domain.rglob("*.py")):
                    found.append(
                        (
                            py,
                            domain_policy(package_of(py, project_root)),
                        )
                    )
            application = module_dir / "application"
            if application.is_dir():
                for py in sorted(application.rglob("*.py")):
                    found.append((py, application_policy(module_dir.name)))
    capabilities_dir = project_root / "app" / "capabilities"
    if capabilities_dir.is_dir():
        for capability_dir in sorted(capabilities_dir.iterdir()):
            if not capability_dir.is_dir():
                continue
            policy = capability_policy(capability_dir.name)
            for py in sorted(capability_dir.rglob("*.py")):
                found.append((py, policy))
    return found
