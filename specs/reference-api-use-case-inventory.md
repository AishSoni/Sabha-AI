# Reference: API use-case and contract inventory

Recorded at Spec 03 (post capability extraction `e7d2507`, archive/reporting
characterization `3251a4e`). This is the authoritative inventory of the
accepted contract surface that later specs cut and rebuild. Every row cites
the backend route (`backend/app/api/*`) and the client shape the frontend
already depends on (`frontend/src/lib/api.ts`).

Maintenance rules:

- New routes and stream events must be added here in the same commit that
  ships them (this file travels with the code, not behind it).
- "Class" is the target-architecture vocabulary: **command** (causes a
  durable write or a paid side effect), **observation** (read-only record
  fetch), **status** (derived/read-only view computed on demand), **probe**
  (side-effecting but non-durable check against an external service).
- When a row's shape changes in a coordinated frontend/backend cut, move its
  row to the cut tracker below instead of silently rewriting history.

## Cross-cutting conventions

### Error envelope (safe errors)

Every failure is `{ "detail": "<human readable>" }` — `handleResponse`
(`api.ts`) throws `new Error(detail || "API Error: <status>")`. Unsupported
browsers still see the generic `API Error: <status>` fallback. Nothing else
(error codes, field maps) is currently part of the contract.

### BYOK generation contract (turns + summary only)

- Non-secret settings ride the JSON body as `provider`: `{ provider, model,
  temperature, max_tokens, base_url }` (all fields optional, `null` allowed).
- The secret key rides the `X-Provider-Key` header and is **never persisted**
  (`resolve_generation_settings`, now owned by
  `app.capabilities.configuration.service`).
- `base_url` is **request-only** (Ollama-style local inference); it is never
  saved to the database.
- Cloud providers (`openrouter`, `gemini`) require a browser key or a server
  key (`{provider}_api_key` in app config) or fail with `422` and message
  "No API key available for {provider}. Provide a browser key (BYOK) or
  configure the server key."
- Known conscious exception: the setting probes `POST /settings/test-key` and
  `POST /settings/models` carry `api_key` **in the request body** (non-
  durable provider checks, not generation).

### Anonymous access

