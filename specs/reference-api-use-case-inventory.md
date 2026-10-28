# Reference: API use-case and contract inventory

Recorded at the Spec 11 final cutover (2026-10). This is the authoritative
inventory of the public HTTP surface after the backend became module-owned.
Every live route is listed here; the contract test
`backend/tests/contract/test_api_inventory.py` fails when this table and the
running `app.routes` disagree.

Maintenance rules:

- New routes and stream events must be added here in the same commit that
  ships them.
- "Class" is the target-architecture vocabulary: **command** (causes a
  durable write or a paid side effect), **observation** (read-only record
  fetch), **status** (derived/read-only view computed on demand), **probe**
  (side-effecting but non-durable check against an external service).
- Response model names below are the OpenAPI schema names frozen in
  `frontend/tests/fixtures/openapi.json`.
- The running schema can be checked with
  `python -m scripts.export_openapi --check` from `backend/`.

## Cross-cutting conventions

### Error envelope (safe errors)

Every HTTP failure is `{ "detail": "<human readable>" }`. Validation failures
produced by FastAPI are `{ "detail": [ ... ] }`. A central exception handler
maps infrastructure failures to a safe `503` without leaking credentials or
driver messages. No endpoint returns a provider response body verbatim.

### Access and runtime modes

No endpoint declares an auth dependency. `local` and `hosted` runtimes are
shared, writable, no-sign-in workspaces; every visitor sees the same records.
`runtime_mode=demo` enables a read-only HTTP guard: middleware returns `403`
for any non-GET/HEAD/OPTIONS request under `/api` with
`"Demo workspace is read-only — mutations are disabled"`.

Phase 3 adds a separate replay request graph under `/api/replay`. It is not a
mode switch for the live graph: replay requests read only a published package
in `app.state.replay` through the dedicated spec-12 reader, and every non-GET
replay request is rejected before an adapter. The server pins one package and
version; a visitor may select an approved checkpoint, never a package outside
the pin. When no replay package is configured, `/api/replay/*` returns
`503 replay_not_configured`; a missing, retired, or corrupt package returns
`503` and never falls back to live data. The entry choice remains UX, not
authorization over the intentionally shared live API.

### BYOK generation contract

- Non-secret overrides ride the JSON body as `provider`:
  `{ provider, model, temperature, max_tokens, base_url }`; every field is
  optional and `null` means "inherit".
- The secret key rides `X-Provider-Key` and is never persisted.
- `base_url` is request-only and is never written to the database.
- Cloud providers require a browser key or a configured server key; otherwise
  the request fails with `422` and
  `"No API key available for {provider}. Provide a browser key (BYOK) or configure the server key."`
- The settings probes `POST /api/settings/models` and
  `POST /api/settings/test-key` are the conscious exception: their `api_key`
  is in the body because they are non-durable provider checks.

### Meeting lifecycle and accounting

The underlying lifecycle is `active -> voting -> ended`; archive is an overlay
represented by `archived_at` and public status `archived`. Writes to a `voting`,
`ended`, or `archived` meeting are rejected with `409` (`MeetingClosedError`),
except the closing workflow's own writes. Archiving an ended meeting is allowed;
unarchiving removes the overlay and preserves the underlying state. It does not
reopen an ended meeting.

Paid inference is ledgered through `inference_events`, `Message.estimated_cost`,
and `meeting.total_cost`. A failed ledger write is logged and never turns a
successful provider response into a failed request. The closing flow is paid:
a `GET` never calls a provider.

### Ordering and pagination

There is no pagination except the durable turn list's `limit` (1–200).
Messages are `created_at` ordered; meetings and documents are newest-first.
`GET /api/meetings` is not status-filtered; archived meetings remain listed.

### Document lifecycle

