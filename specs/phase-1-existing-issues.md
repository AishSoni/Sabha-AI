# Phase 1: Fixing Existing Project Issues

## Purpose and review boundaries

Record the code review findings, likely fixes, and concrete regression tests so each issue can be addressed independently.

### Constraints that every fix must preserve

- **One shared workspace, not user-scoped data.** Authentication controls entry. Approved accounts access the same meetings, personas, documents, and knowledge stacks. Do not add tenant isolation or per-user ownership filters to resolve this review.
- **Local development remains usable without login.** Any authentication changes must retain an explicit development-only local mode, restricted to a trusted loopback deployment. An exposed deployment must not silently fall back to that mode.
- **Existing local integrations remain functional.** In particular, do not fix SSRF by indiscriminately prohibiting the intentionally configured local Ollama service.
- **Agent knowledge boundaries still apply.** Shared human access does not mean every AI participant may search every persona's private knowledge stacks.
- **Persona templates and meeting participants have separate lifecycles.** Later template edits must not silently rewrite an existing participant's identity, prompt, generation settings, or knowledge-stack assignments. Document-content versioning is a separate decision; freezing stack IDs alone does not freeze their contents.
- Do not overwrite existing data, credentials, or configuration as part of a fix. Test schema/permission changes against disposable databases first.

## Mandatory implementation method: TDD

Every remediation in this specification must follow test-driven development. The fixture contracts and acceptance cases below are requirements for executable tests, not a substitute for them.

- **Red:** Before changing production code, add the smallest regression test that demonstrates the issue and run it. Verify that it fails for the intended behavioral reason, not because of broken setup or an unavailable service.
- **Green:** Implement the smallest safe fix that makes that test pass. Cover the relevant guards, failure paths, and local-compatibility constraints; use disposable resources and synthetic credentials.
- **Refactor:** Improve the implementation only while the new regression and existing relevant tests remain green. Do not weaken assertions or delete valid coverage to accommodate a regression.
- Add deterministic concurrency, integration, migration, and component tests where unit fakes cannot establish the required property. Database atomicity and vector-store compatibility cannot be established by mocked repositories alone.
- For operational risks that are not reproduced incidents, first test the stated guard or failure mechanism. Do not manufacture performance results or claim an incident was reproduced merely because a synthetic test exists.
- Run the focused tests after each change and the relevant broader suite before completing the fix. Record the failing-before and passing-after commands/results, limitations, and any intentionally unexecuted integration checks. Never describe proposed tests as passing.
- Existing passing characterization tests protect supported behavior but do not replace a new failing regression for the behavior being corrected. A justified skipped or quarantined test must remain visible and cannot count as acceptance.

## Findings overview

| Area | Priority | Issue |
| --- | --- | --- |
| Backend | Exposure-dependent critical | No authentication gate; unrestricted direct database policies |
| Backend | High when exposed | Caller-controlled Ollama URLs enable server-side requests |
| Backend | High | Database status constraint rejects meeting ending |
| Backend | High | Tool results are never returned to the model |
| Backend | High | Persona-backed knowledge search calls an undefined dependency |
| Backend | Medium | Optional search stack IDs cause a null-iteration crash |
| Backend | Medium | Meeting creation drops persona generation configuration |
| Backend | Medium | Summary failure strands a meeting in voting state |
| Backend | Medium | Closed meetings remain writable through the API |
| Backend | Medium | Ingestion can recreate vectors after document deletion |
| Backend | High | Persona knowledge-stack edits are silently ignored |
| Backend | High on incompatible dependency versions | Allowed Qdrant versions remove the search method in use |
| Backend | Medium | Prompt activation and creation can lose the active selection |
| Backend | Medium | Parent deletion leaves indexed content behind |
| Backend | Medium under concurrent uploads | First uploads race when creating a collection |
| Backend | Medium | Persona subtitles exceed the participant role limit |
| Backend | Medium for paid providers | Voting and summary inference bypass cost accounting |
| Backend | Medium | Accepted legacy Excel files cannot be parsed |
| Backend | Medium for Cohere retrieval | Query embeddings use document mode |
| Backend | Medium, partly masked by other bugs | Existing participants follow mutable persona knowledge assignments |
| Frontend | High | Stale asynchronous work corrupts selected-meeting state |
| Frontend | High | Summary UI presents fabricated conclusions |
| Frontend | Medium | Provider settings are disconnected from generation |
| Frontend | Medium | Incomplete streams can leave the interface permanently busy |
| Frontend | Medium | Message submission can discard unsent or newly typed drafts |
| Frontend | Medium | Persisted initialization prevents server metadata refresh |
| Frontend | Medium | Retrying failed document uploads creates duplicate meetings |
| Frontend | Medium | Prompt history retains stale active-version controls |
| Integration | Medium | Streaming drops tool-call activity events |
| Operational risk | Potential request stalls | Synchronous ingestion runs on the serving event loop |
| Operational risk | Potential resource exhaustion | Upload limits apply after reading the full file |
| Operational risk | Restart-dependent ingestion loss | In-process ingestion has no durable recovery |

## Shared test fixture definitions

These are fixture contracts for whoever implements the tests, not new application code or existing fixture files. Reset stores, storage, spies, and disposable database state between cases. Use synthetic credentials only.

