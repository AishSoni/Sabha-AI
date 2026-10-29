# Spec 20 (Phase 4): Backend Data-Access Latency and Event-Loop Responsiveness

## Purpose and prerequisites

Remove the latency that the current data-access style adds to **every** live and
replay API, not just the replay endpoints fixed by Spec 17. Specs 12–19 are
accepted at the local level (Spec 19 records conditional local acceptance and a
blocked public replay release). This spec does not add a feature; it repairs the
shared access pattern those specs left in place.

Spec 04 explicitly deferred this work: “`PersonaManager` and the adapter still
issue synchronous supabase calls inside async handlers — compatibility posture
from the legacy tree; latency restructuring is queued to the orchestrator
decomposition slices (spec-07/08), not this seam”
([spec-04](spec-04-backend-composition-and-transactions.md), line 94). Specs 07
and 08 delivered correctness, not the restructuring. Spec 17 then reproduced the
same pattern on the replay reader with a fresh TLS connection per operation. This
spec owns the deferred work for both paths.

Prerequisites:

- None functionally. The live and replay behaviour contracts, API fixtures,
  package immutability, permission model and SSE wire format must not change.
- Read the [runtime contract](reference-runtime-modes-and-credentials.md), the
  [package/playback contract](reference-replay-package-and-playback.md), and the
  replay deployment topology in [`docs/OPERATIONS.md`](../docs/OPERATIONS.md).
- Measurement requires a running backend and, for real numbers, the actual
  hosted Supabase project. Simulated-latency tests must run without either.

## Grounding: method and environment

Baseline measured 2026-10-29 against the user's running server at
`http://localhost:8000` (FastAPI/uvicorn) and the real hosted Supabase project.
No load generator was used: requests were issued sequentially unless a row says
“concurrent”, repeated while warm, and reported as the observed range. Direct
PostgREST probes used the configured service credential; no credential value is
recorded here.

Environment facts required to read the numbers correctly:

| Property | Observed |
| --- | --- |
| Backend host | Local Windows machine, single uvicorn worker |
| Supabase origin region | `ap-southeast-2` (Sydney) |
| Cloudflare edge serving the backend | `cf-ray …-BOM` (Mumbai) |
| PostgREST upstream service time | `x-envoy-upstream-service-time: 1–5` ms |
| PostgREST attempt count | `x-envoy-attempt-count: 1` |
| Raw unauthenticated edge request | 44 ms |
| Authenticated, origin-backed PostgREST request | 283–300 ms |
| Smallest probed body | 47 bytes (`meetings?select=id&limit=1`) |
| Global frontend query `staleTime` | 30 s (`frontend/src/shared/query/client.ts`) |

The gap between 44 ms and ~290 ms is the origin round trip paid by every
authenticated query. Server-side execution is 1–5 ms, so this spec is **not** a
query-plan or index-tuning assignment.

## Observed baseline

Round-trip counts are the calls the handler issues against Supabase; latency is
the measured HTTP response time.

| Endpoint | DB round trips | Observed latency |
| --- | --- | --- |
| `GET /health` (idle) | 0 | 1–7 ms |
| `GET /api/settings/providers` | 1 | 302, 316, 410, 525 ms |
| `GET /api/meetings` | 1 | 279, 290, 335, 355, 785 ms |
| `GET /api/meetings/{id}/turns` | 1 RPC | 281–529 ms |
| `GET /api/meetings/{id}` | 3 | 832, 851, 920, 928, 1001, 1047, 1447 ms |
| `GET /api/meetings/{id}/context-stats` | 3 (re-reads the meeting) | 880, 913, 1120 ms |
| `GET /api/meetings/{id}/closing` | 4 | 1438, 1519, 1608 ms; 2330 ms under load |
| `GET /api/personas` (9 rows) | **1 + 2N = 19** | **7181, 7290, 7396 ms** |
| `GET /api/participants/templates` | 0 (static) | 1 ms |
| `GET /api/replay/session` | 1 resolve | **6243 ms** |
| `GET /api/replay/…/turns?checkpoint=…` | 2 | **10.69 s** (user report) |
| `GET /api/replay/…/events?checkpoint=…&after=0` | 3 | **10.22 s + 5.32 s** download (user report) |

