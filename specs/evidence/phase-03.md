# Phase 03 evidence — demo scaffolding only

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/03-demo-scaffolding.md` (scaffold only, no J00-J09).
- Contracts: `specs/CONTRACTS.md` sections 7/9 target shapes; `specs/DEMO-JOURNEY.md`
  is the Phase 10 target, not implemented here.
- Decisions: fixture-only composition under `backend/app/infrastructure/demo/`;
  synthetic `synthetic-*` / `SYNTHETIC-*` content only; public entry registered
  but disabled (`503 demo_unavailable`); persistent lifecycle deferred to
  Phase 08; real scenario/bootstrap/actions deferred to Phase 10.

## Tasks / acceptance IDs and code/test paths

- Contract scaffold: `backend/app/infrastructure/demo/manifest.py`
  (`ScenarioManifest`, `ScenarioAction`, `DemoSession`, `SourceProvenance`,
  `ClaimKind`); rejects the real journey scenario and non-synthetic IDs/ISINs.
- Composition seam: `backend/app/infrastructure/demo/composition.py`
  (`build_fixture_composition`, `FixtureKnowledgeSearch`,
  `FixtureProviderResolver`, `guard_live_transport`) plus
  `capabilities.py` (fail-closed `DemoUnavailable` policy).
- Synthetic smoke harness: `backend/tests/application/test_demo_smoke.py` runs
  one synthetic `search_knowledge_base` -> tool result -> final response case
  through `backend/app/modules/meetings/engine.py` with captured
  inputs/effects and no journey progression.
- Disabled entry boundary: `backend/app/infrastructure/demo/routes.py` mounted
  at `/api/v2/demo` in `backend/app/factory.py`; every handler returns typed
  `503 demo_unavailable`. Frontend boundary:
  `frontend/src/features/demo/types.ts` (`DEMO_ENABLED = false`) plus
  `disabled.test.ts`.
- Lifecycle extension points: `backend/app/infrastructure/demo/sessions.py`
  (`create_session`, `reset_generation` with generation fencing and
  idempotency); persistent runtime remains Phase 08 work.
- Scaffold evidence: this file.

## Owned tests (all green, no expected failures in this phase)

- `backend/tests/contract/test_demo_manifest.py` — accepts synthetic
  manifest/source/session/action; rejects real scenario ID
  (`indian-corporate-bond-review`), non-synthetic IDs, real ISIN refs, and
  malformed revisions.
- `backend/tests/unit/test_demo_composition.py` — offline composition boots
  with provider/Qdrant/embedding keys absent; fixture resolver allows only
  `fixture`/`synthetic`/empty provider names; live destinations fail before
  transport; synthetic search returns visibly test-only hits; empty query
  returns no items; votes/summaries/metadata/live capabilities report
  `DemoUnavailable`.
- `backend/tests/application/test_demo_smoke.py` — synthetic tool call with
  original call ID returns through the shared engine, produces one persisted
  test message, two provider invocations, `turn_completed` event, and no
  journey state; tool-only empty final answer fails without a placeholder.
- `backend/tests/api/test_demo_disabled.py` — `POST /api/v2/demo/sessions`,
  `/reset`, `/actions` return `503 demo_unavailable`; client mode/provider
  override headers cannot enable them.
- `backend/tests/unit/test_demo_sessions.py` — reset increments generation
  and fences the old turn; same-key retry is idempotent; stale generation is
  rejected; sessions are isolated.
- `frontend/src/features/demo/disabled.test.ts` — `DEMO_ENABLED` is false;
  unavailable reason is typed; only synthetic manifests pass the guard.

## Commands, environment, results

- Env: Windows, Python 3.11.9, pytest 8.3.5, anyio 4.9.0, httpx 0.28.1;
  Node (frontend `npm test`), vitest 3.2.7, jsdom.
- Backend fast suite (repo root):
  `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest backend/tests
  -m 'not integration' -q -p anyio.pytest_plugin` →
  **46 passed, 17 skipped, 4 deselected, 8 xfailed**.
  (Autoload disabled: broken `langsmith` plugin in system site-packages.)
- Frontend (cwd `frontend/`): `npm test` → **4 files, 10 tests passed**
  (7 pre-existing + 3 new demo-disabled cases).
- Type check: `npx tsc --noEmit` → clean.
- Excluded scopes: `integration` marker (needs isolated infra; explicit
  opt-in only).

## Migration / rollback

- Additive only: new `backend/app/infrastructure/demo/` package, new tests,
  one additive router mount. No schema change, no persona/meeting migration.
- Rollback: revert the three scaffold commits and the evidence commit; the
  shared engine and existing routes are untouched.

## Manual acceptance and limitations

- No recruiter walkthrough exists by design; the disabled handlers were
  verified via API tests, not a browser journey.
- Limitations: fakes do not prove DB concurrency/SQL rollback or live vendor
  behavior; jsdom does not cover real-server streaming; no paid-service
  fallback exists to audit beyond the offline/network-guard suites.

## Downstream ownership checklist (nothing pulled forward)

- Phase 04: meeting status/voting/ended repair, durable coordination and queues.
  The former authorization assignment is withdrawn by the scope correction.
- Phase 07: frontend async-state fixes, editable queue UI, reusable
  accessible components.
- Phase 08: generic session lifecycle/expiry/cleanup, runtime bounds,
  route-policy hardening, no-live-service audit.
- Phase 10: exact bond/ISIN selection (D-01), dated evidence pack,
  specialist seeds, J00-J09 guided/exploration UI, authored ending, brief,
  and release verification.

## Exit decision

Passed scaffold gate: offline composition plus one synthetic shared-engine
smoke exercise green; disabled entry, contract validation, and test
isolation green; no early journey implementation or paid-service fallback.
