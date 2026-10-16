# Personas and configuration evidence — safe edits, stable snapshots, server-owned settings

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/05-personas-and-configuration.md`; contracts
  `specs/CONTRACTS.md` sections 1, 6, 9; requirements R-08, R-09, R-11,
  R-12, R-16; defects B-06, B-07, B-08, B-11; tasks T01–T08, TEST01–09,
  AC01–04.
- Canonical inference shape is `{provider, model, temperature, max_tokens}`
  with ranges temperature 0..2, max_tokens 1..128000, default 2048.
  Parse layers stay permissive (synthetic test providers allowed); the
  canonical resolver enforces the provider allowlist visibly so misconfig
  fails before any provider call. Unified `max_tokens` default (was 2048
  in meetings vs 2000 in personas).
- Prompts are transactional: single-active partial unique index, locked
  version allocation with unique-constraint retry (replaces max+1 race),
  validate-before-switch activation (never leaves none active).
- Snapshots are stable until explicit refresh: inheritance from persona
  provider config, BASE_INSTRUCTION split from persona extension,
  provenance + persona/prompt/snapshot revisions recorded.
- Effective settings = inference settings: precedence
  participant > persona > server > global, with per-field provenance and
  readiness reporting (no secrets in responses). System AI resolves
  separately; meeting summaries no longer borrow the first participant.
- Destinations are restricted: pinned hosts
  (openrouter.ai, generativelanguage.googleapis.com, loopback),
  `validate_destination` / `validate_ollama_base_url` before every
  outbound call, `follow_redirects=False` on all transports.
- Frontend seam (D-09): browser never holds keys or base URLs; non-secret
  preferences persist via `PUT /preferences`, hydrate via
  `GET /preferences`, readiness via `GET /effective`.

## Tasks / acceptance IDs and code/test paths

- Canonical config: `backend/app/modules/personas/config.py`
  (normalize, resolve with provenance, adapter args),
  `backend/app/models/schemas.py` + `persona_schemas.py` (unified
  validators, default 2048).
- Transactional prompts: `backend/app/modules/personas/prompts.py`
  (split/compose, activation validation, next version),
  `backend/app/services/persona_manager.py` (locked allocation, safe
  activation, revision bump), `migrations/005_persona_configuration.sql`
  (revision column, single-active index, snapshot columns, activation RPC).
- Snapshot creation: `backend/app/modules/personas/snapshots.py`,
  `backend/app/services/meeting_manager.py` (persona branch builds
  snapshot, copies provider config + stacks + revision).
- Refresh: `backend/app/modules/personas/refresh.py`
  (preview diff, idle/queue/revision eligibility, apply),
  `backend/app/api/participants.py` (refresh-preview/refresh with
  ownership guards), manager helpers `get_participant`,
  `get_persona_snapshot`, `update_participant_snapshot`.
- Authoritative prefs: `backend/app/modules/personas/preferences.py`
  (server-owned non-secrets, system AI separate, effective resolvers),
  `backend/app/api/settings.py` (`GET/PUT /preferences`,
  `GET /effective`, no secrets in responses).
- Restricted destinations: `backend/app/modules/personas/destinations.py`
  (allowlist, Ollama loopback pin, no-redirect flag), enforced in
  `backend/app/api/settings.py` on fetch/test paths with server-env key
  fallback and per-branch error handling.
- Frontend seam: `frontend/src/stores/settings-store.ts` (v2, secrets
  excluded from persist, legacy keys stripped on migrate, full defaults
  round-trip, auto-persist on edits),
  `frontend/src/lib/api.ts` (optional keys, preferences/effective/refresh
  clients matching backend shapes),
  `frontend/src/components/settings/provider-card.tsx` (server-managed
  notices, no browser key/URL inputs),
  `frontend/src/components/settings/system-ai-card.tsx` (no secrets,
  canonical 0..2 temperature),
  `frontend/src/components/settings/api-keys-section.tsx`
  (server copy, hydrates authoritative prefs after provider list).
- Legacy migration: `backend/app/modules/personas/migration.py`
  (multi/no-active audit, legacy active resolution), additive SQL only.

## Owned bugs: red/green evidence

- B-11 red: `activate_prompt_version` deactivated all before validating
  the target. Green: validates first, then switches; strict-xfail marker
  removed — `test_b11_invalid_activation_preserves_active` passes.
- B-07 red: persona branch dropped provider config. Green: snapshot
  inherits persona config with canonical `max_tokens` 2048; ledger test
  now asserts provider/model/temperature propagation + canonical tokens
  instead of exact raw equality.
- B-06 red: caller-controlled Ollama URLs with no policy. Green: policy
  in `destinations.py` (pinned hosts, no redirects), enforced in
  `settings.py`; ledger test checks the module + transport usage.
- B-08 red: placeholder `pytest.fail`, no seam. Green: executable seam
  check — preferences round-trip without secrets, effective resolution
  with readiness, System AI resolved separately.
- Remaining xfails (owning phase intact): B-03 (isolated Qdrant fixture,
  Phase 06), B-10 (vector cleanup on delete, Phase 06).

## Commands, environment, results

- Env: Windows, Python 3.11, Node frontend suite.
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest backend/tests -p anyio -q` →
  **103 passed, 17 skipped, 5 deselected, 2 xfailed** (autoload disabled:
  broken `langsmith` plugin in system site-packages; integration
  deselected by default marker).
- `python -m pytest backend/tests -m integration -p anyio -q` →
  **5 passed** (real-server transport reconnect).
- `npm test` (cwd `frontend/`) → **4 files, 10 tests passed**.
- `npx tsc --noEmit` → clean (exit 0). `npm run lint` shows 2 pre-existing
  errors in untouched chat components (`SharedDocumentsTab`,
  `ThinkingBlock`) plus warnings; no new errors from the settings seam.
- Excluded: `npm run build` (no production build change in this phase).

## Migration / rollback

- Additive migration `005_persona_configuration.sql`; legacy readers
  ignore new columns/indexes. Rollback = application rollback; prompt
  history preserved, multi/no-active cases reported by the audit helper
  rather than silently resolved.

## Manual acceptance and limitations

- No walkthrough (core phase). Secrets verified absent from browser
  persist (partialize), migrate path, and every preferences/effective
  response. Temperature upper bound aligned to canonical 2.0 in both
  backend validators and the System AI slider.
- Limitations: sqlite/double suites prove predicates, not live Supabase
  locking; former RLS hardening is out of scope; multi-worker PG adapters stay
  Phase 08.

## Exit decision

Passed: AC01 (safe persona edits, transactional prompts), AC02 (stable
snapshots until explicit refresh), AC03 (atomic activation + effective =
inference with provenance), AC04 (restricted destinations, server-owned
seam, legacy history preserved).
