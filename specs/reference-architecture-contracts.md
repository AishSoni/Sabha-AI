# Phase 2 Reference: Architecture Contracts and Target File Structure

This is the shared design reference, **not a single implementation assignment**. Follow the [Phase 2 roadmap](roadmap-phase-2-domain-architecture-and-frontend-resilience.md) for Spec 03 through Spec 11, their prerequisites, code examples, and acceptance gates. Read the relevant contract sections for the slice being implemented; do not scaffold or implement this whole reference at once.

## Purpose, prerequisite, and scope

After [Phase 1: Fixing Existing Project Issues](roadmap-phase-1-existing-issues.md), reorganize Sabha around explicit domain ownership, application workflows, infrastructure boundaries, and resilient frontend state ownership. Implement incrementally, with executable contracts and test-driven development throughout; this is not a wholesale rewrite or a directory-renaming exercise.

Phase 1 fixes and their regression tests are the behavioral baseline. Architecture implementation starts only after those fixes are accepted and their relevant suites pass. The Phase 1 document currently records findings, not proof of completed fixes. This document is likewise a specification, not implemented functionality or a passing test report.

### Confirmed decisions

| Topic | Required behavior |
| --- | --- |
| Application stack | Retain FastAPI, Next.js/React, Supabase/Postgres, and Qdrant. No database or vector-store replacement is part of this work. |
| Backend style | Modular monolith with anemic domain models and explicit domain/application services. Enforce invariants without requiring behavior-rich entities or elaborate patterns for simple CRUD. |
| Demo | Completely no-sign-in, dedicated isolated no-write workspace, fixed user-paced guided replay through the same UI/core as the base application. No credentials, live calls, persistent effects, per-visitor seeding, or fallback generation. See the [runtime contract](reference-runtime-modes-and-credentials.md). |
| Hosted live credentials | Ask for required visitor service keys; persist them only encrypted in browser localStorage. Neither unlock passphrase nor derived key is persisted. Use transient operation-bound handoff; never silently use operator-paid keys. Infrastructure credentials stay server-only; trusted local environment/Ollama policy remains explicit. |
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

- Do not introduce per-user ownership filtering of live shared records, a visual redesign, or unrelated product features. Mandatory demo/live workspace and execution isolation is not optional and is not per-user tenancy.
- Do not require microservices, event sourcing, a CQRS framework, a message broker, or a generic event bus. Separate command/query functions are permitted without a framework.
- A worker may run in the same deployment or another process from the same codebase; this does not turn a bounded context into a separate service. Local startup must remain straightforward.
- Preserve the global base prompt, persona extensions, agent read-only-world restriction, and participant-specific knowledge boundaries described in `AGENTS.md:1-29`. Internal persistence tools do not authorize real-world agent actions.
- Keep infrastructure credentials server-only and preserve explicit environment-based local configuration. Hosted live external-service keys use the encrypted browser vault and transient backend handoff, not shared settings or a persistent server vault. No passphrase, derived key, or plaintext credential in browser persistence, query caches, stream/audit payloads, logs, or generated artifacts. The [runtime/credential reference](reference-runtime-modes-and-credentials.md) defines encryption, locking, migration, and recovery requirements.
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

Provide provider/embedding adapters, tool dispatch, settings resolution, usage accounting, job execution, transient credential availability, and clocks/IDs. These are supporting capabilities, not automatically independent business domains or deployed services. No visitor authentication capability is required. Replay composes fixed read/event sources and rejecting write ports, not a second domain engine or a provider fallback.

Inference is an application workflow. Domain services decide business policies; provider SDK details, HTTP errors, stream framing, and SQL/Qdrant calls stay outside domain models. Keep tool-loop limits, context-budget behavior, error handling, and usage recording consistent between streaming and non-streaming entry points.

## Dependency and persistence contracts

- Organize backend modules by business boundary, with focused domain, application, infrastructure, and presentation responsibilities. Follow the target file structure below; establish its import rules during the foundation phase and enforce them with tests.
- Domain models are data-focused Python types. Domain services enforce business invariants; application services coordinate use cases and external work. Do not turn anemic models into unrestricted write access from routes or repositories.
- Domain code must not import FastAPI, Supabase, Qdrant, provider SDKs, or frontend/API schemas. Application code depends on domain contracts and ports, not concrete adapters. Avoid HTTP status codes and transport exceptions in business policies.
- Presentation validates transport inputs, invokes a use case, and maps typed outcomes/errors. A composition root constructs adapters and injects dependencies; SDK singletons must not leak through domain/application imports.
- Use narrow repositories and ports for actual use cases: meeting/conversation access, persona snapshots, operation claiming, settings resolution, source storage, retrieval, inference, and usage persistence. Do not create generic repositories or an interface for every function.
- Cross-module work goes through explicit application interfaces. Infrastructure may implement a documented cross-table atomic operation without allowing one domain module to mutate another module's internals arbitrarily.
- Define atomic operations for meeting-plus-participant creation, prompt activation, assignment replacement, operation admission/claiming, final turn publication, and summary-plus-ended commit. Database constraints and conditional writes back service-level validation.
- A Python unit-of-work abstraction must represent a real database transaction, not sequential Supabase `.execute()` calls. A narrow Postgres function invoked through RPC is a viable starting point for atomic operations; a direct Postgres transaction adapter is an alternative requiring an explicit decision and connection configuration. Preserve the chosen abstraction's rollback semantics with integration tests.
- If using database functions, constrain caller permissions and execution privileges; direct browser/anonymous table or internal RPC access must not bypass backend validation and resource controls. Live backend persistence uses intended infrastructure credentials; replay reads only its dedicated data and has no writable credential requirement. Deny demo writes before dispatch and with read-only adapter/role defenses. This is not a visitor login gate. Keep SQL limited to necessary constraints, concurrency guards, and atomic persistence operations.
- Never hold a transaction or database lock across inference, embedding, parsing, file transfer, or vector-store calls. Use short claims/transitions, operation IDs, persisted checkpoints, and compensating/reconciliation work.
- Make blocking SDK calls deliberately off-loop or use supported async adapters. Bound worker/provider concurrency and resource consumption independently of the per-meeting queue.

