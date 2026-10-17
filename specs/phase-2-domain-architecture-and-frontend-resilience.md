# Phase 2: Backend Domain Architecture and Frontend Resilience

## Purpose, prerequisite, and scope

After [Phase 1: Fixing Existing Project Issues](phase-1-existing-issues.md), reorganize Sabha around explicit domain ownership, application workflows, infrastructure boundaries, and resilient frontend state ownership. Implement incrementally, with executable contracts and test-driven development throughout; this is not a wholesale rewrite or a directory-renaming exercise.

Phase 1 fixes and their regression tests are the behavioral baseline. Architecture implementation starts only after those fixes are accepted and their relevant suites pass. The Phase 1 document currently records findings, not proof of completed fixes. This document is likewise a specification, not implemented functionality or a passing test report.

### Confirmed decisions

| Topic | Required behavior |
| --- | --- |
| Application stack | Retain FastAPI, Next.js/React, Supabase/Postgres, and Qdrant. No database or vector-store replacement is part of this work. |
| Backend style | Modular monolith with anemic domain models and explicit domain/application services. Enforce invariants without requiring behavior-rich entities or elaborate patterns for simple CRUD. |
| Access | Keep one shared workspace. Authentication gates entry; approved identities see the same application data. Preserve explicit development-only local no-login operation and trusted local Ollama integration. |
| Participant identity | Identity, prompt, explicit generation overrides, and knowledge-stack assignments are fixed when a participant joins. Later template edits do not propagate to that participant. |
| Default generation settings | Preserve an explicit inheritance policy. Resolve inherited settings at each turn's execution start, not participant creation or queue submission. Record the effective configuration for that operation. Credential rotation is independent. |
| Knowledge contents | Assigned stack IDs are fixed, but their eligible document contents remain live. Record the sources/revisions and passages used; exact historical replay is not promised. |
| Intentional deletion | Revoke future retrieval and redact retained retrieved-passage evidence tied to the deleted source. Do not automatically erase existing conversation text. |
| AI turns | One executing turn per meeting, with other requests in a visible, cancellable queue. Different meetings may execute independently, subject to explicit resource limits. |
| User messages during a turn | Accept messages while the meeting is active. The running turn keeps its captured conversation boundary; subsequent turns see later committed messages. |
| Ending during a turn | Close admission atomically, cancel waiting turns, let the executing turn finish, then perform the applicable vote/summary workflow. Do not silently restore cancelled turns if closing fails. |
| Upload completion | Success means ready for retrieval. A long-running upload may return a durable pending-operation receipt, but that is not completion success. The UI follows the same operation until ready or failed. |
| API compatibility | Coordinated frontend/backend breaking changes are allowed. Document and migrate them explicitly; preserve existing data and required behavior. |
| Frontend state | React local state owns transient inputs; Zustand owns shared client/UI and scoped stream state; TanStack Query owns backend records and request/cache state. React Query is the React integration of TanStack Query, not an additional state layer. |

### Non-goals and preserved constraints

- Do not introduce per-user ownership filtering, tenant isolation, a visual redesign, or unrelated product features.
- Do not require microservices, event sourcing, a CQRS framework, a message broker, or a generic event bus. Separate command/query functions are permitted without a framework.
- A worker may run in the same deployment or another process from the same codebase; this does not turn a bounded context into a separate service. Local startup must remain straightforward.
- Preserve the global base prompt, persona extensions, agent read-only-world restriction, and participant-specific knowledge boundaries described in `AGENTS.md:1-29`. Internal persistence tools do not authorize real-world agent actions.
- Keep provider credentials server-side and retain environment-based local configuration. No secrets in browser persistence, query caches, stream events, audit payloads, logs, or generated API artifacts.
- Preserve IDs, historical records, and valid configuration during migration. Do not fabricate historical snapshots, effective settings, source passages, or costs that were never recorded.

### Remaining decision gate: original document bytes

Keeping Supabase for application records does not select a source-file storage implementation. Before the knowledge-lifecycle phase, record a short descriptive architecture decision comparing Supabase Storage with a persistent local filesystem behind a focused source-store interface. A local adapter may accompany object storage if needed to preserve development operation; it is not mandatory without a justified requirement.

Select the actual adapter and document local startup, durability before acknowledgement, size limits, generated storage keys, deletion, restart recovery, retention, and coordinated backup/restore. SQL metadata alone is not a backup of file bytes. This is a blocking decision for ingestion implementation, not permission to leave durable storage unspecified or silently add a hosted dependency.

## Mandatory implementation method: TDD

Every implementation phase below uses the same red-green-refactor discipline:

