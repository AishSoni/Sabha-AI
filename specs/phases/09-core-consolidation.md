# Phase 09 — Core consolidation and regression closure

Status: core gate/evidence must be re-audited for the 2026-10-16 correction; no pass is inferred from a regression ledger alone. Depends on: Phases 00-08 core/scaffold/runtime gates. Requirements: R-12, R-13, R-17, shared foundations for R-21/R-22 and closure of all B-01 through B-11 plus core requirements. R-04/R-19/R-20 and final journey/release portions of R-03/R-18/R-21/R-22 remain assigned to Phase 10.

## Objective and outcome

Establish a corrected, refactored, reproducible core baseline before implementing the demo journey. Close every reviewed defect with failing-regression -> fix -> green evidence, then remove remaining duplication after accounting for callers and compatibility. Passing this gate is mandatory for Phase 10 development.

## Current-to-target cleanup scope

Review old orchestrator methods, manager globals, route-contained business logic, duplicated ProviderConfig schemas, stale settings-store persistence, legacy stream translations and unused background-task paths. Do not delete unfamiliar files or third-party/user work simply because a new module exists.

Update root/backend/frontend setup documentation to reflect actual API base prefixes, complete migration order, test commands, demo/live composition and worker lifecycle. Existing README claims about inference/tool continuation and search must match implemented behavior.

## Required behavior

- Exactly one application implementation owns turn execution, ending, queue dispatch, persona activation and knowledge deletion.
- Retained compatibility wrappers have tests, callers and a documented retirement policy; otherwise remove them with an explicit contract change.
- Domain imports cannot reach HTTP/vendor/global-client layers. Composition is centralized and resource clients are closed through lifecycle management.
- Runtime/test dependencies are reproducible and the selected Qdrant/client contracts are recorded. Do not rely on developer `venv/` contents as the dependency specification.
- Fresh setup and legacy upgrade both work. No destructive cleanup migration is applied before compatibility and data preservation are verified.
- Coverage and manual limitations are reported honestly. Synthetic scaffold success does not constitute journey acceptance or prove live vendor availability/model quality.
- All B-01 through B-11 must be fixed and their intended-behavior regressions green before feature work begins. No expected-failure marker, unexplained skip or demo adapter may conceal a broken live/core path. If this audit discovers a missed bug, reproduce it first, fix it, then resume structural cleanup.

## Ordered tasks

- **P09-T01 — Call-site audit:** identify all remaining callers/imports of old paths, route wrappers, globals and DTO duplicates. Classify retained compatibility versus removable implementation.
- **P09-T02 — Remove superseded behavior:** delete duplicate algorithms and dead paths, keeping public compatibility only through thin adapters where still required. Update associated imports/tests.
- **P09-T03 — Boundary enforcement:** add focused architectural import checks or equivalent lint rules for the approved domain dependencies; avoid a brittle ban on harmless standard-library modules.
- **P09-T04 — Migration finalization:** verify ledger/install instructions, backfill reconciliation, rollback/forward repair and deferred contraction checklist. Archive no data without an explicit approved policy.
- **P09-T05 — Core documentation:** write local quickstart, scaffold/extension contracts, live-provider configuration, test/integration setup, worker operations, privacy/retention notes and known limitations. Identify the corrected real-application tutorial as pending Phase 10 acceptance; an existing standalone substitute is not completion.
- **P09-T06 — Defect/core traceability closure:** verify red/green evidence for every B-*, close core R-*/acceptance obligations and explicitly carry forward only Phase 10 feature/release requirements; eliminate stale expected failures and misleading success claims.
- **P09-T07 — Core verification:** run relevant test/static/build suites, fresh-install and supported-upgrade rehearsals, local real-transport tests and manual core-application checks after final cleanup. Use synthetic fixtures, not a recruiter walkthrough.
- **P09-T08 — Feature-entry baseline:** record architecture boundaries, operational recovery, all eleven closed defects and the ready-to-use interfaces for Phase 10. Final project handoff follows the complete feature and verification in Phase 10.

Re-audit actual shared turn and ending/summary SSE, normal API ownership/CRUD capabilities, durable session/queue/progress and independent tool continuation against the corrected contracts before reopening feature work. Missing Phase 00/02/09 evidence is an explicit audit action, not permission to fabricate past results or assume every core defect remains open. Preserve valid original evidence and obtain new verification where required.

## TDD and verification cases

- **P09-TEST01:** Architectural import test rejects a deliberate domain-to-provider/HTTP/global-database dependency; approved module structure passes.
- **P09-TEST02:** Compatibility routes, if retained, exercise the same use cases/effects as version-2 operations and do not bypass ownership or mode restrictions.
- **P09-TEST03:** Rehearse documented fresh setup from declared dependencies and migration ledger without existing developer state; run the synthetic scaffold/core smoke harness without authored scenario content.
- **P09-TEST04:** Upgrade each supported legacy fixture and compare preserved IDs, counts, prompt history, message content/order, ownership exceptions and cost baseline.
- **P09-TEST05:** Rehearse application rollback/forward repair on expanded schema with new turn/queue/job records; no silent data truncation or old-reader privacy regression.
- **P09-TEST06:** Run required pytest/Vitest/contract/integration/static/build checks; every B-01 through B-11 has recorded intended red failure and a passing regression, with no skipped/expected-failing defect left at feature entry.
- **P09-TEST07:** Follow documented reset, expiry cleanup, failed-job recovery and interrupted-turn recovery procedures; verify resulting observable states.
- **P09-TEST08:** Validate documentation links, commands, dependencies and manual core checks against the consolidated implementation. Explicitly identify Phase 10 journey/content/release work as pending rather than completed.

## Acceptance gate

- **P09-AC01:** No duplicate core workflow remains; boundary and compatibility checks pass (TEST01-02).
- **P09-AC02:** Reproducible setup and data-preserving migration/recovery evidence exist (TEST03-05, TEST07).
- **P09-AC03:** All eleven reviewed defects and required core behaviors have passing evidence; the red -> fix -> green record is complete and Phase 10 entry is unblocked (TEST06).
- **P09-AC04:** Core baseline documents implemented capabilities and the explicit Phase 10 remainder accurately (TEST08). This is not project completion or public-release approval.

## Rollout, rollback, exclusions and risks

Remove compatibility code only after consumer migration is verified. Do not combine cleanup with a wholesale framework upgrade. Any schema contraction needs a separate checked migration and data retention/recovery decision. If regression appears, restore the thin compatibility surface rather than reviving duplicated business algorithms. Demo journey implementation is excluded here and explicitly assigned to Phase 10; additional scenarios and live-model evaluations remain out of scope.
