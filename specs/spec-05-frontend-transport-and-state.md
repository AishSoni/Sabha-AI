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

## Implemented (spec-05 exit gate, recorded 2026-10)

Twenty-nine local commits from `1d12246` through this exit-gate commit (all committed locally, nothing pushed). Tests were written red and landed red before their implementations at every seam; each commit subject names the behavior or boundary it sets.

- Colocation first (`1d12246`, `1b31f75`, `a1d7abe`): the 17 Phase-1 suites moved beside the surfaces they pin — meeting/chat suites beside their components and stores, the stream parser beside `lib/api.ts`, settings suites beside the store and the settings section, and the cross-surface sanity/upload contracts into `tests/integration/` — behavior unchanged (79/79 green at the moment of the move), so every later seam could carry its contracts with it.
- The no-sign-in transport contract was pinned red (`093abfc`) against scripted fetch fixtures, then extracted (`4a8ee7c`): `src/shared/api/errors.ts` (ApiError kinds `http | network | aborted`; legacy `detail || API Error: ${status}` failure protocol byte-preserved) and `src/shared/api/transport.ts` (`requestJson` with Content-Type only when a body is present and no credentials option ever; `requestForm` multipart POST with no Content-Type header — the browser sets the boundary; AbortSignal propagated; fetch rejections translated to network/aborted kinds instead of leaking raw TypeError). The transport never reads user-auth headers, cookies, or visitor-auth state of any kind, resolves `NEXT_PUBLIC_API_URL` at call time for hosted/local parity, and imports nothing from features.
- The turn-stream parser contract (spec-02 heritage) was re-pinned beside the transport (`98225d3`) and moved verbatim into `src/shared/api/sse.ts` (`3010644`): complete-lines-only framing, `data:` prefix with arbitrary byte-boundary reassembly, malformed-line skip with `[SSE Parse Error]`, post-terminal drop with a console warning, final unterminated frame flushed, EOF recovery interruption synthesized with `interrupted: true` (no auto re-inference), and the abort contract — an aborted `reader.read()` releases the lock, yields nothing, and never claims backend cancellation. `lib/api.ts` `streamTurn` became a documented delegating shim (`ce5918c`), the deliberate compatibility path whose removal is queued to the spec-07 UI cutover.
- The backend contract was frozen (`8f44769`: `tests/fixtures/openapi.json`, 31 paths) and typed against (`c51c55c`): `openapi-typescript` generates `src/shared/api/generated.ts` (no timestamps, deterministic), a colocated drift test regenerates from the frozen snapshot and string-compares the committed file, and `npm run sync:openapi` refreshes it. Thin shape-agnostic decode primitives followed (`2f32df4` red, `49d7af6` green): `decode.ts` with DecodeError breadcrumbs (`participants[1].name: expected a string`); concrete record decoders live with their owning features, not in shared.
- Query composition landed red/Green (`48426fe` → `1663c29`): `@tanstack/react-query@5.104.5` pinned; `src/app/providers.tsx` owns `makeQueryClient` (staleTime 30 s; mutations `retry: false` — turn generation, uploads, and lifecycle are paid/stateful and replay only by user intent), a fresh client per server request so no mutable store is shared across server requests, and a browser singleton. The red tests pin A→B navigation cache identity (a late response for meeting A never touches meeting B's selected state) and one-attempt mutation behavior.
- The meetings feature became the one canonical owner of its backend records (`fe4b044` red → `4f61557`): `features/meetings/api/` with identity-scoped keys (`meetingKeys.detail(id) = ['meetings','detail',id]`), strict wire decoders feeding generated types, `meetingClient` (list/get/create/archive/unarchive/delete), `useMeeting`/`useMeetingList` reads, and cache-politics mutations — creation seeds the detail cache and invalidates the list, archive/unarchive patch the cached record's status, delete removes the detail entry, and the suite pins that a stale list refetch cannot regress a newer commit and that a failed create caches nothing.
- The meetings list screen was migrated as one complete screen (`7a46677` red → `b4c2774`): the page now renders through `useMeetingList` plus the command mutations (a source-ownership test forbids `@/lib/api` and direct `api.*` calls there), while tabs, the delete dialog, dropdown menus, styles, and URLs survive byte-for-byte.
- The create-meeting flow followed (`d57560a` red → `854df8c`, `951c257`): thin `features/persona-catalog` (roster reads via `usePersonaList`) and `features/knowledge` (document upload mutation, `retry: false`, strict five-field decoder) compose the new `useMeetingCreation` hook — created-meeting-id retention so a retry never re-creates, per-file staged upload statuses (`pending/uploading/uploaded/failed`) reconciled by file identity across `Promise.allSettled`, retry-of-failed-only, and the once-navigation guard. The page test now pins UI wiring while the hook tests own the resume invariants.
- The BYOK key vault was extracted into `src/shared/credentials/` (`bd9b0a4` red → `f0919ea`): `envelope.ts` (version-1 envelope, PBKDF2-SHA-256 210k iterations, ≥16-byte salt, ≥96-bit IV, fail-safe parse that rejects downgrades/corruption/unsupported versions, legacy packed payloads still readable) and `vault.ts` (module-memory keys only — `openVault`/`sealIntoVault`/`revealFromVault`/`forgetInVault`/`lockVault`, wrong-passphrase and lock-on-reload fail safe, cross-tab storage observation locks the vault). The settings store keeps only orchestration and its persisted shape (`vaultSalt` + ciphertexts — never passphrases or keys); settings-vault/hydration tests stayed green through the move unchanged.
- Settings metadata moved under Query (`2f5d9ae` red → `71a0818`): `features/settings` owns `GET /settings/providers` (`useProvidersEnvironment` with strict snake_case→view decoders), and the API-keys section hydrates server metadata every load through `initializeFromServer`, keeping the reconciliation rules (user choice wins `defaultProvider`, pristine system AI adopts the server value) and its graceful failure surface; the legacy `initialized` persist flag still strips to v1 as pinned.
- The import-boundary checker grew teeth (`136d3e3` red → `e8ed304`): features may not import the legacy `@/lib/api` monolith or `@/stores/*` (suite suites excepted by architecture rules), cross-feature access must go through root barrels, and `@/shared/*` (including the credentials vault) may not import features, stores, components, app, lib, or tests — enforced against a sandboxed synthetic tree and the live one.
- Hosted/local parity turned out to be test-visible, not just claimed (`142836c`): twelve assertions had pinned the literal localhost base and failed under `NEXT_PUBLIC_API_URL`; they now compose expectations from `resolveApiBaseUrl()`, and the full suite runs green in both configurations.

Commands and results: frontend full suite `npx vitest run` → **161 passed / 28 files** (local mode: **161 passed / 28 files**; hosted mode with `NEXT_PUBLIC_API_URL=https://sabha-hhcu.vercel.app/api`: **161 passed / 28 files**); `npx tsc --noEmit` → exactly the **7 pre-existing baseline errors** (two stale `.next` validator misses pre-dating this spec, two legacy store-selector typings, two legacy store test typing/arities, one legacy settings-store persist-migrate typing) — no new TypeScript debt. Backend untouched: the spec-04 backend full suite still passes from a clean checkout.

### Limitations (recorded honestly; never claimed as executed)

- The meeting room (`app/meetings/[id]`, ChatArea, turn execution/streaming) still works exactly as before through `stores/meetingStore.ts` and `lib/api.ts` — that migration is spec-07's "one accepted slice". The delegating `streamTurn` shim and the `StreamEvent` re-export are the deliberate compatibility path for it, with removal queued to spec-07. Meetings list + create flow + settings metadata are the migrated canonical owners; the checker now forbids any NEW feature code from the legacy paths.
- No real browser e2e was run; evidence is the component/integration suites, the architecture checker, `tsc`, and the hosted-environment parity run against stubbed fetch (the hosted endpoint itself was never contacted; no paid inference).
- The legacy workflow stores keep their own op-scope orchestration until spec-07 collapses the duplication; `lib/op-scope.ts` remains the shared pure mechanism, now reused by the migration-side `useMeetingCreation` hook too.
- Rate-limit cooldown stays a local non-authoritative helper on its legacy consumers (spec-10 owns the settings/reporting/archive cutover); HTTP 429 IS surfaced as a normal ApiError by the shared transport.
- The knowledge feature ships only the upload mutation the create flow needs (document reads/list/search still go through the legacy API on their legacy consumers); the personas feature ships only roster reads for the same reason.
- Cooldown and cost totals remain approximations pending the backend accounting contracts (spec-08); nothing here reads or persists provider/server credentials beyond the designed vault capability.

Next: [Persona catalog and participants](spec-06-persona-catalog-and-participants.md).
