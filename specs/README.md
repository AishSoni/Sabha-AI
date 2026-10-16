# Sabha refactor and deterministic demo specifications

Status: **Corrective specification revision, 2026-10-16.** The user-confirmed product direction below supersedes the standalone demo. Implementation exists but is not accepted as satisfying this revision; technical defaults still require their recorded approvals.
Baseline: original repository review on 2026-10-14; demo/spec discrepancy review on 2026-10-16. File references describe reviewed baselines, not permanent line numbers.

## Purpose

Deliver a reliable AI advisory-board application through an incremental, domain-oriented modular-monolith refactor. Ship a deterministic recruiter onboarding experience through the same application workflows without paid AI dependencies. Preserve existing data. Use pytest for backend tests and Vitest for frontend tests, with no Playwright dependency or browser provider.

The demo starts from a **Try the demo** button on the actual home page and teaches the normal application across its real routes using concise, videogame-style overlays and a persistent DEMO watermark. Remove the standalone demo UI completely. The backend provides thin session/seed coordination around shared application utilities; the database supplies a versioned package derived from a genuine research run with real documents for one Indian corporate bond. Research is demo-grade: reasonable sources and meaningful analysis, not exhaustive verification or formal sign-off. All AI output, including the brief, arrives incrementally through actual SSE. Recorded analysis is disclosed, never represented as fresh inference.

Complementary credit, structure/downside and treasury/market specialists demonstrate analysis, not financial advice. Real documents/excerpts, a short genuine-run note, labeled assumptions and a lightweight plausibility pass suffice; incomplete evidence and approximate claims are acceptable with clear demo framing. D-01 is not a research-first implementation blocker. See [the journey specification](DEMO-JOURNEY.md) and [the latest scope correction](DELIVERY.md#scope-correction--no-authentication-and-demo-grade-research).

**Authentication and identity/access-control work are completely outside scope**, including actor/credential frameworks, login/signup, ownership-policy rollout and RLS hardening. Anonymous run references exist only for progress/resume/reset and state separation, not as security credentials. B-05 is withdrawn; no phase or release gate can require it. Historical evidence describing earlier work is not a mandate to continue it.

## Read in this order

1. [Master specification](MASTER.md): scope, architecture, requirements, decisions, dependencies, and migration policy.
2. [Delivery methodology](DELIVERY.md): waterfall specification gates and test-driven implementation.
3. [Domain and interface contracts](CONTRACTS.md): states, queue semantics, APIs, event protocol, anonymous run bookkeeping, and consistency.
4. [Deterministic demo journey](DEMO-JOURNEY.md): scenario, onboarding, fixture design, and exploration rules.
5. [Testing and traceability](TESTING.md): test architecture, defect mapping, and verification obligations.
6. Phase specifications below, in sequence.

## Implementation sequence

| Phase | Specification | Working increment / exit outcome |
| --- | --- | --- |
| 00 | [Decisions and baseline](phases/00-decisions-and-baseline.md) | Approved contracts, acceptance cases, migration inventory, and implementation baseline |
| 01 | [Test foundations](phases/01-test-foundations.md) | Offline pytest/Vitest suites, explicit known-failure ledger, reusable doubles |
| 02 | [Shared turn engine](phases/02-shared-turn-engine.md) | One bounded, tool-capable execution engine with stable turn identity |
| 03 | [Demo scaffolding only](phases/03-demo-scaffolding.md) | Offline composition/contracts and synthetic developer smoke harness; no journey |
| 04 | [Meeting lifecycle and integrity](phases/04-meeting-lifecycle.md) | Domain rules, durable coordination, editable message queue, run/meeting relationships |
| 05 | [Personas and configuration](phases/05-personas-and-configuration.md) | Atomic prompt activation, explicit snapshot refresh, effective settings |
| 06 | [Knowledge workflows](phases/06-knowledge-workflows.md) | Context-scoped retrieval, durable ingestion, logical deletion and eventual cleanup |
| 07 | [Frontend reliability and QoF](phases/07-frontend-reliability.md) | Correct core stores/streams, editable queue and reusable accessible components |
| 08 | [Demo runtime foundations](phases/08-demo-runtime-hardening.md) | Generic session lifecycle, isolation, bounds and no-live-service policy; synthetic checks |
| 09 | [Core consolidation](phases/09-core-consolidation.md) | Ten in-scope defects closed with red/green evidence; B-05 withdrawn; core refactor complete |
| 10 | [Complete demo journey and release](phases/10-demo-journey-and-release.md) | Reopened: real-app tutorial, DB research seed, shared streaming workflows, exploration and verified handoff |

**First usable recruiter demonstration:** Phase 10. **Public-exposure gate:** G4 after Phase 10 feature/runtime verification and actual-host checks. Hosting selection and provisioning remain a separate user-owned workstream.

Existing evidence is historical, not automatic acceptance of the correction. Re-audit missing core gate records and shared-workflow obligations; a green test count does not replace them. Phase 10 remains reopened until the revised route, research, persistence, streaming and manual acceptance gates have evidence.

Each affected phase starts with a test asserting the correct behavior that fails for its known bug, records that failure, fixes the bug, then refactors with the regression green. Phase 03 is scaffolding only. Core fixes/refactoring and reusable infrastructure finish through Phase 09; the complete J00-J09 feature is implemented together in Phase 10, including the real queue exercise rather than an early substitute.

## Specification conventions

- `R-*`: product or architectural requirement, defined in MASTER.md.
- `D-*`: decision requiring explicit approval, defined in MASTER.md.
- `B-*`: reviewed defect, defined in TESTING.md.
- `Pxx-Tnn`: ordered implementation task.
- `Pxx-ACnn`: measurable acceptance criterion.
- `Pxx-TESTnn`: required test case or related parametrized test group.
- **MUST** is an implementation obligation after baseline approval. **Proposed** is not an approved product decision.
- Phase status, gates, and test results are never implied by this document existing.

Shared contracts are authoritative over phase summaries. A contradiction blocks the affected task until the specification is reconciled. Changes to scope or contracts follow DELIVERY.md; no phase may silently redefine a previously approved requirement.
