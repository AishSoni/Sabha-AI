# Spec 05 (Phase 2): Frontend Transport and State Foundation

## Purpose and prerequisites

Migrate one read-and-mutate feature to explicit state ownership, rather than moving the old all-purpose store unchanged.

- [Foundations](spec-03-foundations-and-contracts.md) and [backend composition](spec-04-backend-composition-and-transactions.md) accepted. DTOs, server-bound live/replay context, dedicated read-only demo access, safe errors, operation identity, and API cut are defined.
- Phase 1's minimal encrypted BYOK path passes. Adopt the [vault/handoff contract](reference-runtime-modes-and-credentials.md); select/benchmark the supported KDF policy and configure actual secure-context browser tests before extraction. Do not create a second vault or save an unlock key.
- Component/query harness, deterministic HTTP/SSE transports, store reset, deferred promises, and existing Phase 1 navigation/draft/EOF tests run.
- Install/lock a supported TanStack Query version deliberately. Read [frontend ownership](reference-architecture-contracts.md#frontend-ownership-and-contracts) and [target layout/import rules](reference-architecture-contracts.md#frontend-target-layout).

## Scope and target files

Introduce `frontend/src/app/providers.tsx`, `shared/api/{transport,errors,sse,generated}.ts`, and one feature's `api/{client,keys,queries,mutations}.ts`. Create only the UI/provisional stores actually needed. Do not add `shared/auth/`, an Auth boundary, or login routes; the demo does not require an authentication SDK or session bootstrap. Preserve current URLs, styles, and `components/ui/`.

Extract `shared/runtime/{contracts,context}` and `shared/credentials/{envelope,vault,memory}.ts`; Settings owns local unlock/lock/forget/change UI. The vault alone persists authenticated ciphertext in localStorage; unlocked material has a non-persisted capability. Live/replay sources implement the same accepted read/event interfaces, not duplicate feature screens.

Split the relevant callers out of `frontend/src/lib/api.ts` and `frontend/src/stores/meetingStore.ts` or `settings-store.ts` as one vertical slice. The old and new paths may coexist for different unmigrated features, **not independently write the same canonical records**.

## Tests to write first

- A and B have distinct query/cache identities. Resolve A after B navigation: A may populate A's cache, never B's selected UI/buffers/errors/loading flags.
- Fresh replay visitors need no login/credentials and cannot submit uploads/mutations/live calls. Separate live JSON/multipart/status/SSE tests cover encrypted BYOK and explicit local environment policy. Demo/live/workspace/package identity prevents cross-cache/buffer contamination even when resource IDs coincide; browser flags cannot bypass backend binding.
- Actual browser crypto round-trip, fresh IVs, wrong passphrase/tampering, locked reload, lock/forget/change/cross-tab invalidation, and storage/crypto failure pass. Enumerate persistent stores: no passphrase, derived key, plaintext, or plaintext fallback. Legacy persisted key migration preserves unrelated settings and never unlocks automatically. Replay does not touch the vault.
- Synthetic keys from two visitors reach only their intended live service/operation, never public settings/logs/Query state/server persistence. Missing/locked credentials prompt locally, not operator-key fallback. Test re-provision to the same operation and scoped revocation without automatic paid replay.
- Parser handles chunk boundaries, malformed/truncated completion, scoped cleanup, and reconciliation without command replay. Abort releases observation resources but does not claim backend cancellation.
- Canonical reads/mutations have deliberate invalidation/revision behavior; stale refetch cannot regress a new commit. Failed mutation retains versioned drafts and does not auto-replay generation/upload/end.
- Client stores/QueryClient are scoped correctly at the server/client boundary, not shared mutable instances across server requests. Old persisted initialization/server flags do not suppress metadata refresh.

## Code example: identity-scoped server state

Proposed `features/meetings/api/keys.ts` and `queries.ts` fragments. `meetingClient.get` is a typed feature client to implement through shared transport, with decoded backend DTOs and the supplied AbortSignal:

```typescript
import type { RuntimeScope } from "@/shared/runtime/contracts";

export const meetingKeys = {
  detail: (scope: RuntimeScope, meetingId: string) =>
    ["meetings", scope.mode, scope.workspaceId, scope.packageVersion, "detail", meetingId] as const,
};
```

Proposed `shared/runtime/contracts.ts` fragment:

```typescript
export type RuntimeScope = {
  mode: "live" | "replay";
  workspaceId: string;
  packageVersion: string | null; // null for live; validated package version for replay.
};
```

```typescript
import { useQuery } from "@tanstack/react-query";
import type { RuntimeScope } from "@/shared/runtime/contracts";
import { meetingClient } from "./client";
import { meetingKeys } from "./keys";

export function useMeeting(scope: RuntimeScope, meetingId: string) {
  return useQuery({
    queryKey: meetingKeys.detail(scope, meetingId),
    queryFn: ({ signal }) => meetingClient.get(meetingId, { scope, signal }),
    enabled: meetingId.length > 0,
  });
}
```

The client selects the composed source, but this scope is not authority to bypass server guards. Validate that replay requires a supported package version and live uses null; the fragment does not replace that runtime validation. The read hook never submits inference or contains keys/passphrases in its query key. Mutations specify command/retry/idempotency separately. [TanStack cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) requires propagating `signal`; it does not undo an accepted command.

## Code example: locked reload, not a persisted unlock key

Proposed actual-browser test contract. Implement `browserVault` with Web Crypto and isolated real storage, not a reversible mock; the factory creates a fresh capability over the existing encrypted envelope:

```typescript
it("requires the unsaved passphrase after reload", async () => {
  const first = await browserVault.openIsolated();
  await first.save({ providerKey: "SYNTHETIC_KEY" }, "fixture passphrase");
  const reloaded = await first.reloadCapability();
  expect(reloaded.isLocked()).toBe(true);
  await expect(reloaded.unlock("wrong passphrase")).rejects.toThrow();
  expect(reloaded.isLocked()).toBe(true);
  await reloaded.unlock("fixture passphrase");
  expect(await reloaded.inspectPersistentSecrets()).toEqual([]);
});
```

The final assertion must scan forbidden persisted passphrase/derived-key/plaintext material, not assert that the encrypted envelope is absent. Add independent nonce/metadata/tamper checks and captured backend/log tests; a round-trip alone does not establish secure storage.

## Green and refactor

- Put backend records and settings metadata in Query; drafts in React; shared panels/preferences and operation-scoped provisional buffers in focused Zustand controllers. No full meeting/messages mirror in Zustand.
- Shared transport owns errors, runtime-aware requests and narrowly scoped transient live credential handoff, multipart/SSE decoding, but imports no feature stores/query keys. Reproducible DTOs are drift-tested. Infrastructure/operator credentials never enter the browser; visitor keys are explicit BYOK inputs, never public responses/settings or global transport defaults.
- Migrate one complete screen/caller path and its tests before expanding. A temporary compatibility wrapper delegates to one owner and has an explicit removal gate.
- Scope buffers/cleanup by runtime/workspace/package/resource/operation. Persist justified preferences plus the separate encrypted-only vault envelope; never passphrase/derived key/plaintext, canonical records, server initialization gates, live stream flags, or tutorial progress. Clear unlocked capability references on lock; do not promise JavaScript secure zeroization.

## Exit gate

The migrated feature has one canonical record owner and runtime-separated cache/observation identity. Actual navigation, read-only replay guards, live BYOK handoff, browser encryption/locked reload/failures, malformed EOF, drafts, and caches pass. Existing unmigrated features and local integrations work. No browser provider/vector/backend database clients, visitor-auth bootstrap, saved passphrase/derived key, or hidden operator fallback.

Next: [Persona catalog and participants](spec-06-persona-catalog-and-participants.md).
