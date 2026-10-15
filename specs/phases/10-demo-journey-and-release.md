# Phase 10 — Complete demo journey, release verification and handoff

Status: draft. **Final development phase.** Depends on: all Phase 00-09 gates, especially Phase 09's complete B-01 through B-11 closure and refactored core baseline. D-01's exact instrument/content must be approved before scenario implementation. Requirements: complete R-03/R-04/R-18 and final integration/release evidence for all R-*.

## Objective and outcome

Implement the entire single-bond recruiter experience on the corrected application: J00-J09, specialist agents, evidence, disagreement/consensus, queue teaching, final executive brief, guided-then-explore behavior, resume/reset and public-demo presentation. All generic turn, lifecycle, configuration, knowledge, queue, frontend and session infrastructure already exists. This phase consumes those capabilities rather than creating a parallel workflow.

Phase 03 supplied scaffolding only. Phases 04-08 delivered core/runtime behavior, and Phase 09 verified regression closure and architecture. This is the first usable recruiter walkthrough milestone. Source review and full feature acceptance are performed here; hosting selection/provisioning remain user-owned.

## Entry and bug-first discipline

1. Verify Phase 09 evidence: every known B-* has an intended-behavior failing regression on the pre-fix path, a correction and a passing retained regression. No known defect is deferred into this feature phase or hidden by fixture adapters.
2. Confirm the scenario design from DEMO-JOURNEY.md and approve D-01's exact issuer/ISIN, dated evidence pack, specialist prompt wording, claim/source mappings and final copy before implementing the scenario.
3. If integration reveals a new or missed core defect, first write/reproduce its correct failing regression, fix it in the owning core boundary, refactor with tests green and reverify that boundary. Resume feature work only after closure; never patch around it with a canned success.
4. Implement each new journey behavior with its own red -> green -> refactor cycle using pytest/Vitest. A prior green core regression need not be made artificially red again; retain its original evidence and rerun it when impacted.

## Required behavior

- Implement all steps and states in DEMO-JOURNEY.md together. J05 uses the already implemented editable FIFO queue; there is no early idle-message substitute or simulated queue success.
- Author exactly one real Indian corporate bond scenario. Every reset/replay/fork preserves the approved instrument and pinned source snapshot; there is no alternate scenario selector.
- Seed scenario-specific Credit & Business, Bond Structure & Downside, and Treasury & Market specialist snapshots without overwriting user templates/history. Distinctness is functional, with role-specific evidence and contributions.
- Execute ordinary model/tool/meeting use cases through fixture adapters. Scripted provider invocations verify tool results before continuation; the application commits actual messages, disagreement/consensus, citations, votes, summary, usage and progress.
- Supply real scenario seeding and authoritative action/progression to Phase 08 session infrastructure. Persist idempotent seed/progress records, support resume/reset and reject stale/unsupported actions without a live fallback.
- Keep phase progression transactional or retry-safe with the underlying committed application outcome. Failed turns do not silently advance; repeated deliveries/actions do not duplicate effects.
- Complete guided UI, source/fact/judgment explanations, visible scripted/not-financial-advice context, exact instrument/snapshot identity, role orientation, queue instructions and final brief. Decisions and independent verification remain the user's responsibility.
- Implement supported exploration only after completion, keeping the ended walkthrough read-only and allowing at most the approved bounded fork of the same instrument. Unsupported text gets honest guidance.
- Demonstrate refresh, navigation during a turn, reconnect, expiry, storage failure and reset through the completed UI. Reuse Phase 07 state/stream/queue components and Phase 08 session controls.
- Perform full content, runtime/network, accessibility, integration and eventual hosted release checks. Local feature completion alone does not authorize public exposure.

## Ordered tasks

- **P10-T01 — Entry audit:** check Phase 09 bug red/green records, core/refactor acceptance and runtime interfaces; stop feature implementation if a required baseline is unresolved.
- **P10-T02 — Finalize authored content:** research/verify the exact ISIN and source snapshot, approve D-01, and create the source/claim review record, specialist prompts, action scripts, disclosure copy and executive brief. No runtime research calls are introduced.
- **P10-T03 — Evidence and script adapters:** implement the approved versioned manifest, fixture retrieval/metadata, normalized invocations, votes and summary with expected tool-result assertions. Add source/claim/calculation validation before populating the success path.
- **P10-T04 — Scenario seed/progression:** bind real seed/action handlers into existing sessions; atomically create meeting/specialist/evidence references and persist progress/retries with ownership, generation and idempotency checks.
- **P10-T05 — Full guided UI:** implement J00-J09 orientation, suggested actions, tool/citation explanations, J04/J05 pacing and queue teaching, consensus/ending presentation and executive brief using the existing core APIs/components.
- **P10-T06 — Exploration/resume/reset:** add bounded same-bond fork actions, unsupported-input feedback, server-authoritative restoration and UI generation cleanup. Reuse the existing lifecycle rather than reopening the ended walkthrough implicitly.
- **P10-T07 — Feature TDD and content review:** execute deterministic full replay, fault branches, Vitest interactions and reviewed source/role/disclosure acceptance. Retain committed-effect assertions rather than checking only a progress counter.
- **P10-T08 — Integrated release audit:** rerun impacted core regressions and the full applicable suites; audit all newly registered actions/routes for ownership, quota/mode policy and no external transport. Exercise local real streaming/recovery and manual desktop/narrow/keyboard/reduced-motion journeys.
- **P10-T09 — Release and operational packet:** document the complete walkthrough, source snapshot/publication-time framing, network evidence, setup/migration/recovery commands and chosen-platform checks. Perform hosted checks only when the user supplies the environment; report pending checks explicitly.
- **P10-T10 — Final handoff:** close all requirement/phase traceability, document how to version the sole scenario and maintain source provenance, record architecture and operational limitations, and distinguish verified implementation from any pending public deployment gate.

