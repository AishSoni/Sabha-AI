# Phase 02 — Correct shared turn execution

Status: draft. Depends on: Phases 00-01. Requirements: R-01, R-06, R-11, R-14; foundations for R-15. Defects: B-01 and the dependency-boundary portion of B-02.

## Objective and outcome

One application engine executes a bounded inference/tool loop and produces normalized events. Streaming and collected responses observe that same execution. A tool-only provider response is continued, not replaced with a fabricated final message.

## Current implementation

Affected paths: `backend/app/services/orchestrator.py`, `services/streaming.py`, `llm/base.py`, `llm/{gemini,openrouter,ollama}.py`, `llm/__init__.py`, `services/meeting_manager.py`, `api/meetings.py`, and application bootstrap.

Currently both orchestrator methods invoke once; tool results do not return to the model; streamed tool IDs are replaced with tool names; provider completion is conflated with overall completion; configuration and retrieval reach globals. Message and cost writes are separate. A stream request owns execution lifetime.

## Required behavior and boundaries

Implement CONTRACTS.md sections 3-4, 8-10. The use case receives provider resolution, authorized knowledge/tool execution, persistence/unit-of-work, clock and runner dependencies. HTTP routes validate/map requests and subscribe/collect; they do not implement the loop.

Pull forward minimal persistent turn reservation, invocation/effect identity, finalization and event sequencing. This is necessary for correct retries and stream-independent execution, not the full Phase 04 queue/lease system. Process-lifetime detached work is acceptable only for this private milestone; public release requires Phase 04 durable recovery.

Tool execution preserves original call IDs and application execution identities. Validate complete arguments before execution; never execute partial streamed JSON. Multiple calls in one response execute in documented order initially. Communication effects are idempotent. Tool errors are structured; authorization failures never leak hidden sources.

Context construction includes the base prompt, snapshot extension and complete conversation/tool groups within budgets. No unbounded history loading in the new engine. Provider usage is accumulated per invocation; unknown usage remains unknown. No hardcoded single-model rate is applied to all vendors/models.

## Ordered tasks

First reproduce B-01 with the correct tool-continuation assertions in both existing paths and B-02 with a persona-backed retrieval assertion; record their intended failures. Apply the smallest coherent corrections, verify green, then consolidate the corrected behavior through ports and one engine. Adapter/transaction changes necessary for a correction stay in that red-green cycle; broader relocation follows green. Later tasks add their own failing behavior tests before implementation.

- **P02-T01 — Port extraction:** define normalized invocation events and ports; move `_handle_tool_call` dependencies behind ToolExecutor/KnowledgeSearch; remove undefined/global persona lookup from this path.
- **P02-T02 — Additive persistence:** introduce turn identity/state, idempotency keys, invocation/effect records and event cursor; implement atomic reservation and finalization with real SQL tests.
- **P02-T03 — Adapter normalization:** preserve native tool IDs across complete/stream interfaces; assemble fragments; distinguish invocation-finished from terminal turn-finished; normalize usage without double counting cumulative updates.
- **P02-T04 — Consolidate corrected loop:** retain green continuation regressions while unifying assistant call-list append, tool execution/results append and reinvocation. Add failing cases for final-answer detection and bounded termination before completing those rules against scripted provider fixtures.
- **P02-T05 — Resource policy:** enforce approved deadline, invocation/tool/output/context limits; implement explicit failure/cancellation results and safe error mapping.
- **P02-T06 — Independent runner:** start accepted turns outside subscriber iterators; allow status lookup, subscribe/replay and collected awaiting of the same execution. Manage application shutdown explicitly.
- **P02-T07 — Persistence/effects:** commit terminal result/cost once; retain already committed communication effects on failure; save sanitized tool inputs/outputs/citations and partial-result metadata.
- **P02-T08 — Compatibility routes:** route existing `/turn` and `/turn/stream` through the engine. Translate legacy events only in the adapter; new events use version 2. Do not duplicate the inference algorithm.

## Data/API changes

Add turn/invocation/tool-effect/event storage without rewriting historical messages. Link new messages to turn IDs uniquely; historical messages have no invented turn provenance. Preserve old cost totals as a legacy baseline; ledger increments apply only to new execution records.

Reserve/finalize using a transaction-capable adapter or approved database RPC. Enforce one active turn per meeting and idempotent completion at the database boundary. Make pending reservation recoverable on startup at least by a safe failed/interrupted state; Phase 04 adds full worker leases/fencing. Old app rollback must tolerate nullable added fields and new tables.

## TDD cases

- **P02-TEST01:** Provider requests search, receives result with matching call ID, then produces final text. Assert history shape, two invocations, one final message and aggregated usage.
- **P02-TEST02:** Two same-name calls have different IDs and results; no collision. Duplicate delivery of one execution ID produces one communication effect; changed arguments under the same ID fail.
- **P02-TEST03:** Tool-only response never terminalizes successfully; loop/deadline exhaustion and an empty final answer fail with no successful placeholder/blank message.
- **P02-TEST04:** Unknown tool, malformed arguments, out-of-range severity and foreign participant references cannot mutate state; recoverable errors reach the model within the limit.
- **P02-TEST05:** Streaming and collected observers produce equivalent persisted results/effects. Provider invocation completion does not emit application completion.
- **P02-TEST06:** Consumer disconnects after first delta; runner finishes and status/replay returns the persisted result without a second provider execution.
- **P02-TEST07:** Inject failure between message/cost/terminal writes; transaction rolls back. Retry finalization produces one message, one ledger application and one terminal event.
- **P02-TEST08:** Context trimming preserves assistant/tool groups and base prompt; oversized irreducible input fails before a provider call.
- **P02-TEST09:** Recorded adapter payloads cover fragmented arguments, whitespace text, multiple calls, missing usage, transport errors and completion semantics for each supported provider.
- **P02-TEST10:** Two independent reservations race; one wins. Retrying same idempotency key returns the original turn, changed payload conflicts.

## Acceptance gate

- **P02-AC01:** B-01 no longer expected-fails; both old routes delegate to one loop (TEST01-05).
- **P02-AC02:** Original tool identities and authorized results reach the model; no direct persona/global DB lookup remains in the engine (TEST01-04).
- **P02-AC03:** Disconnect continuation, stable status/replay and terminal deduplication pass (TEST05-07, TEST10).
- **P02-AC04:** Limits, context policy and supported provider contracts pass offline; usage uncertainty is visible (TEST03, TEST08-09).

## Rollout, rollback, risks and exclusions

Stage new composition privately, preserve old route shapes through explicit adapters, and compare contract tests. Roll back the application against expanded schema; do not erase new turn history. Restart may mark uncertain work interrupted, but must never repeat paid calls automatically. Durable multi-worker recovery, editable queues, full ending lifecycle and live vector-client repair remain assigned to later phases. No public-release claim is made here.