- Write and run a failing acceptance, unit, component, adapter, or architecture-boundary test before adding the production behavior it specifies. Confirm the intended failure reason.
- Implement the smallest complete vertical slice that makes the test pass, then refactor while the new and existing tests remain green.
- For behavior-preserving extractions, first run characterization tests against the old path. Add a failing boundary/adapter test for the new seam, implement it, and run the same behavioral contracts against the migrated path. Do not invent a user-visible bug solely to obtain a red test.
- Reuse Phase 1 fixtures and regressions. Add contract tests that run against both in-memory fakes and real disposable adapters where appropriate; fakes alone do not prove database transactions, locking, permissions, or Qdrant compatibility.
- Use deterministic IDs, fake clocks, controlled promises/barriers, scripted providers, and failure injection. Avoid race tests that depend on arbitrary sleeps or real paid inference.
- Keep unit/domain tests independent of running services. Run migration/database/vector/storage integration tests against isolated disposable resources, never existing shared or personal data.
- Record exact focused and broader test commands, failing-before/passing-after results, and unexecuted checks with each implementation change. Never claim a phase is complete because test cases were merely written down.
- Do not hide failures through weakened assertions, blanket skips, swallowed exceptions, or removal of valid Phase 1 coverage. Type checking, linting, and builds supplement tests; they do not replace them.

Commit names and implementation headings should describe the behavior or boundary being changed. Do not introduce numbered finding IDs or require numbered commit prefixes.

## Reviewed migration anchors

These are verified anchors in the reviewed source, not the target architecture. Phase 1 edits may move them; recheck the named implementations before migration. Do not preserve a known bug as characterization-approved behavior.

| Existing implementation | Architectural concern to separate |
| --- | --- |
| `backend/app/services/meeting_manager.py:33-108`, `backend/app/services/meeting_manager.py:160-178` | Meeting creation, persona reads, participant creation, and persistence currently meet in the same service. |
| `backend/app/services/orchestrator.py:36-80`, `backend/app/services/orchestrator.py:123-173` | Context assembly and retrieval orchestration include knowledge-store selection and direct template-assignment lookup. |
| `backend/app/api/meetings.py:206-304`, `backend/app/api/meetings.py:306-378` | Route-level ending code performs admission checks, provider calls, vote decisions, summary creation, and persistence. |
| `backend/app/api/documents.py:30-72`, `backend/app/api/documents.py:75-173` | Upload handling, in-memory task input, parsing/indexing, and document status changes need a recoverable workflow boundary. |
| `backend/app/core/database.py:7-23` | Supabase client construction is global infrastructure and must not become a domain dependency or mutable per-user session. |
| `frontend/src/stores/meetingStore.ts:105-164`, `frontend/src/stores/meetingStore.ts:169-277` | Canonical backend records, transport work, selected-meeting state, and live stream buffers share a store. |
| `frontend/src/stores/settings-store.ts:9-53`, `frontend/src/stores/settings-store.ts:83-107` | Client preferences, server-controlled execution configuration, and editable credentials require distinct ownership. |

## Domain ownership and vocabulary

### Meetings

Own meeting identity, lifecycle/admission rules, participant instances, conversation ordering, recorded disagreement/consensus, final summaries, and the relationship between a meeting and its operations. Disagreement/consensus remain meeting records unless independent lifecycle requirements later justify another boundary.

The meeting is the consistency boundary for admitting turns/messages and closing. It does not require loading an entire conversation into an aggregate object. Messages, tool artifacts, operations, and usage records may have separate persistence representations within that boundary.

### Persona catalog

Own reusable persona templates, prompt history/activation, template generation policies, and template stack assignments. Meetings obtain a creation-time snapshot through an explicit application interface, not by reaching into persona tables from an inference path.

An existing participant owns its copied fields and assignments. A template ID/version is provenance, not a live settings source. Template deletion must not erase participant-owned snapshots or bindings to surviving stacks. Explicit adoption of a newer template is not part of this phase.

### Knowledge

Own stacks, documents and revisions, ingestion/publication/deletion state, source storage, eligible retrieval, and source-linked evidence redaction. Qdrant is a derived search projection, not authority for whether a document still exists or may be retrieved.

Meeting-shared documents and participant-assigned stacks determine AI retrieval access. A shared human workspace does not grant an AI access to unassigned stacks. Cross-boundary references use identifiers and explicit interfaces rather than mutable object graphs or cross-module table access.

### Supporting execution and configuration capabilities

Provide provider/embedding adapters, tool dispatch, settings resolution, usage accounting, job execution, clocks/IDs, and authentication infrastructure. These are supporting capabilities, not automatically independent business domains or deployed services.