| Fixture | Required contents or behavior |
| --- | --- |
| `meetings_ab` | Two distinct meetings A and B, each with a participant and a recognizable message (`A-only message`, `B-only message`). Use fixed valid UUIDs, for example `00000000-0000-4000-8000-000000000001` and `00000000-0000-4000-8000-000000000002`. Keep participant IDs distinct too. |
| `meeting_states` | Otherwise equivalent meetings in `active`, `voting`, `ended`, and `archived` states. Keep at least one participant and message in each where the operation requires them. |
| `persona_config` | A persona with an active prompt and non-default configuration: provider `gemini`, model `fixture-model`, temperature `0.2`, maximum tokens `1234`. These are test values; do not call a real model. Include a second persona with empty/default configuration. |
| `knowledge_boundaries` | A shared meeting document containing `SHARED_SENTINEL`, a stack assigned to the current persona containing `ASSIGNED_SENTINEL`, and an unassigned stack containing `UNASSIGNED_SENTINEL`. Assign unique document and stack IDs. |
| `provider_script` | A fake provider recording messages, tools, configuration, and call count. It can return a tool call with ID `call-kb-1`, then return final text `Grounded answer: SHARED_SENTINEL` only after receiving the matching tool result. Provide the equivalent scripted stream and deterministic usage values. |
| `controlled_failure` | Provider/database/vector-store fakes that fail at a selected operation. Include summary-generation failure and failure to save a summary. No real requests or paid inference. |
| `deferred_requests` | Manually controlled promises/barriers so A and B responses, messages, statistics, and stream events can complete in a chosen order. Do not use timing-dependent sleeps to reproduce races. |
| `stream_variants` | Valid text plus `done`; explicit `error`; text followed by clean EOF without a terminal event; malformed/truncated final event; and arbitrary byte chunk boundaries splitting a valid event. |
| `indexing_barrier` | Pause embedding generation after ingestion starts but before vector upsert. Allow deletion to complete, then release indexing. Record surviving vector points and SQL rows. |
| `auth_modes` | Explicit local mode and authentication-required mode. A fake verifier accepts two distinct approved identities and rejects missing, malformed, expired, and wrong-project tokens. Both approved identities access the same seeded workspace. |
| `network_spy` | A fake outbound HTTP transport plus controlled DNS resolution. Record destination requests without contacting loopback, private infrastructure, or public services. Include the explicitly configured trusted Ollama origin and unapproved origins. |
| `persisted_settings` | Browser storage containing `initialized=true`, selected preferences, and stale provider metadata. Server responses can switch production status, configured providers, and default models between loads. |
| `persona_history` | A persona with prompt version 1 active, version 2 inactive, and a nonexistent target version. Include controlled insert failures and barriers for concurrent version creation/activation. |
| `persona_instances` | A template with distinctive identity, prompt, generation settings, and stack A. Create meeting A, edit the template to distinct values and stack B, then create meeting B. Inspect persisted participant settings and collections actually searched; use a valid assignment update/repository setup if the current update-schema bug blocks the scenario. |
| `indexed_parent` | A meeting or stack with fully indexed documents, known SQL document IDs, and known vector points. No ingestion is running. The vector store can fail deletion once and then recover. |
| `collection_creation_barrier` | Two indexing jobs targeting the same initially absent collection. Hold both existence checks at the missing result, then release both create attempts. Return an already-exists response to one attempt; separately simulate unrelated failures and incompatible collection configuration. |
| `document_formats` | A genuine binary BIFF `.xls` fixture, a valid `.xlsx`, and malformed content. For size tests use a controlled/counting upload stream rather than allocating huge files; extraction fakes can simulate expanded-content limits. |
| `inference_usage` | Paid-provider fakes with deterministic usage and prices for each vote and summary. Include rejected votes, force-end, failed persistence, and repeated operation IDs. Keep Ollama zero-cost behavior as a separate case. |
| `embedding_transport` | A fake Cohere HTTP transport recording payloads for indexing and querying. Return deterministic embeddings without external requests. |
| `creation_uploads` | A create-meeting spy returning a fixed meeting ID and two independently controlled upload requests. One upload can succeed while the other fails or completes late. |
| `ingestion_recovery` | A disposable persistent job/document repository and source-file store, with explicit interruption points after upload acknowledgement, during parsing, and around vector publication. Restart only the worker/application instance, retaining persistent state. |

Use unit/component tests for deterministic branches and races. Use isolated database/API integration tests for migrations, permissions, authentication coverage, and state transitions. Any real-provider smoke test should be separate and opt-in; it is not needed to reproduce these findings.

## Backend findings

### Missing access gate and unrestricted database policies

**Evidence:** `backend/main.py:6-27`; `backend/app/api/meetings.py:39-64`; `backend/app/core/database.py:7-23`; `backend/supabase_schema.sql:132-144`.

**Issue and impact:** Application routers have no authentication gate, meeting listing is global, and the supplied RLS policies allow all operations. Global listing is correct for the shared-workspace requirement; unrestricted entry is the exposure risk. A reachable API allows unapproved callers to read/change shared data and trigger paid inference. Protecting only the frontend would leave the API and potentially the database Data API accessible.

**Fix approach:** Add a centralized backend authentication gate, using the previously discussed Supabase Auth approach rather than per-user data scoping. Cover meetings, participants, personas, knowledge stacks, documents, settings, uploads, and stream initiation. Validate tokens server-side; do not trust decoded claims without verification. Retain an explicit development-only local mode; request headers must not enable it, and exposed deployment configuration must reject it. Keep minimal health endpoints separate.

For backend-only application-table access, tighten direct database permissions and keep server credentials server-only. Inspect the existing database credential path before changing policies: the current backend may rely on the same permissive access. Do not silently replace credentials or break local access. Keep auth verification separate from the shared database client's mutable session state.

**Fixtures:** `auth_modes`, `meetings_ab`, disposable database roles/credentials, provider/network spies.

**Regression cases / acceptance:**
- In required mode, missing/invalid/expired/wrong-project tokens reject every protected route before database mutation, file processing, or provider calls. Streaming must reject before opening a successful event stream.
- Approved identity 1 and identity 2 list/read the same A and B records. Neither requires owner-specific rows or filters.
- Explicit local mode supports the existing no-token workflow. A spoofed header cannot activate it in required mode; exposed/bypass configuration fails validation.
- Direct unauthenticated application-table access cannot bypass the API gate after policy changes. Backend CRUD still works with its intended server credentials.
- Exercise uploads, settings, and streaming explicitly; do not test only meeting listing.

### Unrestricted Ollama base URLs allow SSRF

**Evidence:** `backend/app/api/settings.py:72-76`, `112-114`, `189-198`, `239-240`, `299-308` (`fetch_models`, `_fetch_ollama_models`, `test_api_key`, `_test_ollama_connection`).

**Issue and impact:** Caller-provided `base_url` values become server-side GET requests. A reachable settings API can probe destinations reachable from the backend. The appended `/api/tags` path limits the request shape; this finding does not establish unrestricted arbitrary-response extraction.

**Fix approach:** Prefer administrator-configured provider origins over arbitrary request URLs. Enforce approved schemes/origins and account for resolved addresses, redirects, and URL parser edge cases. If a configured local Ollama origin is allowed, treat it as a deliberate trusted exception, not permission to access all loopback/private destinations. Authentication alone does not validate destinations.

**Fixtures:** `network_spy`, configured `http://localhost:11434` origin, unapproved loopback/private/public origins, a hostname resolving to an unapproved address, and redirect responses.

**Regression cases / acceptance:**
- Both model discovery and connection testing reach the explicitly configured local origin successfully.
- Unapproved origins/schemes are rejected before a request is issued.
- DNS resolution or redirect handling cannot escape the allowed destination policy.
- Response/error handling does not reveal credentials or full internal response bodies.

### Schema rejects `voting` and `ended` meeting states

**Evidence:** `backend/supabase_schema.sql:15`; `backend/app/models/schemas.py:8-12`; `backend/app/api/meetings.py:222`, `357-372`. The reviewed migrations do not expand the meeting status constraint.

**Issue and impact:** The schema accepts only `active` and `archived`, whereas ending writes `voting` and `ended`. Normal ending fails on the first transition. Forced ending can incur a model call and save an ending message before the final status write fails.