No endpoint declares auth dependencies (`Depends`/`Security`/headers) —
verified by `tests/characterization/test_no_sign_in_sweep.py`. The only 403
is the demo-mode write guard middleware ("Demo workspace is read-only —
mutations are disabled") for non-GET/HEAD/OPTIONS `/api` requests when
`settings.runtime_mode == "demo"`.

### Meeting status lifecycle

`active -> voting -> ended -> archived` (legacy AND fresh schemas accept all
four). Writes to a `voting`/`ended`/`archived` meeting are rejected with
`409` (`MeetingClosedError`), except `PUT`s that the closing flow itself
performs. `archive`/`unarchive` use a plain last-writer-wins status update
(`update_meeting_status`); the argue-worthy CAS path
(`transition_meeting_status`) is reserved for the end-acquisition race. An
`ended` meeting that is archived and later unarchived becomes **`active`
again** (pre-archive state is not remembered).

### Money and usage accounting

Paid inference is always ledgered: `Message.estimated_cost`, meeting
`total_cost`, and per-turn usage events (`done.usage` =
`{prompt_tokens, completion_tokens}` on the stream). Embedding/moderation
side effects are accounted separately by the inference ledger
(`tests/.../test_inference_ledger.py`, `test_orchestrator_knowledge_scope.py`).

### Ordering and pagination

No pagination anywhere. Message lists are created_at-ordered; meeting and
document lists are newest-first (`created_at desc`). The meeting list is
**not** filtered by status — archived meetings keep being listed; hiding is
a presentation concern today.

## Endpoint inventory

### Meetings — `/api/meetings` (`app/api/meetings.py`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST ""` | command | `MeetingWithParticipants` (participants materialized from personas) | name (+agenda, persona_ids) | 422 str(exc) w/ "Unknown personas" | Validation happens **before** any write; persona knowledge-stack assignments snapshotted at creation |
| `GET ""` | observation | `Meeting[]` | — | — | Not status-filtered; archived stay listed |
| `GET /{meeting_id}` | status | `MeetingWithParticipants` | meeting_id | 404 "Meeting not found" | Canonical record feed for detail views |
| `POST /{meeting_id}/message` | command | `Message` | meeting_id, content | 404 "Meeting not found"; 403 demo-guard | Content-only body (`UserMessageRequest`); closed meetings 409 via write guard |
| `POST /{meeting_id}/summary` | command (paid) | `Message` | meeting_id, BYOK | 409 closed; 422 `EmptyConversationError` / missing key; 404 "Meeting not found"; 500 `Error generating summary: ...` | Interim summary is persisted + ledgered; system-only conversations are 422 |
| `POST /{meeting_id}/turn` | command (paid) | `TurnResponse {message, disagreements, consensus}` | meeting_id, participant_id, BYOK | 409 closed (entry-time guard); 422 missing key; 404 "Meeting not found"; 500 `Error executing turn: ...` | Non-streaming turn; closing mid-turn persists the paid response (spec-02 policy, `test_end_meeting_recovery`) |
| `POST /{meeting_id}/turn/stream` | command (paid) | SSE stream (see stream contract) | meeting_id, participant_id, BYOK | same pre-stream failures as `/turn` (raised before stream starts) | Exactly one terminal (`done`/`error`) on a healthy stream |
| `GET /{meeting_id}/disagreements` | observation | `Disagreement[]` | meeting_id | — | Scoreboard source |
| `GET /{meeting_id}/consensus` | observation | `Consensus[]` | meeting_id | — | Scoreboard source |
| `GET /{meeting_id}/context-stats` | status | `ContextStats` | meeting_id | 404 "Meeting not found" | Stable keys `{current_tokens, max_tokens, usage_percent, message_count, participant_count}`; `message_tokens`/`system_tokens`/`agenda_tokens` appear only when tiktoken resolves `cl100k_base`; `max_tokens` is the fixed 128000 budget |
| `POST /{meeting_id}/end` | command (paid during summary) | `EndMeetingResponse {success, votes: EndMeetingVote[], summary, message}` | meeting_id, force_end | 404 "Meeting not found"; 409 `MeetingClosedConflict`; 403 demo-guard | Recoverable closing flow: entry serialization → votes → summary → atomic commit; **`EndAttemptIncomplete` is NOT an HTTP error** — it returns 200 with `success: false` and an explicitly retryable message (retry resumes at the summary phase) |
| `POST /{meeting_id}/archive` | command | `{success: true, message: "Meeting archived successfully"}` | meeting_id | 404 "Meeting not found"; 400 "Meeting is already archived"; 500 "Failed to archive meeting" | Last-writer-wins; archiving an `ended` meeting is allowed |
| `POST /{meeting_id}/unarchive` | command | `{success: true, message: "Meeting unarchived successfully"}` | meeting_id | 404; 400 "Meeting is not archived"; 500 | Restores to `active` unconditionally |
| `DELETE /{meeting_id}` | command | `{success: true, message: "Meeting deleted successfully"}` | meeting_id | 404; 500 "Failed to delete meeting" | Order: `vector_cleanup_ledger.record(collection, kind="meeting", id)` → `vector_store.delete_collection(...)` → SQL delete; Qdrant outage degrades to a `last_error` ledger row, **never** blocks the SQL delete (reconciliation finishes) |

### Participants — `/api/participants` (`app/api/participants.py`)

| Method & path | Class | Receipt | Notes |
|---|---|---|---|
| `GET /templates` | observation | `[{name, role, system_prompt, color}]` | Default roster templates for the "New Meeting" wizard |
| `POST ""` | command | `AIParticipant` | Participant added to an existing meeting |

### Personas — `/api/personas` (`app/api/personas.py`)

| Method & path | Class | Receipt | Safe errors | Notes |
|---|---|---|---|---|
| `GET ""` | observation | `PersonaListResponse {personas, total}` | — | `user_id` + `include_defaults` query params (`include_defaults=true` default) |
| `POST ""` | command | `PersonaWithPrompt` (201) | 422 str(exc) | Creates initial prompt version |
| `GET /{persona_id}` | status | `PersonaWithPrompt` | 404 "Persona not found" | |
| `PUT /{persona_id}` | command | `PersonaWithPrompt` | 422 str(exc); 404 | System prompt is NOT editable here — it is versioned (see prompts). Stack assignments update via `stack_ids` |
| `DELETE /{persona_id}` | command | 204 empty | 404 | |
| `GET /{persona_id}/prompts` | observation | `PromptVersion[]` | — (no explicit 404 observed on this route today) | Version history |
| `POST /{persona_id}/prompts` | command | `PromptVersion` (201) | 404; 422 | New version (content body) |
| `POST /{persona_id}/prompts/{version}/activate` | command | 200 `{...}` | 404 "Prompt version not found"; 404 "Persona not found" | Activation flips `is_active`; reads pick `active_prompt` + `active_prompt_version` |

### Settings — `/api/settings` (`app/api/settings.py`)

| Method & path | Class | Receipt | Safe errors | Notes |
|---|---|---|---|---|
| `GET /providers` | observation | `ProvidersListResponse {providers: ProviderInfo[], environment: EnvironmentInfo, system_ai: SystemAIConfig}` | — | The canonical server-side capability snapshot (defaults, which providers are configured); drives the settings UI and BYOK validation |
| `POST /models` | probe | `FetchModelsResponse {success, models: [{id, name, context_length?}], message}` | failure is returned as a receipt: `success: false, message: "Unknown provider: {provider}"` (NOT an HTTP error); 403 demo-guard for POST | Optional `api_key` rides the **body** (probe exception); external catalog call; Ollama destinations validated by `_ensure_trusted_ollama_destination` (`test_ollama_origin_allowlist`) |
| `POST /test-key` | probe | `TestKeyResponse {valid, message, models?}` | 400 `Unknown provider: {provider}` (raised here, unlike `/models`); 403 demo-guard | Same probe exception for the key; exercises the same Ollama destination allowlist |

### Documents — `/api/documents` (`app/api/documents.py`)

| Method & path | Class | Receipt | Safe errors | Notes |
|---|---|---|---|---|
| `POST /upload` | command | `DocumentUploadResponse {id, file_name, status, chunk_count, message}` | 400 "Invalid target for document upload"; 403 demo-guard; 422 | multipart FormData with `file` + optional `meeting_id`/`persona_id`/`stack_id`; extraction budget + bounded upload read enforced (Phase 1 tests); legacy formats (.xls) rejected |
| `GET /meeting/{meeting_id}` | observation | `Document[]` | — | Scope = shared meeting knowledge |
| `GET /persona/{persona_id}` | observation | `Document[]` | — | Scope = private persona stack knowledge |
| `GET /stack/{stack_id}` | observation | `Document[]` | — | Scope = stack-owned knowledge |
| `GET /{document_id}` | status | `Document` | 404 "Document not found" | `status ∈ {processing, indexed, failed}`; `error_message` for failed |
| `DELETE /{document_id}` | command | `{message, id}` | 404; 403 demo-guard | Deletes vector points + record |
| `POST /search` | observation (embedding side effect) | `DocumentSearchResponse {query, results: [{text, score, document_id, file_name, chunk_index}], total_results}` | 422 | Query scope is the intersection rules proven in `tests/.../test_document_search_scope.py` (`meeting_id`/`persona_id`/`stack_ids` + limit default 5) |

### Knowledge stacks — `/api/knowledge_stacks` (`app/api/knowledge_stacks.py`)

| Method & path | Class | Receipt | Safe errors |
|---|---|---|---|
| `GET ""` | observation | `KnowledgeStackListResponse` | — |
| `POST ""` | command | `KnowledgeStack` (201) | 422 |
| `GET /{stack_id}` | status | `KnowledgeStack` | 404 "Knowledge stack not found" |
| `PUT /{stack_id}` | command | `KnowledgeStack` | 404 |
| `DELETE /{stack_id}` | command | 204 | 404; 403 demo-guard |

## Stream turn contract

`POST /{meeting_id}/turn/stream` (SSE via `sse-starlette`) is the canonical
turn transport. The client is `api.streamTurn` (`api.ts`); the parser rules
below are pinned by `frontend/tests/fixtures/sse-envelopes.test.ts` and the
backend fakes in `backend/tests/doubles/transports.py`.

- **Wire format**: each frame is `data: {json}\n\n`. `format_sse_event`
  returns `{"data": json.dumps(model_dump)}` for `sse-starlette`.
- **Event union** (`StreamEvent`, fields optional except `type`):

  | Event | Payload fields | Semantics |
  |---|---|---|
  | `text` | `content` | Assistant visible chunk; rendered in order of arrival |
  | `thinking` | `content` | Chain-of-thought chunk; separate buffer |
  | `tool_call` | `tool_name`, `tool_arguments`, `tool_call_id` | Tool invocation announced **before** execution; duplicate tool names are legal and disambiguated by `tool_call_id` |
  | `tool_result` | `tool_call_id`, `tool_result` | Paired by id; may appear split/followed by more `text` |
  | `citation` | `source`, `title?`, `url?`, `snippet?` | Knowledge-grounding evidence; can interleave between text chunks |
  | `done` | `message_id`, `usage: {prompt_tokens, completion_tokens}` | Successful terminal; the persisted message id lets the client reconcile the store |
  | `error` | `content` (+ `interrupted` only when synthesized client-side) | Failure terminal |

- **Parser rules** (client-side, `api.ts`):
  - Stream is decoded as text, split on `\n`; empty lines skipped; only
    `data:` lines carry events (SSE `\n\n` separators are structural).
  - **Exactly one terminal** (`done` or `error`) ends a healthy stream;
    non-terminal events after the terminal are ignored with a console warn
    (never replayed to the UI).
  - A final unterminated frame (truncated leftover) is still attempted as a
    parsed event.
  - EOF **without** a terminal synthesizes a recovered-interruption error:
    `{type: "error", interrupted: true, content: "The stream was
    interrupted before the turn completed. Any partial result may already be
    saved — retry when ready to continue."}` — the store clears its busy
    state; there is **no auto re-inference** (the user decides whether to
    retry).
  - Malformed JSON is logged (`[SSE Parse Error]`) and skipped, never thrown.

## Coordinated compatibility cuts (tracked)

Cuts below keep the two clients working while the target architecture is
built. Each names its **removal owner** — the spec that is expected to delete
the compatibility surface.

| Cut (current shape) | Why it exists | Removal owner | Planned target |
|---|---|---|---|
| `frontend/src/lib/api.ts` monolith (702 lines, meetings/personas/settings/documents/stacks/constants in one file) | Single owner of transport today | **Spec 05** (frontend API seams) | `src/features/*/api/{client,keys,queries,mutations}.ts` + `src/shared/api/*` |
| `frontend/src/stores/meetingStore.ts` mixes canonical record fetch + transport buffering + stream buffers | Store grew around the monolith API | **Spec 05/07** | React local state for transient input; Zustand for provisional stream state only; TanStack Query owns server records |
| 17 suites under `frontend/src/test/*` instead of colocated tests | Historical layout; moved setup already | **Spec 05** (fixture relocation happens alongside feature extraction) | Colocated `*.test.ts(x)` beside feature files; `tests/` keeps architecture + fixtures |
| `Orchestrator` monolith service (588 lines: turn lifecycle, tools, streaming, accounting in one class) | Original turn engine | **Spec 07/08** | `app.modules.meetings.application` use cases + capabilities (configuration already extracted) |
| Route-level business logic in `app/api/*` (context-stats computing, archive policy inline) | Meh API-era shortcut | **Spec 04+** (composition lands use-case boundaries) | presentation layer delegates to application services |
| `app.services.orchestrator` re-exports `MissingProviderKeyError`/`resolve_generation_settings` + `summary_service` imports them from the old location | Keeps every import site stable while capabilities exist | **Spec 07/08** | Importers move to `app.capabilities.configuration` directly |
| `app.models.schemas` mixes meeting/persona/document/DTO shapes untyped-ish | Historical single-module DTO bag | ongoing per-module tightening (first touched by Specs 07/08) | Module-owned DTOs in `app.modules.*.presentation` |
| `app/core/__init__` re-exported `get_supabase` (removed in spec-03 `e7d2507`) | Made `app.core.config` import drag the Supabase SDK into every consumer | **Done in Spec 03** — new rule: platform `__init__` packages stay side-effect-free; import submodules directly | — |

## Open decision gates

Spec 03 left these two load-bearing decisions open, each with an owner that
blocks named downstream specs until it lands.

### 1. Real transaction strategy — **DECIDED (spec 04, 2026-10-19)**

**Decision: Option A — narrow Postgres RPCs invoked through the Supabase
client.** One SQL function per atomic multi-table invariant
(`security invoker`, pinned `search_path`, execution granted only to the
verified backend service role, revoked from anonymous roles). Ordinary
single-table writes stay on the standard Supabase client calls.

Rationale recorded at decision time:

- Phase 1 already built and proved the pattern: `activate_prompt_version`,
  `create_prompt_version` (007), `replace_persona_stacks` (005),
  `create_meeting_transaction` (008), `commit_meeting_ending` (010),
  `record_inference_cost` (011) — each with rollback semantics validated
  against disposable embedded Postgres (fake + real contract parity).
- Option B (direct psycopg transaction adapter) would add connection-pool
  configuration and lifecycle responsibilities without a requirement the
  RPCs fail to meet, and would re-validate every seam the RPCs already do.
- Rollback-safety constraints checked: the embedded-Postgres test harness
  executes the same functions SQL-side, so tests exercise the real
  transactions; the RLS posture stays table-managed; the RPCs contain no
  cross-database side effects.
- Escape hatch: module `application/ports.py` interfaces keep the transport
  replaceable — a direct-connection adapter could later implement the same
  ports without touching domain/application code.

### 2. Original source-byte store — owner: Spec 09 (knowledge ingestion)

Uploads currently extract text immediately and persist only chunks/vectors;
the original bytes live and die with the request. Once ingestion must be
repriced/retried with new parameters, the bytes need a home:

- **Option A**: Supabase Storage bucket (server-side, integrates with the SQL
  record row).
- **Option B**: a persistent local filesystem (volume) behind a focused
  source-store interface.

Constraints: retention/backup posture, demo/hosted deployment parity, and
the bounded-read doctrine (upload re-reads are budgeted). **Blocks Spec 09**
(knowledge ingestion) — ingestion pricing/retries cannot land without this
decision.

### 2. Original source-byte store — owner: Spec 09 (knowledge ingestion)

Uploads currently extract text immediately and persist only chunks/vectors;
the original bytes live and die with the request. Once ingestion must be
repriced/retried with new parameters, the bytes need a home:

- **Option A**: Supabase Storage bucket (server-side, integrates with the SQL
  record row).
- **Option B**: a persistent local filesystem (volume) behind a focused
  source-store interface.

Constraints: retention/backup posture, demo/hosted deployment parity, and
the bounded-read doctrine (upload re-reads are budgeted). **Blocks Spec 09**
(knowledge ingestion) — ingestion pricing/retries cannot land without this
decision.