Inference is an application workflow. Domain services decide business policies; provider SDK details, HTTP errors, stream framing, and SQL/Qdrant calls stay outside domain models. Keep tool-loop limits, context-budget behavior, error handling, and usage recording consistent between streaming and non-streaming entry points.

## Dependency and persistence contracts

- Organize backend modules by business boundary, with focused domain, application, infrastructure, and presentation responsibilities. Use feature/module names that match the vocabulary above; choose exact paths during the foundation phase and enforce them with tests.
- Domain models are data-focused Python types. Domain services enforce business invariants; application services coordinate use cases and external work. Do not turn anemic models into unrestricted write access from routes or repositories.
- Domain code must not import FastAPI, Supabase, Qdrant, provider SDKs, or frontend/API schemas. Application code depends on domain contracts and ports, not concrete adapters. Avoid HTTP status codes and transport exceptions in business policies.
- Presentation validates transport inputs, invokes a use case, and maps typed outcomes/errors. A composition root constructs adapters and injects dependencies; SDK singletons must not leak through domain/application imports.
- Use narrow repositories and ports for actual use cases: meeting/conversation access, persona snapshots, operation claiming, settings resolution, source storage, retrieval, inference, and usage persistence. Do not create generic repositories or an interface for every function.
- Cross-module work goes through explicit application interfaces. Infrastructure may implement a documented cross-table atomic operation without allowing one domain module to mutate another module's internals arbitrarily.
- Define atomic operations for meeting-plus-participant creation, prompt activation, assignment replacement, operation admission/claiming, final turn publication, and summary-plus-ended commit. Database constraints and conditional writes back service-level validation.
- A Python unit-of-work abstraction must represent a real database transaction, not sequential Supabase `.execute()` calls. A narrow Postgres function invoked through RPC is a viable starting point for atomic operations; a direct Postgres transaction adapter is an alternative requiring an explicit decision and connection configuration. Preserve the chosen abstraction's rollback semantics with integration tests.
- If using database functions, constrain caller permissions and execution privileges; do not expose a new anonymous bypass around the Phase 1 gate. Do not duplicate the entire business policy in SQL: keep only necessary constraints, concurrency guards, and atomic persistence operations there.
- Never hold a transaction or database lock across inference, embedding, parsing, file transfer, or vector-store calls. Use short claims/transitions, operation IDs, persisted checkpoints, and compensating/reconciliation work.
- Make blocking SDK calls deliberately off-loop or use supported async adapters. Bound worker/provider concurrency and resource consumption independently of the per-meeting queue.

## Required behavior contracts

### Participant snapshots and per-turn inheritance

- Snapshot identity, role, color, prompt/base-prompt revision or equivalent saved text, explicit generation overrides, inheritance markers, and assigned stack IDs when joining. Validate referenced stacks and capture a coherent template revision/creation snapshot.
- Do not freeze an inherited default accidentally by copying its currently resolved value into an explicit override. Conversely, never replace an explicit participant value because a shared default or template later changes.
- Define field-level inheritance unambiguously. Resolve the provider first, then its compatible model/defaults and supported parameters. Reject invalid provider/model combinations rather than silently charging another provider.
- Resolve inherited values once when a queued turn starts executing, save that effective settings snapshot before inference, and reuse it throughout its tool loop. Changes during execution affect later turns, not the running operation. A turn queued before a defaults change uses the defaults present when it actually starts.
- Record the effective provider/model, supported parameters, configuration revision/provenance, and a non-secret credential reference where useful. Never persist credential values as operation evidence.
- Resolve voting participants from their own saved policy at each vote operation's start. Resolve the summary's System AI configuration through the explicit supported settings contract, not whichever participant happens to be first. Preserve local environment fallbacks.
- Where Phase 1 refers to preserving generation settings, distinguish copied explicit overrides/inheritance policy from dynamically resolved shared defaults. These are compatible contracts, not permission to restore live template inheritance.

### Durable queue and conversation boundaries

