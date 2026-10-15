# Delivery methodology: specification-driven gates and TDD

## 1. Two complementary control loops

**Waterfall/specification-driven planning:** requirements -> domain/architecture -> interfaces/data design -> phase implementation specifications -> acceptance-test design -> baseline approval -> implementation -> verification -> release/handoff.

The specification package is reviewed as a whole before production implementation. Each phase then has an entry gate, an implementation interval, and a verification/exit gate. Drafting files is not approval. User-confirmed requirements in MASTER.md are already decisions; proposed defaults still need resolution.

**Test-driven implementation:** within an approved phase, select one behavior -> write a meaningful failing test -> confirm the failure is for the intended reason -> implement the smallest coherent behavior -> pass -> refactor with tests green -> run impacted regression checks.

Waterfall does not mean deferring testing until the end. TDD does not permit discovering public contracts by silently changing requirements in code.

**Mandatory delivery order:** for every affected phase, first reproduce its known defects with tests asserting the desired correct result, observe the specific failure, fix the behavior, and only then perform broader refactoring with those regressions green. Structural changes necessary to make a correctness fix are part of its red-green cycle; unrelated relocation must not obscure the original failure. Phase 03 is scaffolding only. Phases 00-09 establish the corrected/refactored core and reusable infrastructure; Phase 10 is the final development phase and implements the entire demo journey.

## 2. Gate definitions

| Gate | Required evidence | Blocks |
| --- | --- | --- |
| G0 Requirements baseline | Confirmed scope, decision log, non-goals, acceptance scenarios | Architectural commitment to unresolved behavior |
| G1 Design baseline | Approved contracts, schema evolution, ownership model, error/recovery semantics, phase dependency map | Production implementation |
| G2 Phase entry | Prior required gates passed, affected D-* resolved, tests designed, migration/rollback reviewed | Work in that phase |
| G3 Phase verification | Required tests/checks and acceptance cases pass; owned regressions no longer expected failures | Declaring phase complete |
| G4 Public-demo release | Phase 10 integrated feature/content/runtime acceptance, actual-host capability evidence, manual recruiter walkthrough, no live-service routes | Public exposure |
| G5 Handoff | Phase 09 core baseline plus Phase 10 final documentation, traceability and operational recovery evidence; pending hosting explicitly identified | Project completion claim |

The developer supplies evidence. The project owner approves product/default changes and major baseline changes. No extra approval is required for routine code changes already covered by an approved phase.

Phase 10's G2 additionally requires Phase 09's closure of **all eleven B-* defects** and core refactor obligations, plus D-01 content approval before scenario code is implemented. Phase 08 verifies runtime foundations, not public readiness. Local Phase 10 implementation evidence may be complete while G4 remains blocked on the user's hosting environment; those statuses must be reported separately.

## 3. Task workflow

For each `Pxx-Tnn`:

1. Link relevant R-*, B-*, contract section, and acceptance/test IDs in the work item.
2. Identify current behavior and intended observable result. Do not preserve a bug as a success assertion.
3. Add the smallest useful failing test: pure domain for rules, application fake for workflow, integration for transactional/concurrent guarantees, Vitest for UI behavior.
4. Run and record the initial failure against the pre-fix behavior: test ID, command, failing assertion and why it demonstrates the defect. A missing dependency, malformed fixture or broken harness is not proof. If a prior phase already fixed it, reference that original red/green evidence rather than deliberately reintroducing the bug.
5. Correct the bug through the owning boundary before wider restructuring; avoid separate demo workarounds. New infrastructure/feature behavior follows its own designed failing test.
6. Verify the same intended assertion passes; remove the bug's expected-failure marker if present and record the green command/result.
7. Refactor naming/placement without changing the contract, then rerun focused tests.
8. Run the phase's impacted suites and required checks. Update traceability and migration evidence.

Do not write tests that merely mirror private methods. Assert final state, observable events, authorization, side-effect counts, consistency, and failure behavior.

## 4. Known failures and CI

Phase 01 may record reviewed defects using narrowly scoped strict expected-failure cases linked to B-* and their fixing phase. Unexpected passes fail the check so stale markers are removed. Frontend expected-failure support must have equivalent detection, or use an explicit separate regression manifest/job rather than silently skipping tests.

- Harness failures and unexplained flakes are never expected failures.
- Every expected failure has an owner phase and an expiry gate.
- A phase cannot pass with its own acceptance cases still expected-failing.
- Phase 09 cannot pass, and Phase 10 feature implementation cannot start, while any B-01 through B-11 remains unfixed, skipped or expected-failing. A scripted adapter is not evidence that the underlying defect is fixed.
- The release gate allows no unresolved expected failures for the public-demo path.
- Test collection must not import production credentials or connect to production infrastructure.

