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

## Completion record

Recorded 2026-10-28. Commits, oldest first:

| Commit | Slice |
| --- | --- |
| `ce2eaf4` | Resolve live presentation ports from the container |
| `cd3887e` | Add the read-only recorded replay request graph |
| `13de445` | Rebuild route fixtures around injected containers |
| `b73bce9` | Add scoped runtime identity and query clients |
| `8c8afc3` | Compose the meeting room through a runtime contract |
| `117467d` | Compose the recorded room route |
| `8245502` | Guard new epochs from late recorded reads |
| `df03b03` | Document shared hosting and replay-only startup |

Every result below comes from a command run against this checked-out tree.
No hosted service was contacted.

### Verdict

Spec 14 exits for the checked-in/local evidence:

- Live routes now resolve meetings, reads, turn observation, closing,
  knowledge, and the System AI read from the composition root. Request-layer
  default construction is forbidden by architecture tests.
- `/api/replay/*` is a separate request graph with its own read and observation
  ports. It never reads `app.state.container`, and its commands are rejected
  before any live adapter is reached.
- A replay-only startup builds without the live composition; the live worker
  refuses to run under `REPLAY_ONLY=true`. Cohosted startup still performs live
  recovery legitimately.
- The same `MeetingRoom` composes through a typed runtime contract. Live and
  replay use separate QueryClients, identities, epochs, projections, and abort
  signals; replay restart cannot reuse live caches, vault state, provider
  credentials, or cooldowns.

This is composition and isolation acceptance, not a packaged replay journey.
Production currently composes no recorded source, so `/api/replay/*` returns
`503 replay_not_configured`; see [Outstanding gates](#outstanding-gates).

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `venv\Scripts\python.exe -m pytest -q` (full suite) | `backend/` | **630 passed**, 0 failed, 23 warnings, 710 s |
| `venv\Scripts\python.exe -m pytest tests/integration/test_replay_surface.py tests/characterization/test_public_surface.py tests/contract/test_api_inventory.py tests/architecture/test_composition_boundaries.py -q` | `backend/` | **26 passed**, 15.21 s |
| `npm test` (final full run) | `frontend/` | **41 files / 235 tests passed**, 9.69 s |
| `npx tsc --noEmit` | `frontend/` | exit 0, no diagnostics |
| `python -m scripts.export_openapi` | `backend/` | wrote `frontend/tests/fixtures/openapi.json`, 46 paths |
| `npm run sync:openapi` | `frontend/` | regenerated `src/shared/api/generated.ts`; drift test passes |

The focused backend run includes the public-surface pin (38 non-replay
`/api` paths plus the exact replay surface), the inventory contract, the
composition-boundary checks, and all replay HTTP/isolation/startup tests. The
full backend suite includes the existing live create/read/turn/closing/
knowledge suites against the injected composition.

### What the tests prove

1. **Live behavior is characterized through composition.** Existing live
   route tests now build a `Container` and exercise the same application
   contracts. Test fixtures no longer patch deleted module-level defaults.
2. **The replay graph is independent.** Replay tests install a replay container
   with no live container, send real HTTP requests and deep links, and confirm
   every read reaches only the replay ports. Forged `X-Runtime-Mode`,
   `X-Workspace-Id`, `X-Provider-Key`, and `X-Replay-Mode` headers cannot leave
   the recorded meeting or select live data.
3. **Commands fail before adapters.** Every non-GET `/api/replay` path returns
   `403 replay_read_only`; a sentinel live write adapter is never invoked, and
   no fake commit receipt is returned.
4. **Replay-only startup is real.** Monkeypatched `Container.production` is
   never constructed when `REPLAY_ONLY=true` or when the app is created with
   the live mount disabled. `/health` and the replay session still serve. The
   live worker raises `SystemExit` for a replay-only composition.
5. **Cohosted recovery is not disabled.** The live lifespan still reconciles,
   starts the queue/runner, recovers closing, and runs knowledge cleanup when a
   live container is present. Replay dispatch does not construct those
   services.
6. **The browser scopes are separate.** `RuntimeScope` carries kind, ID, epoch,
   label, and provenance. The live provider keeps the existing live QueryClient;
   the replay provider mints a fresh client and abort controller per epoch.
7. **Replay renders the real room.** `/demo/meetings/[id]` composes the actual
   `MeetingRoom`. Recorded reads, disagreements, consensus, and explicit
   operation observation use `/api/replay/*`; canonical meeting rendering is
   unchanged.
8. **No live credential or cooldown path runs.** Replay makes no
   `/api/meetings` request and sends no `X-Provider-Key`. It does not read the
   `sabha` settings key, hydrate the vault, or mutate the provider cooldown.
   The architecture test walks the transitive replay import graph and forbids
   settings, credentials, stores, the live runtime, and legacy API clients.
9. **Colliding IDs and restarts stay isolated.** A live meeting cache survives
   replay entry and restart with the same meeting ID. Restart increments the
   epoch, replaces the replay QueryClient, and removes the old projection
   namespace. A deferred first-epoch JSON read resolved after restart cannot
   repopulate the new epoch.
10. **Late events cannot cross epochs.** Projection keys include the runtime
    scope ID, so an event from epoch 1 is absent from epoch 2 even when meeting
    and operation IDs collide. Observation uses the runtime signal combined
    with the caller signal, and unmount detaches without cancelling live work.
11. **Public surfaces are pinned.** The replay routes appear in the API
    inventory, OpenAPI fixture, generated frontend types, and drift test. The
    hidden non-GET catch-all is excluded from the schema but included in the
    route-surface assertion.

### Deliberate scope and manual rollback

- No packaged reader, manifest format, checkpoint engine, or pacing was built.
  The replay graph accepts an injected validated recorded source; Spec 17 owns
  the production reader and event implementation.
- Production does not import tests. The replay surface is mounted but returns
  an honest `503 replay_not_configured` until an operator composes a source.
- No replay entry wizard or guided bond journey was built. `/demo/meetings/[id]`
  is only the route scope; Spec 18 owns entry UX and the guide.
- Migration covered replay-reachable callers only: meeting service, meeting
  reads, turn observation and shared SSE, closing, knowledge lifecycle/stacks
  DB, and the `GET /providers` System AI read. Persona catalogs and other
  presentation defaults remain as they were.
- Isolation is graph, credential, and permission based. The implementation
  does not claim process-wide outbound denial while live calls are allowed.
  Hosted egress separation is optional and was not deployed.
- `HOSTED_STORAGE_VERIFICATION.md` remains an unrelated pre-existing untracked
  file and was not modified.
- Manual rollback: revert `df03b03` through `ce2eaf4` in reverse order, tests
  and docs together. The change adds no schema migration or hosted state to
  unwind.

### Outstanding gates

- Packaged recorded data, the checkpoint engine, prepared retrieval, paced
  generated text, and the approved guided journey are Specs 17–18. Until then,
  hosted replay is intentionally unavailable rather than mocked.
- No hosted replay reader credential was exercised end to end in this spec.
  Spec 12's independent reader-permission tests remain the database boundary;
  no new hosted egress or permission proof is claimed here.
- Late JSON is covered directly. Late SSE is covered by the epoch-keyed
  projection contract, the combined abort signal, and the observation-detach
  test; a browser SSE transport that ignores abort was not simulated.
- This is jsdom integration and FastAPI in-process acceptance, not a deployed
  multi-user browser journey. No full journey is claimed.
- Repository-level frontend lint was not rerun for this record. The full test
  suite's only warnings are the pre-existing localStorage/Radix `act()`
  warnings; backend warnings are pre-existing Pydantic deprecations.
