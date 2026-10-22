# Spec 08 (Phase 2): Coordinated Closing, Summaries, and Accounting

## Purpose and prerequisites

Coordinate meeting end with queued/running work and persist a recoverable, correctly priced outcome.

- [Durable queue and inference](spec-07-durable-turn-queue-and-inference.md) accepted, including fenced publication, conversation boundaries, provider attempts, status/observation, and frontend reconciliation.
- Atomic summary/status commit and idempotent usage adapter contracts run against real disposable Postgres. Have controlled provider/save failures and end-versus-claim/message barriers.
- Define close command/status/retry/abort DTOs, stages, deadlines/recovery for stalled turns, and archive's underlying lifecycle representation. Preserve normal versus force-end behavior.
- Read [closing/accounting contracts](reference-architecture-contracts.md#closing-and-accounting), System AI resolution, and the Phase 1 closing/write-guard/accounting regressions.

## Bounded scope and paths

Move admission/voting/summary/state logic from `backend/app/api/meetings.py` into Meetings `application/closing.py`, typed contracts, domain lifecycle/vote services, and atomic persistence adapters. Reuse the queue/inference/configuration/usage capabilities; don't build another provider loop in the route.

Migrate real summaries/close progress into `features/meetings/components/ClosingPanel.tsx`, canonical Query data, and `hooks/useClosingObservation.ts`. Remove the old route-body workflow only after new routes pass failure/retry tests.

## Tests to write first

- Atomically close new admission, cancel pending turns, and drain the sole executing turn before vote/summary. Race this with claim and user-message writes; rejected writes/claims cannot slip through stale prechecks.
- Vote rejection reopens active admission but never restores cancelled turns. Force-end skips voting only, not drain/guards. Test existing strict-majority/tie and invalid/error vote behavior explicitly without changing product rules accidentally.
- Persist vote/summary checkpoints. Provider failure, summary save failure, state save failure, concurrent close, retry, and abort expose a recoverable operation, not permanent unexplained voting or duplicate summaries.
- Every completed provider attempt, including rejected voting rounds, follow-ups, and summaries, has deduplicated usage despite later failure. Unknown usage stays unknown; estimates and reported amounts differ; local zero pricing remains explicit.
- Reload restores canonical progress/result. EOF/navigation reconciles the same close operation; no automatic regeneration. Archive/unarchive never reopens ended.

## Code example: preserve the vote rule as a pure service

Proposed fragment for Meetings `domain/services.py`. The voting workflow must separately classify/record invalid or failed ballots and preserve its accepted eligibility policy:

```python
def has_strict_majority(yes_count: int, eligible_count: int) -> bool:
    if eligible_count < 0 or not 0 <= yes_count <= eligible_count:
        raise ValueError("Invalid vote counts")
    return eligible_count > 0 and yes_count * 2 > eligible_count

def test_tie_is_not_a_majority():
    assert not has_strict_majority(1, 2)
    assert not has_strict_majority(0, 0)
    assert has_strict_majority(2, 3)
```

This helper does not authorize ending or handle drain/force behavior. Those belong to the application workflow and guarded persistence contracts.

## Code example: closing/drain acceptance

Proposed application test using a deterministic `closing_barriers` harness to implement. Its `request_end` returns a durable operation receipt, not a completed summary:

```python
async def test_end_cancels_waiting_but_drains_running(closing_barriers):
    running, waiting = await closing_barriers.start_running_and_waiting()
    close = await closing_barriers.request_end()
    assert await closing_barriers.turn_status(waiting) == "cancelled"
    assert await closing_barriers.close_stage(close) == "draining"
    assert closing_barriers.summary_provider.call_count == 0
    await closing_barriers.complete_running(running)
    await closing_barriers.complete_close(close)
    assert await closing_barriers.meeting_status() == "ended"
    assert await closing_barriers.final_summary_count() == 1
```

Repeat with negative votes and failures/checkpoint retries; cancelled turns remain cancelled. Run database races independently: a fake cannot establish atomic end admission or summary/status commit. Do not hold transactions across provider calls.

## Green and refactor

- Implement one persisted closing state machine: draining, voting where applicable, summarizing, failed/recoverable, completed. Keep meeting lifecycle and operation progress distinct; map old statuses explicitly.
- Resolve voting settings from each participant's saved policy at vote start and summary settings through explicit System AI configuration, never arbitrary first participant selection. Freeze each effective invocation policy.
- Short atomic transitions/checkpoints plus one guarded final summary/ended commit replace sequential optimistic saves. Persistence retries reuse confirmed paid output; uncertain external calls require explicit recovery rather than blind replay.
- Publish progress/terminal state only from canonical committed outcomes. Keep attempt usage durable even if logical completion is rejected; aggregate counters deduplicate stable attempt IDs.

## Exit gate

Normal, forced, rejected, interrupted, failed/retried/aborted, concurrent, and archived scenarios pass through real API/database and frontend observation tests. No unexplained voting/busy trap, duplicate committed ending, implicit reopen, lost known usage, or replayed completed paid checkpoint remains.

## Implemented (spec-08 exit gate, recorded 2026-10)

Thirteen implementation and test commits from `07d19b3` through `9328627`, plus this exit-gate record. Each slice was written test-first at its seam: domain rule, schema/RPC harness, API acceptance, legacy-route removal, generated contract, client/query layer, and room UI. Nothing was pushed.

- Domain and persistence (`07d19b3`, `1a9f734`): pure `has_strict_majority`/stage/tally rules; migration `020` adds `meetings.archived_at`, `meeting_closings`, `closing_votes`, and closing ledger kinds. Archive is an overlay, so the public API still presents `archived` while the lifecycle status remains `ended` (or `active`) underneath.
- Admission and drain (`e601deb`): migration `021` atomically closes new turn admission, cancels queued turns, records the closing operation, and drains the sole executing turn. Database races cover close-versus-claim and close-versus-user-message; rejected writes cannot pass a stale precheck. Force-end skips voting only, never drain or write guards. A rejected vote reopens active admission but cancelled turns stay cancelled.
- Ballots and usage (`5d1629d`): migration `022` checkpoints each ballot with its attempt identity, provider/model, vote, reason, and usage. Invalid ballots and provider errors are recorded as no-votes; every completed attempt is ledgered exactly once.
- Summary and final commit (`dc4120b`): migration `023` reserves one summary attempt and saves the paid output once under a lease. A guarded final transaction writes the `📋 **MEETING ENDED**` summary and moves the meeting to `ended` together; retries reuse the confirmed checkpoint instead of replaying it.
- Application workflow (`c02a671`, `60ecd66`): `ClosingService` owns draining → voting (when applicable) → summarizing → completed, plus recoverable failed/rejected/aborted states. Ports keep provider calls outside transactions. Closing is advanced inline by the command/status HTTP request; startup reconciliation detects abandoned work. Routes are `POST/GET /meetings/{id}/closing`, `POST /closing/retry`, and `POST /closing/abort`.
- Write guards and archive semantics (`b30016c`): migration `024` adds archived checks to turn admission and claim; `/message`, archive, and unarchive use guarded RPCs. Duplicate message request keys return the original message, and archive during active closing returns `409` without setting `archived_at`. Unarchive never reopens an ended meeting.
- Legacy removal and contract (`1358c2b`, `4dc836f`): deleted the old `POST /meetings/{id}/end` route, `meeting_closer.py`, EndMeeting DTOs, and their tests only after the new failure/retry routes passed. The checked-in OpenAPI snapshot and generated types now contain the closing routes and no `EndMeeting*` schemas.
- Frontend observation (`e250958`, `d30d94a`): canonical closing decoders/client/keys/queries/mutations; polling only during non-terminal stages; `useClosingObservation` reconciles a settled result once and exposes an explicit reconnect, never an automatic regeneration. `ClosingPanel` shows stages, ballots, errors, retry/abort, and start/force confirmations. Ambiguous network/5xx failures reuse the request key; definitive 4xx responses rotate it. The room's legacy end flow and `api.endMeeting` were removed; `SummaryTab` now refreshes the presented meeting once the close settles.

Commands and results: backend full collection is **416 passed**, run in directory chunks to avoid the harness's long-command restarts: unit/contract/architecture **115**, integration **49**, regression **199**, application/characterization **37**, doubles **16**. Frontend is **224 passed / 39 files**; targeted ESLint is clean, `npm run sync:openapi` drift is green, and the existing unrelated `tsc` errors are outside the closing changes.

### Limitations (recorded honestly; never claimed as executed)

- Closing advances when the HTTP command/status call drives `advance()`; there is no independent background closer. A browser that leaves mid-close resumes observation later, but another request (status polling or retry) is what advances abandoned work.
- Provider calls are scripted. No paid inference, hosted Supabase, Qdrant network, or external provider was contacted; the embedded disposable Postgres establishes the database and API gate.
- Frontend observation tests install a scripted transport around `ClosingPanel`; they assert the exact GET/POST behavior and request-key discipline, but they are not a browser E2E against a live backend.

Next: [Durable knowledge and deletion-aware evidence](spec-09-durable-knowledge-and-redaction.md).