**Fix approach:** Add an explicit upgrade migration and align the fresh-install schema with the application enum. Preserve existing rows and continue rejecting unknown statuses. Merely editing `CREATE TABLE IF NOT EXISTS` does not upgrade an existing table. Coordinate this with recovery from summary-generation failures, but test the schema mismatch independently.

**Fixtures:** Disposable databases for (a) a fresh installation and (b) the existing schema plus seeded active/archived meetings; deterministic yes-voting and summary providers.

**Regression cases / acceptance:**
- Fresh and upgraded databases accept all four declared states and reject an unknown state.
- A successful normal end transitions through voting to ended and persists its summary.
- A successful forced end reaches ended without a constraint failure.
- Migration preserves existing records; repeat application follows the repository's migration policy without corrupting the constraint.

### Tool execution has no follow-up inference

**Evidence:** `backend/app/services/orchestrator.py:223-267`, `325-389` (`execute_turn`, `execute_turn_streaming`).

**Issue and impact:** Each path calls the provider once, executes tools, and saves/returns without appending results for another inference. The model cannot answer from retrieved evidence. Tool-only replies become `[participant used tools: ...]` rather than useful answers.

**Fix approach:** Add a bounded inference/tool loop to both paths. Preserve assistant tool-call records and matching IDs, append tool results, and continue until final text or a defined limit/error. Aggregate usage/cost across calls and preserve auditable tool inputs/results. Streaming must expose tool activity and continue with grounded text before one application-level terminal event. Avoid duplicate tool side effects.

**Fixtures:** `provider_script`, `knowledge_boundaries`; additional scripts for two tools in one response, a tool failure, repeated tool requests, and a plain-text-only answer.

**Regression cases / acceptance:**
- Provider call 2 receives `call-kb-1` and its matching tool result; the saved final answer contains `SHARED_SENTINEL`, not a placeholder.
- Repeat for streaming; tool results precede final answer text and exactly one final application `done` event follows successful persistence.
- Plain text takes one inference. Multiple tool results retain their identities; tool failures follow an explicit controlled policy.
- Repeated tool requests terminate at the configured bound; costs cover all completed inference calls. One turn produces one intended final message, without duplicate conflict/consensus writes.

### Persona-backed knowledge search raises `NameError`

**Evidence:** `backend/app/services/orchestrator.py:5-19`, `123-154` (`_handle_tool_call`).

**Issue and impact:** The branch for participants with `persona_id` calls undefined `get_supabase()`. It executes before the search exception handler, aborting knowledge retrieval even when shared documents exist.

**Fix approach:** Import the dependency or inject a repository explicitly. Test collection selection, not only absence of the exception. Preserve shared-plus-assigned-stack access and exclude unassigned stacks. This fix is independent of the missing follow-up inference after tool execution.

**Fixtures:** `knowledge_boundaries`; participants with and without `persona_id`; fake stack-assignment repository and vector store.

**Regression cases / acceptance:**
- A persona-backed participant searches the shared and assigned collections without `NameError`.
- The unassigned stack is never queried and its sentinel is never returned.
- A participant without a persona still searches meeting documents. Empty assignments and missing collections return a controlled no-documents result.

### Omitted `stack_ids` crashes document search

**Evidence:** `backend/app/models/document_schemas.py:57-63`; `backend/app/api/documents.py:281-299` (`search_documents`).

**Issue and impact:** The optional field defaults to `None`; `getattr(request, 'stack_ids', [])` returns that existing null value. Iteration raises `TypeError`, so valid meeting-only and persona-only requests fail.

**Fix approach:** Normalize nullable values to an empty list or make the field a non-null list with a safe default, with a deliberate compatibility choice for explicitly supplied null. Keep collection-scope validation intact.

**Fixtures:** Requests containing a query with meeting-only, persona-only, stack-only, and mixed scopes; variations with omitted, null, empty, and populated `stack_ids`. Stub search results.

**Regression cases / acceptance:**
- Omitted `stack_ids` works with meeting/persona scopes; an empty list works too.
- Explicit null is either normalized or rejected as request validation, never a server error.
- Stack-only and mixed scopes select the intended collections.
- No scope returns a controlled client error; it must not search globally.

### Meeting participants lose persona generation settings

**Evidence:** `backend/app/services/meeting_manager.py:67-88`, `160-178`; `backend/app/models/schemas.py:29-44`.

**Issue and impact:** `create_meeting` copies persona identity and prompt but omits `provider_config` when constructing the participant. The defaults are persisted instead, changing provider/model/temperature silently. Participant configuration also lacks the persona token-limit option.

**Fix approach:** Copy a validated snapshot of persona generation settings when creating participants. Align supported configuration fields and propagate them into inference; do not merely store an unused token limit. Keep fallback behavior for genuinely empty configuration and existing participant rows. Define a snapshot as creation-time configuration rather than accidentally applying later persona edits to old meetings.

**Fixtures:** `persona_config`; fake database and provider recording effective model/provider/temperature/token limit.

**Regression cases / acceptance:**
- Creating a meeting from the configured persona preserves all supported settings in its persisted participant and subsequent provider call.
- Empty configuration still resolves the existing server defaults.
- Existing participant records missing newly supported optional fields still load.
- Editing the source persona afterward does not silently change an already-created participant snapshot.

### Summary failure can strand a meeting in `voting`

**Evidence:** `backend/app/api/meetings.py:215-222`, `296-304`, `314-372` (`end_meeting`).

**Issue and impact:** Once a successful end vote has changed status to voting, summary generation/persistence has no recovery path. A failure leaves voting in place; another end request, including force-end, is rejected by the active-only check. This becomes observable once the database status constraint is corrected to accept voting and ended states.

**Fix approach:** Make ending recoverable and idempotent. Use guarded state transitions and an explicit failure/retry strategy instead of leaving a partial operation. Do not hold a database transaction open across a network inference call. Coordinate summary persistence and terminal status so a failure cannot misleadingly record a completed end. Prevent duplicate endings from concurrent requests.

**Fixtures:** `meeting_states`, successful voting, `controlled_failure`, barriers coordinating two simultaneous end attempts.

**Regression cases / acceptance:**
- Summary-generation failure leaves a recoverable meeting; a later normal or forced retry can complete according to the chosen recovery policy.
- Summary-save/status-save failures do not leave an unrecoverable voting state or contradictory final records.
- A failed majority vote returns the meeting to active.
- Concurrent end requests produce at most one committed ending and one intended final summary, rather than duplicate successful endings.

### Closed meeting status is not enforced on writes

**Evidence:** `backend/app/api/meetings.py:67-87`; `backend/app/services/orchestrator.py:195-217`, `287-311`.