## Data/API and compatibility

Add scenario progress, authored manifest/source references and any seed-specific linkage through compatible migrations. Reuse existing meeting/turn/session/queue records, ports and security boundaries. Assets are immutable/versioned; sessions pin their content revision. A content update either supports pinned sessions or issues an explicit restart requirement, never silently changes a running script. Reset cleans only session-owned data and preserves shared assets.

Concrete demo bootstrap/actions now implement the CONTRACTS.md target that earlier scaffolding kept unavailable. Client-provided scenario/instrument/provider values cannot select another scenario or enable live services. The final brief/status is an analysis result, not investment approval. No destructive reset of existing user data is permitted.

## TDD and verification cases

- **P10-TEST01:** Full J00-J09 succeeds with AI keys/Qdrant/embeddings absent and outbound service access denied; expected persisted messages, citations, disagreement, consensus, ending votes and executive brief exist through shared use cases.
- **P10-TEST02:** Corrupt/omit a fixture result; scripted continuation cannot return an evidence-based success anyway, and progression remains retryable with committed effects preserved.
- **P10-TEST03:** Unsupported action, wrong specialist, stale stage/revision, second scenario/ISIN and provider override fail without progress or external calls. Edited unsupported queued text never silently selects an answer as if understood.
- **P10-TEST04:** Retried seed/action/reset keys produce one result; changed payload under the same key conflicts. Fail between application commit and progression recording; reconciliation advances once without repeating tool effects.
- **P10-TEST05:** Private downside worksheet is retrieved only by the assigned specialist; authorized director inspection does not grant another participant access. Shared citations remain verifiable and worksheet assumptions remain labeled analysis.
- **P10-TEST06:** Missing/incorrect instrument identity, source locators, snapshot, claim mappings or worksheet labels fail validation. Derived calculations reproduce reviewed inputs/units/rounding; missing market inputs remain explicit unknowns. Separately record human source verification and three genuinely different analytical contributions.
- **P10-TEST07:** Guided J04/J05 uses real enqueue/edit/remove/dispatch; final edited content appears once after the active turn. If dispatch beats editing, show delivered state and the supported repeat/skip path. No automatic speaker or false queued state appears.
- **P10-TEST08:** Navigate during a turn, disconnect/reconnect, reload stale sessionStorage, reset during streaming, expire the session and deny storage access; completed UI reconciles authoritative state without old-generation/meeting overwrites.
- **P10-TEST09:** Ended walkthrough stays read-only; supported exploration creates only the allowed same-bond fork, respects its bounds, ends through ordinary use cases and never implicitly reopens or changes instruments.
- **P10-TEST10:** Guided/resumed/ended/fork views preserve exact bond/snapshot identity, fact/judgment labels, readable source dates/locators and disclosures. Brief/consensus/votes convey analysis and user verification ownership, not investment approval. Keyboard, reduced-motion and narrow-layout acceptance passes; original-source navigation sends no session credential.
- **P10-TEST11:** Audit the complete guided/explore/reset runtime and new routes for zero live AI/search/embedding/market/model-discovery attempts, cross-session access, mode overrides, quotas, expiry/reset races, cleanup and slow-subscriber bounds. Reuse Phase 08 suites against the final seeded feature, not just synthetic fixtures.
- **P10-TEST12:** On the eventual hosting target, verify actual streaming/proxy buffering, disconnect/reconnect, process restart/worker recovery, expiry scheduling and the manual recruiter walkthrough. Mark pending until that environment exists; required before public exposure.
- **P10-TEST13:** After feature integration, impacted B-* regressions plus applicable pytest/Vitest/contract/integration/static/build, fresh-install/legacy-upgrade and local transport checks pass. Setup/operations/docs and all requirement links match the delivered application.
- **P10-TEST14:** Fail scenario seeding and final ending persistence at transaction boundaries; no partially usable seed, duplicated roster, successful summary on active state or cross-generation progress appears. Retry preserves prior user data and produces one valid outcome.

## Acceptance gates

- **P10-AC01:** All guided steps run through corrected shared workflows with real persisted outcomes and honest failures (TEST01-04, TEST07, TEST14).
- **P10-AC02:** Exactly one verified real-bond evidence pack, functional specialist differences, source/claim integrity and required positioning pass automated checks plus recorded content review (TEST05-06, TEST10).
- **P10-AC03:** Complete navigation/resume/reset/exploration and accessible UI pass Vitest, local transport and manual walkthrough evidence (TEST07-10).
- **P10-AC04:** Final runtime isolation, bounded resources and zero-live-service behavior pass; public entry remains disabled until G4 also has actual-host evidence (TEST11-12).
- **P10-AC05:** Core regressions remain green, all R-*/B-* and phase obligations are accounted for, and setup/migration/recovery/content-maintenance handoff is complete (TEST13). Report local implementation verification and pending hosted release checks separately; do not claim an untested public release.

## Rollout, recovery, exclusions and risks

First enable the full feature privately. Activate public entry only after G4; the application cannot bypass approval by exposing a new action route. Rollback disables new bootstrap/actions and fences/drains work while preserving safe scoped reads, shared fixtures and unrelated user data. Rehearse rollback against additive progress metadata. Hosting procurement, more scenarios, live recruiter inference/BYOK and unrelated visual redesign remain excluded. The main risk is hiding unfinished core work behind a polished script; Phase 09 entry evidence and TEST02/TEST13 prevent that shortcut.
