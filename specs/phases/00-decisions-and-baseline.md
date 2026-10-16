# Phase 00 — Decisions, contracts, and migration baseline

Status: contract re-review required for the 2026-10-16 correction; not an assertion of a new passed gate. Dependencies: none. Gate: G0/G1. Requirements: R-02, R-12, R-17, R-18..R-22 and all cross-phase contracts. Product direction is confirmed; unresolved defaults require their own approval.

## Objective and outcome

Turn the agreed direction into an approved, internally consistent implementation baseline. Resolve decisions that would otherwise cause repeated rewrites. The output is specifications and acceptance designs, not application changes or a claim that tests pass.

## Original discovery baseline and current re-review

- `backend/app/api/meetings.py` mixes HTTP concerns and end-meeting business logic.
- `backend/app/services/orchestrator.py` duplicates streaming/nonstreaming behavior and directly selects global providers.
- `backend/app/models/schemas.py` has voting/ended states absent from the base database constraint.
- `backend/supabase_schema.sql` and migrations `002_personas.sql` / `003_knowledge_stacks.sql` form an undocumented multi-step install sequence.
- Personas, meetings and stacks have differing nullable ownership shapes; browser settings and server settings do not share authority.
- These are original discovery observations, not current implementation acceptance. Tests/implementation now exist; audit them against the corrected contracts. Live data/schema versions are not assumed inspected or approved by specification editing.

## Required decisions and design artifacts

Approve or replace D-02 through D-08 and D-11 through D-13 before core implementation. For D-01 approve the single-bond content/source/role contract now; exact instrument, source capture and final copy may remain explicitly open until Phase 10 content entry. D-09/D-10 may remain blockers for their later phases, with safe provisional interfaces. Final hosting vendor choice is not required.

Architecture acceptance requires:

1. Domain vocabulary distinguishing reusable persona, participant snapshot, turn, invocation, tool execution, message, queue entry, ending attempt, demo session and generation.
2. State-transition and consistency rules in CONTRACTS.md, including negative cases.
3. DTO schemas for proposed operations/events: required/nullable fields, validation bounds, idempotency scope, error codes, actor binding, and compatibility wrappers.
4. A storage design for atomic operations. Select direct SQL transactions or defined SQL RPC boundaries; do not label sequential REST writes as transactional.
5. A migration plan that does not rewrite an already-applied historical migration or reset user data.
6. Runtime boundaries: turn and ending/summary stream subscribers are separate from execution; a minimum durable runner/replay design is understood before implementing a disconnect-dependent happy path.
7. Real-home entry and UI00-UI08 route/control coverage, short what/why plus expandable technical overlays, persistent watermark and safe pause/back/skip/exit/resume semantics. No standalone UI or scripted replacement controls.
8. A DB-backed immutable package with genuine research-run/document/review provenance and recorded provider invocations; session-owned starting state distinct from later form-created records/effects. Approve nullable pre-meeting DTOs and bounded template-based CRUD policy before integration.

## Ordered tasks

- **P00-T01 — Confirm requirements:** review MASTER.md confirmed decisions and non-goals against the conversation. Resolve any mismatch before technical design.
- **P00-T02 — Approve domain rules:** decide queue dispatch/failure semantics, ending policy, archive restoration, cancellation, snapshot refresh scope, and session lifetime.
- **P00-T03 — Approve demo design contract:** define real-home/real-screen tutorial and watermark, UI00-UI08 coverage, genuine research-run/source/decision provenance, DB package and thin shared-utility coordination, bounded form operations, distinct specialist remits, disclosures and same-bond exploration. Exact ISIN, reviewed run, documents, prompts and recorded/guide content are D-01 deliverables for Phase 10 content entry, not blockers for bug fixes or scaffolding. Do not implement scripts/J-steps here.
- **P00-T04 — Inventory data safely:** design read-only inventory queries and obtain schema-only/sanitized evidence from the owner; identify supported upgrade baselines, orphan rows, prompt duplicates and legacy archive ambiguity. Do not access live infrastructure without the separate authorization/setup needed for that inventory.
- **P00-T05 — Fix technical contracts:** enumerate DTOs/OpenAPI examples, stable errors, stream payloads, settings precedence, actor scopes, job/lease semantics, and database atomic operations.
- **P00-T06 — Create acceptance designs:** map every R-*/B-* to phase/test groups; identify tests requiring real SQL/Qdrant or real transport rather than doubles.
- **P00-T07 — Review sequencing:** require intended-behavior failing tests before each known-bug fix, then green-tested refactoring. Assign scaffold only to Phase 03, all status/ending repair to Phase 04, core regression closure to Phase 09, and the entire journey to final development Phase 10. No partial walkthrough pulls feature work forward.
- **P00-T08 — Baseline approval:** record accepted defaults, remaining phase-specific blockers, document revision, and approval in decision/evidence records.

## Review/validation cases

- **P00-TEST01:** Trace a successful tool-using turn from route through provider, tools, database and stream; every effect has an owner and idempotency identity.
- **P00-TEST02:** Trace navigation, worker crash, duplicate request, stale queue edit, reset and session expiry; no path assumes the browser owns server execution.
- **P00-TEST03:** Trace a legacy ownerless meeting and archived record through migration; no silent reassignment or reopening occurs.
- **P00-TEST04:** Trace demo startup, retrieval, votes, summary, settings and failure fallback; none requires a paid or live external service.
- **P00-TEST05:** Resolve every local document link and ID reference; verify each phase has tasks, tests, gates, rollout/recovery and exclusions.
- **P00-TEST06:** Review the designed instrument/source/claim schema and distinct analytical roles, explicit unknown handling, dated/historical framing, same-bond exploration and user-owned conclusion. Confirm Phase 10 must supply verified concrete content; no placeholder is treated as approved evidence and Phase 03 requires no authored bond scenario.
- **P00-TEST07:** Trace actual-home startup before a meeting exists, normal stack/persona/meeting forms, every required route/tab, overlay/watermark lifecycle, shared turn and ending SSE, and genuine research-run-to-DB publication. Every operation has an authorization/ownership boundary; no precreated completed effects, duplicate creation, standalone page or second engine is permitted.

These are specification reviews; executable behavior tests are implemented from Phase 01 onward.

## Acceptance gate

- **P00-AC01:** All decisions due in Phase 00 are explicitly accepted/replaced; no implementation-critical "TBD" remains disguised as a default (TEST01-04).
- **P00-AC02:** Migration baselines, preserved data categories and unresolved historical mappings are documented with an owner action (TEST03).
- **P00-AC03:** One authoritative interface/state contract and dependency direction is agreed; phase descriptions do not contradict the real-application/DB-seed/shared-SSE correction (TEST01-02, TEST05, TEST07).
- **P00-AC04:** All reviewed bugs have red/green regression ownership and a fixing phase; Phase 09 blocks feature entry until all are closed, and public exposure remains blocked until Phase 10/G4 (TEST04-05).
- **P00-AC05:** D-01's source/role/disclosure contract and Phase 10 content approval deadline are explicit. Unselected issuer/ISIN or unverified figures cannot be accepted as executable content (TEST06).

## Rollout, recovery, and exclusions

No database/API deployment occurs. Revision-control the baseline; later changes follow DELIVERY.md rather than overwriting approval history. Hosting procurement, live-data mutation, implementation and test execution are outside this phase. Main risk: treating documentation volume as approval; the exit record must distinguish draft, approved and blocked decisions.