## Required behavior contracts

### Participant snapshots and per-turn inheritance

- Snapshot identity, role, color, prompt/base-prompt revision or equivalent saved text, explicit generation overrides, inheritance markers, and assigned stack IDs when joining. Validate referenced stacks and capture a coherent template revision/creation snapshot.
- Do not freeze an inherited default accidentally by copying its currently resolved value into an explicit override. Conversely, never replace an explicit participant value because a shared default or template later changes.
- Define field-level inheritance unambiguously. Resolve the provider first, then its compatible model/defaults and supported parameters. Reject invalid provider/model combinations rather than silently charging another provider.
- Resolve inherited values once when a queued turn starts executing, save that effective settings snapshot before inference, and reuse it throughout its tool loop. Changes during execution affect later turns, not the running operation. A turn queued before a defaults change uses the defaults present when it actually starts.
- Record the effective provider/model, supported parameters, configuration revision/provenance, and a non-secret credential reference where useful. Never persist credential values as operation evidence.
- Resolve voting participants from their own saved policy at each vote operation's start. Resolve the summary's System AI configuration explicitly, not from the first participant. Hosted live service credentials come from the initiating visitor's transient handoff, separately from shared defaults. Local environment fallbacks are allowed only under explicit trusted local policy; never in hosted live or replay.
- Where Phase 1 refers to preserving generation settings, distinguish copied explicit overrides/inheritance policy from dynamically resolved shared defaults. These are compatible contracts, not permission to restore live template inheritance.

### Durable queue and conversation boundaries

- Submit an AI-turn command with a stable client request/operation key and participant/meeting identity. Atomically validate admission and create or return the existing operation. Reusing the key with a different payload is a conflict, not a second turn.
- Persist a FIFO admission order per meeting. Expose queued, executing, completed, failed/interrupted, and cancelled outcomes with operation identity. The queue is server-owned, visible, and cancellable while pending; browser navigation does not own its lifetime.
- Permit one executing turn per meeting across all workers/processes, not merely within one Python instance. Use an atomic claim with a recoverable lease/fencing or equivalent mechanism; stale workers cannot publish after ownership changes.
- At claim/start, capture a durable conversation sequence boundary and effective configuration. Assemble all follow-up inference context from that boundary plus this operation's own tool exchange; do not absorb newly arriving user messages mid-turn.
- While active, accept user messages with monotonic committed ordering and duplicate-submission protection. Later queued turns include messages committed before their execution boundary. The UI explains why a running response may not address a just-submitted message.
- On a worker restart, recover pending operations. Treat uncertain in-flight inference explicitly as interrupted/unknown until reconciled; do not automatically repeat a potentially paid call merely because a stream ended or lease expired. Cancellation stops work only as far as the provider supports.
- Credential values do not survive in durable queue records. Choose/test bounded private handoff across the actual worker topology before queue implementation. Loss/expiry pauses the same operation in an explicit `awaiting_credentials` recovery stage; re-provision without new admission or repeating completed paid checkpoints. Public operation IDs cannot authorize reuse of another visitor's handoff. Preserve FIFO/cancellation/drain behavior without holding locks while awaiting credentials; no silent operator fallback.
- Guarantee at most one committed final message/tool side effect for a logical operation through deduplication and fenced commits. Do not claim exactly-once external inference. Record known incurred usage even when publication is rejected or transport disconnects.
- Removing a participant or deleting/archiving its meeting must use the same admission/operation coordination, not strand queued work or permit late resurrection. Document these transition outcomes before implementing them; preserve read-only ended/archived behavior.

### Inference and stream protocol

- Use one application execution pipeline for streaming and non-streaming requests. Streaming is observation of the operation, not a separate implementation of domain behavior.
- Send correlated tool-call events before execution, then corresponding result/error events. Append matching tool results to the model context and continue a bounded inference loop. Deduplicate persisted log-disagreement/log-consensus effects by operation and call identity.
- Assign every stream event an operation ID, meeting ID, and ordered event identity. Tool events also carry unique call IDs. Validate the contract and preserve IDs through persistence and frontend reconciliation.
- Emit completion only after the required final state/message is committed. EOF without a terminal outcome is an interrupted observation, not proof that inference failed or succeeded.
- Provide operation status/result reconciliation independently of the stream. Reconnect to observation or refetch status; do not resubmit generation. Define bounded replay or snapshot reconciliation explicitly rather than promising unlimited token-event retention.
- Browser navigation aborts/detaches observation and clears only the matching local buffer. It does not silently cancel an accepted queue entry or restart it on remount. An explicit pending-turn cancellation is a separate command.
- These commit guarantees describe live execution. Demo events are pre-recorded, labelled replay, and reconciled through the same event/rendering contracts without submitting commands or claiming new persistence. Missing replay data fails closed; no provider or successful no-op commit fallback.

