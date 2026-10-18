# Spec 10 (Phase 2): Guided Replay, Feature Cutover, and Legacy Removal

## Purpose and prerequisites

Deliver the fixed, user-paced guided replay through the same UI and core as the base application. Finish remaining feature migrations and remove old writers only after caller-level acceptance. Implement these as small test-first work packages, not one tutorial/restructure commit.

- [Persona](spec-06-persona-catalog-and-participants.md), [queue](spec-07-durable-turn-queue-and-inference.md), [closing](spec-08-closing-summaries-and-accounting.md), and [knowledge](spec-09-durable-knowledge-and-redaction.md) slices pass their API/database/frontend gates.
- Current-to-target caller inventory is updated; temporary compatibility wrappers have named owners and removal conditions. Preserve existing public URLs and required archive/reporting/settings behavior.
- Run architecture checks and the full Phase 1 regression suite at the new locations. Read [frontend ownership](reference-architecture-contracts.md#frontend-ownership-and-contracts), [placement rules](reference-architecture-contracts.md#frontend-target-layout), and [current-to-target mapping](reference-architecture-contracts.md#current-to-target-file-ownership).
- The [runtime/replay contract](reference-runtime-modes-and-credentials.md) and recorded read/event/write-denial seams from Spec 03–05 are accepted. Prepare the fixed versioned manifest, dedicated no-write workspace, complete recorded scenario/step outcomes, real-control targets, and reproducibly provisioned assets before guide implementation. Validate content/schema compatibility and missing-asset behavior; do not invent scenario details or require author-local files.
- The encrypted vault/private handoff and missing-credential recovery paths already pass. No part of replay may ask for credentials, access that vault, or use live providers/search/embedding/tools.

## Bounded scope and paths

Migrate remaining settings, archive/reporting, summary, roster, stack, and shared-shell callers to feature interfaces and thin routes. Complete `features/settings/`, `shared/layout/`, justified `shared/state/preferencesStore.ts`, and canonical query invalidation. Retain stable `components/ui/`, assets, styles, and framework config.

Retire `frontend/src/lib/api.ts`, the old canonical `meetingStore`/settings writers, backend mixed routes/services/models, and compatibility imports **only after the last real caller is migrated**. This is not authorization to delete unfamiliar files, ignored user assets, or similarly named leftovers. Actual imports/source count; caches and empty folders do not.

Implement replay package validation/readers in `backend/app/replay/`, server runtime guards/composition, and `frontend/src/features/demo/` for guide/script/ephemeral cursor. Use `shared/runtime/` contracts and the actual Meetings, Knowledge, Persona Catalog, and Settings screens/public interfaces. Reuse core policy interfaces, normalized read/events, and pure reconciliation/rendering. Do not fork lifecycle rules, build duplicate mock screens, or make no-op writes look like real commits.

## Tests to write first

- Remaining live real-route flows: shared defaults/System AI, old-storage reload, archive/reporting, real summaries, per-file retry, and versioned drafts. Fixed recorded history exists only in explicit replay context, never as fabricated live output.
- Fresh hosted/local demo visitors need no sign-in, Auth bootstrap, credentials, or vault access. Server binding permits only the dedicated replay data; forged IDs/deep links/direct mutations cannot reach demo/live writes or live effects. Exercise actual HTTP plus read-only roles/adapters, not UI guards alone.
- Advance only on permitted user action. Next/back/restart, repeated clicks, route changes, keyboard focus, mounted targets, and reduced motion preserve fixed step outcomes and ephemeral state. Prove actual feature screens/shared core/read/event reconciliation are used, not a standalone imitation or video player.
- Every replay path has zero live inference/search/embedding/tool calls and zero application writes to any store: no messages, queues/jobs, usage/evidence, settings/uploads, progress/session/analytics rows, per-visitor seed, or late effect. Missing package/asset/step fails honestly, never falls back to live work. Recorded completion is not asserted as a fresh commit or charge.
- Live/replay/workspace/package identities isolate caches and provisional buffers. Leaving replay requires an explicit context switch; a stale replay event cannot alter live state or unlock/use a stored key. Live hosted keys remain encrypted-only at rest and privately handed off.
- Feature-private imports and dependency cycles fail; curated public exports pass. One canonical Query owner exists per backend record; Zustand only owns scoped UI/provisional state.
- Navigation/remount and stale refetch preserve current identity/revision, never resubmit commands or duplicate canonical/provisional output.
- Production imports never reach tests/doubles or retired writers. Validated production replay assets are provisioned runtime data, not test fixtures. API/read/event types remain reproducible and drift-tested.

## Code example: a deliberately small feature interface

Proposed `frontend/src/features/meetings/index.ts` fragment; target files are created as tested behavior migrates:

```typescript
export { MeetingRoom } from "./components/MeetingRoom";
export { useMeetingCreation } from "./hooks/useMeetingCreation";
```

Do not add wildcard exports or expose private Query keys, adapters, or operation stores to make a cross-feature import convenient. Meetings can consume Knowledge's exported `DocumentPanel`; compose reciprocal workflows in route/provider composition rather than creating cyclic feature dependencies.

## Code example: remount observes rather than regenerates

Proposed frontend integration contract. Implement `meetingNavigation` with real feature routes/hooks and deterministic backend-contract transport; it is not an existing fixture:

```typescript
it("reconnects to the same operation without a second command", async () => {
  const h = await meetingNavigation.create();
  await h.openMeeting("meeting-a");
  const operationId = await h.requestTurn();
  await h.openMeeting("meeting-b");
  await h.openMeeting("meeting-a");
  await h.expectObservedOperation(operationId);
  expect(h.transport.submitTurnCalls).toHaveLength(1);
  expect(h.selectedMeetingId()).toBe("meeting-a");
});
```

Use fixed valid UUIDs in the actual API fixture. Add late A events while B is selected, a fresh no-sign-in browser context, terminal/refetch deduplication, and explicit pending cancellation; navigation itself is not cancellation.

## Code example: reject a demo mutation before dispatch

Proposed API integration contract. Implement `runtimeApi` over the real composed HTTP application, dedicated read-only data, and separately instrumented live/demo stores/outbound adapters. The harness must attempt a real command, not just click a disabled button:

```typescript
it("does not turn replay into a live command through a forged scope", async () => {
  const h = await runtimeApi.openReplay();
  const response = await h.postTurn({
    meetingId: h.liveMeetingId,
    requestedMode: "live",
  });
  expect(response.error.code).toBe("replay_read_only");
  expect(h.allApplicationWrites()).toEqual([]);
  expect(h.liveEffects()).toEqual([]);
});
```

Choose/document the actual stable error/status in the API contract; `replay_read_only` illustrates the required rejection category. Add the [user-pacing test](reference-runtime-modes-and-credentials.md#test-contracts-and-implementation-ownership), a full guided route walkthrough, missing-asset failures, and independent role/build/import checks. Spies alone do not prove deployed isolation or shared-core reuse.

## Green and refactor

- Migrate one remaining screen/use case and its callers/tests at a time. Temporary wrappers delegate to a single owner; they cannot become parallel stores or writers.
- Deliver replay in bounded packages: validate/provision assets and read-only binding; compose recorded reads/events over the accepted core; add guide targets/user-paced controls to actual screens; then run all no-write/no-live-effect/accessibility tests. Each package starts red, reaches green, and retains the other runtime's regressions.
- Finish settings metadata, encrypted browser vault, and transient handoff; only justified UI preferences and encrypted envelope persist. Never persist passphrase/derived key/plaintext or use operator fallback. Preserve old-storage migration, lock/forget, and credential-required recovery.
- Remove fabricated live runtime records while preserving isolated test fixtures and explicit production replay packages. Move regression files without losing discovery/assertions. No durable tutorial progress, per-visit seed, shadow engine, or successful no-op persistence adapter.
- Remove legacy files only after import inventory, route integration, and old/new contract equivalence establish that they are no longer used. Do not move stable primitives merely for symmetry.

## Exit gate

The complete user-paced strict replay runs through actual base-app UI/core against dedicated isolated no-write data with no credentials/live effects/persistent progress. Direct HTTP and role tests prove guards; missing assets never trigger fallback. Live BYOK/local behavior, full Phase 1 regressions, architecture and caller-level feature tests pass. Thin routes/public interfaces and canonical ownership hold; no duplicate application/engine, canonical store, or retired compatibility writer remains.

Next: [Upgrade rehearsal and architecture acceptance](spec-11-upgrade-and-architecture-acceptance.md).
