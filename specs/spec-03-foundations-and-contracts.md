# Spec 03 (Phase 2): Foundations and Executable Contracts

## Purpose and prerequisites

Make the architecture migration testable before moving production responsibilities.

- Both [Phase 1 specs](roadmap-phase-1-existing-issues.md) must have executed red-green-refactor evidence and passing relevant regression suites. Document limitations; do not assume tests exist because their directories or caches do.
- Read the [confirmed decisions](reference-architecture-contracts.md#confirmed-decisions), [domain ownership](reference-architecture-contracts.md#domain-ownership-and-vocabulary), and [target file structure](reference-architecture-contracts.md#target-file-structure-and-restructuring-plan).
- Have resettable disposable Postgres/Supabase and Qdrant resources, synthetic credentials, and provider/embedding HTTP fakes. No real paid calls or personal data are required.
- Select compatible, reproducibly resolved test/runtime dependencies and backend async/frontend component runners. Explicitly configure test discovery, plugins, isolation, and CI.

## Bounded deliverable

Do not move every source file or scaffold the target tree. Deliver the contract inventory, first enforced import boundaries, reusable test harnesses, and a reproducible accepted baseline. Record two later decision gates: real transaction strategy before backend atomic adapters; source-byte storage/retention/backup before knowledge ingestion.

Current anchors: `backend/app/core/database.py`, `backend/app/services/meeting_manager.py`, `backend/app/services/orchestrator.py`, `frontend/src/lib/api.ts`, and both existing stores. Recheck them after Phase 1 fixes. Target tests: `backend/tests/architecture/`, `backend/tests/doubles/`, `frontend/tests/architecture/`, `frontend/tests/fixtures/`, and `frontend/tests/setup.ts`.

## Tests to write first

- Characterize accepted creation, persona edit/history, turn/tool behavior, end/recovery, upload/search/delete, settings, archive/reporting, and local/authenticated entry. Do not characterize a known review defect as supported behavior.
- A deliberately forbidden domain SDK import must fail the architecture checker; legal imports must pass. Cover absolute and relative imports, module public interfaces, indirect imports causing SDK construction, and frontend private-feature dependencies.
- Instantiate the first domain/application use case with fakes while client constructors are patched to fail. Merely avoiding network calls is weaker than avoiding SDK construction/import coupling.
- Prove fixture reset, fake clocks/barriers, split-event transport, and disposable migrations actually run in CI. Preserve Phase 1 assertions through later moves.

## Code example: a boundary-checker seed

Proposed test helper for `backend/tests/architecture/`. It illustrates inspecting **absolute imports only**; build the complete checker with relative import resolution and transitive/side-effect tests before calling the boundary enforced:

```python
import ast

FORBIDDEN_ROOTS = {"fastapi", "supabase", "qdrant_client"}

def forbidden_sdk_imports(source: str) -> set[str]:
    roots = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            roots.add((node.module or "").split(".")[0])
    return roots & FORBIDDEN_ROOTS

def test_checker_rejects_domain_sdk_import():
    assert forbidden_sdk_imports("from supabase import create_client") == {"supabase"}
    assert forbidden_sdk_imports("from dataclasses import dataclass") == set()
```

Apply the completed checker to real domain/application roots using their different allowed dependency sets. Extend SDK roots to selected provider SDKs and prohibit composition-root/infrastructure imports; this seed alone does not catch them.

## Green and refactor

- Publish the [API/use-case inventory](reference-architecture-contracts.md#api-schema-and-migration-policy): commands versus observation/status, operation receipts, request-key rules, safe errors, revisions/order, and stream contracts. Track coordinated cuts and the removal owner of each compatibility adapter.
- Adopt the target ownership vocabulary and curated cross-module/feature interfaces. Keep anemic data plus explicit services; do not introduce generic repository/entity frameworks.
- Establish contract suites that can run against fakes and isolated real adapters, with deterministic IDs, scriptable providers, controlled promises, failure injection, and safe worker teardown.
- Record exact setup/focused/broader commands and results. Document services required for integration separately from SDK-free unit tests.

## Exit gate

Phase 1 regressions and characterization suites are reproducible without paid inference. Architecture tests fail on intentional forbidden imports and pass legal cases. Test fixtures exist and execute rather than remaining prose. Transaction and source-store decisions have explicit owners and blocking downstream gates; no unchosen hosted dependency is introduced.

Next: [Backend composition and transactions](spec-04-backend-composition-and-transactions.md). Frontend work follows its accepted API seams through [Frontend transport and state](spec-05-frontend-transport-and-state.md).
