# Spec 05 (Phase 2): Frontend Transport and State Foundation

## Purpose and prerequisites

Migrate one read-and-mutate feature to explicit state ownership, rather than moving the old all-purpose store unchanged.

- [Foundations](spec-03-foundations-and-contracts.md) and initial [backend composition/contracts](spec-04-backend-composition-and-transactions.md) accepted. Backend DTOs, no-sign-in shared-workspace access, safe errors, status/operation identity, and coordinated API cut are defined.
- Component/query harness, deterministic HTTP/SSE transports, store reset, deferred promises, and existing Phase 1 navigation/draft/EOF tests run.
- Install/lock a supported TanStack Query version deliberately. Read [frontend ownership](reference-architecture-contracts.md#frontend-ownership-and-contracts) and [target layout/import rules](reference-architecture-contracts.md#frontend-target-layout).

## Scope and target files

Introduce `frontend/src/app/providers.tsx`, `shared/api/{transport,errors,sse,generated}.ts`, and one feature's `api/{client,keys,queries,mutations}.ts`. Create only the UI/provisional stores actually needed. Do not add `shared/auth/`, an Auth boundary, or login routes; the demo does not require an authentication SDK or session bootstrap. Preserve current URLs, styles, and `components/ui/`.

Split the relevant callers out of `frontend/src/lib/api.ts` and `frontend/src/stores/meetingStore.ts` or `settings-store.ts` as one vertical slice. The old and new paths may coexist for different unmigrated features, **not independently write the same canonical records**.

## Tests to write first

- A and B have distinct query/cache identities. Resolve A after B navigation: A may populate A's cache, never B's selected UI/buffers/errors/loading flags.
- A fresh browser uses JSON, multipart, status, and SSE without login redirects, Auth bootstrap, user-auth headers/cookies, or an account. Hosted and local configurations work identically in this respect. Settings/errors/streams never reveal server credential values; resource or validation errors do not send visitors to a login screen.
- Parser handles chunk boundaries, malformed/truncated completion, scoped cleanup, and reconciliation without command replay. Abort releases observation resources but does not claim backend cancellation.
- Canonical reads/mutations have deliberate invalidation/revision behavior; stale refetch cannot regress a new commit. Failed mutation retains versioned drafts and does not auto-replay generation/upload/end.
- Client stores/QueryClient are scoped correctly at the server/client boundary, not shared mutable instances across server requests. Old persisted initialization/server flags do not suppress metadata refresh.

## Code example: identity-scoped server state

Proposed `features/meetings/api/keys.ts` and `queries.ts` fragments. `meetingClient.get` is a typed feature client to implement through shared transport, with decoded backend DTOs and the supplied AbortSignal:

```typescript
export const meetingKeys = {
  detail: (meetingId: string) => ["meetings", "detail", meetingId] as const,
};
```

```typescript
import { useQuery } from "@tanstack/react-query";
import { meetingClient } from "./client";
import { meetingKeys } from "./keys";

export function useMeeting(meetingId: string) {
  return useQuery({
    queryKey: meetingKeys.detail(meetingId),
    queryFn: ({ signal }) => meetingClient.get(meetingId, { signal }),
    enabled: meetingId.length > 0,
  });
}
```

This read hook never submits inference. Mutation hooks must specify their command/retry/idempotency policy separately. [TanStack cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) requires propagating `signal` through the transport; it does not undo an accepted server command.

## Green and refactor

- Put backend records and settings metadata in Query; drafts in React; shared panels/preferences and operation-scoped provisional buffers in focused Zustand controllers. No full meeting/messages mirror in Zustand.
- Shared transport owns safe errors, no-sign-in requests, multipart and SSE decoding, but imports no feature stores/query keys. Generated/validated DTOs must be reproducible and drift-tested. Never inject server database/provider credentials into browser requests.
- Migrate one complete screen/caller path and its tests before expanding. A temporary compatibility wrapper delegates to one owner and has an explicit removal gate.
- Scope provisional buffers and cleanup by resource/operation identity. Persist only justified, versioned presentation preferences; never secrets, canonical records, server initialization gates, or live stream flags.

## Exit gate

The migrated feature has one canonical backend-record owner; actual navigation, no-sign-in fetch/upload/status/SSE, credential non-disclosure, malformed EOF, draft, and cache tests pass in hosted and local configurations. Existing unmigrated features still work. No raw provider/vector/backend database clients or required visitor-auth SDK/session are constructed in the browser.

Next: [Persona catalog and participants](spec-06-persona-catalog-and-participants.md).