- Submit an AI-turn command with a stable client request/operation key and participant/meeting identity. Atomically validate admission and create or return the existing operation. Reusing the key with a different payload is a conflict, not a second turn.
- Persist a FIFO admission order per meeting. Expose queued, executing, completed, failed/interrupted, and cancelled outcomes with operation identity. The queue is server-owned, visible, and cancellable while pending; browser navigation does not own its lifetime.
- Permit one executing turn per meeting across all workers/processes, not merely within one Python instance. Use an atomic claim with a recoverable lease/fencing or equivalent mechanism; stale workers cannot publish after ownership changes.
- At claim/start, capture a durable conversation sequence boundary and effective configuration. Assemble all follow-up inference context from that boundary plus this operation's own tool exchange; do not absorb newly arriving user messages mid-turn.
- While active, accept user messages with monotonic committed ordering and duplicate-submission protection. Later queued turns include messages committed before their execution boundary. The UI explains why a running response may not address a just-submitted message.
- On a worker restart, recover pending operations. Treat uncertain in-flight inference explicitly as interrupted/unknown until reconciled; do not automatically repeat a potentially paid call merely because a stream ended or lease expired. Cancellation stops work only as far as the provider supports.
- Guarantee at most one committed final message/tool side effect for a logical operation through deduplication and fenced commits. Do not claim exactly-once external inference. Record known incurred usage even when publication is rejected or transport disconnects.
- Removing a participant or deleting/archiving its meeting must use the same admission/operation coordination, not strand queued work or permit late resurrection. Document these transition outcomes before implementing them; preserve read-only ended/archived behavior.

### Inference and stream protocol

- Use one application execution pipeline for streaming and non-streaming requests. Streaming is observation of the operation, not a separate implementation of domain behavior.
- Send correlated tool-call events before execution, then corresponding result/error events. Append matching tool results to the model context and continue a bounded inference loop. Deduplicate persisted log-disagreement/log-consensus effects by operation and call identity.
- Assign every stream event an operation ID, meeting ID, and ordered event identity. Tool events also carry unique call IDs. Validate the contract and preserve IDs through persistence and frontend reconciliation.
- Emit completion only after the required final state/message is committed. EOF without a terminal outcome is an interrupted observation, not proof that inference failed or succeeded.
- Provide operation status/result reconciliation independently of the stream. Reconnect to observation or refetch status; do not resubmit generation. Define bounded replay or snapshot reconciliation explicitly rather than promising unlimited token-event retention.
- Browser navigation aborts/detaches observation and clears only the matching local buffer. It does not silently cancel an accepted queue entry or restart it on remount. An explicit pending-turn cancellation is a separate command.

### Closing and accounting

- Requesting end atomically closes admission, cancels queued turns, and records one closing operation. Let the executing turn reach a committed terminal outcome before voting/summary. Coordinate end/message/claim races through database guards.
- Preserve the applicable normal vote and force-end behavior. A rejected vote returns the meeting to active admission; already cancelled turns stay cancelled. Force-end skips voting, not the running-turn drain or persistence guards.
- Distinguish meeting lifecycle from closing-operation stages such as draining, voting, summarizing, failed, and completed. Do not leave an unexplained permanent voting state. Map existing statuses deliberately during migration.
- Persist completed votes/summary checkpoints so persistence retries do not needlessly regenerate paid output. Commit the final summary and ended transition atomically and only once. On failure, expose a recoverable operation with an explicit retry or abort-to-active path, not implicit duplicate inference.
- If a running turn stalls or becomes uncertain, surface its interrupted/recovery state; do not wait indefinitely or claim the closing summary includes uncommitted output. Define configurable deadlines and explicit recovery actions.
- Account for every actual provider attempt in turns, follow-ups, voting, summaries, rejected votes, and later persistence failures. Use stable attempt IDs and distinguish reported usage, estimates, and unknown usage; aggregate counters must not double-count retries. Keep zero-priced local-provider behavior explicit.
- Preserve the distinction between ended and archived. Archive/unarchive must not implicitly reopen an ended meeting or bypass operation coordination; retain the underlying lifecycle when representing archive state.

### Durable knowledge, publication, and deletion

