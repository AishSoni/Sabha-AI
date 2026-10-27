# Phase 2 Roadmap: Backend Domain Architecture and Frontend Resilience

## Prerequisite and reading order

Both [Phase 1 implementation specs](roadmap-phase-1-existing-issues.md) must be accepted with executed regression evidence before architecture implementation begins. Do not substitute the existence of specifications, cached tests, or a successful build for this gate.

Continue with **Spec 03 through Spec 11, in that order**, following the [ordered index](README.md). Complete each spec's exit gate before advancing. Work in small test-first vertical slices, not a repository-wide move.

| Implementation spec | Prerequisites | Bounded deliverable |
| --- | --- | --- |
| [Spec 03: Foundations and executable contracts](spec-03-foundations-and-contracts.md) | Phase 1 accepted | Reproducible harnesses, contracts, import checks, decision gates |
| [Spec 04: Backend composition and transactions](spec-04-backend-composition-and-transactions.md) | Foundations | First real atomic use case through injected composition |
| [Spec 05: Frontend transport and state](spec-05-frontend-transport-and-state.md) | Foundations and backend seams/API contracts; tested vault contract | One feature with typed transport, runtime-scoped identity, encrypted vault, and one canonical data owner |
| [Spec 06: Persona catalog and participants](spec-06-persona-catalog-and-participants.md) | Backend seams and frontend foundation | Independent snapshots, execution-time inheritance, canonical prompt editing |
| [Spec 07: Durable turn queue and inference](spec-07-durable-turn-queue-and-inference.md) | Participant/configuration and operation persistence contracts | Durable queue, one execution pipeline, scoped observation |
| [Spec 08: Closing, summaries, and accounting](spec-08-closing-summaries-and-accounting.md) | Queue accepted | Drain/cancel coordination, recoverable closing, atomic finalization, usage |
| [Spec 09: Durable knowledge and redaction](spec-09-durable-knowledge-and-redaction.md) | Prior slices; explicit source-store/retention decision | Durable ready publication, live scoped retrieval, revocation/redaction/cleanup |
| [Spec 10: Feature cutover and legacy ownership removal](spec-10-feature-cutover-and-legacy-removal.md) | Persona, queue, closing, knowledge gates | Remaining production screens migrated and caller-proven removal; guided replay explicitly deferred in its completion record |
| [Spec 11: Upgrade and architecture acceptance](spec-11-upgrade-and-architecture-acceptance.md) | All feature gates | Fresh/upgrade/restore/deployment evidence and final acceptance |

## Shared references, not additional implementation phases

- [Architecture contracts](reference-architecture-contracts.md): confirmed decisions, domains, transactions, participant/default semantics, queue/message/closing behavior, knowledge deletion/redaction, frontend ownership, migration policy, fixture matrix, and final completion criteria.
- [Target file structure](reference-architecture-contracts.md#target-file-structure-and-restructuring-plan): complete backend/frontend trees, import rules, current-to-target ownership, and incremental file-migration proof. Create files only when tested behavior moves; preserve URLs and startup compatibility.
- [Phase 1 evidence and fixtures](reference-review-evidence-and-fixtures.md): preserved regressions and source anchors. Recheck implementations after fixes; source line numbers are not permanent APIs.
- [Runtime modes and credentials](reference-runtime-modes-and-credentials.md): authoritative replay isolation, same-UI/core tutorial, encrypted local BYOK, and credential-aware operation recovery.

These references are consulted by slice; they are not a request to implement the entire design at once. Their contracts remain authoritative when a short example shows only one aspect.

## Decisions every slice must preserve

Retain FastAPI, Next.js/React, Supabase/Postgres, and Qdrant. Use anemic domain data with explicit domain/application services in a modular monolith. Hosted/local demo runs are fixed, user-paced guided replay through the same UI/core in a dedicated, isolated, no-write workspace; no sign-in, credentials, live calls, or durable effects. Hosted live calls use visitor credentials encrypted in browser `localStorage`, with the passphrase/derived key never persisted. Infrastructure secrets remain server-only; preserve explicit local environment/Ollama policy and restricted direct database access. Keep template snapshots independent, inherited defaults execution-scoped, knowledge contents live with source-linked evidence, and deletion redaction distinct from erasing conversation text.

React owns drafts; TanStack Query owns backend records; Zustand owns scoped UI/provisional observation only. A separate non-persisted credential capability owns unlocked material; query/cache identities distinguish live from replay and its package/workspace. Live AI turns queue server-side; user messages commit immediately within active admission; closing cancels pending turns and drains the executing turn. Missing transient credentials pause the same operation for re-provision, not operator-key fallback or repeated paid work. Upload acknowledgement is not readiness. Breaking API cuts are coordinated and migration-tested.

**Recorded decision:** Spec 09 selected Supabase Storage for original bytes, with durability/retention/local operation/backup policy in the [architecture reference](reference-architecture-contracts.md#decision-original-document-bytes-recorded-2026-10-spec-09). Do not reopen this as an undecided adapter gate. Real hosted verification remains separate from local/test evidence.

**Forward ownership:** [Phase 3](roadmap-phase-3-hosted-guided-replay.md) owns the deferred guided replay in the same hosted app, effective database read hardening and the new shared-product integration fixes. Preserve Phase 2 completion records; they do not establish replay delivery or resolve Spec 11's conditional hosted checks.

## Mandatory TDD and evidence

Each implementation spec contains prerequisites, tests to write first, short proposed code/test fragments, incremental changes, and an exit gate. Implement its harness before running fixture-dependent examples. Examples are not already implemented or verified. For extraction, protect accepted behavior with characterization tests and add a failing new boundary test; do not invent a user-visible bug to obtain red.

Record actual failing-before/passing-after commands, broader regressions, and unexecuted integration checks. Fakes do not prove SQL rollback/locking, Qdrant compatibility, source durability, or restart recovery. Do not weaken assertions, hide skips, or treat lint/types/build as lifecycle proof. No paid inference is required. Spec filenames follow the global implementation sequence. Keep change/commit names descriptive, without numbered prefixes or finding identifiers.