### Closing and accounting

- Requesting end atomically closes admission, cancels queued turns, and records one closing operation. Let the executing turn reach a committed terminal outcome before voting/summary. Coordinate end/message/claim races through database guards.
- Preserve the applicable normal vote and force-end behavior. A rejected vote returns the meeting to active admission; already cancelled turns stay cancelled. Force-end skips voting, not the running-turn drain or persistence guards.
- Distinguish meeting lifecycle from closing-operation stages such as draining, voting, summarizing, failed, and completed. Do not leave an unexplained permanent voting state. Map existing statuses deliberately during migration.
- Persist completed votes/summary checkpoints so persistence retries do not needlessly regenerate paid output. Commit the final summary and ended transition atomically and only once. On failure, expose a recoverable operation with an explicit retry or abort-to-active path, not implicit duplicate inference.
- If a running turn stalls or becomes uncertain, surface its interrupted/recovery state; do not wait indefinitely or claim the closing summary includes uncommitted output. Define configurable deadlines and explicit recovery actions.
- Account for every actual provider attempt in turns, follow-ups, voting, summaries, rejected votes, and later persistence failures. Use stable attempt IDs and distinguish reported usage, estimates, and unknown usage; aggregate counters must not double-count retries. Keep zero-priced local-provider behavior explicit.
- Preserve the distinction between ended and archived. Archive/unarchive must not implicitly reopen an ended meeting or bypass operation coordination; retain the underlying lifecycle when representing archive state.
- Votes and System AI summaries require the initiating visitor's applicable live credentials. Missing material pauses the existing closing checkpoint for re-provision, not re-voting or summary regeneration. Replay displays fixed votes/summary without a live closing operation, usage entry, or status mutation.

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
- Hosted live embedding/search credentials follow transient handoff and same-job recovery; never persist them with source bytes/jobs or substitute operator keys. Demo sources/passages/tool results are pre-recorded and read-only: no uploads, ingestion, live vector/search/embedding calls, or evidence writes.

## Frontend ownership and contracts

| State or responsibility | Owner |
| --- | --- |
| Meetings, messages, participants, persona history, stacks/documents, summaries, settings metadata, queue/operation records | TanStack Query, keyed by runtime mode, workspace/package version, resource identity, and relevant parameters |
| Form input, prompt edits, temporary validation, upload selection | React component/feature-local state; protect draft edit versions during saves |
| Selected UI panels, cross-component presentation preferences, active observation references, provisional streamed tokens/tool activity | Focused Zustand stores/controllers scoped to meeting and operation identity |
| Authoritative generation defaults and System AI configuration | Backend settings contract; cached as server state, edited through validated mutations |
| HTTP requests, DTO decoding, errors, AbortSignal, multipart upload, stream parsing | Shared typed transport; validated runtime binding and narrowly scoped live credential handoff, no visitor-auth session or infrastructure secrets |
| Encrypted credentials and unlocked material | Versioned encrypted-only localStorage envelope; separate non-persisted credential capability for unlocked keys/material, never Query/Zustand persistence |
| Tutorial cursor/guide and replay projections | Ephemeral guide state and projections from a fixed package through shared read/event/reconciliation contracts; no durable progress or duplicate domain engine |

- Organize business features around Meetings, Persona Catalog, Knowledge, and Settings. Demo owns only guidance/script/cursor composition over those real features and the shared core, not parallel meeting screens or policies. Keep routes thin.
- Feature modules expose intentional public interfaces. Do not import another feature's private store/component internals or hide business logic in generic shared helpers.
- Keep shared transport, generated API types, query-key conventions, UI primitives, and composition separate from feature behavior. Avoid an all-purpose API/store file that becomes a new monolith.
- Establish one canonical owner for each server record. Do not mirror full meetings/messages into Zustand. Provisional streaming output is explicitly temporary and reconciles by operation/message identity when canonical data arrives.
- Use runtime/workspace/package- and identity-scoped query keys, observation buffers, and mutation invalidation. A late A response cannot change selected B, and replay/live contexts cannot contaminate each other's cache. Switching context detaches old observation without resubmitting commands. Propagate abort; it is not a substitute for identity guards.
- Configure mutation retries deliberately. No automatic replay of paid generation, end commands, or uploads without a proven idempotent command contract. Query refetch/reconnect must not trigger a command.
- Separate command submission from operation observation. Queue cancellation, navigation detach, and interrupted stream recovery have distinct behavior. Render waiting turns and pending uploads honestly after remount.
- Prevent stale refetches from regressing newly committed records, using canonical ordering/revisions and reconciliation rules. Tool activity matches call IDs, not tool names, and is not duplicated after final refetch.
- Persist justified preferences and the separately encrypted credential envelope only, with explicit migration/hydration. Never persist active stream flags, server initialization gates, raw credentials, passphrase/derived key, canonical records, or tutorial progress. React Server Components must not share mutable client stores or secret capabilities across requests.
- Hosted/local replay requires neither sign-in nor vault unlock and cannot issue uploads/mutations/live calls. Hosted live asks for its own required service keys, unlocks locally, and uses narrow transient handoff; no server-secret disclosure or operator fallback. Do not add an Auth SDK/boundary. Server-side runtime, workflow/resource/destination/private-knowledge guards cannot be disabled by browser state.

## API, schema, and migration policy

