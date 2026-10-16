# Phase 10 evidence — single-bond journey and release packet

## Spec revision and decisions

- Spec: `specs/phases/10-demo-journey-and-release.md`; contracts
  `specs/CONTRACTS.md` §7/§9, requirements R-03/R-04/R-18, defects B-01..B-11
  owned by earlier phases (entry audit found no open B-*; see below).
- D-01 instrument (user-approved direction, verified at authoring time from
  CRISIL July-31-2020 rationale + HDFC placement-memo/transfer docs):
  **HDFC Ltd, INE001A07RW5, 7.87% secured redeemable NCD, allotted
  2019-07-18, matured 2022-07-18, Rs 5000 crore, CRISIL AAA/Stable at the
  2020-07-31 snapshot.** Matured pre-merger, so the walkthrough is labeled
  historical; no live quote is asserted.
- Hosting deferred by user decision: P10-TEST12 hosted checks and G4 public
  exposure stay **pending — user-owned**. Local implementation verification
  below is complete; it is not a public-release claim.

## Entry audit (P10-T01)

- Backend: `185 passed, 17 skipped, 7 deselected` (integration) via
  `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests -q
  -p anyio.pytest_plugin`. Frontend: 40 passed (`npm test`).
  Command output recorded pre-change; no B-* red found.
- `specs/evidence/phase-09.md`, `phase-00.md`, `phase-02.md` absent, but the
  regression ledger (`backend/tests/regression/test_ledger.py`) shows all
  eleven B-* closed with no xfail markers, and both suites green — no hidden
  core bug found, so no bug-first detour was needed.

## Tasks / acceptance IDs and code/test paths

- Content pack (P10-T02, TEST05/06): `backend/app/infrastructure/demo/
  bond_scenario.py` + `backend/tests/unit/test_bond_scenario.py` (6).
- Script adapters (P10-T03, TEST01/02/09): `bond_scripts.py` +
  `test_bond_scripts.py` (5).
- Retrieval scoping (TEST05): `bond_retrieval.py` + `test_bond_retrieval.py` (4).
- Seed/progression (P10-T04, TEST03/04/14): `bond_progress.py` +
  `test_bond_progress.py` (9); migration `008_demo_bond_scenario.sql`.
- Routes/queues (P10-T05/06, TEST03/04/07/13): `bond_service.py`, rewritten
  `routes.py`, `backend/tests/api/test_bond_routes.py` (6); retired
  `test_demo_disabled.py` 503 pins to the fail-closed contract.
- Guided UI (T05, TEST08): `frontend/src/features/demo/{journeyClient,
  useBondJourney, BondJourney}.tsx` + tests, `frontend/src/app/demo/page.tsx`.
- Verification/release (T08/09/10, TEST10/11): this file; network audit
  clean (no httpx/requests/urllib/keys in `bond_*`).

## Bug-first record

- No new core defect discovered: credits J03 disagreement (severity 3) and
  J07 consensus (strength 4) replay through the owned turn engine (B-01 loop
  intact); queue J05 uses the real FIFO revision-guarded queue; votes use the
  strict-majority ending path. New-behavior tests were written failing first
  (missing-module reds) then implemented green.

## Verification

- Backend full suite post-change: **185 passed, 17 skipped, 7 deselected**
  (integration needs isolated infra; same skips as baseline).
- Frontend: **48 passed** (14 files), `tsc --noEmit` clean, `eslint` clean on
  touched paths, `npm run build` succeeds (`/demo` prerendered).
- Replay determinism: scripted provider + hash-gated tool results replay
  byte-identical; credentials remain the documented exception.
- Network audit: no live LLM/embedding/search/market/model-discovery calls in
  the demo path; mode/provider override headers ignored server-side.

## Migration rehearsal

- `008_demo_bond_scenario.sql`: widens the 007 CHECK to
  `synthetic-% OR indian-corporate-bond-review` and adds
  `demo_scenario_progress` (session+generation PK, meeting, step,
  completed/idempotency JSONB). Additive only; synthetic fixtures untouched.
  Apply via the Supabase SQL editor per repo practice. Rollback: drop the new
  table + restore the old CHECK (documented forward repair; no data loss — old
  rows are all synthetic and remain valid).

## Manual acceptance and limitations

- Automated coverage above is green. Honest gaps (not claimed):
  - Manual recruiter browser walkthrough (desktop + narrow, keyboard,
    reduced-motion) not yet recorded — needs a human pass.
  - Actual-host proxy/SSE verification (P10-TEST12) pending user hosting.
  - Market evidence is an explicit recorded unknown (no invented quote);
    users must verify independently.
- Public demo stays disabled for exposure until G4 hosted evidence exists.

## Exit decision

- Local Phase 10 implementation: **passed** (AC01–AC03, AC05 evidence
  complete; AC04 operational packet = this file + code).
- G4 public exposure: **blocked** on user-owned hosting + manual walkthrough.
  G5 handoff completes when those are recorded.