**Issue and impact:** Message submission and both turn paths verify existence, not active status. Direct requests can append messages or incur model costs in voting, ended, or archived meetings despite the read-only UI contract.

**Fix approach:** Enforce state guards in backend write/inference paths, with consistent client-visible errors. Coordinate with ending so a check performed before generation cannot allow a late response to modify an already-closed meeting. Preserve explicit archive/unarchive operations; this finding concerns conversational writes and inference, not banning lifecycle operations.

**Fixtures:** `meeting_states`, provider/database spies, a barrier between turn initiation and final persistence.

**Regression cases / acceptance:**
- User-message submission, non-streaming turns, and streaming turns work in active state.
- Each rejects voting/ended/archived states before inference or conversational writes.
- Force an end/turn overlap; closing cannot be followed by an unguarded late conversational write. Test the selected serialization/cancellation policy explicitly.
- Direct API calls receive the same protection even if the frontend controls are bypassed.

### Deleting an indexing document can recreate its vectors

**Evidence:** `backend/app/api/documents.py:30-65`, `235-263`, `308-329`; `backend/app/services/vector_store.py:149-173`, `223-232`.

**Issue and impact:** Deletion removes existing vectors and the SQL record but does not coordinate with ingestion. An embedding operation already in progress can upsert afterward. Search returns those orphaned payloads even when SQL enrichment finds no document, leaving deleted content searchable.

**Fix approach:** Coordinate indexing and deletion with cancellation/tombstones or another durable lifecycle mechanism. An existence check alone is insufficient if deletion can race after the check. Clean up late vector writes and prevent deleted/non-published documents from surfacing in search. Handle repeat deletion/cleanup safely.

**Fixtures:** `indexing_barrier`, a processing document, fake vector store, isolated document repository.

**Regression cases / acceptance:**
- Start indexing, pause embeddings, delete the document, release indexing, and wait for completion. No SQL record or searchable vectors remain.
- Repeat with deletion immediately before/after upsert to cover both race windows.
- Search does not return content for deleted document IDs, even if a stale vector point is injected.
- Ordinary successful indexing and deletion of an already-indexed document continue to work; repeated cleanup is safe.

### Persona knowledge-stack edits are silently ignored

**Evidence:** `backend/app/models/persona_schemas.py:36-42` (`PersonaUpdate`); `backend/app/api/personas.py:46-53`; `backend/app/services/persona_manager.py:175-185`; `frontend/src/app/roster/[id]/page.tsx:65-72`.

**Issue and impact:** The editor submits `stack_ids`, but the update schema does not declare the field. Validation drops it, and the manager's guarded assignment-update branch never runs. Saving returns success while the persona retains its previous private-stack assignments. This is distinct from whether existing meeting instances should inherit later template changes.

**Fix approach:** Declare optional stack assignments on the update model, with omitted meaning unchanged and an empty list meaning clear. Validate and deduplicate target IDs before mutation. Replace mappings atomically so invalid targets or insert failures cannot leave a half-applied update. Apply template changes only to the template; coordinate meeting-instance behavior with the separate snapshot finding.

**Fixtures:** A persona initially assigned stack A; stack B; invalid and duplicate stack IDs; controlled mapping-insert failure.

**Regression cases / acceptance:**
- Change A to B through the actual update API, reload, and verify B is persisted and returned.
- Submit `[]` to clear assignments; omit the field to preserve them. Explicit null follows a documented validation/no-change policy.
- Invalid targets or persistence failures preserve the previous valid assignment set rather than returning misleading success.
- Duplicate IDs do not produce duplicate mappings or an unhandled database error.

### Allowed Qdrant dependency versions remove the search method