- Publish a use-case/contract inventory before changing routes. Cover persona CRUD/history, meeting creation/participants/messages, submit/status/observe/cancel turn, end/status/retry/abort close, document upload/status/delete/search, settings, and existing reporting/archive behavior.
- Include server-bound replay reads/package validation, explicit rejection of replay writes/live effects, credential-required/re-provision outcomes, private transient handoff, and cache/runtime identity. Do not put plaintext keys into ordinary response/generated record DTOs or public settings; a dedicated transient credential request is a separate sensitive boundary.
- Define command request keys, operation receipts, stable error categories, resource revisions/order, stream events, and final result shapes. Generate or validate frontend types against the backend contract; handwritten divergent DTO copies are not the long-term boundary.
- Breaking changes may ship as coordinated frontend/backend slices. Declare deployment order, compatibility window or maintenance requirement, migration/backfill steps, and rollback limitations. Do not leave two independent writers to the same workflow.
- Use additive schema changes first, validate/backfill on a disposable copy, then cut over and remove legacy paths only after acceptance. Do not drop columns or data simply because new classes no longer read them.
- For existing participant configuration, preserve recorded explicit values. Treat empty/default markers according to a documented migration rule; do not reinterpret meaningful values silently. Unknown historical stack assignments/settings remain explicitly unknown unless evidence supports a reconstruction.
- For existing documents and summaries, preserve recognizable records and mark missing revision/source metadata honestly. Do not present fabricated audit history or recreate intentionally deleted data.
- Test both an empty installation and an upgrade from the Phase 1 schema/data. Back up before real migration; rehearse restore and forward recovery for irreversible redaction/deletion instead of promising unsafe rollback.

## Target file structure and restructuring plan

These are target ownership locations, not directories to scaffold in advance or a claim that they already contain working implementations. Keep the repository's `backend/`, `frontend/`, and `specs/` roots. Keep existing page URLs, backend startup compatibility, and migration history unless an accepted API/deployment change explicitly replaces them. Python package initializer files are omitted from the trees for readability.

Create a file when its first tested behavior moves into it. The named boundaries and responsibilities are required; split a growing file by use case when justified, rather than creating empty layers, generic base repositories, or one interface per function. Record any justified path adjustment and update its import checks in the same change.

### Backend target layout

```text
backend/
  main.py                         # Thin ASGI entry point; preserve the existing startup command
  worker.py                       # Optional separate entry point using the same composition root
  app/
    bootstrap.py                  # Constructs adapters, use cases, routes, and registered worker handlers
    presentation/
      router.py                   # Assembles module routers with server-bound live/replay guards
      dependencies.py             # Injected use cases/runtime context; no client-controlled privilege switch
      errors.py                   # Maps typed application failures to safe HTTP responses
      sse.py                      # SSE framing/heartbeats; no inference or meeting policy
      settings.py                 # Settings HTTP boundary, including request/response schemas
    modules/
      meetings/
        public.py                 # Deliberate application interface for other modules
        domain/
          models.py               # Data-focused meeting, participant, operation, and usage representations
          services.py             # Admission, lifecycle, voting, and participant invariants
          errors.py               # Typed business failures without HTTP dependencies
        application/
          commands.py             # Create/update, messages, submit/cancel, archive, and deletion commands
          queries.py              # Meeting, history, operation, summary, and reporting reads
          ports.py                # Narrow persistence and external capability requirements
          contracts.py            # Transport-independent operation receipts and event payloads
          turns.py                # Claim, capture context/settings, execute, and publish a turn
          closing.py              # Drain, vote, summarize, checkpoint, retry/abort, and final commit
          context.py              # Base/persona prompt assembly and conversation-budget policy
          tools.py                # Meeting-aware tool validation, dispatch, and communication effects
        infrastructure/
          supabase.py             # SQL mappings, repositories, atomic RPCs, operation/event persistence
        presentation/
          http.py                 # Meeting/participant/message/turn/closing/archive/reporting routes
          schemas.py              # HTTP DTO validation and mapping; not domain models
      persona_catalog/
        public.py                 # Coherent template snapshot and catalog use-case interface
        domain/
          models.py               # Templates, prompt revisions, and explicit/inherited generation policies
          services.py             # Template validation and active-prompt rules
        application/
          commands.py             # Template edits, prompt activation, and assignment replacement
          queries.py              # Catalog/history reads and coherent creation snapshots
          ports.py                # Catalog persistence and referenced-stack validation contracts
        infrastructure/
          supabase.py             # Catalog mappings and transactional persistence
        presentation/
          http.py                 # Persona and prompt-history routes
          schemas.py              # Catalog HTTP DTOs
      knowledge/
        public.py                 # Stack validation, eligible retrieval, and cleanup/redaction interface
        domain/
          models.py               # Stacks, document revisions, eligibility, and source-linked evidence
          services.py             # Publication, retrieval-scope, revocation, and deletion rules
        application/
          commands.py             # Stack/document commands and durable operation admission
          queries.py              # Stack/document/status reads
          ports.py                # Source, parser, embedding, vector, job, and evidence requirements
          ingestion.py            # Recoverable extraction/indexing and readiness publication
          retrieval.py            # Resolve scopes, search, revalidate, and record source-linked evidence
          deletion.py             # Tombstones, passage redaction, parent cleanup, and reconciliation
        infrastructure/
          supabase.py             # Metadata, evidence, durable jobs, and transactional state changes
          qdrant.py               # Derived vector projection, search, and idempotent cleanup
          parsers.py              # Supported document extraction and format-specific bounds
          source_store.py         # Only the adapter selected by the original-byte decision gate
        presentation/
          http.py                 # Stack/document/upload/status/search routes
          schemas.py              # Knowledge HTTP DTOs and pending/ready responses
    capabilities/
      inference/
        contracts.py              # Provider/embedding ports and normalized invocation/tool/usage types
        loop.py                   # Shared bounded inference loop with injected tool execution
        usage.py                  # Pricing/usage calculations; durable ownership stays with the operation
      configuration/
        contracts.py              # Settings policies and non-secret effective settings values
        ports.py                  # Non-secret settings and transient credential-availability contracts
        service.py                # Defaults/override resolution and System AI configuration
      runtime/
        ports.py                  # Claim/checkpoint/clock/handler requirements without SDK imports
        runner.py                 # Bounded supervision and recovery through registered handlers/ports
    platform/
      config.py                   # Process/environment configuration and trusted integration validation
      database.py                 # Supabase client lifecycle; no user-session mutation of shared clients
      qdrant.py                   # Qdrant client lifecycle, not retrieval policy
      configuration.py           # Non-secret settings/local policy and trusted provider origins
      runtime.py                 # Server-controlled mode/workspace binding and write/effect guards
      credentials.py             # Selected bounded transient handoff; no durable secret store/global client mutation
      providers/
        ollama.py
        openrouter.py
        gemini.py
        embeddings.py            # Configured embedding adapters, including query/document mode
    replay/
      contracts.py               # Fixed manifest/read/event contracts, no second lifecycle engine
      package.py                 # Version/schema/asset validation of preprovisioned production package
      reader.py                  # Dedicated read-only source; no live fallback or successful no-op writes
  replay-data/                    # Reproducibly provisioned, versioned production manifest/assets; not tests
  migrations/                     # Existing ordered SQL history plus additive Phase 2 migrations
  tests/
    architecture/                 # Dependency direction, public interfaces, and SDK-free import checks
    unit/                         # Domain/capability rules, grouped by owning module
    application/                  # Workflow tests using injected fakes and deterministic barriers
    contract/                     # Shared repository/provider/source-store adapter contracts
    api/                          # Actual no-sign-in HTTP/SSE, workflow/resource guards, and transport
    integration/                  # Disposable Postgres/Qdrant/source-store and restart/migration tests
    regression/                   # Phase 1 cases retained through migration
    doubles/                      # Test-only providers, stores, clocks, and controlled transports
```

