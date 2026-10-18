# Spec 07 (Phase 2): Durable Turn Queue and Unified Inference

## Purpose and prerequisites

Make execution server-owned, durable, and distinct from browser observation.

- [Participant/configuration contracts](spec-06-persona-catalog-and-participants.md), atomic operation persistence/claims from [backend seams](spec-04-backend-composition-and-transactions.md), and [frontend transport](spec-05-frontend-transport-and-state.md) accepted.
- Real database multi-worker harness, fake clocks, controlled leases/barriers, scripted providers, and actual backend-to-frontend SSE fixture transport exist. Unit-only stores cannot establish this gate.
- Define submit/status/observe/cancel DTOs, stable request-key scope, payload conflict behavior, FIFO ordering, resource limits, event order/identity, retention/replay or snapshot reconciliation, safe errors, and coordinated API cut before changing callers.
- Read [queue/conversation contracts](reference-architecture-contracts.md#durable-queue-and-conversation-boundaries) and [inference/stream contracts](reference-architecture-contracts.md#inference-and-stream-protocol).

## Scope and paths

Split `backend/app/services/orchestrator.py` into Meetings `application/{turns,context,tools,contracts}.py`, shared `capabilities/inference/{contracts,loop,usage}.py`, and runtime supervision through injected ports/registered handlers. Supabase owns durable operation/order/event/attempt state; platform adapters own provider protocols. Do not replace this with a process-local production store.

Migrate submit/status/observe/cancel routes and the Meetings queue/room/observation/reconciliation/UI controllers together. Remove duplicate streaming versus collected execution policy only when both callers use the same accepted pipeline.

## Tests to write first

- Two same-meeting admissions create ordered visible operations; two workers can claim only one. Complete it, then claim the next FIFO entry. Different meetings can progress under configured global concurrency limits.
- Same request key and same payload returns the original operation; changed payload conflicts. Test cancellation versus claim, participant removal, archive/delete, stale lease/fence, restart, and at-most-one final message/effect publication.
- User message committed during A is not injected into A's captured context; it appears in B when B starts. Capture defaults and committed conversation boundary at claim/start, never queue submission.
- Script repeated same-name tools, matching results, tool failures, loop/context bounds, usage for each attempt, and both streaming/collected final results. Communication effects deduplicate by operation/call identity.
- Feed actual backend events through frontend parsing/reconciliation: call visible before handler, result IDs match, split chunks/replay/EOF/navigation cannot corrupt another operation. Terminal completion follows final commit; status works independently of subscribers.
- Restart around a provider call and final commit. Pending work recovers, but uncertain paid work becomes interrupted/unknown for explicit reconciliation rather than automatic resubmission.

## Code example: multi-worker claim acceptance

Proposed `backend/tests/integration/` test contract. Implement `durable_queue` using independent database clients/worker identities and resettable persistent state. It is not an existing fixture; test cancellation, clocks, and fencing separately:

```python
import asyncio

async def test_one_same_meeting_claim_across_workers(durable_queue):
    meeting_id, participant_id = await durable_queue.seed_active_meeting()
    first = await durable_queue.submit(meeting_id, participant_id, key="first")
    second = await durable_queue.submit(meeting_id, participant_id, key="second")
    claims = await asyncio.gather(
        durable_queue.worker("worker-a").claim(meeting_id),
        durable_queue.worker("worker-b").claim(meeting_id),
    )
    claimed = [claim for claim in claims if claim is not None]
    assert len(claimed) == 1
    assert claimed[0].operation_id == first.operation_id
    assert await durable_queue.status(second.operation_id) == "queued"
```

This test proves only concurrent claiming. Add a stale-owner publication test with a changed fence and ensure a rejected publish cannot lose known incurred usage. Do not hold the claim transaction while invoking a provider.

## Code example: correlate tool activity beyond its name

Proposed fragment of the shared backend/frontend event contract, generated or drift-validated rather than maintained as unrelated DTO copies. A complete discriminated union must also define text, result/error, status, and terminal payloads:

```typescript
type ToolCallEvent = {
  type: "tool_call";
  meetingId: string;
  operationId: string;
  eventId: string;
  sequence: number;
  invocationId: string;
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export function toolIdentity(event: ToolCallEvent): string {
  return JSON.stringify([event.operationId, event.invocationId, event.callId]);
}
```

Preserve provider-native correlation IDs in normalized invocations, and assign application identity where necessary. Tool results reference the same identity; two tools with the same name are not one execution. Event redelivery deduplicates by event identity/sequence, separately from tool effects.

## Green and refactor

- Deliver submit/claim/status/cancel first, then captured context/configuration and fenced execution, then observation/reconciliation. Each slice is test-first and may use a delegating compatibility path with a removal gate.
- Persist stable provider-attempt identities and completed usage even if later publication fails. Do not promise exactly-once external inference; guarantee at-most-one committed logical outcome/effect using database guards.
- One bounded inference/tool loop uses injected validated tools; Meetings owns admission/context/private scope policy, not the generic loop. Keep context/output/tool-result budgets and controlled failure policy consistent across entry points.
- Stream observation detaches on navigation; remount reads status/observes the same operation. It never submits generation implicitly. Pending cancellation is a separate command; no canonical meeting mirror moves into Zustand.

## Exit gate

Real concurrency/restart/fencing tests establish the queue and publication guarantees. Actual SSE-to-frontend tests pass. Pending work survives restart; uncertain inference is visible without automatic duplicate cost. Both execution entry points share one workflow, and the visible queue/cancellation and immediate user-message boundary match the accepted decisions.

Next: [Closing, summaries, and accounting](spec-08-closing-summaries-and-accounting.md).