- Persist original bytes plus a recoverable document/job handoff before returning a pending receipt. SQL and file/object storage are not one transaction: define staging, finalization, orphan cleanup, and retry/reconciliation explicitly.
- Enforce bounded input reads, extraction budgets, supported-format checks, and bounded off-loop parsing. Use deterministic document revision/chunk identities and compatible embedding model/dimension metadata for idempotent indexing.
- Distinguish pending/processing, ready, failed, and deletion/revocation state. A document becomes ready only after complete vector publication is confirmed and SQL eligibility is committed. An acknowledgement or vector request submission alone is not readiness.
- When work outlasts the upload request, return the same durable operation/document identity and let the UI track it. A pending receipt must not produce a completed-success notification. Reload or observation retry must not upload the file again.
- Search only eligible revisions in meeting-shared scope plus the participant's saved stack assignments. Recheck authoritative eligibility rather than trusting orphaned vector payloads or a client-supplied collection name. Use query/document embedding modes correctly.
- Record source/document revision, chunk identity/hash, operation/call identity, and retrieved-passage evidence in a structured, source-linked form. Represent actual observed revisions without promising a globally immutable snapshot across multiple live stacks.
- At deletion/revocation commit, exclude the source from new retrieval immediately through authoritative guards; physical source/vector cleanup may be retryable. Revalidate stale in-flight retrieval and not-yet-dispatched context at the publication/dispatch boundary. Bytes already sent to a provider cannot be recalled; document that limitation and prevent subsequent reuse.
- Redact retained raw retrieved passages and derived evidence copies tied to the deleted source, including structured tool results, citation snippets used as evidence, and any persisted assembled-context copies. Keep permitted IDs/hashes/deletion markers. Do not log raw passages in a channel that cannot honor this policy.
- Existing conversation text is not automatically erased, even if it quotes a deleted source. Do not claim redaction removes provider-held data, external logs, or old backups automatically. Define backup retention and restored-system tombstone/redaction reconciliation; an old restore must not silently re-enable deleted knowledge.
- Apply deletion to documents and parent meetings/stacks with durable cleanup intent. Restarting workers, late vector writes, or retries must not resurrect deleted content. Temporary cleanup failure is visible and retried; it cannot make deleted passages eligible for retrieval.
- Back up SQL, original bytes, and recovery metadata coherently. Rebuilding vectors is possible only where original inputs/configuration still exist. Historical documents without retained originals need an honest unavailable-source/re-upload status, not an invented successful recovery promise.

## Frontend ownership and contracts

| State or responsibility | Owner |
| --- | --- |
| Meetings, messages, participants, persona history, stacks/documents, summaries, settings metadata, queue/operation records | TanStack Query, keyed by resource identity and relevant parameters |
| Form input, prompt edits, temporary validation, upload selection | React component/feature-local state; protect draft edit versions during saves |
| Selected UI panels, cross-component presentation preferences, active observation references, provisional streamed tokens/tool activity | Focused Zustand stores/controllers scoped to meeting and operation identity |
| Authoritative generation defaults and System AI configuration | Backend settings contract; cached as server state, edited through validated mutations |
| HTTP authentication, DTO decoding, errors, AbortSignal, multipart upload, stream parsing | Shared transport layer with feature-facing typed clients |

- Organize features around Meetings, Persona Catalog, Knowledge, and Settings. Keep route components thin; feature hooks/use cases coordinate workflows and presentation components render state.
- Feature modules expose intentional public interfaces. Do not import another feature's private store/component internals or hide business logic in generic shared helpers.
- Keep shared transport, generated API types, query-key conventions, UI primitives, and composition separate from feature behavior. Avoid an all-purpose API/store file that becomes a new monolith.
- Establish one canonical owner for each server record. Do not mirror full meetings/messages into Zustand. Provisional streaming output is explicitly temporary and reconciles by operation/message identity when canonical data arrives.
- Use identity-scoped query keys and mutation invalidation. A late A response may populate A's cache but cannot change selected B, its stream buffers, errors, or busy indicators. Propagate abort signals; cancellation is not a substitute for identity guards.
- Configure mutation retries deliberately. No automatic replay of paid generation, end commands, or uploads without a proven idempotent command contract. Query refetch/reconnect must not trigger a command.
- Separate command submission from operation observation. Queue cancellation, navigation detach, and interrupted stream recovery have distinct behavior. Render waiting turns and pending uploads honestly after remount.
- Prevent stale refetches from regressing newly committed records, using canonical ordering/revisions and reconciliation rules. Tool activity matches call IDs, not tool names, and is not duplicated after final refetch.
- Persist only justified client preferences, with versioned migration and explicit hydration. Do not persist active stream flags, server initialization gates, raw credentials, or canonical server records. React Server Components must not share mutable client stores across requests.
- Authentication-required mode uses the shared authenticated transport for normal fetches, uploads, status reads, and SSE initiation. Logout/expiry stops observation and clears sensitive client/cache state; the server independently enforces entry. Preserve explicit local no-login behavior.

## API, schema, and migration policy

