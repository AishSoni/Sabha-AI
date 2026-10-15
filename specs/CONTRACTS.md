# Shared domain and interface contracts

Status: proposed technical baseline. Product decisions marked D-* require approval in MASTER.md. These contracts become normative after that approval.

## 1. Identity, ownership, and authorization

An application `Actor` has a trusted kind (`demo_session`, authenticated `user`, or explicitly configured local-development actor) and server-resolved identity. Request bodies never establish identity. A local-development actor cannot be enabled on a public/demo runtime as a fallback.

Every read/write checks owner scope, including list, direct-ID lookup, messages, queues, turns, stream replay, documents, persona refresh, settings, and reset. Cross-owner lookups return the same not-found behavior as unknown IDs; malformed/absent credentials return unauthorized. Supplied meeting/participant/document IDs must be related as well as independently valid.

Demo bootstrapping issues a high-entropy opaque credential plus public session ID and generation. Hash the credential at rest; log neither it nor authorization headers. Store the credential/reference/progress in sessionStorage only. Use an authorization header on fetch-based streams; never put a token in query parameters. Sessions are anonymous capabilities, not proof of a person's identity.

sessionStorage survives refresh in a tab, not a guaranteed cross-browser restore or a reliable close notification. Tab duplication can copy storage: document this; do not claim strict isolation between duplicated tabs that hold the same credential. Independent new sessions must be isolated. Server expiry and cleanup remain authoritative even when the tab disappears.

Legacy user IDs have inconsistent types/nullable semantics. Migration must map them explicitly or quarantine them under D-12. Shared/default persona reads do not grant shared mutation permission. Never expose ownerless historical records through a demo session.

## 2. Meeting lifecycle

Proposed transitions:

| From | Command/condition | To | Required effects |
| --- | --- | --- | --- |
| active | Start turn, no active turn/ending attempt/undrained queue | active | Reserve one turn and freeze context/config revisions |
| active | End, idle and queue empty | voting | Create ending attempt; freeze roster and transcript revision |
| voting | Strict majority yes and summary succeeds | ended | Commit summary, attempt outcome, status, and known usage atomically |
| voting | Vote rejection or processing failure | active | Persist attempt outcome; no misleading completed summary |
| active | Force end, idle and queue empty | voting then ended/active | Skip votes, keep summary/commit/recovery discipline |
| active or ended | Archive, idle and queue empty | archived | Store previous state |
| archived | Unarchive, known previous state | previous state | Do not automatically reopen a previously ended meeting |

No new messages, turns, participant edits, or persona refresh in voting/ended/archived state. Queries remain allowed by ownership. Invalid transitions return a typed conflict. An ending attempt is not a provider-controlled state change: the application validates votes and chooses the transition.

Voting policy D-04: freeze eligible roster; require `yes_count > roster_count / 2`; ties fail; invalid votes/timeouts are recorded separately and count as non-yes. A zero-participant normal vote fails eligibility; force-ending may still summarize the transcript. Summary generation uses explicitly resolved System AI configuration. Votes and summaries contribute known usage, including failed attempts.

Legacy archived records without provable prior state MUST NOT silently restore to active. Provide an explicit administrative mapping/recovery action or leave restoration blocked pending owner choice. Historical ended-summary text alone is not authoritative lifecycle evidence.

## 3. Turn lifecycle and execution

States: `pending -> running -> completed | failed | cancelled`; pending may also fail/cancel. These are execution states, not a queue of requested future speakers. A second speaker request while one is pending/running returns `409 turn_in_progress`.

Reservation atomically verifies actor, active meeting, participant membership, queue barrier, and uniqueness of active work. It captures transcript boundary, participant snapshot revision, effective provider settings, and scenario revision/action for demo. New queued messages cannot enter that context retrospectively.

An accepted turn has stable `turn_id`, request idempotency key, timestamps, attempt/lease metadata, terminal reason, optional result message ID, usage completeness, and a monotonic event cursor. Unique reservation/database compare-and-swap is required across independent processes.

Execution is owned by an application runner, not an SSE iterator. Stream disconnect detaches a subscriber. Navigation is not cancellation. Phase 02 supports process-lifetime continuation; Phase 04 requires persistent lease/recovery semantics. A crashed live call of uncertain completion is not blindly replayed: record an interrupted/unknown outcome and require explicit retry. Already persisted effects remain visible. New worker writes must be fenced against stale lease/generation owners.

Explicit cancellation (D-13) sets a request checked between steps and during cancellable awaits. Terminalization and cancellation race atomically: if completion won, return completed. Cancellation cannot unspend tokens or undo committed disagreement/consensus. Do not fabricate usage when a provider disconnects without reporting it.

