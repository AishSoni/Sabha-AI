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

- Characterize accepted creation, persona edit/history, turn/tool behavior, end/recovery, upload/search/delete, settings, archive/reporting, and no-sign-in hosted/local demo access. Verify a fresh visitor needs neither accounts nor an Auth bootstrap. Do not characterize a known review defect as supported behavior.
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

## Implemented (spec-03 exit gate, recorded 2026-10)

Ten descriptive unnumbered local commits from `51f27b3` to the exit-gate commit (all committed locally, nothing pushed):

- Runner configuration: pytest markers (`architecture` / `characterization` / `regression` / `integration`); frontend scripts `test:unit` and `test:architecture`; vitest discovers the runner-owned `frontend/tests/` tree in the same commit that shipped its first test (`dc9381d`).
- Reusable backend doubles with executable proofs (`backend/tests/doubles/test_doubles.py`, 16 tests): a fake clock (recorded reads plus rewind for replay proofs), owner-gated `WaitEvent` / `AsyncBarrier` barriers (single-owner release semantics, one-shot failure injection to current and future waiters), and a scriptable split-event SSE transport fake (arbitrary chunk boundaries, injected transport failure after N frames, truncated last frame, full reset/replay).
- Executable architecture contracts: a backend AST checker (`backend/tests/architecture/checker.py`) with absolute and relative import resolution (including climbing out of packages), transitive SDK reach scanning (for example services → `app.core.database` → `supabase`), module-level SDK-construction detection, and per-root layer policies whose allowed sets are validated against the live capability tree rather than only synthetic trees. A frontend TypeScript-compiler import walker (`frontend/tests/architecture/checker.ts`) forbids Supabase/provider SDK imports, enforces one curated ui→store exception pair that is checked for liveness, and forbids route files importing test modules. Both checkers carry sandbox meta-tests that fail on planted violations and pass legal files.
- First SDK-isolated use case: `resolve_generation_settings` extracted verbatim into `app.capabilities.configuration` (`contracts.py` holds `MissingProviderKeyError` plus faithful defaults dataclasses; `service.py` is a duck-typed use case). The isolation subprocess test patches `supabase`, `qdrant_client`, `openai`, `cohere`, and `anthropic` module members to raise on any attribute read before app import, and proves the use case executes with only those raising stubs in `sys.modules` (`71fb1b0` red → `e7d2507` green). Old import surfaces stay stable via re-exports; `app/core/__init__.py` lost its side-effectful SDK re-export. Both generation-settings regression files pass unchanged through the migrated path.
- Characterization of the accepted baseline: archive/unarchive/delete lifecycle with cleanup-ledger ordering (pending recorded first → best-effort vector delete → SQL delete → resolve; a Qdrant outage degrades to a `last_error` ledger entry without blocking the SQL delete), list-includes-archived, last-writer-wins archive transitions versus the CAS ending acquisition, context-stats stable key subset, and a no-sign-in access sweep (source token scan, live route table, and a real TestClient visitor read/write flow) with a planted-auth probe proving the sweep is not vacuous.
- Frontend transport fixtures that execute: split-frame and truncated-frame survivability, duplicate/replay passthrough, EOF-without-terminal recovery (synthesized `interrupted` error), duplicate-name tool calls disambiguated by `tool_call_id`, and a scripted fetch with call recording plus loud empty-queue failures (`frontend/tests/fixtures/`).
- Contract inventory published: `specs/reference-api-use-case-inventory.md` — all 39 routes classified (command / observation / status / probe) with receipts, request keys, safe errors, ordering rules, the full SSE stream contract, and a coordinated-cut tracker naming the removal owner of every compatibility adapter (api.ts split → spec-05; orchestrator decomposition → spec-07/08; DTO mixing → ongoing).
- Open decision gates recorded explicitly with owners and blockers: real transaction strategy (narrow SQL RPC versus a direct Postgres transaction adapter — blocks spec-04) and original source-byte store (Supabase Storage versus a persistent local filesystem behind a focused source-store interface — blocks spec-09). Neither is decided; both stand as "none decided yet" in the inventory.

Commands and results: backend full suite `venv\Scripts\python.exe -m pytest -q` → **202 passed** in 232.73s (embedded disposable Postgres only; 63 warnings, all pre-existing pydantic class-Config / utcnow / supabase-client / pyiceberg-pyparsing deprecations); frontend `npm run test` → **79 passed / 17 files** (6.10s); `npm run test:architecture` → **7 passed** (1 file); backend architecture subset **14 passed** (including the live capability-tree scan that auto-activated when the first capability landed); frontend typecheck `npx tsc --noEmit` → pre-existing errors only (below), zero errors in `frontend/tests/`.

### Limitations (recorded honestly; never claimed as executed)

- **CI intentionally deferred by user decision.** The spec normally asks for explicit CI configuration alongside discovery and isolation. During spec-03 planning the user chose to leave CI out of this spec; everything above was therefore verified locally with the exact commands recorded. Standing up the workflow remains open work, and the recorded deviation is a decision, not an unexecuted success.
- The backend has no ruff/mypy configuration; type checking is frontend-only via `npx tsc --noEmit`, which still reports **pre-existing** debt unrelated to this spec: `src/stores/settings-store.ts(403)` persist-migration typing, `src/test/chat-drafts.test.tsx(50)` and `meeting-room-route-gate.test.tsx(46)` store-selector typing, `src/test/meeting-op-scope.test.ts(220, 262)` call arity and `ContextStats.used_tokens` typing, plus stale `.next/dev/types/validator.ts` and `.next/types/validator.ts` errors referencing a deleted `src/app/demo/page.js` (stale build caches — trust source, not caches).
- The backend import checker is static; SDK construction confined to function bodies is covered by the reach scan and the subprocess isolation gate, not by proving refusal at every runtime call site.
- No paid inference and no external network calls: provider transports ran on fakes and raising stubs; SQL ran on embedded disposable Postgres; Qdrant paths used in-process fakes and the PostgREST-shaped stub. No real Supabase/Qdrant cluster was exercised.
- The frontend import walker executes no module code; it statically analyzes import declarations, including dynamic `import()` string arguments.