Backend placement and import rules:

- `modules/*/domain` contains data models and explicit business services, not active-record models. It imports neither its application/presentation/infrastructure layer nor SDKs or the composition root.
- Module application code may use its domain, focused capability contracts, and another module's deliberate `public.py` interface. `public.py` exposes application contracts/use cases, not raw repositories, HTTP schemas, concrete clients, or eager SDK construction. Keep cross-module dependencies directional; avoid reciprocal service-locator imports.
- `capabilities/` is supporting application code, not a fourth business domain or a general shared-utilities bucket. Its inference loop accepts injected tools; it does not decide meeting admission, read persona tables, or select private knowledge scopes. Its runtime accepts registered handlers; it does not import module route handlers or embed their policies.
- `platform/` and module `infrastructure/` contain concrete integrations. Shared client construction belongs in `platform/`; module-specific SQL/vector mappings belong with their owner. Meeting operations/events and knowledge jobs have one durable owner each, not competing generic and module stores.
- `bootstrap.py` is the composition root. HTTP and optional worker entry points use it; domain/application imports never reach back into it. A separate worker process is optional, but an in-process runner must still use durable claims and the same tested recovery rules.
- Compose replay read/event sources and rejecting write/effect ports over the same core/read/reconciliation contracts. `replay/` validates/reads recorded data; it cannot import a live provider fallback, fork domain policy, or pretend a no-op commit succeeded. Production replay assets are not test doubles. Live worker secrets use the selected transient capability, never database/job fields.
- Generation policies are resolved through the configuration capability; HTTP settings DTOs are not imported into domain models. Keep domain snapshots data-focused and map them to capability input/output values at the application boundary.
- Cross-source deletion orchestration belongs in Knowledge through explicit evidence/cleanup ports. Meetings requests the required cleanup through that public interface; neither module silently edits the other's raw tables. Necessary cross-table SQL atomicity remains confined to reviewed persistence operations.
- Keep SQL migrations in one ordered history. Do not scatter copied schema definitions across modules, edit already-applied migrations as an upgrade strategy, or introduce an alternative database/process-local production store as a substitute for the required Supabase contracts. Only implement the selected source-store adapter unless a second adapter is explicitly justified.

### Frontend target layout

