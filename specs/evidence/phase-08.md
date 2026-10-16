# Phase 08 evidence — demo runtime hardening (generic foundations only)

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/08-demo-runtime-hardening.md` (draft); contracts
  `specs/CONTRACTS.md`; requirements R-06, R-07, R-08; defects B-01 through
  B-13 (demo-runtime set).
- Entry criteria D-02 (2h idle / 24h absolute session expiry), D-07
  (sessionStorage + `Authorization` header, hashed opaque token), and D-10
  (1 scenario/session, 100 actions/session, 30 writes/min) are finalized and
  treated as fixed inputs, not debated in this phase.
- No real bond journey, no live providers, no paid services: every runtime
  path in this phase runs on synthetic fixtures only. The public demo entry
  (`/api/v2/demo/*`) stays disabled and the real scenario
  (`indian-corporate-bond-review`) stays owned by Phase 10. Session/header
  integration in the real frontend is Phase 10 work; the frontend sends no
  auth headers yet and that is unchanged here.
- Supabase Row-Level Security remains disabled (migration policies are
  commented out and the backend reads through anon/service keys), so the
  application layer is the ownership control. B-02 is therefore closed at
  the route/helper layer: every data route resolves identity at the entry
  boundary and scopes or quarantines cross-owner reads to 404.

## Tasks / acceptance IDs and code/test paths

- Route policy (B-02 app-layer + B-05 remainder + B-06 demo denial):
  `backend/app/api/personas.py`, `knowledge_stacks.py`, `documents.py`,
  `settings.py`; regression `backend/tests/api/test_demo_route_policy.py`.
- Capability inventory (B-01): this file, section "Capability inventory".
- Composition (B-03/B-04): `backend/app/infrastructure/demo/composition.py`
  (pre-existing; inventoried, not rebuilt).
- Session lifecycle (B-07/B-08/B-09): `backend/app/infrastructure/demo/`
  runtime modules — `tokens.py` (256-bit opaque bearer, SHA-256 at rest,
  constant-time verify), `runtime.py` (`DemoSessionStore` over a gateway
  port: `InMemoryGateway` default, `SupabaseGateway` persistent via
  migration `007_demo_sessions.sql`), `errors.py` (typed codes),
  `bounds.py` (D-02/D-10 values + documented local caps).
- Bounds (B-10): 1 scenario/session for life, 100 actions/session,
  30 writes/min sliding window, 100 live sessions global, 20
  creations/hour per key, 8k-char action payload budget, 32-entry bounded
  reset-key history. Reset preserves lifetime counters (no bypass).
- Cleanup (B-11): `cleanup.py` idempotent retention sweep; per-record
  failures counted not fatal; fixtures preserved by construction (store
  holds IDs/counters only).
- Observability (B-12): `observability.py` allowlisted JSON logs (no token
  parameter by design), `build_health` readiness (backlog, failed
  cleanups, pending expiry; `paid_probes` always empty),
  `private_no_store_headers` for credential responses.
- Determinism (B-13): fixture content replays byte-identical
  (`test_demo_determinism.py`); credentials are the documented exception.
- Frontend contract: `frontend/src/features/demo/types.ts`
  (`DEMO_SESSION_STORAGE_KEY`, `DEMO_AUTH_SCHEME`, `demoAuthHeader`;
  `DEMO_ENABLED` still false) + `session-contract.test.ts`.
- Regression: `backend/tests/unit/test_demo_runtime.py` (20 tests),
  `test_demo_gateway.py` (4), `test_demo_determinism.py` (3),
  `backend/tests/api/test_cross_owner_isolation.py` (5),
  `test_demo_route_policy.py` (6).
- Migration: `backend/migrations/007_demo_sessions.sql` (apply via
  Supabase SQL editor per repo practice; includes a synthetic-only CHECK).

## Owned bugs: red/green evidence

- B-05/B-06 remainder red: new `test_demo_route_policy.py` failed 6/6
  pre-fix — persona/stack/document probes reached Supabase with no auth
  check (transport `ConnectError`), `GET /api/settings/preferences`
  returned 200, and `POST /api/settings/models` + `/test-key` returned 200
  in demo mode. Green post-fix: 6/6 pass (auth rejects before the database;
  live lookups denied in demo mode before auth). Commit `1e24c0b`.
- Detail: `personas.py` requires the entry-boundary actor on all 8
  endpoints; list scopes to `actor.identity`, create stamps it, and
  direct-ID read/update/delete/prompt-version allow shared `is_default`
  rows while cross-owner rows read as 404. `knowledge_stacks.py` requires
  the actor everywhere and always scopes list/create/get/update/delete to
  `actor.identity` (the previous unfiltered list leaked the full table).
  `documents.py` requires the actor on all 10 endpoints and verifies
  ownership through the parent link (meetings strictly, personas
  owner-or-default, stacks strictly; parentless rows quarantine to 404),
  including the search endpoint which previously trusted caller-supplied
  parent IDs. `settings.py` requires the actor on preferences/effective and
  denies `/models` + `/test-key` with 403 `demo_mode_denies_live_lookup`
  while `app_env == "demo"`, checked before auth so test doubles and
  crawlers cannot reach live transport. Note for later phases: these routes
  read the global `settings` object, not `get_settings()`, so tests must
  monkeypatch `app.core.config.settings.app_env`.
- B-01/B-03/B-04 red: no phase-level record existed of what the demo may
  touch, so a reviewer could not tell a paid/live call from an allowed
  fixture read. Green: the inventory below plus the contract tests
  (`test_demo_composition.py`, `test_demo_manifest.py`,
  `test_demo_smoke.py`, `test_demo_disabled.py`) pin the allowlist.
- B-07–B-13 red: the runtime modules did not exist — new
  `test_demo_runtime.py` failed at collection (`ImportError: cannot import
  name 'bounds'`). Green after implementation: 20/20, including
  heartbeat-not-extending-idle, absolute-dominates-idle (12 rounds of
  activity then expiry), reset-preserving-counters, burst-with-retry, and
  crash-retry cleanup. One real bug caught mid-green: frozen-dataclass
  exceptions cannot be raised (`FrozenInstanceError` on traceback attach);
  `errors.py` is now plain `Exception` subclasses. Gateway contract
  (`test_demo_gateway.py`, recording fake, no network): 4/4 green on first
  run — adapter over already-verified logic — including a full
  issue/write/reset/sweep cycle over the Supabase query shape.
- Cross-owner HTTP (TEST02): `test_cross_owner_isolation.py` (5/5, faked
  storage, no DB in this environment). Each case asserts both sides so the
  tests fail against pre-fix code (open reads returned the stranger 200;
  the unfiltered stack list returned both owners' rows). Parentless
  documents quarantine to 404; shared default personas stay visible.
- Determinism (B-13): `test_demo_determinism.py` 3/3 — two builds are
  byte-identical, content carries no clock/randomness (pinned
  `2026-01-01` snapshot), search replays identically. Tokens/session IDs
  are the intentional exception (uniqueness required; never in content).

## Capability inventory (B-01)

Surveyed `backend/app/infrastructure/demo/` (capabilities, composition,
manifest, routes, sessions), `backend/app/factory.py` (router mount),
`frontend/src/features/demo/types.ts` (disabled-entry contract), and the
settings live-call sites. Allowed in demo runtime:

- `fixture_retrieval` — synthetic fixture reads only
  (`FixtureKnowledgeSearch`; hits carry `synthetic-*` IDs and
  `SYNTHETIC-*` refs; empty query returns no items, never fabricated).
- `synthetic_smoke` — the single synthetic manifest
  (`synthetic-smoke-scaffold`, revision-pinned, `synthetic_only=True`).

Everything else fails closed with typed `demo_unavailable`
(`DemoUnavailable`, HTTP 503 on the disabled public entry):

- `real_scenario_bootstrap`, `guided_actions`, `votes`, `summaries`,
  `metadata`, `live_search`, `live_inference`, `market_data`,
  `exploration_fork`, `authored_ending`.
- `FixtureProviderResolver` serves only `fixture`/`synthetic`/default
  providers; any named live provider raises before transport.
- `guard_live_transport` raises before any live destination is attempted.
- Settings `/models` and `/test-key` are denied in demo mode (see above);
  no other settings path performs network I/O (preferences/effective are
  Supabase reads/writes only).

Explicitly out of demo reach: Qdrant, embeddings, provider API keys,
market-data vendors, web search, and the real journey state machine
(J00–J09, Phase 10). The manifest validators reject the real scenario ID
and any non-`synthetic-` source/scenario IDs at the type boundary, and
composition raises a second explicit guard on the real scenario ID.

## Zero-paid composition (B-03/B-04)

- `build_fixture_composition` boots with no credentials, no Qdrant, no
  embeddings: the default provider is an in-test `ScriptedProvider`
  (test double), the knowledge search is fixture-backed, and the resolver
  rejects non-fixture providers. Pinned by
  `test_offline_composition_boots_without_keys` (env scrubbed) and
  `test_fixture_resolver_rejects_live_provider_before_transport`.
- No billing control is needed because no billable constructor exists in
  the composition path: there is no metered API client to instantiate, and
  the only HTTP-capable settings endpoints are denied in demo mode.
  Verified by code survey (this phase); if a billable client is ever added
  to the demo path, this section must gain a red test first.

## Session lifecycle (B-07/B-08/B-09)

- Issuance: `DemoSessionStore.issue` mints a 256-bit `secrets` token,
  stores only its SHA-256 hash, and returns `(SessionView, token)`.
  Rejects the real scenario and non-`synthetic-` IDs before any state.
- Status/heartbeat (`get_by_token`) verifies the hash and checks expiry
  but never touches `last_active_at` — reads cannot extend idle lifetime.
- Expiry (D-02): idle 2h from last action/write, absolute 24h from issue.
  Expired sessions deny reads, actions, writes, and reset with typed
  `demo_session_expired` (410 hint).
- Reset: idempotent per (key, generation); bumps generation, clears
  `active_turn_id` (fences old turns/workers), keeps scenario binding,
  `action_count`, write window, and creation stats. Rebinding conflicts
  (409). Reset-key history bounded to 32 entries (oldest evicted).
- Persistence: `InMemoryGateway` (process-local, tested default) and
  `SupabaseGateway` (same records via `demo_sessions`; apply
  `007_demo_sessions.sql` in the SQL editor). The store never holds
  fixture content, tokens, or secrets.

## Bounds (B-10)

Per D-10 plus documented local caps (see `bounds.py`): 1 scenario/session,
100 actions/session (lifetime, survives reset), 30 writes/min sliding
window with `retry_after_s`, 100 live sessions globally (retry = soonest
expiry), 20 creations/hour per creation key, 8k-char action payload
budget. All denials are typed `demo_quota_exceeded` (429 hint) with
scope/limit/retry detail and increment denial counters visible in health.

## Cleanup (B-11)

`run_retention_sweep` removes idle/absolute-expired sessions, keeps live
ones, and reruns clean (second pass removes zero). One failing delete does
not abort the sweep: failures increment `failed_cleanups` (health flips to
`degraded`) and the retry clears the backlog (both paths tested, including
a simulated mid-sweep crash). Fixtures are preserved by construction and
asserted by rebuilding the composition across a sweep.

## Observability (B-12)

`log_event` emits sorted-JSON with request/session/meeting/turn/job IDs and
a truncated safe detail; the signature accepts no token/secret/content, so
credential leaks through this path are structurally impossible (tested:
token absent from payload and keys). `build_health` reports readiness from
store counts only — no paid probes, ever (`paid_probes: []` asserted).
Session/credential responses use `Cache-Control: no-store, private`.

## Determinism policy (B-13)

Fixture content is a pure function of the manifest + fixture hits: no
wall-clock, no randomness, no ambient env. Credentials (tokens, session
IDs) must be unique per issuance and are kept out of fixture content by
construction (store records never enter composition inputs).

## Regression map (P08-TEST01–10)

- TEST01 (disabled/live + overrides): `test_demo_disabled.py` (public
  entry 503 incl. mode-override attempt), `test_demo_route_policy.py`
  (demo-mode denial of `/models` + `/test-key`), composition tests
  (resolver rejects live providers pre-transport).
- TEST02 (cross-session/direct-ID): `test_cross_owner_isolation.py`;
  guessed-ID reads behave as 404 without distinguishing unknown IDs.
- TEST03 (fake-time expiry/fencing): `test_demo_runtime.py` idle,
  absolute, heartbeat, stale-generation, reset-fencing cases.
- TEST04 (caps/reset-bypass): action-cap-survives-reset, burst window,
  global cap, creation rate, retry feedback cases.
- TEST05 (crash/race cleanup): flaky-gateway sweep (failure counted,
  retry clears), idempotent double-sweep, reset-during-lifetime cases.
- TEST06 (credential scan): log-output token-absence test; no-store
  header test; store records contain no `token` field.
- TEST07 (backpressure/bounds): write-window, payload-budget,
  reset-key-bound, global-cap cases (no streams exist yet to back up —
  SSE/backpressure over live streams is Phase 10 scope).
- TEST08 (synthetic issuance/reset/expiry without keys/Qdrant): full
  runtime suite runs with env scrubbed and no network (repo socket guard
  active); composition boots keyless (pre-existing test).
- TEST09 (local lifecycle/restart): in-memory + Supabase-gateway paths
  verified; restart recovery requires the Supabase gateway (documented
  below). Live streaming/reconnect/proxy verification is P10-TEST12, not
  claimed here.
- TEST10 (no bootstrap/instrument selection): real-scenario and
  non-synthetic IDs rejected at issue, manifest, and composition layers;
  disabled public entry stays 503.

## Runtime foundation packet (Phase 10 handoff)

- Modules: `backend/app/infrastructure/demo/` — `tokens`, `errors`,
  `bounds`, `runtime` (`DemoSessionStore`, gateways), `cleanup`,
  `observability`, plus pre-existing `capabilities`, `composition`,
  `manifest`, `routes` (disabled entry), `sessions` (test-only scaffold).
- Database: apply `backend/migrations/007_demo_sessions.sql` via the
  Supabase SQL editor; RLS stays disabled by policy (app-layer control).
  Point the Phase 10 wiring at `SupabaseGateway` (service role).
- Environment: no new variables. Demo needs no API keys, no Qdrant, no
  embeddings. `app_env=demo` flips settings live-lookup denial.
- Scheduler: run `run_retention_sweep` periodically (idle expiry is lazy
  otherwise; sweep also feeds `expired_pending`/`failed_cleanups`). Any
  interval well under 2h works; document the chosen one in Phase 10.
- Restart: in-memory gateway loses sessions (local dev only); Supabase
  gateway survives restarts and shares state across processes. No broker
  required. Authoritative queue durability is Phase 10 wiring concern.
- SSE/proxy: no streams were verified in this phase. Current Phase 10
  acceptance requires real incremental turn/ending transport and correct
  progress freshness. The earlier bearer/header/credential handoff is
  withdrawn; anonymous run references are state bookkeeping only.
- Frontend contract: the historical `frontend/src/features/demo/types.ts`
  scaffold is not a mandatory credential design. Use the current shared
  API/stream contracts and lightweight anonymous resume/reset state.
- Deferred hosted checks (not prerequisites of this gate): actual-host
  proxy/SSE verification (P10-TEST12), live Supabase-backed session test,
  egress controls for the hosting setup.

## Verification

- `test_demo_route_policy.py`: 6/6 green post-fix.
- Backend: 154 passed, 17 skipped (`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
  python -m pytest tests -q -p anyio.pytest_plugin`; integration deselected
  by `pytest.ini`). The 17 skips are pre-existing unmarked-async tests in
  untouched application/contract files (verified: same skips on files last
  touched by earlier phases).
- Frontend: `vitest run` 12 files / 40 tests pass (incl. 3 new
  session-contract tests); `eslint` clean on touched files;
  `tsc --noEmit` clean.
