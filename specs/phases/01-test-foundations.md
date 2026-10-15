# Phase 01 — Offline test foundations and regression baseline

Status: draft. Depends on: Phase 00. Requirements: R-13, R-17. Defects: establish B-01 through B-11 regression ownership without pretending they are fixed.

## Objective and outcome

Provide repeatable pytest/Vitest commands, deterministic fixtures and a trustworthy failure ledger. A developer can test business behavior without provider credentials or a running production database.

## Current implementation and affected paths

`backend/requirements.txt` has broad runtime lower bounds; `backend/app/core/config.py` instantiates settings globally; `backend/app/core/database.py` exposes a singleton. Those patterns can cause import-time coupling. `frontend/package.json` has no tests; the global store in `frontend/src/stores/meetingStore.ts` needs resettable test state. Inspect for new user-added tests before creating overlapping scaffolding.

Proposed additions: backend test dependency/config files, `backend/tests/`, `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, test scripts and CI checks. This phase may add small injection seams; it does not relocate all production modules.

## Required behavior

- Unit/application/frontend tests must collect and run with no live API keys or production `.env`.
- Unexpected network requests fail loudly. Integration jobs opt into isolated endpoints with safety checks and cleanup.
- One async convention: pytest AnyIO with asyncio backend. Exercise app lifespan explicitly where needed.
- Frontend component tests use jsdom and React Testing Library; store/parser tests can use a lighter environment. No browser-provider dependency that installs Playwright.
- Test fixtures reset time, mocks, storage, subscriptions, stores and mutable repositories between tests.
- Regression tests assert desired behavior; known defects may temporarily use the controlled expected-failure procedure in DELIVERY.md.

## Ordered tasks

- **P01-T01 — Dependency baseline:** record runtime versions, choose compatible test versions, add reproducible test installs and scripts. Avoid blanket runtime upgrades while adding the harness.
- **P01-T02 — Backend isolation:** introduce test settings/app factory overrides or the smallest equivalent seam; remove import-time network prerequisites from tests without changing runtime semantics.
- **P01-T03 — Reusable doubles:** add scripted provider invocations, captured provider history, bounded fake knowledge results, in-memory repositories, fake clock and controllable runner. Include explicit failure injection points.
- **P01-T04 — API harness:** configure actor overrides, lifespan management, HTTPX clients and teardown; separate fast and integration markers.
- **P01-T05 — Frontend harness:** add Vitest setup, DOM matchers/user interactions, stream byte builders, sessionStorage helpers and store reset utilities.
- **P01-T06 — Regression ledger:** write focused correct-behavior failing cases for B-01/B-04/B-07/B-09/B-11 first, then executable boundary cases for the remaining findings as seams become available. Record the intended assertion failure before any expected-failure marker. An unavailable seam is an explicit pending reproducer assigned to its fixing phase, never permission to fix without first observing red. No known bug may remain open at Phase 09 exit.
- **P01-T07 — Integration fixtures:** define fresh/legacy database setup, isolated collections and fake embedding dimensions. Block destructive operations unless target is recognized as a test instance.
- **P01-T08 — Checks and evidence:** wire fast tests and explicit integration/build jobs; document commands, environment, known failures and phase deadlines.

## TDD cases

- **P01-TEST01:** Start test collection with required production environment variables absent; no provider/database connection occurs.
- **P01-TEST02:** Attempt an unregistered external HTTP request in a fast test; the guard fails with a useful diagnostic.
- **P01-TEST03:** Run two tests that mutate the same store/fixture; the second starts clean. Restore fake timers even after a failure.
- **P01-TEST04:** Exercise startup and shutdown through the API harness; resources are initialized/closed once and no task leaks remain.
- **P01-TEST05:** Demonstrate a known defect fails for its intended assertion; demonstrate expected-pass detection catches a stale expected-failure marker.
- **P01-TEST06:** Run a fixture provider producing tool call then final text; capture exact input history for later Phase 02 assertions without asserting a broken production implementation is correct.
- **P01-TEST07:** Integration setup rejects a non-test target and leaves unrelated collections/tables untouched; teardown removes only owned test resources.
- **P01-TEST08:** Frontend handles a constructed ReadableStream in the selected test runtime; no network/browser automation package is necessary.

## Acceptance gate

- **P01-AC01:** Documented fast commands pass except narrowly tracked expected failures; paid credentials are absent (TEST01-03, TEST08).
- **P01-AC02:** API fixture lifecycle and integration safety checks pass (TEST04, TEST07).
- **P01-AC03:** Every known failure has a B-* ID, owning phase and expiry gate; there are no generic skipped suites masking harness errors (TEST05).
- **P01-AC04:** Later phases can use provider/knowledge/clock/stream fixtures without rewriting the harness (TEST06, TEST08).

## Migration, rollout and rollback

No production schema changes. Test schema setup uses disposable targets only. Keep runtime dependency changes minimal and inspect the lock/dependency diff. Reverting harness changes must not alter user data. Existing lint/build failures discovered here are recorded separately with reproduction; do not mislabel them as introduced test failures.

## Exclusions and risks

No full engine fix, auth implementation, visual redesign or live-model evaluation. The main risk is overmocking: test doubles must expose side effects and boundaries, while database concurrency and vector compatibility remain explicitly assigned to integration tests.
