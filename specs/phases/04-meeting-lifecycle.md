# Phase 04 — Meeting domain, durable execution and editable queues

Status: draft. Depends on: Phases 00-03. Requirements: R-02, R-05, R-06, R-07, R-11, R-12, R-15. Defects: B-04 full closure; B-05 core authorization enforcement.

## Objective and outcome

Make meeting behavior reliable under concurrency, disconnects, failure and restart. Users can queue messages during a turn, edit/remove pending messages and return to a continuing meeting. Ending and archival obey explicit domain rules.

## Current implementation and affected paths

`backend/app/services/meeting_manager.py` performs several separate SQL calls; `api/meetings.py` contains the ending workflow; participant/message APIs do not consistently enforce active state. The global frontend streaming flag is not server concurrency protection. Build on Phase 02 reservations; Phase 03 added no ending/status implementation. This phase owns that repair and extraction in full.

Destination: meeting domain/use cases, actor policy, repositories/unit-of-work, turn/ending runner and queue APIs. Frontend full queue UX is Phase 07, but API behavior must be complete and inspectable now.

## Required behavior

Implement CONTRACTS.md sections 1-5 fully. One active execution reservation per meeting includes a pending/running turn or an ending attempt. All state-mutating commands serialize against the same eligibility boundary.

The queue contains only user messages. Editing/removal stops at dispatch; already committed transcript messages are immutable through queue operations. Terminal turns drain the queue FIFO under approved D-03; starting another turn or ending cannot bypass undrained entries. New arrivals cannot overtake earlier queued content.

Runner claims use persisted leases, heartbeats and fencing tokens. Old workers cannot finalize after lease loss, reset or expiry. Restart recovery distinguishes safe unstarted work from uncertain already-started provider work. Do not replay paid calls automatically when completion is unknown. Expired jobs are terminalized/reconciled with visible status and committed effects retained.

Ending attempts freeze roster/transcript/config, persist each vote/usage, enforce majority, incrementally stream public vote/summary output, and commit the final summary/status atomically. Execution is independent of SSE subscribers; journal/replay/status recovery follows CONTRACTS.md. Failure restores active state with an auditable failed attempt and no successful provisional summary. No transaction spans inference. Zero-participant/tie/invalid vote behavior follows the approved contract. These are shared capabilities, not a separate Phase 10 demo ending implementation.

## Ordered tasks

Before these implementation tasks, reproduce B-04 with a correct fresh/legacy SQL status and ending-consistency regression and B-05 with denied-access assertions against the current exposed path. Record the intended red failures, implement the corrections, then complete domain extraction/refactoring with those regressions green. Transactional restructuring needed for the correction stays within that red-green cycle. New queue/lease behavior follows TDD and is reusable core functionality, not a guided journey.

- **P04-T01 — Domain extraction:** move lifecycle/eligibility rules from routes/managers into small domain models and use cases; add transition-table tests before changing routes.
- **P04-T02 — Actor policy:** resolve trusted actor at entry, enforce ownership across list/direct-ID/participant/message/turn/event/ending routes and compatibility wrappers; add database policy or restricted-service access enforcement matching the approved storage design.
- **P04-T03 — Durable coordinator:** add lease claims, fencing, heartbeat, startup reconciliation and bounded retry classifications to the Phase 02 runner. Wire lifecycle shutdown/drain behavior.
- **P04-T04 — Queue storage/use cases:** add FIFO sequence, revisions, idempotent submission, edit/remove commands, dispatch transactions and turn/ending barriers.
- **P04-T05 — Status repair and ending workflow:** add the compatible voting/ended constraint migration, extract the route's ending workflow and implement vote validation, incremental public vote/summary SSE with durable journal/status recovery, atomic summary/status persistence, usage ledger, cancellation/failure recovery, idempotency and concurrent attempt protection. No minimal Phase 03 or parallel Phase 10 ending path is assumed.
- **P04-T06 — Archive/restore:** preserve prior state on new archives; provide explicit handling for historical unknown prior state; block busy/queued transitions.
- **P04-T07 — Transactional creation/finalization:** ensure meeting+initial participants creation and all owned lifecycle writes are atomic; reconcile legacy cost baseline with new ledger totals.
- **P04-T08 — Data migration rehearsal:** upgrade sanitized legacy fixtures, enforce constraints after safe backfill, retain unresolved ownership/archive records explicitly, and test application rollback compatibility.
- **P04-T09 — Transport validation:** run local-server disconnect/reconnect tests and independent-worker race tests; expose operational state needed by frontend Phase 07.

