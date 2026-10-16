# Stage A Evidence — Corrected Core Baseline (P10-T01/Stage A checkpoint)

> **Current scope correction (2026-10-16):** The execution observations below are historical. Authentication/identity/access-control work and B-05 are no longer requirements or gates; ownership checks described here do not mandate further work. Research requires only the current demo-grade content check and may proceed in parallel with UI/core implementation, not necessarily last. This annotation does not change code or claim new verification.

Authoritative scope at execution: `specs/` (MASTER, CONTRACTS, DELIVERY) plus guide §4 Stage A
("Stop condition: documented corrected core with the actual required tests,
migrations and recovery evidence. Stop on unresolved core prerequisites; do
not bypass with fixtures"). This document records what was corrected, how it
was verified, and what remains honestly deferred. It does **not** claim
verification for phases 00, 02 or 09 — their evidence remains absent and was
not fabricated.

## Commits

| Commit | Content |
|---|---|
| `89e0663` | Stage A core baseline: live turn SSE, queue drain, shared store, citations |
| `d06b035` | Stage A ending SSE: attempt journal, shared executor, stale recovery |

Working tree: only untracked `DEMO_REMEDIATION_AGENT_GUIDE.md` (never staged,
per its line 3).

## What was corrected

### 1. Turn streaming is now genuinely incremental (CONTRACTS §3, §4, §10)

- `Orchestrator.execute_turn_streaming` no longer awaits the whole turn and
  replays. It reserves an idempotency key, starts the run detached
  (`TurnRunner.register_detached` — dropped subscribers never cancel
  execution), resolves the turn id, and yields **live v2 journal envelopes**
  via `TurnRunner.subscribe`.
- `app/services/streaming.py` serializes dict envelopes correctly:
  `id`/`event`/`data` frames per §10 (the previous StreamEvent-only
  `model_dump` path raised `AttributeError`, swallowed into one error event).
- `InMemoryTurnStore.append_event` envelopes now carry `meeting_id` +
  `session_generation: None`; new lookup `turn_id_for_key`.
- `TurnEngine` emits `text_delta` for the **final answer** (segment
  `"{turn}:final"`) before `turn_completed`; interim tool-path deltas carry
  `segment_id` so provisional vs final text is distinguishable (§4).
- New endpoints: `POST /api/meetings/{meeting_id}/turns` → 202
  `{turn_id, state, events_url}` (404 meeting, 409 meeting_not_active /
  queue_not_drained / turn_in_progress, optional `X-Idempotency-Key`);
  `GET /api/meetings/turns/{turn_id}` authoritative state; `GET
  /api/meetings/turns/{turn_id}/events?after={sequence}` SSE replay-from-cursor
  then live until terminal. `POST .../turn/stream` and `POST .../turn` keep
  their names and `require_actor` guards (regression B-05).

### 2. Ending attempts stream over SSE with an ordered journal (CONTRACTS §2, §9, §10)

- `EndingJournalStore` (process singleton, `app/modules/meetings/ending.py`):
  v2 envelopes carry **`ending_attempt_id`, never a forged `turn_id`**
  (`turn_id: None`), monotonic `sequence`, `event_id = "{attempt}:{seq}"`.
  Each entry is appended only after its own persistence step; exactly one
  terminal event per attempt (`ending_completed` / `ending_failed`) —
  post-terminal appends are dropped.
- Event order pinned by tests: `ending_started` → (`vote_delta`,
  `vote_recorded`)* per participant (recorded only after
  `record_ending_votes` succeeds) → `summary_started` → `summary_delta`* →
  terminal. `summary_delta` chunks (`stream_chunks`) are published
  **before** the atomic outcome commit so the summary arrives before the
  terminal frame; deltas remain provisional until `ending_completed`.
- Shared executor `_execute_ending` used by both the preserved synchronous
  `POST /{meeting_id}/end` (B-05 name/signature/`EndMeetingResponse` shape
  unchanged for the frontend) and the new detached path.
- New endpoints: `POST /api/meetings/{meeting_id}/ending-attempts` → 202
  `{attempt_id, meeting_id, state, duplicate, events_url}` (404 meeting,
  409 meeting_not_active / queue_not_drained / turn_in_progress /
  ending_in_progress; duplicates return the original attempt and spawn no
  task); `GET /api/meetings/ending-attempts/{attempt_id}` authoritative
  state; `GET /api/meetings/ending-attempts/{attempt_id}/events?after=`
  SSE. Ownership failures are 404 (same policy as meetings).
- Atomicity: the attempt outcome, summary and usage still commit through the
  single `commit_ending_attempt` RPC (one transaction; failure restores or
  keeps `in_progress` correctly). Votes persist upsert-per-vote and are also
  re-recorded at terminal paths — per contract, a failed attempt keeps its
  votes.
- Journal-less attempts (created before a restart) are served by a bounded
  DB fallback (~60 s poll, then EOF without terminal = disconnect, not
  completion, §10); clients reconcile via `GET /ending-attempts/{id}`.
- Unexpected executor failures commit `failed` best-effort, publish
  `ending_failed`, and re-raise; the sync route still surfaces HTTP errors.

### 3. Stale ending attempts cannot block a meeting (recovery evidence)

- `begin_ending_attempt` (Supabase path): a live `in_progress` row without a
  live ending lease is committed `failed` through the atomic RPC (guarded
  direct update only when the RPC is unavailable pre-migration), then a
  fresh attempt is created. A live, unexpired ending lease still raises
  `ending_in_progress`.
- Lease-loss race: `_prepare_ending` claims the lease after begin; if the
  claim fails (racing turn), the fresh attempt is rolled back to `failed`
  before the 409, so no orphan row is left blocking (`test_prepare_rolls_back_attempt_when_lease_lost`,
  `test_post_ending_attempts_barriers`).

### 4. Queue drain is wired in production (CONTRACTS §5)

- `LifecycleStoreMixin.drain_queue`: per-meeting `asyncio.Lock`, FIFO
  `list_queue` → `dispatch_queue_entry` RPC (exactly-once pending→dispatched
  in one transaction), skips `already_dispatched`, stops on transport
  failure or when work becomes active; refuses non-active meetings.
- Called: after turn terminalization (sync + streaming task `finally`),
  and as a self-heal in `POST /messages` before the commit-vs-queue
  decision, and at the `/turn`, `/turn/stream`, `/turns` and ending route
  entries before their `queue_not_drained` barrier (failed/cancelled turns
  therefore drain too).
- `has_active_work` consults the shared turn store first — turns are now
  visible to busy detection (previously only `execution_leases` rows were
  read, which turns never write, so `/end` could run during a turn).

### 5. Shared singletons, citations, fail-closed leases

- Process-wide `get_shared_turn_store()` / `reset_shared_turn_store()` (and
  the ending journal equivalent) — orchestrator and busy detection see the
  same reservations; conftest resets both around every test.
- Lease construction fails closed: `RuntimeError("lease coordinator
  unavailable: ...")` instead of silently running unfenced.
- `_message_create` persists `citations` (they were accepted then dropped);
  `FakeMeetingRepo` captures them.

**Still open (deferred to the demo stages, recorded honestly):**
`app/infrastructure/demo/composition.py:127-128` still imports
`tests.doubles.providers` at runtime — a demo-subsystem defect Stage A did
not touch (per the guide, demo substitution collapses in Stages C/F).

## Verification

Runner (system Python ships a broken langsmith pytest plugin; this is the
documented command in phase-01/03/04/05/10 evidence):

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest tests -q -p anyio.pytest_plugin
# cwd: backend/
```

| Run | Result |
|---|---|
| Baseline after `89e0663` | 207 passed, 17 skipped, 7 deselected |
| After `d06b035` (Stage A complete) | **226 passed, 17 skipped, 7 deselected** |

- The 17 skips are pre-existing unmarked-async tests (14 in
  `test_turn_engine.py` + provider normalization), documented in
  phase-08 evidence; the 7 deselected are integration-marked (network guard
  opt-out).
- Regression ledger B-01..B-11 green, including B-05
  (`execute_turn`, `execute_turn_stream`, `end_meeting` keep names +
  `require_actor`) and B-01 (original tool-call id continuation through the
  orchestrator).
- New Stage A tests (19 + prior 21 from tranche 1 = 40 new in total):
  - `tests/application/test_stream_live.py` (5) — live v2 frames while the
    provider is blocked, monotonic sequences, one terminal, `:final`
    segment ordering, legacy reservation error, SSE frame shape.
  - `tests/api/test_turns_endpoints.py` (7) — 202/events_url/barriers,
    status + replay + ownership, submit self-heal.
  - `tests/application/test_queue_drain.py` (7) — FIFO, races, failure
    stops, orchestrator drain hooks.
  - `tests/unit/test_core_hardening.py` (4) — busy detection via shared
    store, fail-closed leases, persisted citations, segment journaling.
  - `tests/application/test_ending_stream.py` (8) — envelope identity,
    replay/single-terminal, lease-loss rollback, duplicate short-circuit,
    summary-delta ordering, per-vote persistence, rejected terminal,
    summary-failure terminal.
  - `tests/api/test_ending_endpoints.py` (5) — 202 + stream terminal,
    barriers + rollback, duplicate, sync `/end` shape + journal,
    state/events ownership + DB fallback.
  - `tests/unit/test_ending_recovery.py` (6) — stale recovery, live/expired/
    wrong-kind lease handling, no-stale fast path, RPC-unavailable fallback.

## Honest limitations (deferred, not hidden)

1. **Provider-level token streaming is not implemented.** LLM providers are
   called non-streaming (`provider.complete`); `summary_delta` and turn
   `text_delta` batches are journaled from completed text *between*
   generation and the terminal commit — they arrive before the terminal
   frame over local HTTP, but they are not per-token from the model. True
   provider streaming is a later, separable upgrade.
2. **Journals are process-local.** Single-worker runtime assumption for live
   subscription; other workers / post-restart readers use the authoritative
   GET + bounded DB-fallback stream (EOF = disconnect, reconcile via GET).
3. **`SqliteTurnLedger`/`DurableCoordinator` remain the lease/turn-persistence
   adapters**; the Postgres adapters are explicitly deferred in
   `app/modules/meetings/leases.py`.
4. **Phases 00, 02, 09 evidence remains absent.** This document does not
   substitute for it.
5. Frontend consumption of ending events (`vote_recorded`,
   `summary_delta`...) is not wired yet — `SummaryTab` still uses the sync
   `POST /end` response; stream consumption is Stage E work.

## Stage A stop-condition check

Documented corrected core: yes — tests above, recovery paths exercised, and
the demo-specific substitute was not used to bypass any of these fixes.
Unresolved core prerequisites: none known. The next authorized stages are the
vertical slice + home-page entry (Stage C / P10-T04-T05 partial), route-spanning
tutorial (Stage D), research seed last (Stage B, separately authorized), then
Stage F retire-and-verify.
