# Spec 35: Live Turn and Message Reliability

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisite: Spec 34 vocabulary. Owns T22, T23, T24, T31; contributes P12/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope

Make active work observable and ordinary message delivery safe under network
uncertainty. Do not change provider policy, closing phases, or demo progression.

## Requirements

### Queue visibility — T22

The current read limits ascending admissions to the oldest 100 operations.
Return all relevant active work plus bounded recent terminal history, or provide
explicit pagination/cursors. Never silently exclude later active operations.
Preserve ordering, authorization, stable operation identity, and bounded reads.
Refetch/remount must not forget an admitted operation or require paid resubmission.

### Terminal reconciliation — T23

Retain observation identity until terminal settlement is reconciled. The current
controller selects only nonterminal operations, so polling can remove the watched
operation before the observer sees completion after a lost stream. Stream events,
polling, cancellation/failure, and next-operation races must converge on canonical
messages and record/accounting reads. Install a saved response once; remove a
projection only with a truthful terminal transition, not stale transcript data.
Reconnection observes existing work; it is not a new inference command.

### Message delivery — T24

Use the backend's existing request-key capability for ordinary chat. Retain one
submission identity across ambiguous delivery/retry until acknowledged or
reconciled; deliberately new messages receive new identities. Identical content
is not global deduplication. A lost response can follow a committed append, so
do not falsely state that an ambiguous send was not saved. Preserve the draft
and offer safe recovery. Upsert cache responses by canonical message ID rather
than blindly append when a GET may already contain the saved message.

### Input composition — T31

Enter confirming an input-method candidate must not send a message. Respect
composition state and preserve a deliberate subsequent send, existing shortcuts,
draft revision handling, accessible naming, and duplicate-admission protection.

## Local acceptance

- More than 100 completed operations, then active/new work: list/refetch/remount
  still observes the new operation and its canonical response without resubmission.
- Exercise real controller/observer integration: SSE loss/EOF, GET completion,
  terminal event versus polling race, next queued work, failure and cancellation.
  Hook tests that directly inject a terminal operation are insufficient alone.
- Commit then lose POST response, retry with the same send identity: one saved
  message. GET-before-POST-response: one cached message. A deliberate identical
  new message remains valid. Verify identity conflict and access-loss behavior.
- Browser composition candidate confirmation does not submit; intentional send
  does. No lost draft, duplicate message, or paid turn restart on navigation.
- Record executed tests and remaining browser/network limitations; no acceptance
  is claimed by this draft.

## Implementation record (2026-11-09)

Status remains a working draft: T22, T23, T24, and T31 are implemented and
covered by focused, integration, and regression tests. Spec 46 still owns
integrated acceptance.

### Dispositions

- **T22 queue visibility.** Migration `037_turn_queue_active_window.sql`
  replaces `list_turn_operations`. It returns every `pending`/`processing`
  operation regardless of admission age, plus bounded recent terminal history
  ordered by admission descending and limited by `p_limit`; the final aggregate
  is ordered by admission ascending. `p_limit` now bounds only terminal history.
  Authorization, stable operation identity, queue positions, and the existing
  response shape are preserved. Refetch and remount therefore retain later
  active work without submitting new inference.
- **T23 terminal reconciliation.** The turn controller now retains a watched
  operation after it leaves the nonterminal list, using turn-detail polling as
  the fallback until terminal settlement. `observationOperation` keeps the
  projection mounted; `activeOperation` remains the current nonterminal work for
  queue and roster presentation. Terminal settlement is guarded once per
  projection scope and invalidates meeting detail, turn list, context stats,
  disagreements, and consensus. A canonical message replaces the projection
  once, and a lost stream is reconciled by the terminal status read. Reconnection
  remains observation-only.
- **T24 message delivery.** Ordinary chat now sends a request key through the
  existing `UserMessageRequest.request_key` capability. A pending send identity
  survives ambiguous network and 5xx failures; a deliberate new message receives
  a new key, and identical content is never treated as global deduplication. A
  matching canonical message in a meeting read reconciles a lost response by
  `request_key`. Cached messages are upserted by canonical message ID rather than
  appended. Ambiguous, rejected, and access-loss failures preserve the draft and
  use truthful copy. Migration `038_message_request_key_conflict.sql` makes a
  same-key/same-payload retry idempotent and returns a conflict for the same key
  with different content or sender, without overwriting the saved message.
- **T31 input composition.** The composer tracks composition start/end and
  ignores Enter while composition is active, while `nativeEvent.isComposing` is
  true, for key code 229, and for the Safari ordering where `compositionend`
  precedes the confirming keydown. The confirming Enter is not prevented; a
  subsequent deliberate Enter sends. Shift+Enter, draft revisions, accessible
  naming, and duplicate-admission protection remain intact.

### Verification performed

- Backend full suite: `python -m pytest -q` — 988 passed, 1 skipped, 21
  pre-existing dependency warnings.
- Backend turn API: 8 passed; Spec 11 migration/upgrade checks: 13 passed.
- Backend message and closing regression: 19 passed.
- `python -m scripts.export_openapi --check`: passed with 57 paths.
- Frontend full suite: `npm test` — 116 files / 705 tests passed.
- `npm run test:unit`: 89 files / 528 tests passed.
- `npm run test:architecture`: 7 files / 52 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 17 pre-existing warnings.
- `npm run build`: passed (`next build`).
- T23 real controller/observer integration: 5 passed, covering lost stream and
  GET completion, failure, cancellation, terminal-event versus polling race,
  next queued work, and remount resume without submission.
- Meeting-room suite: 20 passed, including the IME candidate/next-Enter cases,
  cache upsert, ambiguous retry, GET-before-POST, access loss, and tab-navigation
  draft retention.

### Deferred owners and limits

- No live Supabase, operator-auth, or paid-provider run was performed. Provider
  behavior, authorization denial, and production network partitions remain
  environment-dependent.
- SSE loss, EOF, retries, and terminal/polling races are exercised through
  scripted transports and integration doubles, not a real browser network.
- IME behavior is simulated in happy-dom, including the Safari ordering case; it
  is not a real browser input-method session.
- Spec 46 owns integrated browser and end-to-end acceptance across the completed
  experience. This record is not an acceptance claim.