- Publish a use-case/contract inventory before changing routes. Cover persona CRUD/history, meeting creation/participants/messages, submit/status/observe/cancel turn, end/status/retry/abort close, document upload/status/delete/search, settings, and existing reporting/archive behavior.
- Define command request keys, operation receipts, stable error categories, resource revisions/order, stream events, and final result shapes. Generate or validate frontend types against the backend contract; handwritten divergent DTO copies are not the long-term boundary.
- Breaking changes may ship as coordinated frontend/backend slices. Declare deployment order, compatibility window or maintenance requirement, migration/backfill steps, and rollback limitations. Do not leave two independent writers to the same workflow.
- Use additive schema changes first, validate/backfill on a disposable copy, then cut over and remove legacy paths only after acceptance. Do not drop columns or data simply because new classes no longer read them.
- For existing participant configuration, preserve recorded explicit values. Treat empty/default markers according to a documented migration rule; do not reinterpret meaningful values silently. Unknown historical stack assignments/settings remain explicitly unknown unless evidence supports a reconstruction.
- For existing documents and summaries, preserve recognizable records and mark missing revision/source metadata honestly. Do not present fabricated audit history or recreate intentionally deleted data.
- Test both an empty installation and an upgrade from the Phase 1 schema/data. Back up before real migration; rehearse restore and forward recovery for irreversible redaction/deletion instead of promising unsafe rollback.

## Implementation phases

Each phase is a test-first vertical slice with a named entry condition, deliverables, and exit gate. Use descriptive branch/commit names. Small compatibility adapters are acceptable during migration, but must have an owner and removal gate. Do not perform a repository-wide file move before the first migrated behavior passes.

### Implementation phase: Baseline and executable architecture contracts

**Entry:** Phase 1 remediation is accepted; identify the actual passing commands and any explicit limitations rather than assuming a baseline.

**Red:** Add tests for the first intended dependency boundary/use-case seam. Characterize supported existing API/local workflows without freezing the known incorrect behaviors from the review.

**Green and refactor:** Record the vocabulary, module/dependency map, use-case inventory, error/operation contracts, and chosen test locations. Establish synthetic provider/embedding transports, disposable Postgres/Qdrant resources, and frontend component/transport harnesses. Pick and lock compatible test/runtime dependencies; configure the suites and CI rather than assuming tests already exist.

**Exit:** Phase 1 regressions run; architecture checks demonstrate an intentional forbidden import fails; characterization and smoke suites are reproducible without paid inference. Record unresolved source-store and transaction-adapter decisions with their later gates.

### Implementation phase: Backend composition and atomic persistence seams

**Entry:** Baseline contracts exist.

**Red:** Write repository/transaction contracts for creation rollback, competing claims, prompt activation, assignment replacement, and permission coverage. Add a test proving domain/application code can execute with fakes without constructing SDK clients.

**Green and refactor:** Introduce the module boundaries, typed domain/application outcomes, focused ports, composition root, and Supabase adapters. Implement real atomic operations through the chosen transaction strategy. Introduce additive operation/order/idempotency persistence and short conditional transitions. Preserve the Phase 1 authentication gate and trusted provider-origin policy.

**Exit:** Real disposable database tests establish rollback and concurrency guards; SDK imports stay outside domain/application modules; local startup and existing flows still pass. Routes migrated in this slice invoke use cases instead of database/provider code. Do not claim an empty interface layer completes the architecture migration.

### Implementation phase: Frontend transport and state foundation

**Entry:** Initial API/operation contracts and backend composition seams exist. This foundation can accompany backend vertical slices but must precede migrating their feature screens.

**Red:** Test scoped query keys, authenticated upload/SSE transport, malformed/interrupted stream handling, stale response cleanup, and A-to-B navigation with controlled promises.

**Green and refactor:** Add the feature layout, shared typed transport, TanStack Query ownership, focused Zustand UI/observation controllers, and React-local form state. Migrate one read-and-mutate feature end to end before expanding. Define cache updates/invalidation, per-request SSR/client initialization where applicable, and legacy browser-preference migration.

**Exit:** The migrated feature has one canonical server-data owner; old state and new caches do not independently write the same records. Navigation/expiry tests prove buffers and errors remain identity-scoped. Unmigrated features keep their working legacy path until explicitly cut over.

### Implementation phase: Persona catalog and independent participants

**Entry:** Backend persistence seams and frontend foundation are available.

**Red:** Create participant A from a template, edit identity/prompt/overrides/assignments, then create B and assert independent snapshots. Change shared defaults before execution and during an operation; assert inheritance versus explicit override behavior. Test failed/concurrent prompt activation and dirty edits during save.

**Green and refactor:** Move persona use cases into the catalog boundary; create participants through a coherent snapshot contract; save inheritance explicitly. Migrate roster/history/settings interactions to typed feature hooks and canonical cache reconciliation. Implement the planned data backfill without fabricating historical values.

**Exit:** Old/new participants, template deletion, surviving stack bindings, per-turn defaults, prompt atomicity, and editor active-state behavior pass unit, database, and component tests. Existing records load after upgrade; secrets are absent from returned/persisted evidence.

### Implementation phase: Durable turn queue and unified inference