A document has an immutable revision id plus a current revision state:
`pending`, `parsing`, `indexing`, `ready`, `failed`, `revoked`, or
`unavailable`. Ingestion operations expose `pending`, `processing`, `ready`,
`failed`, or `revoked`. Original bytes live in the configured source store
(Supabase Storage by default); SQL is the eligibility authority. Legacy rows
without retained bytes are honestly `unavailable`, never reconstructed.

### SSE transport

`POST /api/meetings/{meeting_id}/turn/stream` (legacy compatibility) and
`GET /api/meetings/{meeting_id}/turns/{operation_id}/events` (durable replay)
both use `sse-starlette`. Each frame is `data: {json}\n\n`.

Legacy stream event union (`type` is required; other fields are optional):

| Event | Payload | Semantics |
|---|---|---|
| `text` | `content` | Assistant visible chunk, rendered in arrival order |
| `thinking` | `content` | Reasoning chunk, separate buffer |
| `tool_call` | `tool_name`, `tool_arguments`, `tool_call_id` | Announced before execution; duplicate names are legal |
| `tool_result` | `tool_call_id`, `tool_result` | Paired by id; may be followed by more text |
| `citation` | `source`, `title?`, `url?`, `snippet?` | Knowledge evidence |
| `done` | `message_id`, `usage: {prompt_tokens, completion_tokens}` | Successful terminal |
| `error` | `content` | Failure terminal; `interrupted` is synthesized only client-side |

Durable `/events` frames add `event_id`, `operation_id`, `meeting_id`,
`sequence`, `type`. Exactly one terminal event ends a healthy legacy stream.
A disconnect never cancels accepted work; EOF without a terminal is a client
recovered-interruption state, not an automatic re-inference.

## Endpoint inventory

### Meetings — lifecycle (`app/modules/meetings/presentation/meetings_http.py`, tag `meetings`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST /api/meetings` | command | `MeetingWithParticipants` | `name`, `agenda`, `persona_ids` | `422` unknown personas | Validation happens before any write; persona stack assignments are snapshotted at creation |
| `GET /api/meetings` | observation | `Meeting[]` | — | — | Not status-filtered; archived meetings stay listed |
| `GET /api/meetings/{meeting_id}` | status | `MeetingWithParticipants` | — | `404` "Meeting not found" | Canonical detail feed with participants and messages |
| `POST /api/meetings/{meeting_id}/message` | command | `Message` | `content`, `request_key` | `404`; `409` closed; `422` invalid | Idempotent user write; closed meetings reject writes |
| `GET /api/meetings/{meeting_id}/disagreements` | observation | `Disagreement[]` | — | — | Scoreboard source |
| `GET /api/meetings/{meeting_id}/consensus` | observation | `Consensus[]` | — | — | Scoreboard source |
| `GET /api/meetings/{meeting_id}/context-stats` | status | `{current_tokens,max_tokens,usage_percent,message_count,participant_count}` plus per-part detail when tiktoken resolves | — | `404` | `max_tokens` is the fixed 128000 budget; fallback is 4 chars/token and omits `message_tokens`/`system_tokens`/`agenda_tokens` |
| `POST /api/meetings/{meeting_id}/archive` | command | `{success,message,status}` | — | `404`; `400` already archived; `409` closing in progress; `500` | Last-writer-wins archive overlay |
| `POST /api/meetings/{meeting_id}/unarchive` | command | `{success,message,status}` | — | `404`; `400` not archived; `500` | Removes archive overlay; preserves underlying lifecycle state |
| `DELETE /api/meetings/{meeting_id}` | command | `{success,message}` | — | `404`; `500`; `503` knowledge cleanup unavailable | Cascades meeting rows and records parent knowledge deletion before SQL delete |

