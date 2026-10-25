# Spec 10 (Phase 2): Feature Cutover and Legacy Ownership Removal

## Purpose and prerequisites

Finish the remaining feature migrations and remove old writers only after caller-level acceptance.

- [Persona](spec-06-persona-catalog-and-participants.md), [queue](spec-07-durable-turn-queue-and-inference.md), [closing](spec-08-closing-summaries-and-accounting.md), and [knowledge](spec-09-durable-knowledge-and-redaction.md) slices pass their API/database/frontend gates.
- Current-to-target caller inventory is updated; temporary compatibility wrappers have named owners and removal conditions. Preserve existing public URLs and required archive/reporting/settings behavior.
- Run architecture checks and the full Phase 1 regression suite at the new locations. Read [frontend ownership](reference-architecture-contracts.md#frontend-ownership-and-contracts), [placement rules](reference-architecture-contracts.md#frontend-target-layout), and [current-to-target mapping](reference-architecture-contracts.md#current-to-target-file-ownership).

## Bounded scope and paths

Migrate remaining settings, archive/reporting, summary, roster, stack, and shared-shell callers to feature interfaces and thin routes. Complete `features/settings/`, `shared/layout/`, justified `shared/state/preferencesStore.ts`, and canonical query invalidation. Retain stable `components/ui/`, assets, styles, and framework config.

Retire `frontend/src/lib/api.ts`, the old canonical `meetingStore`/settings writers, backend mixed routes/services/models, and compatibility imports **only after the last real caller is migrated**. This is not authorization to delete unfamiliar files, ignored user assets, or similarly named leftovers. Actual imports/source count; caches and empty folders do not.

## Tests to write first

- Remaining real-route flows: shared defaults/System AI, metadata reload with old persisted storage, archive/unarchive/reporting, real summaries, per-file retry, and failed/delayed draft saves. No canned runtime history enters ordinary views.
- Fresh visitors use fetch/upload/status/SSE in hosted and local demos without sign-in, accounts, user-auth tokens, or Auth bootstrap; no login boundary or auth-only cache owner remains in the target. Shared transport cannot import feature stores or backend table/provider clients, and responses must not disclose server secrets.
- Feature-private imports and dependency cycles fail; curated public exports pass. One canonical Query owner exists per backend record; Zustand only owns scoped UI/provisional state.
- Navigation/remount and stale refetch preserve current identity/revision, never resubmit commands or duplicate canonical/provisional output.
- Production imports never reach fixtures/tests or retired writers. Generated API types are reproducible and drift-tested against backend schemas.

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

## Green and refactor

- Migrate one remaining screen/use case and its callers/tests at a time. Temporary wrappers delegate to a single owner; they cannot become parallel stores or writers.
- Finish settings metadata and safe backend credential-resolution contracts; only valid UI preferences persist, with old-storage migration. Keep raw credentials out of browser persistence, events, logs, and generated artifacts.
- Remove fabricated runtime records while preserving clearly isolated test fixtures. Move regression files without losing discovery/assertions.
- Remove legacy files only after import inventory, route integration, and old/new contract equivalence establish that they are no longer used. Do not move stable primitives merely for symmetry.

## Exit gate

Every supported workflow uses declared ownership and public boundaries. Thin routes do not access infrastructure; components do not implement raw SSE/provider persistence; no duplicate canonical store or legacy compatibility writer remains in migrated production paths. Full frontend/backend Phase 1 regressions, architecture checks, hosted/local no-sign-in behavior, and coordinated feature tests pass.

Next: [Upgrade rehearsal and architecture acceptance](spec-11-upgrade-and-architecture-acceptance.md).

## Completion record

Spec-10 cutover is complete for the production workflows in scope:

- **Settings:** the screen, provider cards, System AI card, commands, decoders and tests live under `frontend/src/features/settings/`. The legacy `@/lib/api` facade, `components/settings/`, `stores/settings-store.ts` compatibility writer, and their tests are gone.
- **Server-owned System AI:** migration `028_system_ai_settings.sql`, validated `PUT /api/settings/system-ai`, environment fallback on read, and summary/closing-summary resolution through the saved policy. The browser keeps only a transient BYOK header; the key never enters server state.
- **Meeting room:** the route is a thin shell over the feature-owned `MeetingRoom`; canonical queries and the durable turn controller own reads and commands. The legacy meeting store, chat components, sidebars and dialogs were deleted.
- **Backend settings ownership:** the settings route and DTOs moved to `app/modules/settings/presentation/`; the legacy `app/api/settings.py` and `app/models/settings_schemas.py` were deleted, with public `/api/settings/*` paths unchanged.
- **Preferences persistence:** store schema v2 strips the retired local System AI and the legacy `initialized` flag while preserving providers, the user default provider, and encrypted vault envelopes.

Evidence at the cutover commits: frontend **215 tests / 37 files** and `tsc` clean; settings/System AI, summary, demo-guard, Ollama-origin and architecture backend suites green (26 targeted regression + 16 architecture); OpenAPI fixture and generated types regenerated with the System AI PUT path. Guided replay remains deferred by decision and is not claimed as part of this record; the existing demo write guard and no-sign-in behavior are unchanged.

No `shared/layout/` was introduced: no production caller needs a shared shell, and spec-10 forbids moving stable primitives for symmetry. `shared/state/preferencesStore.ts` was not introduced for the same reason; the only justified UI preference store remains the curated `rateLimitStore` allowlist.