**Entry:** Participant/configuration contracts and operation persistence are accepted.

**Red:** Admit two same-meeting turns concurrently; assert one claim and a visible ordered pending entry. Test duplicate keys, changed-payload key conflicts, cancellation/claim races, user messages during execution, different-meeting independence, worker interruption, stale leases, repeated tool names, and premature stream EOF.

**Green and refactor:** Implement submit/claim/status/cancel/observe use cases, start-time conversation/settings capture, bounded tool-loop execution, usage-attempt recording, and fenced final publication. Replace duplicate streaming/non-streaming logic. Connect the meeting feature to pending queues and operation-scoped observation; navigation detaches without resubmission.

**Exit:** At most one execution claim per meeting and one committed final result per logical operation are proven with database/concurrency tests. The actual backend SSE contract passes through frontend parsing/controller tests. Pending work survives restart; uncertain provider calls are surfaced rather than automatically charged again. No canonical meeting mirror remains in the migrated store path.

### Implementation phase: Coordinated closing, summaries, and usage

**Entry:** The queue and operation pipeline are accepted.

**Red:** Race end admission against a queued claim and user-message write. Test running-turn drain, queued cancellation, negative vote, forced end, summary/provider/save failure, concurrent end requests, checkpoint retries, and every paid attempt's accounting. Cover archive/unarchive preserving ended state.

**Green and refactor:** Move closing out of route bodies into explicit application/domain services. Persist close stages and results, use the System AI contract for summary configuration, commit summary/ended atomically, and provide retry/abort recovery. Migrate real summary and close-progress UI through server state and operation observation.

**Exit:** No close path leaves an unexplained voting/busy state or reopens an ended meeting. Cancelled queued turns stay cancelled. Known incurred usage is retained without double counting. Repeated persistence attempts do not duplicate summaries or silently regenerate completed paid work; UI reload reconstructs the canonical result.

### Implementation phase: Durable knowledge and deletion-aware evidence

**Entry:** Select and record the original-byte storage adapter, retention/backup policy, and publication protocol. Do not start this phase with that decision implicit.

**Red:** Test acknowledgement-to-restart recovery, bounded reads/extraction, off-loop parsing, first-collection races, idempotent publication, retrieval-before-ready exclusion, live revisions with fixed participant assignments, and both document/parent deletion. Pause queries/publication/context dispatch around deletion and assert no stale reuse or resurrection. Assert passage redaction across all declared evidence stores.

**Green and refactor:** Implement the source store, recoverable jobs, revision/chunk identities, SQL eligibility and Qdrant projection adapter, source-linked audit storage, revocation/redaction, and durable cleanup/reconciliation. Connect pending-operation upload tracking and per-file retry to the knowledge/meeting features. A retained meeting ID and operation key prevent duplicate meeting/file creation after failure.

**Exit:** Ready means demonstrably searchable eligible content; pending never appears as completed success. Worker restart, failed cleanup, late writes, source deletion, and old backup restoration follow the declared policies. Deleted evidence is redacted while existing conversation text remains unchanged. Local operation, provider-specific embedding behavior, source-file limits, and real Qdrant adapter compatibility pass.

### Implementation phase: Complete feature migration and remove legacy ownership

**Entry:** Persona, turn, closing, and knowledge slices pass their gates.

**Red:** Add remaining feature integration tests for shared settings changes, stale metadata hydration, archive/reporting views, summaries, per-file retry, auth expiry, and draft preservation across failed/delayed saves. Test forbidden cross-feature/private imports and duplicate server-state ownership where enforceable.

**Green and refactor:** Move remaining routes/screens to the feature contracts, remove obsolete all-purpose state/API paths, and finish canonical query invalidation. Remove canned runtime data and unused compatibility writers only after confirming callers and preserving intentional fixtures. Keep UI behavior changes limited to the specified queue/progress/recovery semantics.

**Exit:** Every supported workflow uses the declared ownership/dependency rules. No migrated route accesses infrastructure directly; no component implements raw SSE parsing or provider persistence. Phase 1 regressions and the complete migrated frontend suite pass without duplicate command submission or stale cross-meeting updates.

### Implementation phase: Upgrade rehearsal, cutover, and architecture acceptance

**Entry:** All feature gates pass on disposable environments.

**Red:** Write upgrade/restore and deployment-contract tests before final migration/cutover scripts. Exercise legacy data with missing snapshots/originals and rejected configuration, not just clean new databases.

**Green and refactor:** Rehearse fresh setup and Phase 1 upgrade; back up and restore SQL plus actual source bytes; verify deleted-source tombstones/redaction reconciliation. Execute the coordinated frontend/backend deployment plan and record rollback/forward-recovery boundaries. Remove transitional columns/adapters only after validated migration and an explicit removal decision.