## 5. Specification change control

A baseline change record includes: reason, affected requirement/decision IDs, alternative considered, domain/API/schema impact, fixture/test changes, migration/backward compatibility, phases requiring re-verification, and approval status.

Implementation discoveries can change the plan. Update the master contract first, then affected phases/tests. Do not implement a contradiction and leave the docs describing the original design. If a prerequisite is pulled forward, identify its owning acceptance gate and which parts remain deferred.

### Prior draft change record — single real-bond analysis scenario

The scenario decision remains current; phase assignments in this historical record are superseded by the sequencing record below.

- **Reason/status:** user confirmed exactly one real Indian corporate bond as the guided scenario, subjective sourced analysis with independent verification/not-financial-advice positioning, and agents with genuinely different analytical responsibilities. This replaces the earlier proposed fictional launch/pilot story. Exact ISIN, evidence snapshot, specialist prompt wording and final copy remain open under D-01; this record does not approve those details or the implementation baseline.
- **Affected scope:** R-04/R-18 and D-01; MASTER.md, CONTRACTS.md, DEMO-JOURNEY.md, TESTING.md and Phases 00/03/07/08. The alternative fictional business case is superseded; multiple scenarios/instruments are outside this demo.
- **Domain/API impact:** persona remains the configuration concept, with functional specialist remits. Demo manifest/session views pin instrument and source provenance/claim classifications; no change to generic meeting/turn semantics. Ending votes and consensus represent analysis completion/process agreement, not an investment verdict.
- **Fixtures/tests:** replace the old scenario/action/source IDs with the bond journey, validate source/claim integrity and single-instrument continuity, and add specialist/disclosure/verification acceptance cases. Re-review Phases 00/03/07/08 before claiming acceptance.
- **Compatibility:** no application or persisted demo implementation existed when this draft changed; no live-data migration is required for this content revision. Existing user persona definitions and meeting history remain protected by R-12. Runtime content versioning/pinned-session behavior still applies once implemented.

### Draft change record — fixes/refactor first, journey last

- **Reason/status:** user explicitly requested scaffolding only in Phase 03, correct failing tests before known-bug fixes, subsequent refactoring and complete journey implementation in a new last development phase. This sequencing is confirmed; proposed numeric defaults and final bond content are still subject to their own decisions.
- **Affected scope:** all phase dependencies and release/traceability references; R-03/R-04/R-18 implementation ownership; D-01 exact-content deadline. The earlier Phase 03 slice, Phase 07 onboarding and Phase 08 release/content acceptance are superseded.
- **New assignment:** Phase 03 composition/contracts/synthetic harness only; Phase 04 owns all B-04 status/ending repair; Phase 07 fixes/refactors the reusable frontend; Phase 08 supplies generic session/runtime foundations; Phase 09 closes every reviewed bug and the core refactor; Phase 10 implements the entire journey and completes integrated release/handoff verification.
- **Tests/evidence:** B-* records require actual pre-fix intended failures and retained passing regressions. Earlier journey acceptance is reassigned to P10-*; core/runtime tests use synthetic fixtures. Re-review all phase entry/exit references; no early fake walkthrough or queue substitute remains.
- **Compatibility:** specification-only resequencing; no application/schema implementation has been performed. Files 03/08/09 are renamed to reflect their revised scope; task IDs retain their phase namespace but this draft revision changes their scope. No old success evidence is reused as proof of the new gates.
- **Release:** G4 follows Phase 10 and actual-host validation. Hosting procurement remains separate. No new phase after Phase 10 is required for planned feature development.

## 6. Phase evidence record

Store implementation evidence under a future `specs/evidence/phase-XX.md` when the phase is executed. It MUST contain:

- Spec revision and resolved decisions.
- Task/acceptance IDs completed and code/test paths.
- For each owned bug: pre-fix failing assertion/command/output, corrective change reference, passing regression command/output and post-refactor regression result. Reference earlier owning-phase evidence for inherited fixes.
- Exact commands, environment/version details, exit results, and relevant artifacts.
- Test scopes run and reasons for any excluded scope.
- Migration rehearsal, pre/post checks, and rollback/forward-repair exercise where applicable.
- Manual acceptance observations and remaining limitations.
- Exit decision: pending, passed, or blocked; no fabricated green status.

No evidence files are pre-populated with success claims in this draft.

## 7. Release and rollback rules

Every phase remains locally runnable. Feature flags/composition choices may stage incomplete new paths, but must not expose unprotected routes. Keep old API wrappers only as long as compatibility tests require them. Public demo remains disabled until G4.

Application rollback must be tested against expanded schemas. Rollback must not remove new messages or reverse already executed tools. Incompatible contraction is deferred until old readers are retired and recovery is documented. Existing data is never treated as disposable test data.
