# Phase 3 Roadmap: Shared Hosted App and Guided Replay

## Outcome and status

Deliver one polished, approximately five-minute historical corporate-bond walkthrough in the **same hosted application** as live setup and use. Visitors choose their path at entry. Replay reuses real feature screens, domain policies, read DTOs, event contracts, and pure projections; it does not execute live durable workflows against pretend persistence.

This phase is planned, not implemented by these documents. Specs 01–11 and their completion records remain historical evidence. Spec 10 explicitly deferred guided replay; Spec 11's hosted infrastructure checks remain conditional. Neither record is proof of this phase's acceptance.

Read the [runtime contract](reference-runtime-modes-and-credentials.md) and [package/playback contract](reference-replay-package-and-playback.md) before implementing. Follow the [global order](README.md); supporting documents are not extra implementation steps.

## Build order and ownership

| Order | Spec | Owns | Prerequisites and handoff |
| --- | --- | --- | --- |
| 12 | [Database read isolation](spec-12-database-read-isolation.md) | Effective grants, RLS, RPC/view/default privileges, isolated reader and provisioner permissions | First safety gate; supplies tested credentials/permission contract to 14 and 17 |
| 13 | [Meeting creation regressions](spec-13-meeting-creation-regressions.md) | No-file navigation and catalog-selection preservation | 12; establishes vanilla regression baseline before composition changes |
| 14 | [Live/replay composition](spec-14-live-and-replay-composition.md) | Backend DI, route-bound graphs, frontend runtime scope/intents/capabilities, lifecycle and vault isolation | 12–13; supplies seams, not a full replay engine |
| 15 | [Closing UI integration](spec-15-closing-ui-integration.md) | Reachable real closing UI and shared generated-text presentation seam | 14; 17 supplies recorded closing events, not a second closing workflow |
| 16 | [PDF extraction quality](spec-16-pdf-extraction-quality.md) | Shared live parser quality, bounded extraction fallback, deployment requirements | 15; replay will consume offline-prepared output, not run OCR |
| 17 | [Replay package and streaming](spec-17-replay-package-and-streaming.md) | Package validation/provisioning, isolated reads/retrieval, paced SSE, checkpoint reconciliation and one analyst slice | 12–16; establishes the complete technical slice before tutorial expansion |
| 18 | [Guided bond journey](spec-18-guided-bond-journey.md) | Approved authored content, entry choice, one full journey, lightweight guide and focused polish | 17; content review can proceed earlier without claiming runtime completion |
| 19 | [Release acceptance](spec-19-replay-release-acceptance.md) | Cross-layer browser/HTTP/role/deployment evidence, live regressions and release decision | All prior gates; does not substitute for unresolved hosted checks |

Closing and parser work are separate assignments within the shared-product-readiness stage. Package foundations deliberately precede the full journey. Do not build every overlay first and defer runtime correctness to the end.

## Evidence motivating the work

The preceding validation used disposable PostgreSQL, synthetic service credentials, and temporary probes outside the repository. It did not inspect deployed Supabase permissions or perform paid calls.

- Existing baseline: 215 frontend tests, TypeScript checking, and 154 selected backend tests passed. This was not the entire backend suite and is not Phase 3 acceptance.
- Two additional frontend regression probes failed as intended: successful no-file creation never navigated; changed catalog data restored deselected participants. Spec 13 must bring those cases into maintained tests.
- A new narrowly granted reader still read live meetings through inherited `PUBLIC` grants after the full checked-in migration chain. Internal documents were denied: later hardening is real but not blanket. Spec 12 owns the correction.
- The durable SSE iterator emitted a prepared batch without inter-event pacing. This is appropriate backlog behavior for live observation, not a live bug; Spec 17 adds a recorded source with pacing.
- A lifespan probe observed production recovery dispatch even with the global demo setting. In shared hosting, live recovery is legitimate; Spec 14 must isolate replay dependencies rather than disable the live graph globally.
- `ClosingPanel` exists with standalone tests but is not mounted in the real room. Spec 15 closes this integration gap.
- Actual parsing corrected an inaccurate research note: `TS-V-007.pdf` yielded no text; `SE-V007-intimation-150719.pdf` yielded 16,228 characters with poor letter spacing. Neither a nonempty extraction nor those notes establish reviewed bond facts. Spec 16 owns extraction quality; Spec 18 owns approved claims.

Reproduce relevant cases against current code before changes. Do not copy temporary scratch tests or ignored research files into production imports.

## Fixed decisions

- Live and replay coexist in one app/monorepo/deployment. A replay API namespace is bound to a separate dependency graph; a browser mode/header cannot switch a live handler's credentials or database scope.
- Live remains an intentionally shared, no-sign-in writable API. The entry choice is UX, not authorization or per-user ownership. A visitor can deliberately choose/call live APIs; replay requests themselves cannot cross into them.
- Replay has zero application writes, including progress, sessions, analytics, usage, queue journals, retrieval evidence, and seeding. It never consults the live vault or invokes providers, embeddings, Qdrant, ingestion, or live tools.
- Prepared retrieval results and approved passages live in separately provisioned Supabase demo data. Document vectors or a new pgvector search engine are not required.
- One published linear journey, with supported inputs and supplied documents. Future scenarios replace approved data packages; no scenario-specific policy forks or generic tutorial platform.
- All authored generated text is delivered over actual backend SSE, including ballot explanations and the final brief. No client-only typewriter pretending to be a stream.
- Cursor and projection are ephemeral. Refresh restarts the replay; route navigation within a run preserves its runtime scope. Back returns to a completed beat, not arbitrary token-level rewind.
- The package is immutable and version-pinned per run. Missing or incompatible data fails closed. New versions cannot alter an active run.

## Non-goals

No accounts/tenancy, writable sandbox, per-visitor database clone, real user upload handling in replay, free-form simulated intelligence, current market feed, investment recommendation, paid specialist run, scenario editor, branching engine, or redesign. Do not add live features solely to make a scripted claim appear true. Local OCR/extraction work improves the shared parser independently; replay never performs it on request.

## Method and documentation ownership

Use small red-green-refactor slices. Protect behavior-preserving extraction with characterization tests and add a failing boundary test; do not invent bugs to justify DI. Record actual commands, failure reasons, passing evidence, skips, and unresolved gates in the implementing spec only after execution.

Each owner updates affected docs and tests in the same implementation change. Spec 12 owns role/migration operations; 14 owns runtime configuration and isolation docs; 15 owns closing integration; 16 owns parser dependencies and limits; 17 owns package/provisioning/protocol docs and generated API artifacts; 18 owns scenario provenance and guide copy; 19 owns deployment evidence and release status. Update the API inventory only when routes/events actually ship, never to make proposed routes look implemented.

Browser acceptance infrastructure is new bounded work, not pre-existing coverage. Unit fakes cannot prove PostgreSQL privileges, an actual HTTP stream, browser route integration, or deployed proxy behavior. No CI platform migration is implied by this phase.
