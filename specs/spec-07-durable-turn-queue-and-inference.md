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

## Implemented (spec-07 exit gate, recorded 2026-10)

Eight local commits from `8425331` through `5c2dbee`, plus this exit-gate record. Each slice was written test-first at its seam (schema/RPC harness, API acceptance, legacy delegation, frontend contract, controller/UI); every commit subject names the boundary it sets. Nothing was pushed.

- Durable schema and RPCs (`8425331`): migrations `018_turn_queue_schema.sql` and `019_turn_queue_rpcs.sql` add operations, messages, attempts, events, and effects. Admission is FIFO per meeting and idempotent by globally unique request key plus payload hash; a changed payload conflicts. Database guards enforce one executing turn per meeting, the configured global concurrency limit, lease/fence ownership, monotonic event sequence, participant/meeting cancellation, and at-most-once final publication. Disagreement/consensus effects deduplicate by `(operation_id, invocation_id, call_id)`. The disposable-Postgres `durable_queue` harness exercises independent worker identities, controlled claims/leases, cancellation races, stale publishers, and restart recovery.
- Queue execution and API (`8c615d5`): `TurnQueueService` claims without holding a transaction across inference, records a durable attempt before every provider call, runs the bounded context/tool loop, persists usage even when publication is rejected, and publishes at most one final message. `TurnRunner` supervises concurrency, heartbeat/deadline, and shutdown. New routes are `POST/GET /meetings/{id}/turns`, `GET /turns/{op}`, `POST /turns/{op}/cancel`, and `GET /turns/{op}/events?after=N`; the inline runner is default and `backend/worker.py` provides the separate process.
- Legacy cutover (`374147e`): `/turn` and `/turn/stream` now submit and observe the same durable operation instead of executing the orchestrator directly. A regression test pins the single-operation delegation and no direct execution. The adapters remain for one release as the accepted compatibility path.
- Frontend contract (`8d2742d`): frozen OpenAPI snapshot and generated types, custom-header transport, strict turn decoders, and a normalized SSE parser. The parser handles arbitrarily split frames, ignores replayed/lower sequences after a terminal event, correlates tool calls/results by operation/invocation/call identity, and turns EOF without a terminal into a local `observation_interrupted` marker — never a resubmit.
- Client and queries (`e142f21`, `21c490f`): submit/list/get/cancel/observe use the shared transport and keep `X-Provider-Key` out of the JSON body and durable payload. Query identities are meeting/operation scoped; lists and active details poll while non-terminal, and mutations seed or invalidate canonical turn data with retries off.
- Projection and observation (`adc7aaf`): provisional text/thinking/tool/citation state lives in a scoped Zustand projection, not in the canonical meeting mirror. Observation reads the persisted cursor, deduplicates by sequence, reconciles a terminal status even without a subscriber, refetches canonical data once, aborts only the stream on navigation, and exposes an explicit resume. Browser EOF never cancels or resubmits server work.
- Room cutover (`5c2dbee`): the meeting room uses submit + observation for every AI button, shows the oldest executing turn plus the queued FIFO with per-operation cancellation, and explains that a message sent during a running turn will be seen by the next one. A failed ambiguous submit reuses its request key; a deterministic 4xx rotates it. The legacy streaming bubble and direct streaming call were removed from the room.

Commands and results: backend full suite from `backend` with `venv\Scripts\python.exe -m pytest -q` → **352 passed** in 549.62s on embedded disposable Postgres; frontend full suite `npm test` → **202 passed / 36 files**; `npm run sync:openapi` regenerated the checked-in snapshot and the drift test is green. The first full backend attempt reported 128 passed / 224 setup errors only because the test Postgres cluster was completing crash recovery beyond `pgserver`'s 10-second start timeout; after it was ready the unchanged suite passed in full.

### Limitations (recorded honestly; never claimed as executed)

- The behavioral queue, one execution workflow for both HTTP entry points, and fenced publication are complete, but the structural split into `application/{turns,context,tools,contracts}.py` and `capabilities/inference/{contracts,loop,usage}.py` was not performed. `app/services/turn_queue.py` owns the durable workflow and still calls `Orchestrator._build_context`; the old collected/streaming orchestrator methods remain for direct regression tests even though no turn route calls them. Their removal belongs to the spec-10 legacy cutover.
- BYOK credentials are a process-local handoff keyed by operation id. A queued operation recovered by another process cannot see the browser key and becomes `interrupted` with `credential_unavailable` before any provider call; it is never retried automatically.
- `TurnQueueService` calls synchronous Supabase RPCs inside async methods. Correctness is covered, but the blocking-loop improvement remains.
- The room still reads its canonical meeting/messages through the existing legacy `meetingStore` + `loadMeeting`; this slice moved only queue records and provisional observation to TanStack Query/scoped state. Full canonical-store retirement belongs to spec 10.
- The legacy `/turn` adapters wait by polling durable status and may start a local fenced runner when no inline runner is active. They are intentionally retained for one release after frontend acceptance.
- No paid inference, hosted Supabase, Qdrant network, or external provider was contacted. The scripted provider and embedded Postgres establish the gate.

Next: [Closing, summaries, and accounting](spec-08-closing-summaries-and-accounting.md).