**Exit:** The completion criteria below are evidenced by executed tests and recorded results. Update developer documentation for module ownership, local startup, worker recovery, source-store selection, migrations, and test commands. Do not label the phase complete while integration gates are merely proposed or skipped.

## Shared fixture and acceptance matrix

Reuse Phase 1 contracts such as `meetings_ab`, `persona_instances`, `provider_script`, `deferred_requests`, `stream_variants`, `indexed_parent`, and `ingestion_recovery`. Extend them rather than replacing their assertions with easier fakes.

| Fixture/contract | Essential acceptance |
| --- | --- |
| `module_boundaries` | Domain/application modules load without SDK construction; forbidden infrastructure/cross-feature imports fail checks. |
| `atomic_repository_contracts` | Real database rollback, unique prompt activation, assignment replacement, coherent participant creation, and competing operation claims match fake-adapter contracts. |
| `inherited_settings` | Explicit and inherited fields coexist; queued work resolves current defaults at execution start; later changes do not alter a running tool loop; incompatible models fail visibly. |
| `queued_turns` | Two workers, stable request keys, FIFO admission, cancel/claim races, resource limits, different-meeting independence, restart and stale-owner fencing are deterministic. |
| `conversation_boundary` | A user message committed during turn A is absent from A's original context but present in later turn B; committed ordering is stable despite response timing. |
| `closing_barriers` | End races against claims/messages; only the running turn drains; pending turns cancel; failed votes reopen admission; failure/retry does not duplicate summaries or paid calls already checkpointed. |
| `usage_attempts` | Turn/tool/vote/summary attempts have stable deduplication keys; known costs persist after later failures; unknown usage is not fabricated or silently treated as zero. |
| `backend_to_frontend_events` | Feed actual backend event envelopes through the frontend parser/controller, including split chunks, duplicate/replayed events, two same-name calls, EOF, terminal persistence, and navigation. |
| `source_store_contract` | Selected real adapter and fake agree on bounded writes, durable receipt, missing-source errors, deletion, stage cleanup, restart, and backup/restore. |
| `live_knowledge_and_redaction` | Template assignment edits cannot change A's scope; eligible new stack content is live; deleted sources cannot be newly retrieved/reused; all declared stored passage copies redact while existing messages remain. |
| `upgrade_dataset` | Existing IDs/messages/costs survive; explicit configuration remains explicit; unknown assignments/originals are honest; no migration restores deleted content. |
| `shared_workspace_access` | Two approved identities see the same records; unapproved access fails before mutation/inference; local bypass remains explicit and cannot be enabled through request input. |
| `frontend_ownership` | Server records have one owner; provisional buffers reconcile once; stale completions cannot clear newer operations; draft edit versions and pending-upload identity survive the required failure paths. |

## Completion criteria

- Every implementation phase has executed red-green-refactor evidence and its exit gate passes; Phase 1 regressions remain green.
- Domain/application services own the documented rules; adapters and routes cannot bypass the transactional invariants. Boundary tests protect this separation.
- Participant snapshots, per-turn inheritance, queue ordering, message boundaries, closing, accounting, live knowledge, deletion, and evidence redaction match the confirmed decisions.
- Supabase remains the authoritative application store and Qdrant the vector projection. Original bytes have an explicitly selected, tested durable store; backup/restore covers bytes rather than metadata alone.
- Frontend state follows the ownership table, with explicit command/observation separation, operation-scoped cleanup, canonical cache reconciliation, and no duplicate server-data stores.
- Fresh installation, upgrade, local no-login mode, authenticated shared-workspace mode, trusted local Ollama, worker interruption, provider failure, cleanup failure, and coordinated deployment are exercised without paid inference as a required dependency.
- Real-provider smoke tests, if desired, remain separately opt-in. Record supported dependency versions and actual test/build/type/lint results; do not present source inspection or a successful build as proof of lifecycle correctness.

## Documentation references

These references inform adapter/state choices, not a requirement to copy example architectures or add a framework:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions): narrow transactional operations and execution permissions.
- [Supabase Storage](https://supabase.com/docs/guides/storage): candidate original-file adapter; selection remains the decision gate above.
- [TanStack Query: server state versus client state](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state): why backend records and UI state have different owners.
- [TanStack Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): propagate cancellation through transport rather than assuming a cache cancels external effects.
- [Zustand with Next.js](https://zustand.docs.pmnd.rs/guides/nextjs): store scope and server/client boundaries.
