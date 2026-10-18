# Spec 02 (Phase 1): Recovery and Data Safety

## Purpose and prerequisites

This spec owns the remaining **12 findings** plus **three qualified operational risks**. Repair partial-operation recovery, asynchronous UI integrity, deletion, and ingestion failure paths without starting the architecture-wide restructure.

Prerequisites:
- [Core correctness and access](spec-01-core-correctness-and-access.md) is accepted. In particular, the schema supports voting/ended, retrieval uses a supported client, and persona/settings/tool contracts work.
- Follow the [roadmap TDD requirements](roadmap-phase-1-existing-issues.md#tdd-and-examples) and [full evidence/fixtures](reference-review-evidence-and-fixtures.md). Build deterministic barriers and restartable isolated adapters before race tests.
- Implement `deferred_requests`, `stream_variants`, `indexing_barrier`, `indexed_parent`, `collection_creation_barrier`, `controlled_failure`, `inference_usage`, `creation_uploads`, and `ingestion_recovery`.
- Before promising durable recovery, record where original bytes/job state survive restart, their retention, and how cleanup works. Phase 1 may instead expose interrupted ingestion as an honest terminal failure/re-upload path; it must not claim durable replay without retained input. The full source-store selection remains a blocking decision in [Phase 2 knowledge](spec-09-durable-knowledge-and-redaction.md).

## Backend work packages and tests to write first

Each link preserves exact source anchors, full fix requirements, and acceptance cases. Implement each row as a separate red-green-refactor slice.

| Finding and current source | Smallest red test / intended fix |
| --- | --- |
| [Stranded voting state](reference-review-evidence-and-fixtures.md#summary-failure-can-strand-a-meeting-in-voting) — `backend/app/api/meetings.py` | Fail summary generation, summary save, and status save separately; retry can complete without duplicate committed endings. Guard transitions and make recovery explicit; never hold a database transaction across inference. |
| [Closed meetings remain writable](reference-review-evidence-and-fixtures.md#closed-meeting-status-is-not-enforced-on-writes) — meetings API/orchestrator | Direct message, collected turn, and streamed turn reject voting/ended/archived before writes/cost. Race closure with a running turn and prove the selected serialization policy; frontend disabling alone is insufficient. |
| [Deletion/indexing resurrection](reference-review-evidence-and-fixtures.md#deleting-an-indexing-document-can-recreate-its-vectors) — documents API/vector store | Pause indexing around upsert, delete, release: no eligible deleted content or surviving orphan publication. Use lifecycle/tombstone coordination and cleanup; an existence check before upsert is not race protection. |
| [Parent deletion leaves vectors](reference-review-evidence-and-fixtures.md#parent-deletion-leaves-indexed-content-behind) — meeting/stack deletion | Delete an already indexed parent with no active jobs and search its known IDs. Exclude deleted sources immediately; durable retry handles failed physical cleanup without touching another parent. |
| [First collection creation race](reference-review-evidence-and-fixtures.md#concurrent-first-uploads-race-when-creating-a-collection) — `vector_store.py` | Both tasks observe missing before creation, yet both documents index. Handle only expected already-exists, then verify configuration; propagate permission/network/mismatched-dimension errors. A process-local lock does not establish multi-worker safety. |
| [Missing end inference costs](reference-review-evidence-and-fixtures.md#voting-and-summary-inference-bypass-cost-accounting) — end route/accounting | Accepted/rejected votes and normal/forced summaries count completed paid attempts once, even after later save failure. Stable inference identities prevent retry double counting; unknown usage is not fabricated and Ollama remains zero-priced. |

## Frontend work packages and tests to write first

| Finding and current source | Smallest red test / intended fix |
| --- | --- |
| [Wrong-meeting async updates](reference-review-evidence-and-fixtures.md#stale-asynchronous-work-mutates-the-wrong-meeting) — meeting store and meeting route | Finish A load/message/stats/stream after B selection; B stays intact. Guard selected-resource and operation identity, including errors/loading/cleanup; old A must not remain actionable under B's URL. |
| [Fabricated summaries](reference-review-evidence-and-fixtures.md#summary-tab-shows-fabricated-conclusions) — `SummaryTab.tsx` | Empty meeting is empty; persisted real summary survives remount once and never crosses meeting identity. Remove canned runtime content; wire real generation or disable it honestly. |
| [EOF leaves busy state](reference-review-evidence-and-fixtures.md#premature-stream-completion-leaves-the-interface-busy) — API parser/store | Text then EOF or truncated terminal event is interrupted observation with scoped cleanup, not silent success. Split byte chunks still parse; reconciliation never automatically resubmits paid inference. |
| [Lost message drafts](reference-review-evidence-and-fixtures.md#message-submission-loses-drafts) — `ChatArea.tsx`/store | Failure retains draft; late success cannot clear later edits, including edit-away-and-back-to-same-text. Return explicit success/failure, protect edit revisions, and prevent unintended repeated sends. |
| [Stale initialization metadata](reference-review-evidence-and-fixtures.md#persisted-initialization-skips-current-server-metadata) — settings store/provider UI | Load old storage with initialized=true and changed server providers. Refresh authoritative metadata, including removed providers; persist valid preferences only and migrate old storage. |
| [Duplicate meeting on upload retry](reference-review-evidence-and-fixtures.md#upload-failure-during-creation-leads-to-duplicate-meetings-on-retry) — `meetings/new/page.tsx` | One of two uploads fails after create; retry retains the created meeting ID, uploads failed files only, and reconciles late success. Surface per-file errors; rejected Promise.all does not cancel other uploads. |

## Operational risks: targeted validation, not incident claims

| Risk and evidence | Test-first guard |
| --- | --- |
| [Event-loop blocking](reference-review-evidence-and-fixtures.md#synchronous-ingestion-can-block-the-serving-event-loop) — documents background function/parser and synchronous database calls | A safely releasable parser barrier proves off-loop execution while unrelated requests/heartbeat continue. Bound worker concurrency; surface parser/database errors. No latency impact has been measured. |
| [Unbounded upload/expansion allocation](reference-review-evidence-and-fixtures.md#upload-size-checks-do-not-bound-memory-consumption) — full read before limit, workbook materialization | A counting stream stops at a bounded threshold despite missing/false length headers. Test expanded rows/pages/chunks and partial cleanup without attempting dangerous exhaustion. |
| [Restart loses ingestion work](reference-review-evidence-and-fixtures.md#in-process-ingestion-has-no-durable-restart-recovery) — in-memory BackgroundTasks handoff | Restart after acknowledgement, during parsing, and around publication. Recover from retained input or expose actionable interruption, never permanent unexplained processing; no duplicate chunks or deleted-source resurrection. |

## Code example: reject stale completion and preserve drafts

Proposed pure helpers for the existing meeting store/composer. Resource and operation IDs are both required; a new A operation must not accept an old A completion. Draft revision increments on **every edit**, even when text returns to the same value:

```typescript
type Scope = { meetingId: string; operationId: string };
export function isCurrent(active: Scope | null, incoming: Scope): boolean {
  return active?.meetingId === incoming.meetingId
    && active.operationId === incoming.operationId;
}

type Draft = { text: string; revision: number };
export function afterSend(current: Draft, submittedRevision: number): Draft {
  return current.revision === submittedRevision
    ? { text: "", revision: current.revision + 1 }
    : current;
}
```

Only call `afterSend` after confirmed success and if the captured meeting is still the draft's owner; on failure leave it untouched. Guard busy/error/cleanup writes with `isCurrent` too. Abort helps release resources but does not replace these guards or cancel an already accepted backend operation.

## Code example: bounded application read

Fragment for `backend/app/api/documents.py`, before full buffering. `upload` is the existing async upload object; `limit` is validated process configuration:

```python
async def read_bounded(upload, limit: int) -> bytes:
    content = await upload.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Upload exceeds configured limit")
    return content
```

Map this typed failure to a safe client-visible upload error and release resources. This bounds this handler's read, **not** upstream multipart buffering; also set appropriate request/parser limits and extraction/concurrency budgets. For an input abstraction that permits short reads before EOF, use a bounded chunk loop instead and test short reads explicitly.

## Code example: deterministic deletion race acceptance

Proposed async test contract for `backend/tests/regression/`. `indexing_barrier` must be implemented with events/barriers, explicit tasks, isolated SQL/vector stores, and safe teardown; it is not an existing helper:

```python
async def test_delete_fences_late_indexing(indexing_barrier):
    document_id = await indexing_barrier.start_document()
    await indexing_barrier.wait_before_upsert()
    await indexing_barrier.delete(document_id)
    await indexing_barrier.release_and_join()
    assert await indexing_barrier.search(document_id) == []
    assert await indexing_barrier.remaining_points(document_id) == []
```

Run variants immediately before and after upsert, with cleanup failure and restart. Searching uses explicit non-null stack IDs so the earlier null bug cannot hide the result. Real adapter tests must verify the same invariants; the fake alone cannot prove publication/cleanup ordering.

## Green, refactor, and exit gate

- Suggested packages: recoverable closing plus write serialization/accounting; coherent document/parent cleanup plus first-upload race; identity-scoped UI/EOF/drafts/summaries; settings hydration and resumable creation; bounded/off-loop ingestion and restart handling.
- Coordinate changes sharing an invariant, but do not combine all packages into one refactor. Retain IDs, supported local configuration, and existing data; run fresh/upgrade and failure tests on disposable resources.
- All twelve findings' linked acceptance cases and three risk guards pass with recorded red-green-refactor evidence. Demonstrate stream recovery without duplicate inference, no lost drafts, no duplicate meeting on retry, no deleted content searchable, and no permanently unexplained lifecycle state.
- Record any unexecuted integration/performance checks as limitations, not successes. Both Phase 1 specs must be accepted before [Phase 2 foundations](spec-03-foundations-and-contracts.md).