### Meetings — compatibility adapters (`app/modules/meetings/presentation/compat_http.py`, tag `meetings`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST /api/meetings/{meeting_id}/summary` | command (paid) | `Message` | optional BYOK | `404`; `409` closed; `422` empty conversation or missing key; `500` `Error generating summary: ...` | Interim summary is persisted and ledgered; system-only conversation is `422` |
| `POST /api/meetings/{meeting_id}/turn` | command (paid) | `TurnResponse {message,disagreements,consensus}` | `participant_id`, optional BYOK | `404`; `409`; `422`; `504` still accepted; `500` | Synchronous compatibility adapter over the durable queue; disconnect does not cancel accepted work |
| `POST /api/meetings/{meeting_id}/turn/stream` | command (paid) | SSE legacy event union above | `participant_id`, optional BYOK | pre-stream `404`/`409`/`422`; post-stream `error` event | Durable events are translated to legacy `text/thinking/tool_call/tool_result/citation/done/error` |

### Meetings — durable turns (`app/modules/meetings/presentation/turns_http.py`, tag `turns`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST /api/meetings/{meeting_id}/turns` | command (paid) | `TurnOperationResponse`, `202` new / `200` replay | `participant_id`, `request_key`, optional BYOK | `404` meeting/participant; `409` closed/conflict; `429` queue limit | Admission only; execution is server-owned |
| `GET /api/meetings/{meeting_id}/turns` | observation | `TurnOperationResponse[]` | `limit` 1–200 | — | Queue and recent terminal operations |
| `GET /api/meetings/{meeting_id}/turns/{operation_id}` | observation | `TurnOperationResponse` | — | `404` | Never starts work |
| `POST /api/meetings/{meeting_id}/turns/{operation_id}/cancel` | command | `TurnCancelResponse {outcome,status}` | — | `404`; `409` not cancellable | Cooperative while executing |
| `GET /api/meetings/{meeting_id}/turns/{operation_id}/events` | observation | SSE durable event stream | `after` cursor | `404` before stream | Replay and follow survive reconnects and worker/API separation |

Status vocabulary: `queued`, `executing`, `completed`, `failed`, `interrupted`,
`cancelled`. The durable `request_key` is globally unique; replaying it with
the same payload returns the original operation, while a different payload is
`409`.

### Meetings — coordinated closing (`app/modules/meetings/presentation/http.py`, tag `closing`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST /api/meetings/{meeting_id}/closing` | command (paid) | `ClosingReceipt`, `202` | `mode` (`vote`/`force`), `request_key`, optional `summary_settings` | `404`; `409` | Admission plus best-effort drive; returns a durable receipt, not a promised summary |
| `GET /api/meetings/{meeting_id}/closing` | observation | `ClosingView` | — | `404` | Read-only progress and committed result |
| `POST /api/meetings/{meeting_id}/closing/retry` | command (paid) | `ClosingView`, `202` | — | `404`; `409` | Resumes a recoverable stage |
| `POST /api/meetings/{meeting_id}/closing/abort` | command | `ClosingView` | — | `404`; `409` | Aborts an abortable close |

### Participants (`app/modules/meetings/presentation/participants_http.py`, tag `participants`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /api/participants/templates` | observation | `list[dict]` | — | — | Default roster for the new-meeting wizard |
| `POST /api/participants` | command | `AIParticipant` | participant fields | `422` validation | Adds a participant to an existing meeting |

### Personas (`app/modules/persona_catalog/presentation/http.py`, no tag)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /api/personas` | observation | `{personas,total}` | `user_id`, `include_defaults` | — | Catalog read |
| `POST /api/personas` | command | `TemplateView`, `201` | persona fields, `stack_ids` | `422` unknown stack/validation; `503` catalog unavailable | Creates the initial prompt version |
| `GET /api/personas/{persona_id}` | status | `TemplateView` | — | `404` "Persona not found" | |
| `PUT /api/personas/{persona_id}` | command | `TemplateView` | editable persona fields | `404`; `409` lost edit race; `422` | System prompt is versioned separately; stack assignments update here |
| `DELETE /api/personas/{persona_id}` | command | `204` | — | `404`; `503` | |
| `GET /api/personas/{persona_id}/prompts` | observation | `PromptVersion[]` | — | `404` | Version history |
| `POST /api/personas/{persona_id}/prompts` | command | `PromptVersion`, `201` | prompt content | `404`; `422` | New immutable version |
| `POST /api/personas/{persona_id}/prompts/{version}/activate` | command | `{message}` | — | `404` prompt/persona | Flips the active prompt version |

