# Phase 01 evidence — offline test foundations and regression baseline

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/01-test-foundations.md` (addendum with B-01..B-11 ledger).
- TESTING.md / DELIVERY.md followed for xfail procedure and evidence layout.
- Decisions: AnyIO + asyncio as the single async convention; own socket guard
  in `backend/tests/conftest.py` instead of the pytest-socket plugin (the pinned
  `pytest-socket==0.6.5` does not exist, so it was removed from
  `backend/requirements-test.txt`); Vitest jsdom single-environment config with
  no browser-provider dependency; regression ledger kept as an addendum inside
  the phase spec per project constraint, not in DELIVERY.md.

## Tasks / acceptance IDs and code/test paths

- P01-T01: `backend/requirements-test.txt`, `backend/pytest.ini`
  (`xfail_strict = true`), `frontend/package.json` test scripts + pinned devDeps,
  `frontend/package-lock.json`.
- P01-T02: `backend/app/core/config.py` (`get_settings`/`override_settings`/
  `reset_settings_override`), `backend/app/core/database.py`
  (`reset_supabase_client`), `backend/app/core/qdrant.py`
  (`reset_qdrant_client`), `backend/app/factory.py` (`create_app` + lifespan).
- P01-T03: `backend/tests/doubles/` (providers, knowledge, repositories, clock,
  runner). Failure injection: `ScriptedProvider.inject_failure`, scripted
  exceptions, `FakeKnowledge.fail_with`.
- P01-T04: `backend/tests/conftest.py` (dummy env pre-import, settings/singleton
  isolation, loopback-aware socket guard, `api_app`/`api_client`/`actor_headers`),
  `backend/tests/api/test_lifespan.py` (TEST04).
- P01-T05: `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`,
  `frontend/src/test/sse.ts`, `frontend/src/test/reset.ts`,
  `frontend/src/lib/stream.test.ts` (TEST08),
  `frontend/src/stores/meetingStore.isolation.test.ts` (TEST03),
  `frontend/src/stores/meetingStore.regression.test.ts` (B-09 `it.fails`).
- P01-T06: `backend/tests/regression/test_ledger.py` (10 strict-xfail cases +
  TEST05 stale-marker demo); B-09 executable case in frontend.
- P01-T07: `backend/tests/integration/safety.py` + `test_safety.py` (TEST07:
  non-test targets rejected, teardown only removes owned resources).
- P01-T08: commands below; `npm run lint`, `npx tsc --noEmit` (clean),
  `npm run build` not yet exercised (deferred, no production change in phase).
- Acceptance: AC01 (TEST01-03, TEST08 green), AC02 (TEST04, TEST07 green),
  AC03 (11/11 B-* tracked with owner + expiry, strict markers), AC04 (doubles /
  stream builders reusable without rewrite).

## Owned bugs: pre-fix red evidence (no fixes in this phase)

- Backend ledger red observed: `16 passed, 10 xfailed, 4 deselected` — each
  xfail fails on its documented intended assertion (B-01 single-call, B-02
  NameError, B-04 CHECK text, B-05 missing dependencies, B-06 no allowlist,
  B-07 dropped provider_config, B-10 no vector delete, B-11 wiped version;
  B-03/B-08 pending-fixture markers fail via explicit `pytest.fail`).
  Command: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest backend/tests
  -m "not integration" -q -p anyio.pytest_plugin` (cwd: repo root).
- B-09 red observed: `it.fails('delayed A response after selecting B keeps B
  visible')` — inner assertion fails (stale A overwrites B), recorded as the
  expected failure. Command: `npm test` (cwd: `frontend/`), `3 files, 7 passed`.
- Corrective changes: none (fixing belongs to owner phases 02/04/05/06/07/08).
  Post-refactor regression result: n/a in Phase 01; markers are strict so any
  future fix without marker removal fails the suite.

## Commands, environment, results

- Env: Windows, Python 3.11.9, pytest 8.3.5, anyio 4.9.0, httpx 0.28.1,
  pytest-cov 6.0.0; Node v26.8.2, npm 12.2.0, vitest 3.2.7, jsdom 26.1.0.
- `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest backend/tests
  -m "not integration" -q -p anyio.pytest_plugin` → 16 passed, 10 xfailed,
  4 deselected. (Autoload disabled: broken `langsmith` plugin in system
  site-packages; unrelated to the harness.)
- `npm test` → 3 passed files, 7 passed tests. `npx tsc --noEmit` → clean.
- Excluded scopes: `integration` marker (needs isolated infra; explicit opt-in),
  `npm run build` (no production change to build in this phase).

## Migration / rollback

No production schema or runtime changes. Reverting harness commits
(`032cc4c`, `f5771f0`, `f366187`, `e8beb54`) touches only test/seam additions;
`main.py` runtime entrypoint unchanged (`create_app` mirrors it for tests).

## Manual acceptance and limitations

- No manual browser walkthrough in this phase (harness-only phase).
- Limitations: fakes do not prove DB concurrency/SQL rollback or live vendor
  behavior (assigned to integration); jsdom does not cover real-server
  incremental delivery (pytest-managed local-server smoke test deferred to the
  phase that needs it); `pytest-cov` installed but no numeric floor set yet
  (baseline to be measured and approved per TESTING.md).

## Exit decision

Pending owner review; all P01-TEST01..08 executable, ledger complete (11/11
tracked, 0 fixed as intended), fast suites green except narrowly tracked
expected failures.
