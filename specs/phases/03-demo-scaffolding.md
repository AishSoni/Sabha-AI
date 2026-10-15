# Phase 03 — Demo scaffolding only

Status: draft. Depends on: Phases 00-02. Requirements: foundations for R-03/R-04/R-05/R-14, not completion of the journey. No reviewed defect is reassigned here to accelerate a demo.

## Objective and outcome

Create the smallest reusable composition and contract scaffolding needed to build the demo after the core fixes/refactor. This phase produces a developer-facing, offline smoke harness, not a recruiter walkthrough or an executable bond scenario. The complete J00-J09 experience is implemented together in Phase 10.

## Current implementation and affected paths

Reuse Phase 01 test utilities and the corrected Phase 02 provider/tool/application boundaries. Proposed scaffold locations are `backend/app/infrastructure/demo/`, its contract tests, and a small frontend demo API/session type boundary if required. Do not create a second turn engine or a parallel repository implementation merely for the demo.

Meeting-status/schema repair and ending extraction belong entirely to Phase 04. Existing frontend async-state defects belong to Phase 07. Generic session lifecycle and runtime protections are completed in Phase 08. None of these is pulled forward to make an early journey appear functional.

## Required behavior

- Define a server-selected fixture-only composition that can boot without provider credentials, Qdrant or embeddings; unexpected external capabilities fail closed.
- Provide typed scenario manifest/action/result, session/generation, source provenance and claim-classification contracts. They describe the later single-bond feature without supplying an approved real instrument, authored scripts or journey state machine.
- Reuse deterministic test doubles for one synthetic search -> tool result -> final response smoke exercise through the existing engine. Synthetic test content is visibly test-only and cannot be published as bond evidence or offered as another demo scenario.
- Define injection seams for fixture retrieval, votes, summaries and metadata; unconfigured capabilities report typed unavailable results rather than pretending to complete them.
- Keep public demo bootstrap/actions and any UI entry disabled. Missing scenario content is an intentional unavailable capability, not a successful placeholder walkthrough.
- Record the Phase 04/07/08/10 dependency checklist. No J-step completion, seeded specialist roster, real-bond evidence pack, guided UI, exploration fork or authored ending is implemented here.

## Ordered tasks

- **P03-T01 — Contract scaffold:** define minimal typed manifest/action/session/source interfaces consistent with CONTRACTS.md; identify fields owned by later phases and avoid speculative generic framework code.
- **P03-T02 — Composition seam:** wire fixture-only provider/retrieval resolution and fail-closed external capability policy, reusing existing ports and test utilities.
- **P03-T03 — Synthetic smoke harness:** run one developer/test-only tool-continuation case through the Phase 02 engine with captured inputs/effects and no journey progression.
- **P03-T04 — Disabled entry boundary:** add only necessary route/feature registration and frontend types; absent approved scenario returns unavailable and never seeds a partially working journey. Do not expose a recruiter start action.
- **P03-T05 — Lifecycle extension points:** specify session/generation/reset integration with the existing actor/runner contracts; use controlled test actors, leaving persistent runtime lifecycle to Phase 08.
- **P03-T06 — Scaffold evidence:** document how to run the smoke harness, the unavailable capabilities and the exact downstream ownership. Verify no early journey implementation or paid-service fallback exists.

## Data/API and compatibility

No bond content, specialist prompt seeds or production journey-progress rows are inserted. Keep additions additive and disabled; preserve existing personas and meetings. The proposed demo API remains a target contract, not a claim that its journey behavior exists. Persistent session infrastructure is implemented in Phase 08 and scenario-specific seed/progression in Phase 10.

## TDD cases

- **P03-TEST01:** Fixture composition boots with provider keys, Qdrant and embedding settings absent; attempts to construct/use live adapters fail before transport.
- **P03-TEST02:** Synthetic smoke invocation returns its tool result through the shared engine and produces one persisted test result; no second inference algorithm or journey transition is involved.
- **P03-TEST03:** Missing fixture/capability yields an explicit error; it never becomes fabricated successful retrieval, votes or summary.
- **P03-TEST04:** Public demo entry/actions remain disabled and a client mode/provider override cannot enable them or a live fallback.
- **P03-TEST05:** Contract validation rejects malformed identity/revision/source shapes; schema tests do not require a selected real ISIN or approved authored scenario.
- **P03-TEST06:** Test actors/results are isolated and teardown removes only test-owned state; scaffold startup does not overwrite user templates, meetings or configuration.

## Acceptance gate

- **P03-AC01:** Offline composition and one synthetic shared-engine smoke exercise pass (TEST01-03).
- **P03-AC02:** Disabled entry, contract validation and test isolation pass (TEST04-06).
- **P03-AC03:** Evidence lists Phase 04 lifecycle, Phase 07 frontend, Phase 08 runtime and Phase 10 journey dependencies; no recruiter walkthrough or real-bond content completion is claimed.

## Rollout, recovery, exclusions and risks

Scaffolding remains private and disabled for end users. Removing/disabling it cannot affect existing live data or the corrected core engine. Full scenario authoring, specialist seeds, J00-J09, guided queue teaching, exploration, disclosure presentation, final brief and public release are all Phase 10 work. The principal risk is expanding a scaffold into a partial feature before the known defects and refactor are complete.