## 4. One bounded inference/tool loop

1. Build base prompt + snapshotted persona extension + agenda + authorized context. Keep speaker attribution intact.
2. Resolve provider through injection. Enforce model context/output budgets before each invocation, including tool outputs. Never split an assistant tool-call/tool-result group when trimming context. Initial policy may retain recent complete groups and reject an irreducibly oversized prompt; do not silently claim intelligent compression.
3. Normalize provider output into text segments, completed tool calls with original provider call IDs, invocation usage, and an internal invocation-finished signal.
4. Append the assistant message containing the full call list to provider history. Validate each tool name/arguments against the read-only/communication allowlist.
5. Execute bounded tools; append each structured tool result using its original call ID; then invoke the model again.
6. Only a non-empty final response without pending tools can finalize successfully. Tool-only responses are not completed chat answers. Empty/invalid final output is a typed execution failure; do not persist a successful blank answer.
7. Enforce approved invocation/tool/deadline/output limits. Exhaustion produces a typed terminal failure, not an endless loop or a successful placeholder.
8. Finalize result message, artifacts, usage ledger, meeting cost update, and terminal status atomically, with a replayable terminal event.

Preserve provider-native call IDs in adapter messages. Application tool execution identity is `(turn_id, invocation_index, provider_call_id)`, preventing collisions across invocations. A repeated same-name call is not the same call. Reused execution identity with different arguments is a protocol conflict. Communication effects are idempotent on execution identity.

Tools: `search_knowledge_base`, `web_search`, `log_disagreement`, `log_consensus`. Unknown tools and invalid arguments never execute. Recoverable validation errors may be returned to the model as structured failures within the same loop limit. Authorization failures do not expose private existence/content. Fatal policy/infrastructure failures terminalize with a public safe code and correlated server diagnostics.

Validate disagreement severity/consensus strength (1-5), target/participant membership, and bounded fields. The model proposes an effect; application policy authorizes it. Store sanitized inputs, outputs, execution identity, outcome, and citations for audit. Do not expose credentials or private unauthorized evidence in events/logs.

Usage is per provider invocation, deduplicated on invocation identity; summed for the turn/ending attempt. Model-specific pricing is versioned; unsupported pricing or missing token counts are unknown, not zero. Demo actual provider spend is zero; any illustrative usage/cost is explicitly simulated and separate. Preserve legacy estimated costs without inventing a historical ledger.

## 5. Editable user-message queue

The same submission use case decides atomically whether a user message is committed immediately (idle active meeting) or queued (active turn). Only user messages queue; no automatic next speaker.

Queue entry: ID, meeting/owner, monotonically increasing order, content, revision, state (`pending`, `dispatched`, `removed`), creation/update times, and resulting message ID if dispatched. No reorder feature is promised. Use an idempotency key for submission.

- Pending entries are excluded from the active transcript and all running-turn snapshots.
- Edit/remove requires the expected revision. Stale edits return `409 revision_conflict` with a safe current representation for the owner.
- Dispatch and editing/removal contend on the same lock/atomic predicate. If dispatch wins, editing returns `409 already_dispatched`; it never rewrites a delivered message.
- On turn terminalization, drain pending entries FIFO once the meeting is active and the reservation is released. Failed/cancelled turns also drain under D-03.
- Block new turns and ending until the queue barrier is clear. New submissions during draining must join the same ordering mechanism, not overtake older entries.
- Each dispatched entry creates exactly one user message in one transaction with its queue-state transition. A crash/retry cannot duplicate it.
- Empty/oversized messages, exceeded capacity, non-active meetings, and wrong ownership fail before mutation.
- Reset/expiry invalidates that generation's pending work; never leak it into the next walkthrough.

## 6. Participant snapshots and settings

Participant snapshots contain persona ID when available, prompt version/provenance, persona extension, non-secret provider/model/temperature/output limits, knowledge-stack assignments, and revision. The immutable base instruction is composed separately and cannot be removed by refresh.

Persona extensions define an analytical remit, evidence scope, key questions, output obligations and handoffs to other roles. The bond demo uses Credit & Business, Bond Structure & Downside, and Treasury & Market specialists as specified in DEMO-JOURNEY.md. Differences must appear in the evidence and reasoning contributed, not only tone. Scenario-specific seeds do not overwrite existing user templates.

At creation resolve and snapshot effective defaults. A persona/global preference change does not silently alter an existing participant. A refresh preview compares current snapshot to the target persona revision and resolved defaults. Apply requires expected participant and target-persona revisions, an idle active meeting, authorization, and explicit confirmation. A stale preview returns a conflict.

