# Phase 06 — Authorized retrieval and durable knowledge workflows

Status: draft. Depends on: Phases 00-05. Requirements: R-10, R-12, R-15; continued R-03/R-05. Defects: B-02 live integration, B-03, B-10.

## Objective and outcome

Live retrieval works against the selected Qdrant client/server contract. Private evidence stays scoped. Upload/index/delete operations recover from failures, and deleted content becomes inaccessible immediately even if physical cleanup is delayed. Demo retrieval remains fixture-only.

## Current implementation and affected paths

`services/vector_store.py` calls a client method absent from the reviewed installed client. `services/orchestrator.py` has the persona lookup failure addressed at the boundary in Phase 02. `api/documents.py` performs parsing/indexing in in-process BackgroundTasks and accepts direct ownership IDs. `meeting_manager.py` and `api/knowledge_stacks.py` delete SQL owners without coordinated vector cleanup. Search can return orphaned vector hits with an unknown filename.

Preserve useful `services/document_processor.py` and embedding-provider abstractions. Move lifecycle/authorization into knowledge use cases; keep format parsing and vector-client mapping as adapters.

## Required behavior

- Search derives collections/filters from authorized meeting/participant context and current document state. Requesters cannot choose arbitrary trusted collection IDs.
- Shared evidence plus allowed snapshotted private assignments are intersected with current permissions. Tombstones, owner deletion and grant revocation take effect immediately for new retrieval operations.
- Results carry stable source/chunk IDs and structured citation metadata. Filter invalid/orphan hits rather than labeling them as valid unknown sources.
- Use the selected supported Qdrant query API, explicitly map its response shape, constrain dependency versions and validate against an isolated real client/server pair.
- Accepted live uploads retain durable source bytes/reference and a SQL job before processing. An in-memory BackgroundTask is not the authoritative job store.
- Parsing and embedding are bounded by file/chunk/batch limits. Blocking parsing runs outside the event loop with bounded concurrency. Validate file ownership/type/size before costly processing; enforce byte limits while reading, not only after buffering everything.
- Indexing uses stable document-generation/chunk IDs so retry does not duplicate points. Only publish searchable state after verified completion.
- Deletion records a tombstone plus durable cleanup intent before acknowledging. Worker cleanup is idempotent; owner cascades cannot erase required cleanup identifiers.
- Live `web_search` must be an explicitly configured read-only adapter or a typed unavailable capability. A placeholder must not claim successful factual search. Demo uses approved recorded results only.

## Ordered tasks

First record correct failing regressions for B-03 query compatibility and B-10 post-deletion denial/cleanup; reproduce the remaining B-02 integration failure or reference Phase 02's recorded correction and add its integration coverage. Fix the observed defects, then refactor knowledge ownership/adapters with regressions green. Required tombstone/outbox changes may form the coherent correctness fix; broader ingestion improvements follow TDD. All early fixtures are synthetic, not an authored bond walkthrough.

- **P06-T01 — Scope policy:** implement document/stack ownership and participant-scope resolution behind KnowledgeSearch; eliminate direct database discovery from the turn engine.
- **P06-T02 — Vector compatibility:** choose/test the supported query method and response mapping, vector dimensions, result normalization and dependency constraints.
- **P06-T03 — Citation pipeline:** persist authorized result metadata through tool artifacts and final message citations; validate source existence at retrieval and safe citation rendering at read time.
- **P06-T04 — Durable ingestion:** store source reference/checksum, generation/state and outbox job atomically; implement worker claims, bounded parsing/embedding batches, idempotent upserts and failure status.
- **P06-T05 — Deletion/outbox:** implement immediate logical deletion for document/stack/meeting owners and retryable vector/blob cleanup with captured identifiers independent of parent lifetime.
- **P06-T06 — Race/recovery handling:** fence indexing publication after deletion/replacement; reclaim expired jobs, classify permanent versus transient failures and cap retries with visible operator diagnostics.
- **P06-T07 — Legacy reconciliation:** inventory stale processing documents, unknown source availability and orphan vectors; report repair/reindex eligibility. Do not assume original upload bytes still exist.
- **P06-T08 — Live search capability:** replace misleading placeholder behavior with configured read-only search or explicit disabled status; keep all paid/external adapters unavailable in demo.
- **P06-T09 — Integration verification:** run real isolated SQL/Qdrant tests with deterministic embeddings; verify fixture demo still boots with no vector/embedding configuration.

## Data and API changes

Extend document metadata with source-storage reference/checksum, generation, deletion timestamps/state, attempts and safe failure codes. Add transactional outbox/jobs with owner-independent cleanup payloads and lease/fencing metadata. Migrate existing indexed/failed/processing records without deleting content; old processing rows with missing source bytes need an explicit re-upload/repair state.

Upload responses describe accepted/processing state, not falsely completed indexing. Status reads expose retryable/permanent failure and progress without raw provider exceptions. Search/list routes enforce current owner existence and authorization. Deleted citation history may retain already-published safe metadata according to policy, but citation links must not retrieve deleted/private content. Deletion cannot retroactively erase facts already delivered in a message; document that distinction.

## TDD cases

- **P06-TEST01:** Persona-backed participant retrieves shared and its assigned private fixtures; another participant/owner cannot retrieve those private chunks. No undefined global lookup is used.
- **P06-TEST02:** Index/query/delete an isolated collection using the real chosen client and fake embeddings; verify response shape, dimensions, missing collection and empty-result behavior.
- **P06-TEST03:** Delete document/stack/meeting while cleanup service is unavailable; searches immediately exclude content and cleanup remains durably pending.
- **P06-TEST04:** Crash/retry after partial upsert; stable point IDs prevent duplicates. Crash after vector deletion before job completion; retry succeeds without false failure.
- **P06-TEST05:** Race upload indexing with deletion/replacement; old worker cannot publish or resurrect stale chunks. Cleanup reaches a stable empty/deleted state.
- **P06-TEST06:** Parent cascade cannot remove the only cleanup identifiers; foreign-owner IDs and arbitrary collection names are rejected before vector calls.
- **P06-TEST07:** Oversized/malformed upload, parser failure, embedding outage and exhausted retries produce bounded work and explicit states; unrelated requests remain responsive.
- **P06-TEST08:** Missing original bytes on legacy processing record produces repair-needed status, not infinite retries or fabricated indexed status.
- **P06-TEST09:** Demo starts/searches with Qdrant and embedding settings absent; no live web-search fallback occurs. Disabled live search reports unavailable, not fictional results.
- **P06-TEST10:** Grant revocation/tombstoning between job creation and execution is rechecked; citations never expose another owner's metadata.

## Acceptance gate

- **P06-AC01:** B-02/B-03 are closed against authorized live adapter integration, not only a fixture search (TEST01-02).
- **P06-AC02:** B-10 is closed: immediate denial and eventual idempotent cleanup pass under failures/parent deletion (TEST03-06).
- **P06-AC03:** Ingestion is durable, bounded and observable; legacy exceptions have documented recovery (TEST04-05, TEST07-08).
- **P06-AC04:** Citation/access and zero-external-service demo invariants remain intact (TEST09-10).

## Rollout, rollback, exclusions and risks

Enable tombstone-aware readers before new deletion writers. Backfill metadata before migrating jobs; ensure only one worker generation owns a job. Rollback may pause indexing but must retain jobs/tombstones and preserve immediate denial; never restore old search readers that expose deleted content. New storage vendor selection, unrestricted uploads in public demo and live-model relevance benchmarking are excluded. Main risks are deletion resurrection, lost cleanup identifiers, and unavailable original bytes; all have explicit handling above.
