# Phase 04 evidence — meeting domain, durable execution, editable queues

## Spec revision and decisions

- Spec: `specs/phases/04-meeting-lifecycle.md` (draft); contracts
  `specs/CONTRACTS.md` sections 1-5; requirements R-02, R-05, R-06, R-07,
  R-11, R-12, R-15.
- Historical migrations are never rewritten: `supabase_schema.sql` keeps its
  original CHECK; `migrations/004_meeting_lifecycle.sql` expands the status
  constraint and adds queue/ending/lease/ledger storage plus atomic RPCs.
- RLS hardening stays Phase 08 (runtime-policy audit). Until then ownership
  is enforced at the application entry boundary; RPCs run SECURITY DEFINER.
- Multi-replica Postgres lease adapter stays Phase 08; single-host
  durability uses the file-backed coordinator (`backend/data/leases.db`)
  under the same claim/fencing contract proven by the sqlite suites.
- New queue/ending endpoints are additive under `/api/meetings`; `/api/v2`
  namespacing is deferred to Phase 08 with the session lifecycle.

## Tasks / acceptance IDs and code/test paths

- Domain extraction: `backend/app/modules/meetings/domain.py`,
  `backend/tests/unit/test_meeting_transitions.py` (8 tests).
- Actor policy: `backend/app/modules/access/{actors,deps}.py`,
  `backend/tests/unit/test_actor_policy.py`,
  `backend/tests/api/test_actor_boundaries.py` (401/404/scoped/owner-create);
  enforced across all meeting/child routes in `backend/app/api/meetings.py`
  and `add_participant` in `backend/app/api/participants.py`.
- Durable coordinator: `backend/app/modules/meetings/leases.py`
  (claim/heartbeat/fencing/revoke/reconcile/classify),
  `backend/tests/application/test_durable_leases.py` (9 tests); engine wiring
  in `backend/app/modules/meetings/engine.py` (lease claim, per-iteration
  heartbeat, fenced finalize commits nothing); runner drain in
  `backend/app/modules/meetings/runner.py`; startup reconcile + shutdown
  drain in `backend/app/factory.py`; file coordinator wired in
  `backend/app/services/orchestrator.py`.
- Queue: `backend/app/modules/meetings/queue.py` (in-memory + sqlite),
  `backend/tests/application/test_meeting_queue.py` (5),
  `backend/tests/application/test_queue_sql.py` (3, incl. threaded
  dispatch-vs-edit race and crash-retry); endpoints
  `POST /{id}/messages`, `GET /{id}/queue`, `PATCH/DELETE /{id}/queue/{entry}`
  plus legacy `POST /{id}/message` wrapper; turn/ending/archive barriers;
  `backend/tests/api/test_queue_endpoints.py` (6).
- Status repair + ending: `migrations/004_meeting_lifecycle.sql`,
  `backend/app/modules/meetings/ending.py` (sqlite atomic commit +
  `run_ending_attempt` + extracted vote/summary prompt builders),
  `backend/tests/application/test_ending_workflow.py` (7),
  `backend/app/api/meetings.py:end_meeting` (barriers, ending lease,
  idempotent attempts, strict-majority rule, failure restores active).
- Archive/restore: domain guards + `archived_from` provenance
  (`Meeting.archived_from`), `archive_meeting` persists prior state, unknown
  prior stays 409.
- Transactional creation/finalization: `create_meeting_with_participants`
  RPC with sequential-with-compensation fallback pre-migration;
  `commit_ending_attempt` / `dispatch_queue_entry` RPCs with fallbacks.
- Migration rehearsal: `backend/app/modules/meetings/migration.py`
  (`audit_meetings`), `backend/tests/application/test_migration_rehearsal.py`
  (legacy red, upgrade green, preserved IDs/messages/cost, quarantine report).
- Transport: `backend/tests/integration/test_transport_reconnect.py` (real
  uvicorn + TCP disconnect mid-stream, replay, terminal reconciliation).

## Owned bugs: red/green evidence

- B-04 red: `test_legacy_status_constraint_rejects_voting_before_upgrade`
  (legacy CHECK rejects `voting`); `test_b04_*` xfail on
  `supabase_schema.sql:15`. Green: upgrade admits voting/ended, atomic
  ending commit proven (`test_crash_between_votes_and_commit_rolls_back`),
  ledger marker removed. Command below: 99 passed.
- B-05 red: `tests/api/test_actor_boundaries.py` 5 failed pre-fix (routes
  ignored credentials; cross-owner read succeeded). Green: same 5 pass;
  structural ledger test superseded by behavioral boundary + policy suites
  (recorded in `test_ledger.py`). Full Phase 08 audit still owns
  persona/stack/document runtime policy.

## Commands, environment, results

- Env: Windows, Python 3.11.9, pytest 8.3.5, anyio 4.9.0, httpx 0.28.1,
  uvicorn 0.40.0; Node frontend suite.
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest backend/tests
  -m 'not integration' -q -p anyio.pytest_plugin` →
  **99 passed, 17 skipped, 4 deselected, 6 xfailed** (autoload disabled:
  broken `langsmith` plugin in system site-packages).
- `python -m pytest backend/tests/integration -m integration` →
  **5 passed** (incl. real-server disconnect/reconnect, ~3.3s).
- `npm test` (cwd `frontend/`) → **4 files, 10 tests passed**.
- Excluded: `integration` from the default marker (explicit opt-in run
  above covers it); `npm run build` (no frontend production change).

## Migration / rollback

- Additive migration; old readers ignore new tables/columns. Rollback =
  compatible application rollback; queue submission may be disabled while
  retaining pending entries for reconciliation — entries are never discarded.
- Live clone rehearsal (apply 004 on a sanitized clone, review the
  `audit_meetings` report, backfill owner/archive mappings, then switch
  routing) is a required manual step before any production apply; the
  automated rehearsal proves the statement order and preservation rules.

## Manual acceptance and limitations

- No recruiter walkthrough (core phase). Disabled demo entry untouched.
- Limitations: sqlite suites prove the SQL predicates, not live Supabase
  latency/locking; RLS policies not yet restrictive (Phase 08); multi-worker
  across hosts needs the PG lease adapter (contract identical); 17 skipped
  are pre-existing unmarked async tests outside this phase's scope.

## Exit decision

Passed: P04-AC01 (domain/lifecycle/ending on real SQL; B-04 closed), AC02
(queue correctness incl. races/failures), AC03 (runtime disconnect/restart
evidence), AC04 (actor boundaries on old/new endpoints; B-05 core
enforcement, Phase 08 audit pending).