## Storage and API obligations

Add/extend turns, ending attempts/votes, queue entries, active-work reservation, lease/fencing metadata and ownership scope. Use unique active-work protection and revision/row-lock checks. Queue dispatch must transition entry and insert message together with a unique queue-entry linkage. Terminal event creation must be atomic with terminal state or delivered by a transactional outbox.

No broad ownership backfill from an arbitrary currently signed-in user. Shared defaults are read-only to ordinary actors. Protect child-table reads as well as parent routes. A privileged server client does not itself establish user authorization; document which layer enforces each invariant and test both direct access policy and application path as appropriate.

## TDD cases

- **P04-TEST01:** Parameterize every valid/invalid meeting transition, busy state, queue barrier, archive restoration and legacy unknown-state case.
- **P04-TEST02:** Race two workers starting turns and a turn versus ending; exactly one reservation wins with one execution.
- **P04-TEST03:** Enqueue A/B/C, edit B, remove C; after terminalization only A and edited B become messages in FIFO order. No automatic AI turn starts.
- **P04-TEST04:** Race dispatch against edit/remove using independent database connections; exactly one outcome wins, stale requests conflict, no delivered content changes.
- **P04-TEST05:** Fail after queue-message insertion before state update; retry yields exactly one message. New arrivals during drain do not overtake pending entries.
- **P04-TEST06:** Disconnect subscriber and restart worker around claim/invocation/finalization points; expired worker is fenced and uncertain paid calls are not replayed.
- **P04-TEST07:** Majority/tie/zero-roster/invalid vote/summary failure/force-end/duplicate end requests produce the approved state and one summary at most; include usage from failed attempts. Public vote/summary events are incremental, replayable and deduplicated; disconnect does not cancel the attempt, provisional summary failure restores active, and completion follows atomic final commit.
- **P04-TEST08:** Two actors attempt every meeting/child operation, including replay and queue edits; cross-owner access is denied consistently without leaks.
- **P04-TEST09:** Simulate generation revocation/expiry through the actor/runner boundary while racing a tool effect and finalization; old generation cannot commit after revocation. Already committed effects remain only in the old scoped history. Full persistent session/reset endpoints are Phase 08; this test does not depend on them or the journey.
- **P04-TEST10:** Fresh install and supported legacy upgrades preserve IDs/messages/cost baseline; invalid states and broken ownership mappings are reported before enforcement.

## Acceptance gate

- **P04-AC01:** Domain/lifecycle and ending regressions pass on real SQL; B-04 is closed (TEST01, TEST07, TEST10).
- **P04-AC02:** Queue correctness and concurrency guarantees pass independent-connection tests, including failures (TEST02-05).
- **P04-AC03:** Navigation/disconnect/restart behavior has runtime evidence, not just mocked subscriber tests (TEST06, TEST09).
- **P04-AC04:** Core actor boundaries cover old/new endpoints and preserve existing data; B-05 enforcement is ready for the Phase 08 runtime-policy audit (TEST08, TEST10).

## Rollout, rollback, exclusions and risks

Expand schemas first, rehearse on a clone, then switch command routing. A rollback may disable new queue submission while retaining pending entries for safe reconciliation; never discard them. Stop/drain workers before incompatible coordination changes. Full queue UI and public quota hardening are later phases. Main risks: database-only tests bypass auth, stale workers reapply effects, and REST pseudo-transactions; each has an explicit test above.