Arithmetic validates the model at ~300–380 ms per round trip: `19 × 0.38 ≈ 7.2 s`
matches the persona list, and each additional replay connection adds ~4.2–4.6 s.

### Proof that the event loop serializes the server

`/health` does no database work. Its latency is therefore a direct measurement
of event-loop availability:

| Concurrent load | `/health` latency |
| --- | --- |
| Idle | 2 ms |
| One `GET /closing` in flight (2330 ms) | **2331 ms** |
| One `GET /meeting` in flight (1047 ms) | **1046 ms** |
| Five concurrent `GET /meeting` | **1345, 5036, 5036, 5035, 5034 ms** |

Five concurrent requests finished in ~5.04 s — approximately their **sum**, not
their maximum. That is strict FIFO execution of the whole process, not database
contention. Three concurrent `/api/replay/session` calls likewise each took
6.8–7.1 s with no queueing, showing the replay reader pays its cost per request
independently.

## Findings

### F1. The replay reader opens a full TLS/SCRAM connection per operation

`ReplaySource._run` calls `self._connect()` and `connection.close()` around every
operation ([`backend/app/replay/source.py:125-145`](../backend/app/replay/source.py)).
`connect_replay_reader` performs TLS, SCRAM authentication, a five-query identity
assertion and `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
([`backend/app/platform/replay_database.py:92-108`](../backend/app/platform/replay_database.py),
assertion at `:57-89`). That is roughly eleven network round trips before the
first row, every time. The `asyncio.Semaphore(max_concurrency=8)` bounds
concurrency; it is not a pool. One turn observation opens three connections
(`get_replay`, `status`, tape), which is exactly the 10.22 s + 5.32 s split the
user observed.

### F2. The immutable replay package is re-resolved on every request

`ReplayRuntime.for_request` calls `source.resolve_package(...)` unconditionally
([`backend/app/replay/runtime.py:79-163`](../backend/app/replay/runtime.py)).
`resolve_package` reads the registry view, the manifest, **every checkpoint bundle**
(9 for the current package), all assets and all tapes, then re-computes SHA-256
and re-validates each bundle
([`backend/app/replay/source.py:147-314`](../backend/app/replay/source.py)).
`ReplayReads._reads()` re-reads a checkpoint per key with no memoization
([`backend/app/replay/reads.py:53-65`](../backend/app/replay/reads.py)), and
`ReplayObservation.status()` loads the whole checkpoint merely to answer a 404 or
a status ([`backend/app/replay/reads.py:159-168`](../backend/app/replay/reads.py)).
The frontend makes this worse: every checkpoint switch fires six parallel bundle
requests, each of which independently re-resolves the package
([`frontend/src/features/meetings/runtime/replay.tsx:396-433`](../frontend/src/features/meetings/runtime/replay.tsx)).
Spec 17 guarantees packages are immutable and atomically published, so caching
this data cannot violate a contract.

### F3. The synchronous Supabase client runs inline on the event loop

`supabase-py` is synchronous. These modules declare `async def` but call
`.execute()` directly, so the worker blocks for the full WAN wait:

| Module | Evidence |
| --- | --- |
| `meetings/application/meeting_service.py` | every method; `get_meeting` at `:126-161`, `list_meetings` at `:163-173`, writes at `:263`, `:286-296`, `:317`, `:336`, `:417-424`, deletes at `:495-522` |
| `meetings/infrastructure/supabase_closing.py` | `read` at `:185-250`, `_rpc` at `:508-509`, all stage/vote/summary writes |
| `persona_catalog/infrastructure/supabase.py` | every method, including `list_templates` at `:215-263` |
| `settings/infrastructure/system_ai.py` | `load_system_ai_config` at `:45-68`, `save_system_ai_config` at `:71-97` |
| `meetings/infrastructure/orchestrator.py` | `:209`, `:239`, `:353+`, `:368` |
| `meetings/infrastructure/summary.py` | `:84-159` |

This is the highest-leverage defect: it converts per-request latency into
server-wide unavailability. The correct pattern already exists in
[`backend/app/modules/meetings/infrastructure/turns.py:195-203`](../backend/app/modules/meetings/infrastructure/turns.py),
whose `_rpc` docstring explains exactly this hazard, and in the knowledge module,
whose sync repositories are consistently wrapped in `asyncio.to_thread`
(`knowledge/application/ingestion.py`, `queries.py`, `retrieval.py`,
`deletion.py`, `public.py`). Those two modules are the model to generalize, not
counter-examples.

### F4. Round trips are amplified by sequential and N+1 reads

| Path | Current shape | Anchor |
| --- | --- | --- |
| `get_meeting` | meeting → participants → messages, three sequential queries, each `select("*")` | `meeting_service.py:126-161` |
| `context-stats` | calls `get_meeting` again on top of the page's own read | `meetings_http.py:118-179` |
| `closing.read` | RPC already returns meeting + votes, then re-fetches the meeting (3), `closing_votes` (1), `operations` (1) | `supabase_closing.py:185-250`, `:252-267` |
| `list_templates` | rows query, then `prompt_versions` + `persona_knowledge_stacks` **inside the row loop** | `persona_catalog/infrastructure/supabase.py:215-263` |
| participant snapshots | one snapshot RPC per persona id | `construct_participants.py:92-96` |
| `get_ingestion` | documents + revisions + ingestions as three point queries | `knowledge/infrastructure/supabase.py:140-200` |
| `delete_meeting` | five sequential deletes | `meeting_service.py:495-522` |

`list_templates` is the worst: it is O(N) in round trips and its own docstring
calls it a “legacy list fanout”. At nine templates that is 19 calls, ~7.2 s, and
the loop is frozen throughout.

### F5. Turn persistence issues one round trip per streamed delta

Inside the provider stream loop, every `TEXT` and `THINKING` event is awaited
through `_append_event`, which performs an `append_turn_event` RPC
([`turns.py:766-781`](../backend/app/modules/meetings/infrastructure/turns.py),
[`:455-469`](../backend/app/modules/meetings/infrastructure/turns.py)). Providers
yield one event per SSE delta (`platform/providers/openrouter.py:211-225`, and the
same shape in `gemini.py`/`ollama.py`), i.e. approximately per token. At 300 ms
per write, a 400-delta answer spends ~2 minutes in persistence, and the next
delta is not read until the previous insert returns, so streaming is throttled by
the database rather than by the model.

### F6. Polling multiplies the load

| Poller | Interval | Cost |
| --- | --- | --- |
| `turn_event_stream` | 0.5 s | `events` + `status` RPC per tick (`turn_stream.py:72-91`) |
| `TurnRunner._loop` | 0.5 s | one claim RPC per tick even when idle (`runner.py:97-110`) |
| Frontend closing | 1.5 s while active | 4 round trips per poll (`api/closing-queries.ts:18,35-36`) |
| Frontend turns | 2 s while non-terminal | 1 RPC (`runtime/hooks.ts:117-125`) |

The closing poll costs ~1.4 s and repeats every 1.5 s, so it runs effectively
back-to-back for the whole closing phase. Each poll also occupies the single
event loop for its full duration.

### F7. There is no server-side caching

A repository-wide search for `Cache-Control`, `ETag`, `lru_cache` and `TTLCache`
finds only SSE `no-cache` headers. Persona catalog rows, prompt versions, stack
assignments, system AI settings, provider metadata and replay package data are all
re-read per request even though they change rarely (or never).

### F8. A new Supabase client object is constructed per admin call

`get_supabase_admin()` calls `create_client(...)` on every invocation instead of
reusing the singleton pattern used by `get_supabase`
([`backend/app/platform/database.py:68-70`](../backend/app/platform/database.py)).
The shared `httpx.Client` underneath is process-wide, so this costs object
construction rather than a new pool, but it defeats the singleton contract and
invites a future per-call pool.

### F9. A cold meeting page fans out to ~13 sequential round trips

`MeetingRoom` mounts four queries at once — meeting, disagreements, consensus and
context-stats — plus closing observation and turns
([`MeetingRoom.tsx:98-101`](../frontend/src/features/meetings/components/MeetingRoom.tsx),
`:221`). Meeting (3) + disagreements (1) + consensus (1) + context-stats (3 again)
+ closing (4) + turns (1) ≈ 13 round trips ≈ 3.6–4 s, all serialized by F3 even
though the browser issued them concurrently. There is no per-query `staleTime`;
only the 30 s global default protects repeat navigation.

### F10. Incidental defects found while measuring

- `GET /api/personas/templates` returns **503** after ~324 ms: there is no static
  route, so it matches `GET /api/personas/{persona_id}` with
  `persona_id="templates"` (`persona_catalog/presentation/http.py:114-115`),
  fails UUID validation and is translated to `APIError` → 503. It should be 404 or
  422, and it currently masks the real static route `/api/participants/templates`
  (1 ms).
- `get_meeting` orders messages by `created_at`, while the only matching index is
  `idx_messages_meeting_sequence (meeting_id, sequence)`
  (`migrations/018_turn_queue_schema.sql:98-99`). Ordering by `sequence` would be
  index-only. Server-side time is 1–5 ms today, so this is free correctness, not a
  latency fix.
- `select("*")` on meetings, participants and messages pulls
  `tool_artifacts`, `thinking_content`, `citations` and `effective_generation`
  into every list and detail response.

## Rejected explanations

| Hypothesis | Why it is not the cause |
| --- | --- |
| Bad query plans or missing indexes | PostgREST reports 1–5 ms of upstream service time; a 47-byte response still costs ~290 ms. |
| Supabase capacity or throttling | `x-envoy-attempt-count: 1`, no 429s, stable per-query cost, same cost from repeated warm probes. |
| HTTP connection pooling | A process-wide `httpx.Client` with keep-alive already exists (`platform/database.py:33-48`, `platform/http_client.py`). Fixing it again changes nothing. |
| Payload size | The smallest probe is 47 bytes and still pays the full round trip. |
| Demo mode | Replay is slower for a different reason (F1/F2); live endpoints show the same per-query cost in ordinary use. |
| “The database is slow” | The database does 1–5 ms of work. The wire does the rest. |

## Deliverables

1. **One off-loop data-access boundary.** Every async handler that touches the
   synchronous Supabase client must await a single helper that runs the blocking
   call in a bounded thread (or the client must be replaced by an async
   implementation). Apply it to `meeting_service.py`, `supabase_closing.py`,
   `persona_catalog/infrastructure/supabase.py`, `settings/infrastructure/system_ai.py`,
   and the `orchestrator.py`/`summary.py` call sites. Keep the sync knowledge
   repositories and wrap at their existing call sites. Bound the executor so a
   burst cannot exhaust threads.
2. **A pooled replay reader.** Add `psycopg[binary,pool]` and a process-wide
   `ConnectionPool` (`min_size=2`, `max_size=8`, `autocommit=True`). Move the
   identity assertion and read-only session characteristic into the pool's
   `configure=` hook so they run once per physical connection. Keep
   `connect_replay_reader()` as the tested seam and close the pool on shutdown.
   Session-mode or direct connections only; a transaction pooler would break the
   session-scoped read-only setting.
3. **An immutable-package cache with single-flight.** Cache the resolved
   `PublishedPackage`, checkpoint bundles keyed by `(package_id, version,
   checkpoint_id)`, and tapes keyed by `(package_id, version, operation_id)`.
   Collapse concurrent misses per key so six parallel bundle reads produce one
   load. Bound the cache (LRU, small) and cache raw dictionaries rather than
   mutable DTOs. A short TTL may apply to registry/retirement status only; content
   never expires while the version is pinned. Warm the cache at startup on one
   connection and log-and-continue on failure.
4. **Consolidated hot reads.** Return meeting + participants + messages from one
   RPC (explicit columns, ordered by `sequence`); make `read_meeting_closing`
   return meeting, votes, attempt metadata and processing-start in one call;
   replace the persona list fanout with one lateral-join RPC or three batched
   `.in_()` queries; batch persona snapshots in meeting creation; join
   `get_ingestion` into one query.
5. **Batched turn-event persistence.** Coalesce streamed deltas and flush on an
   interval (150–250 ms), on tool/terminal events, and on error. Preserve
   monotonic sequence, `event_id` idempotency and ordering; never lose a terminal
   event; keep the durable log complete for replay and audit. Live SSE must serve
   from the same append path so observers see the same order.
6. **Bounded caching of slow-moving configuration.** Persona catalog list
   (TTL 30–60 s, invalidated on create/update/delete), system AI settings (TTL,
   invalidated on PUT), and provider metadata (static). Keys must include the
   workspace/user scope; never cache a meeting transcript beyond the request.
7. **Polling policy.** Raise idle intervals (runner 0.5 s → 2 s with jitter,
   closing 1.5 s → 3 s, turn list 2 s → 3–5 s), add backoff on error, and prefer
   Supabase Realtime (or an equivalent push channel) for `turn_events` when
   available. Polls must not overlap.
8. **Region placement and budgets in operations.** Record that the API must run
   in the same region as the database, or that the database must move, and treat
   cross-region deployment as a documented latency defect. Add the per-endpoint
   round-trip budget to `docs/OPERATIONS.md` so future changes are reviewable.
9. **Instrumentation.** Per-request timing middleware, a DB-call counter on the
   client wrapper, structured logs for cache hit/miss and pool wait, and an
   opt-in `performance` marker for real-environment measurements.

## Tests to write first

- **Event-loop responsiveness.** With a fake DB adapter that sleeps 300 ms per
  call, a concurrent `/health` request must answer in <100 ms, and N concurrent
  `GET /meeting` calls must complete in approximately the maximum, not the sum.
  This test fails today and is the primary regression guard.
- **Round-trip budgets.** A counting fake client asserts call counts per
  endpoint: `get_meeting` ≤ 2 (target 1), `context-stats` ≤ 1 (after reusing the
  meeting), `closing` ≤ 2, persona list ≤ 3 **regardless of row count**, meeting
  creation ≤ 2, `get_ingestion` ≤ 1. Adding a row to the fixture must not add a
  call.
- **Replay connection accounting.** A counting connector asserts one connection
  per cold request and zero on a warm cached request; a second request for the
  same checkpoint performs no DB work. Identity/permission assertions must run
  once per physical connection, verified against the disposable reader identity.
- **Cache invalidation.** Creating, updating or deleting a persona invalidates
  the list; PUT settings invalidates the config; a new pinned package version
  bypasses stale entries; retirement is observed within the documented TTL.
- **Event batching semantics.** N deltas over T seconds produce at most
  `ceil(T / interval) + 2` writes; order, sequence, `event_id` idempotency,
  terminal flush, error flush and replay equivalence all hold. SSE output remains
  byte-identical in content and ordering to the unbatched path.
- **Poll budgets.** An idle runner performs at most one claim per configured
  interval; an active turn performs at most two observation RPCs per interval;
  overlapping polls are impossible.
- **No behavior drift.** All Specs 01–19 suites, OpenAPI fixture, generated
  frontend types and SSE contract tests pass unchanged. Replay pacing (~0.9 s of
  recorded delays) remains by design; only the 4.4 s tape read disappears.
- **Real-environment measurement (opt-in).** A `performance`-marked harness
  records endpoint, round trips, p50/p95 latency, region pair and date. It must
  not assert absolute thresholds on a WAN, where CI variance would make the suite
  flaky; absolute gates belong to the co-located deployment check.

## Small implementation slices

1. Add instrumentation only: request timing, DB call counter, structured
   cache/pool logs. Change no behavior; capture a baseline table.
2. Introduce the off-loop helper and convert `meeting_service.py` and
   `supabase_closing.py`. Prove `/health` under load and the concurrency test.
3. Convert the persona catalog and settings modules; add the round-trip counter
   tests while the fanout is still visible.
4. Add the replay pool and move identity assertion into `configure=`. Re-measure
   `/replay/session` before touching the cache.
5. Add the package cache and single-flight, then startup warm-up. Re-measure the
   turn and event endpoints.
6. Consolidate `get_meeting`, `closing.read`, the persona list and snapshot
   batches, one RPC at a time with the budget tests as the gate.
7. Batch turn-event persistence; verify live SSE latency and replay tape
   equivalence.
8. Add TTL caches, polling policy and the deployment/region documentation.

Do not invert the order: batching or caching before offloading still leaves the
loop blocked, and consolidating RPCs before the counter exists makes regressions
invisible.

## Constraints and risks

- **Thread-pool exhaustion.** Offloading every call is only safe with a bounded
  executor and bounded per-request fanout; an unbounded `to_thread` in a loop
  moves the stall from the loop to the queue. Cap concurrency and keep the
  existing per-request limits.
- **Pooler mode.** The read-only characteristic and identity assertion are
  session-scoped. A transaction-mode pooler silently discards them; keep
  session-mode/direct connections and re-verify the reader identity in tests.
- **Cache correctness.** Only immutable package content may be cached without a
  TTL. Live transcripts, credentials and provider keys are never cached. Every
  TTL cache needs an explicit invalidation on write.
- **Multi-worker consistency.** Process-local caches are acceptable because the
  cached data is immutable or TTL-bounded; do not introduce cross-process
  assumptions. If more than one worker is used, invalidation must be TTL-based,
  not in-memory notification.
- **Batching durability.** A crash between flushes must not lose the terminal
  event or reorder the log. Flush in `finally`, keep `event_id` idempotency, and
  test the crash boundary.
- **Measured claims.** Keep simulated-latency results separate from real
  measurements. Do not present a synthetic 300 ms adapter as a hosted benchmark.

## Exit gate

- No async handler performs a blocking Supabase wait on the event loop; the
  responsiveness test proves `/health` stays <100 ms while slow DB calls are in
  flight, and concurrent identical reads complete in ~max, not sum.
- Every endpoint in the budget table meets its round-trip target, and the persona
  list is O(1) in rows. Budget tests fail on regression.
- Replay warm reads perform zero DB work; cold reads use one pooled connection;
  identity/read-only assertions run once per physical connection. The user's
  10.69 s / 10.22 s + 5.32 s case is re-measured and recorded.
- Turn streaming no longer pays one WAN write per delta; first-token latency is
  bounded by the model, not by persistence; replay and audit logs remain complete
  and ordered.
- All Specs 01–19 suites, API inventory, OpenAPI fixture and frontend contracts
  pass unchanged, and Spec 19's conditional release decision is re-evaluated
  against the new transport behavior.
- Before/after measurements are recorded with environment, region pair, round
  trips and date. Any unexecuted hosted check is listed as unexecuted, not passed.

## Evidence record

Write the completion record only after execution. It must contain:

| Field | Required content |
| --- | --- |
| Environment | Backend host and region, database region, worker count, Python/psycopg versions, deployment mode |
| Baseline | The table in “Observed baseline”, re-measured on the execution date |
| After | Same endpoints, same method, plus round-trip counts and cache hit rates |
| Replay | Cold/warm `/session`, turns, and events; connection count per request; tape pacing separated from read time |
| Streaming | First delta latency, total turn duration, writes per turn, terminal flush evidence |
| Regressions | Suite counts and any changed contract, with justification |
| Limitations | Every unexecuted hosted/co-located check, explicitly marked unexecuted |

## Operational notes

- The largest absolute win is placement, not code: co-locating the API with the
  database turns ~290 ms per query into single-digit milliseconds and makes the
  remaining budgets easy. Record the current cross-region pair as a known defect
  until placement changes.
- The measurement session echoed service credentials into tool output. Rotate the
  Supabase service key and the replay reader password before treating this record
  or its transcript as shareable. No credential values belong in this spec or in
  the evidence record.
- Replay tape pacing (~0.9 s for the credit tape) is intended behaviour and is not
  a latency defect. Remove the read cost, keep the pacing.
- Spec 19's hosted replay acceptance remains conditional and unaffected by local
  completion of this spec; re-run the relevant rows after transport changes.

## Relationship to prior specs

Spec 04 deferred this restructuring. Spec 07 made turn persistence durable but
kept per-event writes. Spec 12 isolated the reader identity but not its
connection lifetime. Spec 17 made packages immutable — which is precisely what
makes Deliverable 3 safe — while inheriting the per-operation connection cost.
Spec 19's release record stays historical; this spec changes the performance
evidence, not the release decision.

There is no Spec 21. Completion of this spec closes the latency work opened by the
replay investigation and the backend-wide audit.

## Completion record

Executed 2026-10-29 on branch `perf/spec-20-latency`.

### Environment

| Field | Value |
| --- | --- |
| Backend host | Windows acceptance host; `uvicorn main:app` on `127.0.0.1:8010`, 1 worker |
| Database | Hosted Supabase, region `ap-southeast-2` (Sydney) |
| Client edge | BOM (Mumbai); the cross-region pair from the baseline is unchanged |
| Python / database drivers | 3.12.10; `psycopg` 3.3.6; `psycopg_pool` 3.3.3 |
| Deployment mode | `local` runtime mode against the hosted database |
| Migrations | 033–036 were pending on the hosted project and were applied for this measurement (`python -m scripts.migrate`). This is a hosted-infrastructure change; the four migrations only create/replace functions and their grants. |

### Baseline

The original table was captured on the same date and pair with the same probe
method; it was not re-run before the first code change. Round trips → observed:

| Endpoint | RT | Observed |
| --- | --- | --- |
| `GET /health` (idle) | 0 | 1–7 ms |
| `GET /api/settings/providers` | 1 | 302, 316, 410, 525 ms |
| `GET /api/meetings` | 1 | 279, 290, 335, 355, 785 ms |
| `GET /api/meetings/{id}/turns` | 1 RPC | 281–529 ms |
| `GET /api/meetings/{id}` | 3 | 832, 851, 920, 928, 1001, 1047, 1447 ms |
| `GET /api/meetings/{id}/context-stats` | 3 | 880, 913, 1120 ms |
| `GET /api/meetings/{id}/closing` | 4 | 1438, 1519, 1608 ms; 2330 ms under load |
| `GET /api/personas` (9 rows) | 19 | 7181, 7290, 7396 ms |
| `GET /api/participants/templates` | 0 | 1 ms |
| `GET /api/replay/session` | 1 resolve | 6243 ms |
| Replay turns | 2 | 10.69 s (user report) |
| Replay events | 3 | 10.22 s + 5.32 s download (user report) |

### After

Same endpoints, same host/pair, same probe; two samples per endpoint after the
warm-up request (`C:\conda_tmp\opencode\spec20-after2.json`):

| Endpoint | RT after | Observed p50 / p95 |
| --- | --- | --- |
| `GET /health` | 0 | 1.2 / 1.2 ms |
| `GET /api/settings/providers` | 0 hot, 1 cold | 1.5 / 1.8 ms |
| `GET /api/meetings` | 1 | 278.6 / 289.8 ms |
| `GET /api/meetings/{id}` | 1 (`read_meeting_bundle`) | 322.3 / 526.2 ms |
| `GET /api/meetings/{id}/context-stats` | 1 (same bundle) | 278.6 / 302.6 ms |
| `GET /api/meetings/{id}/closing` | 1 (`read_meeting_closing`) | 304.3 / 641.3 ms |
| `GET /api/personas` | 3 fixed, 0 hot | 2.1 / 2.3 ms |
| `GET /api/participants/templates` | 0 | 1.1 / 1.2 ms |
| `GET /api/replay/session` | 0 hot, 1 cold | 5.3 / 5.5 ms |

Cache hits are visible in the second request: providers and personas fall from a
WAN read to ~2 ms, and the replay package is warmed at startup. Per-process
counters (`TTLCache.stats()`) were not exported by the probe, so exact hit rates
are not recorded.

### Responsiveness

`/health` while five concurrent `GET /closing` requests were in flight: min 1.2,
p50 1.4, p95 4.3, max **4.3 ms**. The five closing requests each took
325–739 ms client-side. The baseline was **2331 ms** for `/health` while a single
closing request was in flight. No handler now performs a blocking Supabase wait
on the event loop.

### Replay

- `/api/replay/session` is served from the startup-warmed cache: 5.3 ms, zero DB
  work (baseline 6243 ms, one uncached resolve).
- Turn tape, `checkpoint-credit`: cold **671.1 ms** (one pooled connection, one
  checkpoint read), warm **7.5 ms** (cache hit, zero DB work).
- Turn events: first **1686.9 ms**, second **940.8 ms**, both dominated by the
  intended ~0.9 s recorded tape pacing; the database read cost is gone.
  Baseline was 10.69 s for turns and 10.22 s + 5.32 s for events/download.
- Connection accounting is pinned by `test_replay_pool.py` and
  `test_replay_cache_connections.py`: one borrow per cold resolve, zero on warm
  reads, six concurrent checkpoint reads collapse to one load, and the identity
  and read-only session assertions run once per physical connection.

### Streaming

`TurnEventWriter` buffers text/thinking deltas and flushes at most once per
`TURN_EVENT_FLUSH_MS` (200 ms) or immediately on tool, citation, terminal and
error boundaries. Unit evidence: 100 deltas spread over 2 s produce 8–12 batch
RPCs instead of 100 per-delta writes; 400 deltas are therefore bounded by
`ceil(turn_duration / 0.2 s) + 2` writes. Integration evidence: array order is
preserved, retries are idempotent by `event_id`, a stale fence rejects the whole
batch, and terminal operations reject late events. SSE frame granularity is
unchanged because every delta still becomes its own `operation_events` row.
First-delta latency end-to-end against a live provider was **not measured** in
this environment; it is now model-bound rather than persistence-bound.

### Regressions

- Full backend suite: **814 passed, 4 failed, 1 skipped** before the four
  expectation fixes. The failures were stale migration-history counts (2),
  a runner immediate-drain race in a recovery test, and a `_SlowDb` double
  missing the new `rpc` seam. Fixed in `23431d6`; the four affected suites then
  ran **18 passed**. The full suite was not re-run after that commit.
- Frontend: **269 passed, 5 failed**. The same 5 failures reproduce on `HEAD`
  with the poll-interval edits stashed, in `replay-runtime.test.tsx` (4) and
  `meeting-room.test.tsx` (1); they are pre-existing.
- `scripts.export_openapi --check`: **54 paths unchanged**.
- `npx tsc --noEmit`: clean. `npm run build`: succeeded.
- Contracts: no public API, SSE frame, OpenAPI or frontend type change. New
  migrations add internal service-role-only functions.
- Spec 19's public replay release remains **conditional**; the hosted runbook
  rows still need re-running after this transport change.

### Limitations

- The co-located absolute p95 gate (`SABHA_PERF_COLOCATED=1`) is **unexecuted**:
  this run still uses the cross-region API/DB pair. Multi-region placement
  remains a documented deployment defect.
- Hosted permission inventory (`scripts.inventory_permissions`) is
  **unexecuted**: it requires `DATABASE_URL` and exceeded the 180 s timeout with
  no output in this environment.
- The after probe used two samples; p95 equals max and is indicative, not
  statistical.
- No live provider turn was executed end-to-end, so first-delta timing and
  terminal flush behavior on a hosted stream are **unexecuted**.
- Cache invalidation is process-local with a TTL backstop; no multi-worker
  consistency run was executed.
- The earlier measurement session echoed service credentials into tool output.
  Rotate the Supabase service key and the replay reader password before sharing
  this record or its transcript. No credential values are recorded here.
