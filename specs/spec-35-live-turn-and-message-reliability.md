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