```text
frontend/
  src/
    app/
      layout.tsx                  # Existing route shell and server/client composition boundary
      providers.tsx               # Runtime-scoped Query/UI/vault composition; no visitor auth bootstrap
      page.tsx                    # Existing home route; composes feature public interfaces
      meetings/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      roster/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      knowledge-stacks/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      settings/page.tsx
    features/
      meetings/
        index.ts                  # Intentional public components/hooks, not every private file
        api/
          client.ts               # Meeting commands/queries through shared no-sign-in transport
          keys.ts                 # Runtime/workspace/package- and resource-scoped query keys
          queries.ts              # TanStack Query reads and canonical server-state ownership
          mutations.ts            # Command submission and deliberate cache reconciliation/invalidation
        components/
          MeetingRoom.tsx
          MessageList.tsx
          MessageComposer.tsx
          ParticipantRoster.tsx
          TurnQueue.tsx
          ClosingPanel.tsx
        hooks/
          useMeetingCreation.ts   # Retains created ID and coordinates upload outcomes
          useTurnObservation.ts   # Observe/reconcile an accepted operation, never implicit submission
          useClosingObservation.ts
        model/
          events.ts               # Feature event narrowing/validation using the shared API contract
          reconcile.ts            # Ordered provisional-to-canonical reconciliation rules
        state/
          meetingUiStore.ts       # Selected panels and presentation state only
          operationStore.ts       # Scoped provisional buffers/observation state, not meeting records
      persona-catalog/
        index.ts
        api/                      # client.ts, keys.ts, queries.ts, mutations.ts for catalog operations
        components/
          PersonaList.tsx
          PersonaEditor.tsx
          PromptHistory.tsx
        hooks/usePersonaEditor.ts # Draft versions and save workflow; canonical history stays in Query
      knowledge/
        index.ts
        api/                      # client.ts, keys.ts, queries.ts, mutations.ts for knowledge operations
        components/
          StackList.tsx
          StackEditor.tsx
          DocumentPanel.tsx
          UploadProgress.tsx
        hooks/useDocumentUpload.ts # Same pending operation, bounded retries, per-file outcomes
      settings/
        index.ts
        api/                      # client.ts, keys.ts, queries.ts, mutations.ts for backend settings
        components/
          SettingsScreen.tsx
          ProviderCard.tsx
          SystemAiCard.tsx
          CredentialVault.tsx     # Local unlock/lock/forget/change; no saved passphrase or derived key
      demo/
        index.ts                  # Guide entry over actual business screens, not a duplicate app
        components/TutorialGuide.tsx
        model/script.ts           # Validated fixed steps and real-control targets
        hooks/useReplay.ts        # User-paced recorded events through shared core/reconciliation
        state/replayStore.ts      # Ephemeral cursor/guide state only; no durable progress
    shared/
      api/
        generated.ts              # Reproducible types from the accepted backend API contract
        transport.ts              # Runtime-aware JSON/multipart/status; narrow transient live credential handoff
        errors.ts                 # Safe typed failures, not raw provider exceptions
        sse.ts                    # Reusable framing/decoding; no meeting state or automatic commands
      runtime/
        contracts.ts              # Live/replay context, workspace/package identity, read/event interfaces
        context.tsx               # Composition input, not an authority to bypass server guards
      credentials/
        envelope.ts               # Versioned authenticated-encryption envelope and bounded validation
        vault.ts                  # Browser crypto/storage adapter; encrypted localStorage only
        memory.ts                 # Non-persisted unlocked capability, lock/revocation lifecycle
      layout/                     # Reusable shell/sidebar; business panels remain feature-owned
      state/preferencesStore.ts   # Justified cross-feature UI preferences with versioned hydration
      lib/utils.ts                # Small framework-neutral helpers, not business workflow functions
    components/ui/                # Retain existing stable primitive path; no business/data ownership
  tests/
    architecture/                 # Feature-private imports, layer direction, and ownership checks
    integration/                  # Routes/features, actual event contracts, navigation and recovery
    fixtures/                     # Generated-contract samples and deterministic HTTP/SSE transports
    setup.ts                      # Component/query harness and test isolation
```

Frontend placement and import rules:

- Preserve existing URLs. Route files select route parameters and compose exported feature screens/hooks; they do not regain persistence, raw fetch/SSE parsing, or inference orchestration. Keep server/client boundaries explicit rather than marking the entire route tree client-only.
- Every feature `api/` uses the four files shown under Meetings. Query key factories and canonical records stay with their owning feature; query keys are not duplicated in a global registry. The shared transport knows neither feature stores nor query keys.
- `queries.ts` and `mutations.ts` own server-state integration. `hooks/` coordinates screen workflows, and `model/` holds pure reconciliation only where needed. Do not introduce a separate frontend DDD entity/repository layer for ordinary API records.
- Meetings owns participant instances, conversation, turn queues, and closing UI. Persona Catalog owns templates/history. Knowledge owns document/stack/upload UI and its query keys. A meeting screen consumes the exported `DocumentPanel` or upload hook through `features/knowledge/index.ts`, not Knowledge's private API/cache/store files.
- `features/*/index.ts` is a curated interface, not a wildcard barrel. Shared code and primitives cannot import features; a feature may consume another feature's public interface only in a documented direction. Compose reciprocal workflows in the route/provider layer instead of creating cyclic feature dependencies.
- Zustand stores under `features/meetings/state/` contain only UI/observation state. Never relocate the old full `meetingStore` unchanged into that directory. Settings data belongs in Settings Query state; cross-feature presentation preferences may persist in `shared/state/preferencesStore.ts` without credentials or server records.
- Shared credential code owns encryption/storage/unlocked capability and imports no feature stores; Settings owns its UI. The passphrase/derived key never persists. Demo owns guidance and ephemeral cursor only; reuse business screens and pure core/reconciliation through public interfaces. Query keys distinguish runtime/workspace/package; no live credential use in replay.
- No visitor authentication SDK, session bootstrap, login route, or Auth boundary is required or added by this plan. The browser must not query application tables directly or import server/service-role credentials; it does not construct provider, embedding, vector-store, or backend data clients. Compose observation/cache cleanup through explicit interfaces rather than Shared importing private feature stores; cleanup remains resource/operation-scoped, not account-scoped.
- Colocate pure, hook, store, and component tests as `*.test.ts` or `*.test.tsx` beside their feature files. Keep cross-feature/route/transport tests in `frontend/tests/integration/`; synthetic fixtures stay in `frontend/tests/fixtures/`. Production modules never import tests/doubles. Validated production replay packages are explicit runtime assets, not a loophole for test-fixture imports or canned live history.
- Retain existing assets, global styles, and framework configuration in their appropriate current locations. Do not move stable UI primitives or rename URLs just to make the trees symmetrical. Generate `shared/api/generated.ts` reproducibly and test drift against backend contracts.

