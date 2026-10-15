# Phase 08 evidence — demo runtime hardening (generic foundations only)

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
  runtime modules (persistent store, issuance/status/reset/expiry,
  generation fencing). [In progress]
- Bounds (B-10), cleanup (B-11), observability (B-12), determinism (B-13):
  [in progress — sections below fill in as each lands].

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
- B-07–B-13: [red/green pairs recorded per item as they land].

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

## Session lifecycle (B-07/B-08/B-09) — [in progress]

## Bounds (B-10) — [pending]

## Cleanup (B-11) — [pending]

## Observability (B-12) — [pending]

## Determinism policy (B-13) — [pending]

## Verification

- `test_demo_route_policy.py`: 6/6 green post-fix.
- Full backend suite + frontend checks: [recorded at phase close].