### Settings (`app/modules/settings/presentation/http.py`, tag `settings`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /api/settings/providers` | observation | `ProvidersListResponse {providers,environment,system_ai}` | — | — | Server capability snapshot; drives BYOK validation |
| `PUT /api/settings/system-ai` | command | `SystemAIConfig` | provider, model, temperature, max_tokens | `422` | `provider` is `''`, `ollama`, `openrouter`, or `gemini`; temperature 0–1; max_tokens 256–16000 |
| `POST /api/settings/models` | probe | `FetchModelsResponse {success,models,message}` | provider, optional `api_key`, `base_url` | Provider failures are returned in the body with `success: false` | External catalog probe; Ollama destinations are origin-allowlisted |
| `POST /api/settings/test-key` | probe | `TestKeyResponse {valid,message,models?}` | provider, optional `api_key`, `base_url` | `400` unknown provider; `422` validation | Same probe exception and Ollama allowlist |

### Documents (`app/modules/knowledge/presentation/http.py`, tag `documents`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `POST /api/documents/upload` | command | `UploadReceiptResponse`, `202` pending / `200` ready | multipart `file` plus exactly one of `meeting_id`, `persona_id`, `stack_id` | `400` invalid owner/type; `409` rejected; `413` too large; `422`; `503` unavailable | Bounded read, source-byte staging, and hash before acknowledgement |
| `GET /api/documents/operations/{operation_id}` | observation | `IngestionStatusResponse` | — | `404`; `503` | Operation progress, not a provider call |
| `POST /api/documents/operations/{operation_id}/retry` | command | `UploadReceiptResponse`, `202` pending / `200` ready | — | `404`; `503` | Retries a failed or unavailable ingestion |
| `GET /api/documents/meeting/{meeting_id}` | observation | `DocumentResponse[]` | — | `503` | Shared meeting knowledge |
| `GET /api/documents/persona/{persona_id}` | observation | `DocumentResponse[]` | — | `503` | Private persona knowledge |
| `GET /api/documents/stack/{stack_id}` | observation | `DocumentResponse[]` | — | `503` | Stack-owned knowledge |
| `GET /api/documents/{document_id}` | status | `DocumentResponse` | — | `404`; `503` | Includes revision and operation ids |
| `DELETE /api/documents/{document_id}` | command | `{message,id}` | — | `404`; `503` | Deletes eligibility and records revocation before retrieval reopens |
| `POST /api/documents/search` | observation (embedding side effect) | `DocumentSearchResponse {query,results,total_results}` | scope ids, query, limit | `400` missing scope; `422`; `503` | Results include text, score, document/revision/chunk ids, chunk index, file name |

### Knowledge stacks (`app/modules/knowledge/presentation/stacks_http.py`, tag `knowledge_stacks`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /api/knowledge_stacks` | observation | `{stacks,total}` | `user_id` | — | Stack directory |
| `POST /api/knowledge_stacks` | command | `KnowledgeStack`, `201` | name, optional description | `422` | Name max 100 characters |
| `GET /api/knowledge_stacks/{stack_id}` | status | `KnowledgeStack` | — | `404` "Knowledge stack not found" | |
| `PUT /api/knowledge_stacks/{stack_id}` | command | `KnowledgeStack` | name, optional description | `404`; `422` | |
| `DELETE /api/knowledge_stacks/{stack_id}` | command | `204` | — | `404`; `503` Knowledge cleanup unavailable | Deletes stack-owned knowledge through the lifecycle |

