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

## Addendum — regression ledger (Phase 01 implementation record)

Implementation commits (local, never pushed): `032cc4c` (P01-T01/T02 seams),
`f5771f0` (P01-T03/T04/T06/T07 backend harness + ledger), `f366187` (P01-T05
frontend harness), `e8beb54` (frontend lockfile). Per project constraint this
ledger lives here, not in DELIVERY.md.

### Fast commands (all offline, no paid credentials)

- `backend/`: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest backend/tests
  -m "not integration" -q -p anyio.pytest_plugin` → **16 passed, 10 xfailed,
  4 deselected** (integration). Plugin autoload is disabled because the system
  site-packages ships a broken `langsmith` pytest plugin; the harness needs only
  the AnyIO plugin. Python 3.11.9, pytest 8.3.5, anyio 4.9.0, httpx 0.28.1.
- `frontend/`: `npm test` (`vitest run`) → **3 files, 7 tests passed**
  (incl. B-09 `it.fails` expected failure). `npx tsc --noEmit` clean. Node
  v26.8.2, vitest 3.2.7, jsdom 26.1.0, @testing-library/react 16.3.3.
- TDD mapping: TEST01/TEST03 → `backend/tests/unit/` + `meetingStore.isolation`;
  TEST02 → `test_network_guard.py` (own socket guard, loopback allowed);
  TEST04 → `tests/api/test_lifespan.py`; TEST05 → `test_strict_xfail_detects_stale_markers`
  + strict xfail/`it.fails` semantics; TEST06 → `tests/contract/test_fixture_provider.py`;
  TEST07 → `tests/integration/test_safety.py` (+ `safety.py` guards);
  TEST08 → `frontend/src/lib/stream.test.ts`.

### B-01..B-11 ledger (all open; no bug fixed in this phase)

| ID | Regression test (asserts correct behavior) | Status | Owner / expiry |
| --- | --- | --- | --- |
| B-01 | `test_b01_tool_result_returns_to_model` (backend ledger) | xfail strict, intended red: single provider call, no continuation | 02 / G3 of 02 |
| B-02 | `test_b02_persona_evidence_lookup_has_no_undefined_reference` | xfail strict, intended red: NameError on `get_supabase` | 02 boundary, 06 integration / G3 of 06 |
| B-03 | `test_b03_live_query_contract_pending_isolated_fixture` | xfail strict, pending: needs Phase 06 isolated fixture (client surface holds on qdrant-client 1.7.0) | 06 / G3 of 06 |
| B-04 | `test_b04_schema_check_covers_voting_and_ended` | xfail strict, intended red: CHECK admits only active/archived | 04 / G3 of 04 |
| B-05 | `test_b05_api_routes_require_actor_binding` | xfail strict, intended red: no actor-binding dependencies | 04 enforcement, 08 audit / G3 of 08 |
| B-06 | `test_b06_untrusted_destination_never_reaches_transport` | xfail strict, intended red: no Ollama destination allowlist | 05 restriction, 08 demo deny / G3 of 08 |
| B-07 | `test_b07_persona_provider_config_propagates` | xfail strict, intended red: persona provider_config dropped | 05 / G3 of 05 |
| B-08 | `test_b08_saved_settings_drive_inference_pending` | xfail strict, pending: wiring seam arrives Phase 05 | 05, 07 / G3 of 07 |
| B-09 | `frontend/src/stores/meetingStore.regression.test.ts` (`it.fails`) | expected failure, intended red: stale load overwrites selected meeting | 07 / G3 of 07 |
| B-10 | `test_b10_meeting_deletion_cleans_vectors` | xfail strict, intended red: deletion skips vector cleanup | 06 / G3 of 06 |
| B-11 | `test_b11_invalid_activation_preserves_active` | xfail strict, intended red: invalid activation wipes live version | 05 / G3 of 05 |

Strict expected-failure semantics (`xfail_strict = true`, Vitest `it.fails`)
turn any fixed bug with a leftover marker into a suite failure, so stale markers
cannot linger. No generic skips mask harness errors. All eleven rows must close
by Phase 09 exit (G3 of 09); Phase 10 cannot start feature work with any open.