**Evidence:** `backend/requirements.txt:13`; `backend/app/core/qdrant.py:6-31`; `backend/app/services/vector_store.py:216-221`. The official [Qdrant client v1.16.0 release](https://github.com/qdrant/qdrant-client/releases/tag/v1.16.0) records removal of `search`.

**Issue and impact:** The unbounded `qdrant-client>=1.7.0` requirement permits versions in which `AsyncQdrantClient.search` no longer exists, while retrieval still calls it. A fresh install or upgrade resolving an incompatible version can index successfully but fail retrieval with `AttributeError`. The installed client version was not established; this is not a claim that the current environment already fails.

**Fix approach:** Migrate retrieval to the supported query API, including its response shape, and declare a tested client/server compatibility range with reproducible dependency resolution. A temporary version constraint may restore compatibility, but must not substitute for testing the intended supported versions.

**Fixtures:** An isolated dependency-resolution environment, disposable Qdrant service or version-appropriate client contract fake, and a small indexed document/query pair.

**Regression cases / acceptance:**
- A fresh supported installation can create a collection, index a document, and retrieve its expected passage through the actual adapter.
- Test the chosen minimum/current supported client and server combinations, including query filters and result conversion.
- Dependency resolution cannot silently select an unsupported client API. Do not make a fake expose the removed method and thereby conceal the incompatibility.

### Prompt activation and creation can lose the active selection

**Evidence:** `backend/app/services/persona_manager.py:218-252`, `273-296`; `backend/app/api/personas.py:87-94`; `backend/migrations/002_personas.sql:30-41`.

**Issue and impact:** Activation deactivates every existing version before confirming the requested version exists. A nonexistent target produces an error after clearing the active selection. Creating a version similarly deactivates the old prompt before insertion can fail. Concurrent requests also allocate `max(version) + 1` without serialization; the existing active index is not unique. Prompt content is not deleted, but the active selection can be lost or become inconsistent.

**Fix approach:** Validate targets and perform version allocation/activation in a transaction or equivalent atomic database operation, serializing competing changes for a persona. Enforce at most one active version with an appropriate database constraint/index. An unsuccessful change must preserve the previous selection; successful save/activation should return canonical state.

**Fixtures:** `persona_history`, `controlled_failure`, a disposable database with real uniqueness constraints.

**Regression cases / acceptance:**
- Activating a nonexistent version returns a controlled error and leaves version 1 active.
- Failing a new-version insert rolls back selection changes and preserves existing content.
- Simultaneous version saves allocate distinct versions or return a controlled conflict; successful operations leave exactly one active version.
- Concurrent save/activation cannot leave multiple active versions or an unintended no-active state.

### Parent deletion leaves indexed content behind

**Evidence:** `backend/app/services/meeting_manager.py:286-319`; `backend/app/api/knowledge_stacks.py:88-95`; `backend/supabase_schema.sql:92`; `backend/migrations/003_knowledge_stacks.sql:40`; `backend/app/api/documents.py:281-329`.

**Issue and impact:** Meeting and knowledge-stack deletion remove SQL parents and cascade document metadata, but do not remove the corresponding Qdrant collection. Search enrichment does not exclude vector results whose SQL documents are gone. Already indexed content can therefore survive deletion and remain retrievable using the old scope IDs. This requires no in-flight ingestion and is separate from the document-deletion/indexing race.

**Fix approach:** Add durable, retryable vector cleanup to parent deletion and prevent deleted/tombstoned documents from appearing in results even while cleanup is pending. Preserve scope validation and coordinate cleanup with ingestion so later writes cannot recreate deleted content. Define how cleanup failures are surfaced and reconciled instead of treating SQL deletion as proof of complete removal.

**Fixtures:** `indexed_parent`, vector cleanup spies/failures, valid search requests with an explicit non-null `stack_ids` value so the separate null-iteration bug does not mask this test.

**Regression cases / acceptance:**
- Delete a fully indexed meeting and, separately, a stack. Their SQL documents and searchable vectors are removed without relying on any ingestion race.
- Searching with known deleted scope/document IDs cannot return the removed text.
- A vector cleanup failure is recorded/retried; data remains excluded from search until physical cleanup succeeds.
- Repeated deletion/reconciliation is safe and does not remove another parent's collection.

### Concurrent first uploads race when creating a collection

**Evidence:** `backend/app/services/vector_store.py:80-105`, `149`; `backend/app/api/documents.py:55-72`; `frontend/src/app/meetings/new/page.tsx:93-101`.

**Issue and impact:** Collection initialization performs an existence check followed by creation without handling another task creating the same collection in between. The frontend uploads multiple files concurrently to a new meeting. Both jobs can observe no collection, then one receives an already-exists failure and its otherwise valid document is marked failed.

**Fix approach:** Make collection initialization race-safe across workers, not merely within one process. Treat only the expected already-exists outcome as a reason to re-read/validate the collection and continue. Do not swallow network, permission, or incompatible-vector-configuration failures.

**Fixtures:** `collection_creation_barrier`, two distinct documents, indexing and document-status spies.

**Regression cases / acceptance:**
- Force both jobs to observe an absent collection before either creates it. Both documents subsequently index successfully into the one valid collection.
- An existing collection with incompatible configuration produces a controlled diagnostic rather than proceeding with invalid vectors.
- Unrelated creation failures remain visible; ordinary single-file and existing-collection uploads continue to work.

### Persona subtitles exceed the meeting participant role limit

**Evidence:** `backend/migrations/002_personas.sql:11`; `backend/supabase_schema.sql:27`; `backend/app/models/persona_schemas.py:22`; `backend/app/services/meeting_manager.py:54-85`.

**Issue and impact:** Persona subtitles can occupy 200 database characters, but meeting participant roles allow only 50. Creation copies a subtitle directly into the role after inserting the meeting. A valid saved persona with a 51-200 character subtitle can therefore cause meeting creation to fail midway, leaving a meeting and potentially some participants behind.

**Fix approach:** Align the domain, validation, and schema limits with an explicit compatibility choice; do not silently truncate meaningful existing data. Validate selected personas before creating records and make multi-record meeting creation atomic or reliably compensated on failure. Apply needed upgrade migrations as well as fresh-schema changes.

**Fixtures:** Personas with 50, 51, and 200 character subtitles; a multiple-persona meeting; a controlled participant-insert failure.

**Regression cases / acceptance:**
- Every subtitle accepted as valid by the persona API can be used in a meeting, or an explicit validation error is returned before creating any meeting records.
- Fresh and upgraded databases implement the same agreed limit and preserve existing persona data.
- A later participant failure does not leave a misleading partially created meeting.

### Voting and summary inference bypass cost accounting

**Evidence:** `backend/app/api/meetings.py:256`, `358-369`; `backend/app/models/schemas.py:88`; `backend/app/services/meeting_manager.py:204-209`.

**Issue and impact:** End-vote and executive-summary provider calls do not record estimated cost. The summary message uses the default zero value, and the normal message-based accounting only increments totals for recorded nonzero costs. Paid inference is consequently absent from meeting totals, including unsuccessful voting rounds. Local zero-cost provider behavior is not itself a defect.

**Fix approach:** Record usage/cost for every completed inference, including votes and summaries, through a consistent accounting path. Keep estimates distinguishable from billed amounts. Account for provider work even if a later persistence/state operation fails, and prevent retries or replayed completion handling from double-counting the same inference.

**Fixtures:** `inference_usage`, `controlled_failure`, an operation/inference identity spy or ledger fake.

**Regression cases / acceptance:**
- Accepted and rejected voting rounds include the known costs of all completed votes.
- Normal and forced endings include summary-generation costs exactly once.
- Summary-save/state-save failure does not silently erase an already incurred inference estimate; retries follow documented deduplication rules.
- Zero-cost local inference remains zero, and existing normal-turn accounting is neither lost nor counted twice.

### Legacy Excel files are accepted but cannot be parsed

**Evidence:** `backend/app/api/documents.py:26`; `backend/app/services/document_processor.py:76-85`, `127-131`; `frontend/src/components/chat/SharedDocumentsTab.tsx:106`; `frontend/src/app/knowledge-stacks/[id]/page.tsx:158`. The [openpyxl reader documentation/source](https://openpyxl.readthedocs.io/en/stable/_modules/openpyxl/reader/excel.html) excludes legacy `.xls` files.

**Issue and impact:** The API and selectors accept `.xls`, but dispatch it to the `.xlsx` parser using `openpyxl`. Genuine binary BIFF files cannot be read by that parser and fail after upload acceptance. A renamed `.xlsx` file is not evidence of legacy-format support.

**Fix approach:** Either add a deliberate, maintained binary Excel parsing path or reject `.xls` consistently before queuing processing. Align every upload UI with the API's actual support and provide an actionable validation error. Keep valid `.xlsx` handling intact.

**Fixtures:** `document_formats`, upload/document-state spies.

**Regression cases / acceptance:**
- A genuine `.xls` is either parsed successfully with expected cells or rejected honestly before a processing job is created.
- A valid `.xlsx` still indexes; malformed content produces a controlled, visible failure.
- Meeting and stack upload selectors communicate the same supported formats as the backend.

### Cohere query embeddings use document mode

**Evidence:** `backend/app/services/embedding.py:141-157`; `backend/app/services/vector_store.py:201`. Cohere's retrieval contract distinguishes `search_query` from `search_document`.

**Issue and impact:** Query embedding delegates to the same batch method as document indexing, which hardcodes `input_type="search_document"`. Cohere-backed searches therefore encode queries using the wrong retrieval purpose. The payload mismatch is confirmed; its effect on this project's retrieval quality has not been measured, and no impact is asserted for other embedding providers.

**Fix approach:** Make query/document purpose explicit in the embedding interface, or provide separate query and document methods. Use the provider's query mode for searches and document mode for indexed chunks while preserving consistent model/dimensions. Check any required reindexing against the actual configuration rather than rebuilding existing data blindly.

**Fixtures:** `embedding_transport`, a Cohere-backed vector-store adapter, equivalent contract fakes for existing local/default embedding behavior.

**Regression cases / acceptance:**
- Indexing sends document-mode payloads and querying sends query-mode payloads to Cohere.
- Both paths retain the configured model and compatible vector dimensions.
- A small retrieval integration fixture works without external paid requests; other provider paths keep their documented behavior.

### Existing participants follow mutable persona knowledge assignments

**Evidence:** `backend/app/services/meeting_manager.py:80-88`, `166-175`; `backend/app/services/orchestrator.py:47`, `139-149`; `backend/migrations/003_knowledge_stacks.sql:54`.

**Issue and impact:** Identity and prompt are already copied into the meeting participant; editing those template fields does not automatically rewrite existing participants. Knowledge assignments differ: every private search resolves the current template's `persona_knowledge_stacks` using `participant.persona_id`. Assignment changes can therefore change an old meeting's knowledge access, and deleting the persona clears that reference. The missing-import and dropped-update-field bugs currently mask parts of this behavior; fixing those bugs alone does not establish independent participant lifecycles. Generation settings also need the separate creation-time copy fix above.

**Fix approach:** Treat reusable personas as templates and meeting participants as independent instances. Snapshot the participant's supported generation settings and stack assignments at creation. Use the template reference for provenance, not live execution configuration; persona deletion must not cascade away instance-owned assignments to still-existing stacks. Any later adoption of template changes must be explicit. Decide separately whether stack contents stay live or require versioned documents: copying stack IDs alone does not freeze document contents. Do not restore intentionally deleted documents to satisfy a snapshot contract.

**Fixtures:** `persona_instances`, `knowledge_boundaries`, fake provider and collection-selection spies. Correct the missing dependency or inject a valid repository so that search actually reaches assignment selection.

**Regression cases / acceptance:**
- Meeting A captures template identity, prompt, supported generation settings, and stack A. Editing the template to new values/stack B changes only subsequently created meeting B, absent an explicit instance update.
- Execute turns/searches after the edit and after reloading both meetings. A uses its saved configuration/assignments; B uses the new ones, with no cross-persona private access.
- Deleting the template does not erase existing participant snapshots or their assignments to surviving stacks.
- Test the documented live-versus-versioned document policy independently, including intentional stack/document deletion. Existing meetings with no historical assignment snapshot need an explicit migration/fallback policy; do not claim old assignments can be reconstructed without evidence.

## Frontend findings

### Stale asynchronous work mutates the wrong meeting

**Evidence:** `frontend/src/stores/meetingStore.ts:106-124`, `129-164`, `169-277`; `frontend/src/app/meetings/[id]/page.tsx:17-23`.

**Issue and impact:** Loads and action completions update global state without checking their meeting/request identity. A late A response can replace selected meeting B or append an A message to B. Old streams also mutate the shared streaming state. The route retains an interactive old meeting while the new meeting loads.

**Fix approach:** Scope asynchronous updates by selected meeting and operation identity; ignore stale completions and cancel superseded streams/requests where possible. Guard errors, loading flags, statistics, conflict lists, and cleanup as well as message content. Do not let cleanup for A clear a newer operation for B. Gate route rendering/actions on the requested meeting ID.

**Fixtures:** `meetings_ab`, `deferred_requests`, independently controlled A/B streams and statistics responses.

**Regression cases / acceptance:**
- Start loading A, then B; resolve B before A. B and its associated lists/statistics stay selected.
- Start sending a user message or generating an A turn, navigate to B, then finish A. No A message or state is inserted into B.
- Start A streaming, switch to B, and deliver late A text/done/error events. They do not replace B or clear a newer B stream.
- While B loads, A must not remain actionable under B's route. Also test load failure and superseded-request cleanup.

### Summary tab shows fabricated conclusions

**Evidence:** `frontend/src/components/chat/SummaryTab.tsx:26-49`, `64-85`, `88-109`.

**Issue and impact:** Every meeting initializes with `MOCK_SUMMARIES`; generating a summary adds canned text after a timeout without reading conversation history. Real ending summaries are added only to local state and are not hydrated into the summary list after reload. The UI presents unsupported conclusions as meeting history.

**Fix approach:** Remove fabricated content from ordinary meeting views. Load actual persisted summaries and connect generation to a real backend path, or clearly disable generation until that path exists. Existing persisted ending system messages can be used as an interim source if identified reliably. Bind summary state to the selected meeting and avoid duplicate final summaries after refresh.

**Fixtures:** An empty meeting, A with a distinctive real persisted ending summary, and B with different history; successful/failed generation responses if generation is implemented.

**Regression cases / acceptance:**
- An empty meeting shows an empty state, not investor/CTO conclusions or invented history.
- A persisted real summary remains visible after reload/remount and is not duplicated.
- Switching A to B cannot show A's summary in B.
- Generation either submits the correct meeting to a real handler and displays its result, or is unavailable with an honest explanation. No timeout-created canned summary is presented as generated evidence.

### Settings do not affect actual generation

**Evidence:** `frontend/src/stores/settings-store.ts:88-107`; `frontend/src/lib/api.ts:149-164`; `backend/app/llm/__init__.py:16-25`; `backend/app/llm/openrouter.py:20-23`; `backend/app/api/meetings.py:313-320`.

**Issue and impact:** Provider/default/System AI controls update local state, whereas turn requests send only the participant ID and backend adapters use server credentials/configuration. Testing a browser-entered key does not make it the key used for generation. The selected default model or System AI may therefore be ignored, cause unexpected provider use, or leave generation failing despite a successful key test.

**Fix approach:** Establish an explicit end-to-end settings contract. Either make editable settings configure backend execution, or make server-controlled settings read-only and explain their source. For supported edits, resolve credentials securely server-side and define precedence between participant snapshots, shared defaults, and System AI settings. Do not copy secrets into logs or arbitrary headers. Preserve environment-based local operation. Coordinate participant-specific behavior with preservation of persona generation settings during meeting creation.

**Fixtures:** Two fake providers with distinguishable outputs; synthetic credential references; participant override and empty/default configuration; a non-default System AI configuration; provider-call spies.

**Regression cases / acceptance:**
- Every editable generation setting has an observable effect on the intended call, or is explicitly unavailable rather than falsely claiming success.
- A key test and generation use the intended credential resolution path; secrets are not echoed in responses/logs.
- Shared defaults affect default-configured participants; explicit participant settings retain the documented precedence.
- System AI selection affects the operation its UI promises, including executive summaries where applicable. Existing environment-only local generation still works.

### Premature stream completion leaves the interface busy

**Evidence:** `frontend/src/lib/api.ts:177-209`; `frontend/src/stores/meetingStore.ts:244-277`.

**Issue and impact:** The reader silently accepts EOF, including EOF without an application terminal event. Malformed events are logged and skipped. The store clears streaming/active-participant state only on done/error or an exception, so clean premature EOF can leave controls disabled and a permanent thinking indicator.

**Fix approach:** Track terminal completion and treat EOF without it as interruption. Guarantee operation-scoped cleanup, handle pending decoder/buffer content deliberately, and cancel/release resources on navigation. Reconcile saved state if needed, but do not automatically replay an inference request that might already have incurred cost or persisted output. Coordinate cleanup with protection against stale asynchronous updates to the selected meeting.

**Fixtures:** `stream_variants`, an initialized streaming store, fake meeting refresh, and a newer operation to test stale cleanup.

**Regression cases / acceptance:**
- Valid done/error events clean up correctly; valid events split across arbitrary byte chunks still parse.
- Text plus EOF, or a malformed/truncated terminal event, produces a recoverable interruption state and clears only its own busy indicators.
- The user can start another operation afterward; no automatic duplicate inference occurs.
- Reader/abort resources are cleaned up and an older stream cannot clear a newer stream's state.

### Message submission loses drafts

**Evidence:** `frontend/src/components/chat/ChatArea.tsx:55-65`; `frontend/src/stores/meetingStore.ts:129-143`.

**Issue and impact:** The store catches errors without rejecting, while the component clears the input after awaiting it. A failed send therefore deletes an unsent message. A delayed successful send can erase text typed while it was pending. There is no in-flight submission guard preventing repeated sends of the same draft.

**Fix approach:** Expose send success/failure explicitly. Clear only the successfully submitted draft version, preserve subsequent edits, and guard or deliberately queue in-flight submissions. Maintain usable error feedback and retry behavior.

**Fixtures:** A recognizable draft, deferred send success/failure, a second draft typed before completion, and a request-count spy.

**Regression cases / acceptance:**
- Failed submission retains the original draft and exposes an error; retry can submit it successfully.
- Submit draft 1, type draft 2, then resolve draft 1. Draft 2 remains intact.
- Repeated Enter/click while one unchanged draft is pending does not create unintended duplicate requests.
- Successful submission with an unchanged draft clears it and appends the returned message once.

### Persisted initialization skips current server metadata

**Evidence:** `frontend/src/stores/settings-store.ts:78-80`, `147-155`, `170-194`; `frontend/src/components/settings/api-keys-section.tsx:28-45`; `frontend/src/components/settings/provider-card.tsx:144`.

**Issue and impact:** Persistence includes `initialized` but excludes `isProduction` and `serverConfiguredProviders`. On reload, a persisted true flag prevents initialization while the missing fields revert to defaults. Server configuration changes are also ignored, leaving stale controls and provider status. This is a UI state bug; server authorization must never depend on these browser flags.

**Fix approach:** Refresh authoritative server metadata every session/load, separate it from user preferences, and avoid persisting a flag that suppresses that refresh. Reconcile removed providers as well as added ones. Migrate or tolerate existing stored settings so already-saved `initialized=true` does not retain the bug.

**Fixtures:** `persisted_settings`; successive server responses with different environment/provider metadata; reload/remount using the same storage.

**Regression cases / acceptance:**
- Rehydrate existing storage with `initialized=true`, fetch production metadata, and verify current server flags/control states are applied.
- Changing configured providers between loads updates both added and removed provider indicators.
- User preferences survive where valid; server-authoritative metadata is not replaced by stale persisted values.
- Empty/new storage initializes correctly; metadata fetch failure is visible and does not falsely assert a server configuration.

### Upload failure during creation leads to duplicate meetings on retry

**Evidence:** `frontend/src/app/meetings/new/page.tsx:87-109`.

**Issue and impact:** The page creates the meeting before awaiting concurrent document uploads. An upload failure skips navigation, logs only to the console, and re-enables creation without retaining a resumable created-meeting state. Retrying creates a second meeting while the first and any successfully uploaded documents remain. The unused creation-dialog component is not the evidence for this finding.

**Fix approach:** Retain the created meeting ID across upload failures and show visible per-file outcomes. Retry only failed uploads, or navigate to the created meeting with an honest warning and recovery action. Handle late completion of other concurrent uploads; a rejected `Promise.all` does not cancel them. If choosing rollback instead, define complete, reliable compensation rather than deleting records while uploads still run.

**Fixtures:** `creation_uploads`, navigation and visible-error assertions, a per-file upload/request-count spy.

**Regression cases / acceptance:**
- Let one of two uploads fail after meeting creation. Show an actionable error and retain the one created meeting ID.
- Retry the failed upload without creating another meeting or re-uploading an already successful file.
- A late second upload completion is reconciled rather than lost or duplicated.
- Meeting-creation failure itself remains distinguishable from upload failure; successful creation/uploads navigate once.

### Prompt history retains stale active-version controls

**Evidence:** `frontend/src/app/roster/[id]/page.tsx:80-88`, `339-355`; backend activation behavior in `backend/app/services/persona_manager.py:233-252`.

**Issue and impact:** Saving a prompt activates the new backend version, but the editor only prepends it to local history. The old version retains `is_active=true`, so multiple rows appear active and the old version's activation button remains disabled until state is refreshed. This is separate from backend atomicity failures.

**Fix approach:** Reconcile history from canonical backend state after save/activation, or use a functional update that correctly clears all previous active flags. Serialize or safely reconcile competing save/activation actions. Do not let completion of an older save incorrectly mark newer unsaved edits as saved.

**Fixtures:** `persona_history`, controlled save/activation responses, a component mounted without a full page reload, deferred edits while save is pending.

**Regression cases / acceptance:**
- Save version 2 while version 1 is active. Exactly one row is active and version 1 is immediately available for reactivation.
- Reactivate version 1 without reloading; history and editor agree with persisted state.
- Failed save/activation preserves the last confirmed selection and exposes the error.
- Edits made while a save is pending remain dirty unless that exact edit version was successfully saved; overlapping actions cannot commit stale history state.

### Streaming drops tool-call activity events

**Evidence:** `backend/app/services/orchestrator.py:331-355`; `frontend/src/stores/meetingStore.ts:215-240`; `frontend/src/components/chat/ChatArea.tsx:534-541`.

**Issue and impact:** The orchestrator consumes provider tool-call events, executes the tool, and emits only tool-result events. The frontend creates activity entries only on tool-call events; result handling merely updates existing entries. No entry exists to update, so live tool activity is absent even though a persisted reload may show the artifacts. This stream-contract defect is distinct from the lack of follow-up inference.

**Fix approach:** Emit a correlated tool-call event before execution and its result afterward. Preserve unique call IDs end to end; matching by tool name alone is insufficient for repeated or concurrent calls of the same tool. Align backend event schemas and frontend handling, including failed tools and terminal cleanup.

**Fixtures:** `provider_script`, a deferred tool handler, captured backend SSE events passed through the actual frontend parser/store, repeated same-name calls with different IDs.

**Regression cases / acceptance:**
- While the tool handler is blocked, the frontend already shows the correct pending tool activity.
- Completion updates that entry with its result, then later final text/terminal events follow the repaired inference contract.
- Two calls of the same tool have independent IDs, arguments, and results; a failure cannot mark another call completed.
- Final persistence/refetch does not duplicate activity entries or introduce activity into a different selected meeting.

## Operational risks requiring targeted validation

These are source-backed failure mechanisms, not measured performance or reproduced production incidents. Keep their validation separate from claims that the current environment is already overloaded or has lost jobs.

### Synchronous ingestion can block the serving event loop

**Evidence:** `backend/app/api/documents.py:30-55`; `backend/app/services/document_processor.py:76-143`; synchronous database execution also appears in async services such as `backend/app/services/meeting_manager.py:114-138`.

**Risk:** The async background function directly runs synchronous file parsing/chunking before its first indexing await. Being a background task does not move that synchronous work off the event-loop thread. Large accepted files can delay unrelated requests/streams in the same worker. Synchronous database calls add another blocking path. No latency impact was measured.

**Fix approach:** Offload parsing to a bounded worker/thread/process suitable for the workload, and use asynchronous database access or deliberate bounded offloading for blocking I/O. Bound concurrency; do not replace event-loop blocking with unlimited worker/memory growth. Preserve error/status reporting and coordinate with durable ingestion.

**Fixtures:** A parser fake recording execution context and waiting at a controlled barrier, an event-loop heartbeat/independent request, and bounded worker/database fakes. Ensure a deliberately blocking regression harness has a safe external release mechanism.

**Regression cases / acceptance:**
- While parsing is paused off-loop, an independent heartbeat/request and stream progression continue without waiting for parser completion.
- Verify parsing does not execute on the serving event-loop thread and configured concurrency limits are respected.
- Parser/database failure is surfaced without leaving unrelated requests or document status permanently stuck. Record actual latency measurements separately if performance thresholds are introduced.

### Upload size checks do not bound memory consumption

**Evidence:** `backend/app/api/documents.py:115-119`; `backend/app/services/document_processor.py:127-143`.

**Risk:** The endpoint reads the entire upload before checking the 50 MB limit, so its own limit does not bound allocation of the uploaded bytes. Compressed document expansion and full workbook/row materialization can consume substantially more memory than the upload size. This is a resource-exhaustion risk, not a demonstrated denial-of-service result; upstream limits were not established.

**Fix approach:** Enforce bounded reads/request limits before buffering the complete file, including when no trustworthy content length exists. Add explicit extraction budgets for expanded content, pages/rows/chunks, and worker concurrency. Use streaming/read-only parsing where appropriate without silently dropping accepted content. Reject over-budget documents with clear terminal errors and clean up partial state.

**Fixtures:** `document_formats`, counting streams exceeding the configured limit, missing/misleading content-length metadata, extraction fakes crossing declared processing budgets.

**Regression cases / acceptance:**
- Oversized input stops after the configured limit plus only the documented bounded detection overhead, rather than reading the complete stream.
- Missing or misleading length headers do not bypass enforcement; valid boundary-sized uploads still work.
- Small compressed input that exceeds extraction budgets fails predictably without publishing partial searchable output.
- Failed reads/extraction release resources and leave an honest document state. Do not require dangerous real resource exhaustion to test the guards.

### In-process ingestion has no durable restart recovery

**Evidence:** `backend/app/api/documents.py:155-165` and background ingestion at `30-72`.

**Risk:** Upload inserts a processing row and schedules an in-process task using source bytes passed in memory. The reviewed path has no durable source-file/job handoff or restart reconciliation. A process restart after acknowledgement can therefore lose the work and leave the document in processing with no automatic way to resume from its original bytes.

**Fix approach:** Persist a recoverable source and durable job/lifecycle state before promising accepted processing, then run retryable ingestion with explicit publication semantics. Reconcile abandoned work after restart. If recovery is deliberately unsupported, detect interrupted jobs and expose a terminal failure/re-upload path rather than an indefinite processing state. Coordinate with deletion, collection initialization, and idempotent vector publication.

**Fixtures:** `ingestion_recovery`, `controlled_failure`, an idempotent publication/vector fake.

**Regression cases / acceptance:**
- Interrupt after acknowledgement and restart. The job either resumes from persisted input or becomes an explicit actionable failure, never unexplained permanent processing.
- Interrupt during parsing and around vector upsert/status publication; retry does not duplicate published chunks or expose incomplete content.
- Deleted documents/parents are not resurrected by restart recovery.
- Durable source/job cleanup follows the declared retention policy after success, terminal failure, and deletion.

## Suggested remediation order and completion checks

- **Start with deterministic failures:** Write isolated regression tests for the meeting status constraint, undefined knowledge-search dependency, omitted search stack IDs, discarded persona generation settings, dropped stack updates, role/subtitle limits, and unsupported Excel uploads. Establish supported Qdrant client/server versions with a real adapter smoke test.
- **Preserve persona and participant lifecycles:** Make prompt transitions atomic, fix editor active-state reconciliation, and establish instance-owned knowledge assignments before treating template updates as complete. Test both old and newly created meetings.
- **Repair inference and meeting closure:** Add tool-result follow-up inference and correlated live activity, recover failed summary generation, enforce closed-meeting write guards, and account for all paid inference. Test Cohere query/document purposes separately.
- **Make ingestion and deletion coherent:** Cover document deletion/indexing races, parent vector cleanup, and concurrent collection creation. Validate bounded/off-loop processing and restart recovery rather than assuming background tasks provide those properties.
- **Resolve frontend correctness and data loss:** Protect selected-meeting state from stale requests, remove fabricated summaries, recover incomplete streams, preserve drafts, and make failed upload retries reuse the created meeting.
- **Align settings end to end:** Connect editable settings to generation and refresh server metadata reliably, coordinating with preservation of persona generation settings.
- **Secure exposed access:** Address the missing authentication gate, direct database permissions, and unrestricted Ollama URLs before exposing the application. These can be developed in parallel with functional fixes, but must include local-compatibility checks rather than silently changing local access or Ollama behavior.

An issue is complete only when the red-green-refactor cycle is recorded, its regression cases are implemented and pass, the relevant local workflow still works, and the fix is checked in both ordinary and failure paths. Record actual test commands/results when fixes are made; this static review does not establish a passing baseline.