### Current-to-target file ownership

These are responsibility splits, not mechanical whole-file renames. Confirm callers and run Phase 1 characterization/regression tests before retiring a source file.

| Current source | Target responsibility split |
| --- | --- |
| `backend/main.py`, `backend/app/api/__init__.py` | Keep the thin entry point; assemble dependencies in `backend/app/bootstrap.py` and routes in `backend/app/presentation/router.py`. |
| `backend/app/api/meetings.py`, `backend/app/api/participants.py`, `backend/app/services/meeting_manager.py` | Meetings presentation DTOs/routes, application commands/queries/closing, domain services, and Supabase persistence. Do not move mixed route logic into a single new manager. |
| `backend/app/services/orchestrator.py` | Meetings `application/turns.py`, `context.py`, and `tools.py`; reusable loop/usage contracts under `capabilities/inference/`; runner supervision under `capabilities/runtime/`. |
| `backend/app/services/tools.py`, `backend/app/services/prompts.py` | Tool dispatch/schema responsibilities into Meetings application/capability contracts; base/persona context assembly into Meetings `application/context.py`. Preserve intentional catalog seed/template definitions under Persona Catalog ownership rather than mixing them into runtime transport code. |
| `backend/app/api/personas.py`, `backend/app/services/persona_manager.py` | Persona Catalog presentation, commands/queries, domain rules, and transactional adapter. |
| `backend/app/api/documents.py`, `backend/app/api/knowledge_stacks.py` | Knowledge HTTP DTOs/routes and separate admission, ingestion, retrieval, and deletion use cases. |
| `backend/app/services/document_processor.py`, `backend/app/services/vector_store.py`, `backend/app/services/embedding.py` | Knowledge parsers/vector projection, application publication/retrieval policy, and configured embedding adapters under `platform/providers/embeddings.py`. |
| `backend/app/core/config.py`, `backend/app/core/database.py`, `backend/app/core/qdrant.py`, `backend/app/llm/` | Platform configuration/client/provider adapters plus transport-independent inference contracts. Constructors are wired only from the composition root. |
| `backend/app/api/settings.py`, `backend/app/models/settings_schemas.py`, `backend/app/services/streaming.py` | Shared settings HTTP boundary, configuration capability/adapter, and presentation-only SSE encoding. Provider completion must not be interpreted as application completion by the encoder. |
| Other `backend/app/models/*schemas.py` | Separate module presentation DTOs from domain data and application contracts. Do not alias HTTP schemas as domain models to avoid the mapping work. |
| `frontend/src/lib/api.ts` | Shared transport/error/SSE/generated types plus feature-local clients, query keys, queries, and mutations. |
| `frontend/src/stores/meetingStore.ts` | Meetings Query data, command mutations, observation hooks/reconciliation, and UI-only stores. Delete duplicate canonical writers only after the migrated callers pass. |
| `frontend/src/stores/settings-store.ts`, `frontend/src/stores/rateLimitStore.ts` | Non-secret server settings into Query; encrypted vault/unlocked capability into Shared credentials; justified UI preferences into Shared state. Migrate old plaintext keys safely. Local cooldown remains non-authoritative. |
| `frontend/src/components/chat/` | Meeting conversation/participant/closing components into Meetings; shared-document behavior into Knowledge's exported `DocumentPanel`. Preserve real citations and tool activity without retaining fabricated runtime records. |
| `frontend/src/components/settings/`, `frontend/src/components/layout/`, route `page.tsx` files | Settings components into their feature, generic shell into Shared layout, business panels into their owner, and route files into thin composition. Retain `frontend/src/components/ui/`. |

`backend/app/api/`, `backend/app/services/`, the old all-purpose model/client/store files, and any compatibility imports disappear only after their last real caller has migrated and the removal gate passes. Inspect actual source/imports, not just directory names or leftover `__pycache__` files, when assessing progress. Do not overwrite unrelated files or assume similarly named leftovers implement this target.

### File migration sequence and proof