Snapshots do not preserve revoked permissions: effective retrieval is snapshotted assignments intersected with current authorization and non-deleted documents. Deleting a persona may preserve the meeting participant and historical prompt; access to associated deleted evidence is still revoked.

Live preferences are server-authoritative. Server credentials stay server-side under D-09. System AI settings are separate from participant settings and are snapshotted per ending attempt. Demo resolves only fixture providers regardless of browser settings or request payload. Model choice, temperature, and output limits must reach the actual adapter call; invalid/incompatible combinations return validation errors, not silent fallback to another vendor.

## 7. Knowledge consistency

Search input is a query plus meeting/participant context, never an arbitrary trusted collection name. Resolve authorized shared documents and participant-private scope server-side. Recheck tombstones/current grants when selecting results. Source IDs, chunk IDs, titles and snippets are structured; no orphan hit is returned as an "Unknown" source after deletion.

Documents have explicit states: accepted -> processing -> indexed or failed; any live state -> deleting -> deleted. Store durable source bytes/reference before acknowledging a live upload. Persist indexing/deletion jobs in the same SQL transaction as the state change. Workers claim bounded jobs with leases/attempt counts and idempotent document-generation/chunk identities.

Deletion first records a tombstone and cleanup job with sufficient vector/storage identifiers; search excludes it immediately. Physical cleanup retries safely and survives parent deletion/cascades. An old indexing job cannot resurrect a tombstoned document: compare generation/state before publication and clean stale outputs. Shared immutable demo fixtures are not deleted when a visitor resets.

The real-bond demo pins one instrument identity/ISIN, scenario revision and dated source snapshot. Fixture citations preserve publisher/original URL, publication/effective and retrieval dates, page/section locator and content hash. Authored claims distinguish `sourced_fact`, `derived_calculation`, `subjective_judgment` and `unverified_question`; calculations identify inputs and conventions. A private analytical worksheet is labeled as demo-authored, not an issuer disclosure. Missing/current market evidence remains an explicit verification need; no runtime market-data fetch or invented quote fills the gap.

## 8. Application ports

Suggested contracts, implemented as typed interfaces/protocols rather than mandatory base classes:

| Port | Responsibility |
| --- | --- |
| MeetingRepository / UnitOfWork | Scoped loads; atomic reservations, state transitions, finalization and queue operations |
| TurnRepository / EventStore | Execution state, snapshots, monotonic events, replay cursor, lease fencing |
| ProviderResolver / LLMProvider | Effective configuration -> adapter; normalized invocation stream |
| ToolExecutor | Validated calls -> structured authorized result/effect |
| KnowledgeSearch | Context-scoped query -> bounded structured citations/results |
| PersonaRepository | Version activation and snapshot/refresh reads with concurrency checks |
| JobStore / Runner | Durable job/turn claims, retry policy, heartbeat and recovery |
| Clock / ID source | Controlled time and identities for tests; secure runtime implementations |

Cross-module access uses application interfaces, not another module's raw SQL tables from route handlers. Query projections may be optimized without loading full aggregates.

## 9. Proposed HTTP contract

Prefix `/api/v2` (D-11). Exact DTO schemas/OpenAPI examples are a Phase 00 deliverable before implementation; the required operations and semantics are fixed by this table once approved.

Delivery ownership: Phase 03 defines demo composition/types only; core operations are implemented in their owning fix/refactor phases. Phase 08 implements generic session lifecycle with private synthetic seed hooks. Phase 10 supplies the real scenario bootstrap/actions, source content and all guided/exploration behavior. Defining an operation here does not require an early working recruiter journey; unavailable scenario handlers remain disabled until Phase 10.