### Replay (`app/replay/http.py`, tag `replay`)

Replay routes resolve `request.app.state.replay` only. They never consult
`app.state.container`, a runtime header, a workspace id, or a provider key.
Recorded reads are limited to the published package pinned by the server;
`package`, `version`, and `checkpoint` are allowlisted selectors and invalid
values return `400 replay_selector_invalid`. Every non-GET path returns
`403 replay_read_only` before an adapter is called.

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /api/replay/session` | observation | `ReplaySessionView` | `package`, `version`, `checkpoint` | `400` selector; `503` | Run/package identity, checkpoints, intents, tapes, assets, capabilities, provenance |
| `GET /api/replay/meetings` | observation | `Meeting[]` | `checkpoint` | `503` | Recorded meeting list |
| `GET /api/replay/meetings/{meeting_id}` | observation | `MeetingWithParticipants` | `checkpoint` | `404`; `503` | Recorded detail; ids outside the package are not found |
| `GET /api/replay/meetings/{meeting_id}/disagreements` | observation | `Disagreement[]` | `checkpoint` | `404`; `503` | Recorded scoreboard |
| `GET /api/replay/meetings/{meeting_id}/consensus` | observation | `Consensus[]` | `checkpoint` | `404`; `503` | Recorded scoreboard |
| `GET /api/replay/meetings/{meeting_id}/context-stats` | observation | context stats object | `checkpoint` | `404`; `503` | Recorded token statistics |
| `GET /api/replay/meetings/{meeting_id}/documents` | observation | `DocumentResponse[]` | `checkpoint` | `404`; `503` | Recorded document status; assets are passive URLs |
| `GET /api/replay/meetings/{meeting_id}/safe-config` | observation | safe config object | `checkpoint` | `404`; `503` | Recorded participant/stack/provider labels only; no secrets |
| `GET /api/replay/meetings/{meeting_id}/closing` | observation | `ClosingView` | `checkpoint` | `404`; `503` | Recorded closing snapshot |
| `GET /api/replay/meetings/{meeting_id}/closing/events` | observation | typed closing SSE | `checkpoint`, `after` cursor | `404` before stream; `503` | Ballot/summary text only; never a participant turn |
| `GET /api/replay/meetings/{meeting_id}/turns` | observation | `TurnOperationResponse[]` | `checkpoint`, `limit` | `404`; `503` | Recorded operation list |
| `GET /api/replay/meetings/{meeting_id}/turns/{operation_id}` | observation | `TurnOperationResponse` | `checkpoint` | `404`; `503` | Recorded operation status; never starts work |
| `GET /api/replay/meetings/{meeting_id}/turns/{operation_id}/events` | observation | SSE recorded event stream | `checkpoint`, `after` cursor | `404` before stream; `429` stream limit; `503` | Paced recorded events; no live polling or provider call |
| `GET /api/replay/assets/{asset_id}` | observation | recorded asset metadata | — | `404`; `503` | Passive public URL and provenance; no bytes proxied |
| `POST /api/replay/{path:path}` | command rejection | `{detail:"replay_read_only"}` | — | `403` | Catch-all rejects before any adapter |
| `PUT /api/replay/{path:path}` | command rejection | `{detail:"replay_read_only"}` | — | `403` | Same |
| `PATCH /api/replay/{path:path}` | command rejection | `{detail:"replay_read_only"}` | — | `403` | Same |
| `DELETE /api/replay/{path:path}` | command rejection | `{detail:"replay_read_only"}` | — | `403` | Same |

### Root and health (`app/bootstrap.py`)

| Method & path | Class | Receipt / shape | Request keys | Safe errors | Notes |
|---|---|---|---|---|---|
| `GET /` | observation | `{message:"Sabha API",version:"0.1.0"}` | — | — | Service identity |
| `GET /health` | observation | `{status:"healthy"}` | — | — | Liveness only; does not probe providers or storage |
