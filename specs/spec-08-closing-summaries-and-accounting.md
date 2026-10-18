# Spec 08 (Phase 2): Coordinated Closing, Summaries, and Accounting

## Purpose and prerequisites

Coordinate meeting end with queued/running work and persist a recoverable, correctly priced outcome.

- [Durable queue and inference](spec-07-durable-turn-queue-and-inference.md) accepted, including fenced publication, conversation boundaries, provider attempts, status/observation, and frontend reconciliation.
- Atomic summary/status commit and idempotent usage adapter contracts run against real disposable Postgres. Have controlled provider/save failures and end-versus-claim/message barriers.
- Define close command/status/retry/abort DTOs, stages, deadlines/recovery for stalled turns, and archive's underlying lifecycle representation. Preserve normal versus force-end behavior.
- Read [closing/accounting contracts](reference-architecture-contracts.md#closing-and-accounting), System AI resolution, and the Phase 1 closing/write-guard/accounting regressions.
- Queue credential-handoff/re-provision contracts pass. Identify credentials required for each voting provider and System AI summary under the [runtime contract](reference-runtime-modes-and-credentials.md); shared defaults do not imply shared visitor keys or hosted operator fallback.

## Bounded scope and paths

Move admission/voting/summary/state logic from `backend/app/api/meetings.py` into Meetings `application/closing.py`, typed contracts, domain lifecycle/vote services, and atomic persistence adapters. Reuse the queue/inference/configuration/usage capabilities; don't build another provider loop in the route.

Migrate real summaries/close progress into `features/meetings/components/ClosingPanel.tsx`, canonical Query data, and `hooks/useClosingObservation.ts`. Remove the old route-body workflow only after new routes pass failure/retry tests.

## Tests to write first

- Atomically close new admission, cancel pending turns, and drain the sole executing turn before vote/summary. Race this with claim and user-message writes; rejected writes/claims cannot slip through stale prechecks.
- Vote rejection reopens active admission but never restores cancelled turns. Force-end skips voting only, not drain/guards. Test existing strict-majority/tie and invalid/error vote behavior explicitly without changing product rules accidentally.
- Persist vote/summary checkpoints. Provider failure, summary save failure, state save failure, concurrent close, retry, and abort expose a recoverable operation, not permanent unexplained voting or duplicate summaries.
- Every completed provider attempt, including rejected voting rounds, follow-ups, and summaries, has deduplicated usage despite later failure. Unknown usage stays unknown; estimates and reported amounts differ; local zero pricing remains explicit.
- Reload restores canonical progress/result. EOF/navigation reconciles the same close operation; no automatic regeneration. Archive/unarchive never reopens ended.
- Missing/expired credentials before a vote/summary pause the same closing operation for re-provision without restoring cancelled turns or repeating completed votes/summary. Force-end bypasses voting only, never credential requirements. Two visitors cannot hijack a closing handoff. Recorded demo votes/summary display without live close commands, persistence, or cost entries.

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
- Keep credential availability/recovery distinct from meeting status and closing checkpoints; release locks while awaiting re-provision. No secrets in vote/summary artifacts, durable jobs, logs, or response DTOs. Replay's labelled recorded completion is not evidence of a live final commit.

## Exit gate

Normal, forced, rejected, interrupted, failed/retried/aborted, credential-paused/re-provisioned, concurrent, and archived cases pass real API/database/frontend tests. No voting/busy trap, duplicate ending, implicit reopen, lost usage, operator-key fallback, secret persistence, or repeated completed paid checkpoint. Replay cannot execute closing or write its progress/results.

Next: [Durable knowledge and deletion-aware evidence](spec-09-durable-knowledge-and-redaction.md).
