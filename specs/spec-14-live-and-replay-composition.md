# Spec 14 (Phase 3): Live and Replay Composition

## Purpose and prerequisites

Introduce proper DI for live and replay in the **same hosted application**, after [database isolation](spec-12-database-read-isolation.md) and [creation fixes](spec-13-meeting-creation-regressions.md). Read the [runtime contract](reference-runtime-modes-and-credentials.md). Reuse actual features and application policies, not a parallel app or no-op persistence.

This spec owns composition and runtime scope. Spec 17 owns the recorded reader/event implementation and checkpoint engine; Spec 18 owns entry UX and the full guide. Do not build those prematurely.

## Grounding and extraction scope

- `backend/app/bootstrap.py` constructs concrete production queue/closing services and invokes live knowledge/queue/closing recovery in lifespan. `backend/worker.py` constructs production composition separately.
- `backend/app/presentation/dependencies.py` and `modules/meetings/presentation/compat_http.py` construct default meeting services outside the container. Knowledge defaults construct live database/storage/vector/embedding adapters. Settings provider reads can consult live System AI through an admin client.
- Turn infrastructure consumes `MeetingService.db`; closing infrastructure also reaches concrete persistence. A new container flag without removing these bypasses is not DI.
- Frontend feature hooks import singleton clients and a global turn projection. `app/providers.tsx` has a browser QueryClient singleton. These are acceptable for a single live scope but cannot safely share replay rewind state.
- Room controls assemble generation settings and reveal the vault before submitting; summary UI also reads provider credentials. `RateLimitedButton` records a live cooldown before invoking its callback. Replay dispatch must branch at the feature intent boundary **before** these effects.

Extract narrow, application-owned contracts for needed reads, command admission, observation, and configuration. Infrastructure implements those contracts; bootstrap supplies concrete adapters. Move callers away from public `.db` escape hatches where the extraction requires it. Respect module public exports and import rules; do not introduce one enormous runtime service or repository merely to hide dependencies.

## Required architecture

### Backend

1. Preserve existing live URLs and live queue/closing/knowledge behavior. Bind proposed replay URLs under `/api/replay` to an explicit replay request graph and a dedicated reader credential. No request header, mutable global `runtime_mode`, workspace ID, or package payload switches the live graph's database/client.
2. Presentation resolves dependencies from composition, including compatibility reads and settings/knowledge callers reachable by replay. Replay exposes only its approved read/stream surface, not a generic proxy to every live endpoint. Unsupported commands are rejected before live adapters or transient credential handoffs.
3. Rejecting write ports fail explicitly; they never return fake commit receipts. A replay intent means selecting a permitted recorded transition, not submitting a live create/send/turn/close/upload command.
4. Live lifespan recovery/workers remain legitimate in the same deployment. Replay request handling cannot start, invoke, or lazily construct them. An optional replay-only local composition must start without live providers, Qdrant, service-role access, or recovery workers; reject an attempt to run a live worker in that composition.
5. Isolation is graph/credential/permission based. Same-process coexistence cannot claim process-wide outbound denial while live calls are allowed. Restrict replay adapters to approved Supabase/asset reads and prove no replay-attributable live calls. Stronger deployment egress separation is optional, not an excuse to split the product.

### Frontend

1. Compose typed feature-facing reads, observation, supported intents, capabilities, and presentation provenance. Keep actual `MeetingRoom`, creation/list/document/closing components. Do not intercept global `fetch` or scatter `isDemo` checks through domain behavior.
2. Scope QueryClient, provisional projections, observation subscriptions, and guide UI to runtime identity and replay run epoch. Preserve the live scope separately; replay restart must not clear live caches, credentials, or provider cooldowns.
3. Abort scoped JSON/SSE requests on restart/switch and guard late completions by epoch. A live observation detaches without cancelling durable live work. Reload is not a replay session restore; navigation inside the mounted replay scope preserves the current cursor.
4. Replay intent paths do not import/hydrate/reveal/modify the live vault or query live provider settings merely to render. Supply safe packaged configuration/copy and a presentation cooldown policy without disabling real request/stream limits.
5. Use a replay route scope in the same Next.js app that composes the same feature screens. Preserve existing live routes. A `/demo` route namespace is allowed as composition, not a separate mock screen. Final entry choice belongs to Spec 18.

## Tests to write first

- Characterize existing live create/read/turn/closing/knowledge behavior before extraction. Run the same application contracts against the injected live composition.
- Import/boundary tests forbid request-layer default construction and replay imports of live provider/queue/knowledge lifecycle implementations. Verify actual composition, not only interface names.
- Real replay HTTP/deep-link attempts cannot reach live IDs, settings, storage or commands, even with forged mode/workspace values or a supplied provider key. Use rejecting live-adapter sentinels plus independent Spec 12 reader permission tests.
- Lifespan/worker tests distinguish live startup recovery from replay request dispatch and replay-only startup. Do not assert the entire cohosted process is idle.
- Two scopes with colliding meeting/operation IDs never share cached canonical records or projections. Restart, route switch and late JSON/SSE completion cannot repopulate the new epoch.
- An unlocked synthetic live vault and live cooldown remain unchanged after entering, running and restarting replay. Verify zero replay credential reads as well as zero secret headers; dropping a header after revealing a key is too late.

## Implementation and exit gate

Extract one real read and one observation boundary first, then migrate affected callers in small slices. Add only files/interfaces with real consumers. The replay graph may use a minimal validated test source at this gate; production must never import tests and no full journey is claimed.

Exit when live characterization and architecture suites pass, all replay-reachable construction paths are accounted for, runtime state/vault isolation is tested, and operations docs describe shared hosting accurately. Public route/event changes ship with the API inventory, OpenAPI fixture, generated frontend types and drift tests; proposed routes are not added to the live inventory in advance.

Next: [Closing UI integration](spec-15-closing-ui-integration.md).