| Operation | Request | Success / important conflicts |
| --- | --- | --- |
| `POST /demo/sessions` | the sole approved scenario ID/version; server validates against deployed manifest | 201 credential, session, generation, expiry, current meeting, instrument/snapshot metadata and allowed actions; reject alternate scenarios/instruments |
| `GET /demo/session` | authenticated session | 200 authoritative progress/generation/expiry |
| `POST /demo/reset` | expected generation + idempotency key | 200 new generation/meeting; revoke old work atomically |
| `POST /demo/actions` | action ID, expected scenario revision, idempotency key | 200/202 accepted action/turn; 409 unsupported at this step/stale revision |
| `POST /meetings/{id}/turns` | participant ID + idempotency key | 202 turn ID/state/stream URL (without token); 409 busy/invalid state |
| `GET /turns/{id}` | actor | 200 state, result reference, event cursor, safe failure/usage details |
| `GET /turns/{id}/events?after={sequence}` | actor; non-secret cursor | ordered SSE replay followed by live subscription |
| `POST /turns/{id}/cancel` | actor + idempotency key | 200/202 current cancellation/terminal state |
| `POST /meetings/{id}/messages` | content + idempotency key | 201 committed message or 202 queued entry, explicit discriminated response |
| `GET /meetings/{id}/queue` | actor | ordered current entries with revisions |
| `PATCH /meetings/{id}/queue/{entry}` | content + expected revision | 200 revised pending entry; 409 stale/dispatched |
| `DELETE /meetings/{id}/queue/{entry}` | expected revision | 204 removed; 409 dispatched/stale |
| `POST /meetings/{id}/ending-attempts` | force flag + idempotency key | 202 attempt reference; 409 busy/queue/non-active |
| `GET /ending-attempts/{id}` | actor | 200 progress/outcome/votes/summary reference |
| `POST /participants/{id}/refresh-preview` | target persona revision | 200 field diff and expected revisions |
| `POST /participants/{id}/refresh` | approved revisions | 200 new snapshot revision; 409 stale/busy |

Existing CRUD/settings/document endpoints remain compatibility surfaces until explicitly migrated; every surface must gain the same ownership checks. New commands use idempotency keys scoped by actor and operation: same key/same payload returns the original outcome; same key/different payload returns conflict. Idempotency retention must cover the demo session lifetime and documented live retry window.

Demo resume/reset/exploration responses retain the same instrument/ISIN and source snapshot for the pinned content version. Forking creates a new meeting, not a different scenario. Ending votes mean ready to summarize; consensus on a verification agenda and meeting completion must never be represented as approval to invest. The persisted brief includes source/snapshot references, subjective-analysis and not-financial-advice disclosures, unresolved questions and user-owned verification steps.

Public errors: `{code, message, retryable, request_id, details?}`; no stack traces/secrets/raw provider errors. Use 401 unauthenticated, 404 unknown/cross-owner, 409 state/revision/idempotency conflict, 422 validation, 429 quota with retry information, and 503 unavailable dependencies. Once streaming starts, errors use stream events plus authoritative terminal state, not a late HTTP status change.

## 10. Stream contract

Application stream version 2 is distinct from provider-native events. Envelope:

```json
{
  "version": 2,
  "event_id": "turn-id:7",
  "sequence": 7,
  "meeting_id": "meeting-id",
  "turn_id": "turn-id",
  "session_generation": 1,
  "type": "tool_result",
  "data": {
    "tool_execution_id": "execution-id",
    "provider_call_id": "call-1",
    "tool_name": "search_knowledge_base",
    "outcome": "succeeded",
    "result": {"items": []}
  }
}
```

Generation is nullable outside demo. Data is a discriminated payload, not an unvalidated catch-all. Replay sequences start at 1 and increase per turn; cursor 0 requests the beginning. The cursor is a delivery position, never an authorization capability.

| Event | Required payload |
| --- | --- |
| `turn_started` | participant ID, context/snapshot revision |
| `text_delta` | content, segment ID, invocation index |
| `tool_call` | execution ID, provider call ID, name, validated/sanitized arguments |
| `tool_result` | same IDs, outcome, structured safe result |
| `citation` | citation/source/chunk IDs, title, safe URL if applicable, snippet |
| `turn_completed` | persisted message ID, usage completeness, actual/simulated cost classification |
| `turn_failed` | safe code/message, retryable flag, partial-result reference if any |
| `turn_cancelled` | reason and persisted effects/partial-result reference if any |

SSE uses `id` equal to event ID, `event` equal to type, and JSON `data`, separated by a blank line. Heartbeats are comments, not business events. Exactly one terminal state/event is committed per turn; delivery can repeat. Clients deduplicate by turn/sequence. Provider invocation completion never appears as application turn completion.

Persist bounded replay events or an equivalent durable journal with a consistent sequence. Publish only committed events. Reconnection requests events after the last applied sequence. If retention has expired, return a typed replay-expired result and reload authoritative turn/message state; do not regenerate the answer. Persist terminal state independently of an active subscriber.

Interim model text may precede tool calls. Identify segments/iterations so the UI does not confuse provisional text with the committed final answer. Final transcript text uses the final answer segment; earlier commentary remains in execution artifacts if retained. Do not invent or require private chain-of-thought. Existing thinking fields remain historical compatibility data; optional provider-exposed safe summaries require a separately approved contract.

Protocol consumers must handle UTF-8 splits, partial frames, multiline data, CRLF, duplicate replay, unknown optional fields and EOF without terminal event. EOF alone means connection loss, not successful completion.
