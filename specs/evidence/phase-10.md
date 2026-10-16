# Phase 10 evidence — single-bond journey and release packet

## Current acceptance status — reopened 2026-10-16

**The local Phase 10 pass reported below is superseded. Corrected AC01-AC05 are not accepted; G4 remains blocked.** The user requires a real-home/real-route tutorial, overlays and persistent watermark, a DB-backed seed from genuine demo-grade research, thin shared-utility execution and actual incremental SSE including the brief. The historical standalone implementation does not establish these outcomes. See the corrective record in `specs/DELIVERY.md` and revised `specs/phases/10-demo-journey-and-release.md`.

**Latest scope:** authentication/identity/access-control work is excluded everywhere; B-05 is withdrawn, not an open gate. Historical implementation/test descriptions below do not reinstate it. Real documents or excerpts, a short genuine-run note, meaningful analysis and a lightweight plausibility/readability pass suffice for research. Independent approval, exhaustive claim/calculation verification, full original-document archives and bulletproof financial claims are not required. Labeled approximations and illustrative branches are acceptable; no research-first coding blocker applies.

The following historical report is preserved for provenance, not endorsed as current verification. No application tests, browser walkthrough, financial source verification, database rehearsal or research run were performed as part of this specification correction. In particular:

- Missing Phase 00/02/09 gate records cannot be replaced by aggregate green counts or the absence of xfail markers. Re-audit actual core obligations without inventing historical red/green evidence.
- Claims of shared-engine disagreement/consensus, real active-turn queue dispatch and ordinary ending are not substantiated by the response-dictionary/in-memory path in `bond_service.py`. Verify actual persisted records and normal use cases.
- The service compares a result to a hash calculated from that same result; this does not satisfy independent expected-result assertions.
- `/demo` currently presents a separate complete-response UI. It does not establish home entry, normal-screen route coverage, overlays/watermark or shared incremental turn/ending transport.
- Historical content assertions below may be reused after the lightweight D-01 content check. They do not by themselves establish usable real documents/excerpts, a genuine research run with meaningful choices or a working published DB package; formal financial proof is not required.
- Manual local browser, real SQL/durability and incremental local transport evidence remain local acceptance obligations, not merely hosted-release work. Do not mark them passed before execution.

Add new revision-specific commands/results, a short content-check note and manual observations when actually performed. Keep actual-host checks separately pending until an environment is supplied; specification updates alone close no implementation gate.

## Historical implementation report (superseded acceptance)

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

## Historical exit decision (superseded by the current status above)

- Local Phase 10 implementation: **passed** (AC01–AC03, AC05 evidence
  complete; AC04 operational packet = this file + code).
- G4 public exposure: **blocked** on user-owned hosting + manual walkthrough.
  G5 handoff completes when those are recorded.

## Part B revision (2026-10-16, offline, no live services)

Scope: guide section B only (P10-T02 content + P10-T03 package storage).
Instrument retained per user: INE001A07RW5. Authoring auth=None; no live
LLM/embedding/search/market calls in authoring or tests.

What was added:
- `backend/data/demo_bond_package_v1.json`: versioned immutable package
  (scenario 1/revision 1, status published) with 5 sources carrying usable
  excerpts + titles/URLs/dates, 9 claims, 3 specialists, honest run_note
  (human offline research of S1-S7, decisions, gaps M1-M7), 5 recorded
  invocations (call-search-2/3/4, call-disagree-1, call-consensus-1),
  seed-fixed assertions, J00-J09 guide copy, disclosure.
- `backend/migrations/009_demo_bond_package.sql`: additive
  demo_bond_packages table (scenario/content/revision PK, status, package
  JSONB). Rerunnable; no existing rows touched.
- `backend/app/infrastructure/demo/bond_package.py`: offline loader,
  validator (second-scenario/ISIN-drift/missing-source/empty-excerpt/
  worksheet-visibility/dishonest-note/disclosure/visitor-effects checks),
  idempotent import + pinned load. Missing assets raise
  PackageMissingError; optional audit metadata never blocks.
- `BondSource` extended with optional url/excerpt only (compatible).
- `backend/tests/unit/test_demo_bond_package.py` (6 tests): genuine
  demo-grade content, honest failure, no visitor effects, idempotent
  import + pinned load, fail-closed without import, migration contract.

Verification:
- Focused: 21 passed (bond package/scenario/scripts/retrieval).
- Full: 235 passed, 17 skipped, 7 deselected via
  `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests -q
  -p anyio.pytest_plugin` (cwd backend/).
- Plausibility pass: S1 confirms I-1..I-8; secured wording series-level
  via S2/S3 snippets + S6; S1 alone silent on security; pre-merger
  no-transfer is chronology inference (unverified); maturity payment and
  WDM quotes stay explicit unknowns; approximations labeled.

Not claimed: D-01 approval (still pending-d01), live provider run,
placement-memo/listing-record full text (scanned PDFs), trustee
confirmation, executable quotes, browser/hosted checks. Stages C-F
(vertical slice, tutorial, ending SSE, retire-and-verify) remain open.

## Part B addendum (2026-10-16): original reference PDFs saved

Per user request, the original cited byte artifacts are now saved in-repo
instead of living only outside it:
- `backend/data/demo_sources/TS-V-007.pdf` (364526 bytes,
  sha256 84626479b4b37f25c7b2b2d2ade69ca3e51efcc0da88af93c8970433cfd16a26)
- `backend/data/demo_sources/SE-V007-intimation-150719.pdf` (338207 bytes,
  sha256 56c940b6dce4d11fd562ac8c5bf25e5ae4ee5c60240020f9875d3f4a88525835)
- `backend/data/demo_sources/MANIFEST.json` (provenance + honest gap notes)
  and `README.md` (artifact rules).
- `backend/tests/unit/test_demo_source_artifacts.py` (3 tests): files
  exist with recorded sizes/hashes, hashes match the pre-work inventory,
  manifest honestly states what was never saved as bytes.

No re-authored excerpt files were kept: only the two original PDFs plus
manifest/readme. S1/S4/S6 HTML was captured in-session during pre-work but
never saved as bytes, so no originals exist to store; usable excerpts
remain embedded in `demo_bond_package_v1.json`. No live fetch was used.

Verification: full suite `238 passed, 17 skipped, 7 deselected` via the
documented pytest command (cwd backend/).

## Correction: artifacts live in untracked-bond-research/

Per user direction, the original PDFs + MANIFEST.json + README.md were
moved from `backend/data/demo_sources/` to `untracked-bond-research/`
(stays untracked, never staged). `test_demo_source_artifacts.py` now
resolves `../untracked-bond-research` (cwd backend/). Tracked seed
`demo_bond_package_v1.json` still embeds the usable excerpts; the
untracked folder holds the byte originals + pre-work notes together.