- **Baseline and executable architecture contracts:** Inventory real source files/callers; adopt the target boundaries above; write failing import/SDK-isolation checks. Do not create the entire tree or relocate all tests first.
- **Backend composition and atomic persistence seams:** Introduce `bootstrap.py`, presentation assembly, the first module ports/adapters, and real atomic persistence. Switch one supported use case through the entry point; retain other working routes until their own slice migrates.
- **Frontend transport and state foundation:** Introduce `app/providers.tsx`, Shared no-sign-in transport, and the first feature's API/query ownership. Move its components and callers together; a compatibility wrapper must delegate rather than create another writer.
- Extract the Phase 1 vault into Shared credentials with real-browser crypto tests; introduce runtime-scoped cache/read/event contracts. Preserve the no-write replay guard while leaving complete tutorial delivery to Spec 10.
- **Persona catalog and independent participants:** Populate Persona Catalog and the participant-creation/configuration seams in Meetings; migrate roster/history/settings callers and their tests without changing existing URLs.
- **Durable turn queue and unified inference:** Split the orchestrator into Meetings workflows and injected capabilities. Migrate turn HTTP/observation, meeting components, reconciliation, and UI stores as one accepted slice.
- **Coordinated closing, summaries, and usage:** Move closing policy/workflow/persistence and its feature UI together; remove the old route-level implementation only after failure and replay tests pass through the new path.
- **Durable knowledge and deletion-aware evidence:** Populate Knowledge infrastructure/use cases and the selected source-store adapter; move document/stack/upload UI and all affected parent-deletion callers together.
- **Guided replay and complete feature migration:** Deliver the fixed, user-paced guide over actual UI/core with dedicated no-write/read-only sources and no live fallback. Verify remaining settings/reporting/archive/shared-shell callers, remove obsolete imports/writers, and rerun Phase 1 contracts. Preserve regression discovery/assertions and distinguish production replay assets from synthetic tests.
- **Upgrade rehearsal, cutover, and architecture acceptance:** Verify fresh checkout/build/startup, package imports, generated-contract reproducibility, migrations, and optional worker entry against the final layout. Runtime code must not import the old branch, local caches, or test packages, or require unreproducible generated artifacts/source assets found only in the author's ignored files. Provision legitimate document bytes through the explicitly configured source store instead.

## Implementation sequence

The [roadmap](roadmap-phase-2-domain-architecture-and-frontend-resilience.md) links separate implementation specs. Their prerequisites, red tests, examples, deliverables, and exit gates replace the former inline phase outlines. This reference supplies shared contracts and target ownership, not permission to implement all phases in one change.

## Shared fixture and acceptance matrix

Reuse Phase 1 contracts such as `meetings_ab`, `persona_instances`, `provider_script`, `deferred_requests`, `stream_variants`, `indexed_parent`, and `ingestion_recovery`. Extend them rather than replacing their assertions with easier fakes.

| Fixture/contract | Essential acceptance |
| --- | --- |
| `module_boundaries` | Domain/application modules load without SDK construction; forbidden infrastructure/cross-feature imports fail checks. Target entry points/public interfaces resolve; production imports never reach tests or legacy compatibility writers after removal. |
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
| `runtime_modes` | Fresh visitors see only dedicated fixed replay data without sign-in or credentials; forged IDs/direct writes cannot reach demo/live mutation or live effects. Test live shared records separately with hosted BYOK and explicit local configuration; database/private-scope/resource guards remain enforced. |
| `browser_vault` / `credential_handoff` | Actual browser encryption/locked reload/failure/migration; never persist passphrase/derived key/plaintext. Two visitors' transient keys remain isolated; expired/lost credentials pause the same operation, no operator fallback or paid-step duplication. |
| `strict_replay` | Actual UI/core/read/event contracts, explicit user pacing/back/restart, valid provisioned package, no sign-in/credentials/live calls or application writes to any store. Missing assets fail closed; recorded completion is not live persistence. |
| `frontend_ownership` | Server records have one owner; provisional buffers reconcile once; stale completions cannot clear newer operations; draft edit versions and pending-upload identity survive the required failure paths. |

## Completion criteria

- Every implementation phase has executed red-green-refactor evidence and its exit gate passes; Phase 1 regressions remain green.
- Domain/application services own the documented rules; adapters and routes cannot bypass the transactional invariants. Boundary tests protect this separation.
- Participant snapshots, per-turn inheritance, queue ordering, message boundaries, closing, accounting, live knowledge, deletion, and evidence redaction match the confirmed decisions.
- Supabase remains the authoritative application store and Qdrant the vector projection. Original bytes have an explicitly selected, tested durable store; backup/restore covers bytes rather than metadata alone.
- Frontend state follows the ownership table, with explicit command/observation separation, operation-scoped cleanup, canonical cache reconciliation, and no duplicate server-data stores.
- The target file structure is populated by accepted behavior, not empty scaffolding. Current-to-target caller migration is complete, public interfaces/import checks pass, and obsolete mixed-layer writers are removed without changing required URLs or losing regression coverage.
- Fresh installation, upgrade, hosted/local dedicated no-sign-in strict replay, encrypted browser BYOK/transient handoff, trusted local Ollama, worker interruption/credential loss, provider/cleanup failure, and coordinated deployment are exercised without required paid inference. No account or Auth bootstrap is an acceptance prerequisite. Prove no-write/no-live-effect replay and same-UI/core reuse, not merely a working replay page.
- Real-provider smoke tests, if desired, remain separately opt-in. Record supported dependency versions and actual test/build/type/lint results; do not present source inspection or a successful build as proof of lifecycle correctness.

## Documentation references

These references inform adapter/state choices, not a requirement to copy example architectures or add a framework:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions): narrow transactional operations and execution permissions.
- [Supabase Storage](https://supabase.com/docs/guides/storage): candidate original-file adapter; selection remains the decision gate above.
- [TanStack Query: server state versus client state](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state): why backend records and UI state have different owners.
- [TanStack Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): propagate cancellation through transport rather than assuming a cache cancels external effects.
- [Zustand with Next.js](https://zustand.docs.pmnd.rs/guides/nextjs): store scope and server/client boundaries.
