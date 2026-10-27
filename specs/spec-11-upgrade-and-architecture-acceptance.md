# Spec 11 (Phase 2): Upgrade Rehearsal and Architecture Acceptance

## Purpose and prerequisites

Prove fresh setup, existing-data migration, recovery, and deployment against the final architecture—not just new databases or aggregate test counts.

- All prior feature gates, including [legacy removal](spec-10-feature-cutover-and-legacy-removal.md), pass on disposable environments with executed results.
- Final API/use-case inventory, generated contracts, target imports/entry points, supported dependency versions, selected source store, and local/worker startup instructions are recorded.
- Prepare a disposable Phase 1 data snapshot with existing IDs/history/costs, explicit and empty configuration, unknown assignments, documents with/without originals, real source bytes, summaries, and deleted-source tombstones. Never use production secrets/personal data as fixtures.
- Have a coordinated frontend/backend deployment plan, additive/backfill/cutover/removal steps, restore material, and explicit rollback versus forward-recovery limits. Read [migration policy](reference-architecture-contracts.md#api-schema-and-migration-policy) and [completion criteria](reference-architecture-contracts.md#completion-criteria).

## Bounded scope

Write deployment/upgrade/restore acceptance tests before final scripts. Rehearse the actual ordered `backend/migrations/` history and final HTTP/worker entry points, frontend generation/build/startup, source-store backup, and tombstone/redaction reconciliation.

Do not add new features or revive old branch implementations here. Transitional columns/adapters may be removed only after validated data migration and an explicit removal decision; preserve accepted behavior, URLs, IDs, and source-backed audit facts.

## Tests to write first

- Empty installation and Phase 1 upgrade yield valid consistent schemas, grants, APIs, and final target package imports. Reject incompatible configurations visibly, without silently changing provider or truncating data.
- Existing IDs/messages/summaries/costs/explicit settings survive. Missing assignments/effective history/original bytes remain honestly unknown/unavailable, never inferred as fabricated snapshots or successful reconstruction.
- Back up and restore SQL **and actual original bytes**, then reconcile deletion/redaction before reopening retrieval. Old backups must not resurrect deleted knowledge or retained raw passages.
- Fresh checkout can install, generate API types, run tests, build and start HTTP/optional worker without author-local caches, test package imports, or ignored source/seed files. Legitimate document bytes come from the selected configured source store.
- Two independent fresh visitors share records without sign-in in hosted and local demos, including upload/status/SSE workflows; no accounts, user-auth tokens, or Auth bootstrap are needed. Direct database restrictions, credential non-disclosure, operation/resource limits, and configured local Ollama work. Provider/worker interruption and cleanup failure remain recoverable without paid inference.
- Rehearse deployment compatibility or declared maintenance window and recovery after a mid-cutover failure. Irreversible redaction cannot be undone by promising an unsafe restore.

## Code example: upgrade preserves known values without inventing missing ones

Proposed integration contract for `backend/tests/integration/`; implement `upgrade_dataset` with the actual old schema, versioned migrations, source adapter, and final repository/API reads. The names below are harness contracts, not existing methods:

```python
async def test_upgrade_preserves_recorded_history(upgrade_dataset):
    h = upgrade_dataset
    before = await h.seed_phase_one_data()
    await h.apply_target_migrations()
    after = await h.read_preserved_history()
    assert after.meeting_ids == before.meeting_ids
    assert after.messages == before.messages
    assert after.legacy_costs == before.legacy_costs
    assert after.explicit_overrides == before.explicit_overrides
    assert await h.unknown_legacy_assignments_are_marked_unknown()
    assert await h.missing_originals_are_marked_unavailable()
```

Test migration reruns according to the actual migration policy, rejected malformed legacy records, and failure before/after cutover. These equality checks cannot prove byte backup, permission correctness, or deletion safety by themselves.

## Code example: restored data must honor later deletion

Separate proposed restore test, with declared tombstone retention/recovery sources provided by the same harness:

```python
async def test_restore_cannot_reenable_deleted_knowledge(upgrade_dataset):
    h = upgrade_dataset
    source = await h.seed_ready_source()
    backup = await h.backup_sql_and_source_bytes()
    await h.delete_source_and_retain_revocation(source)
    await h.restore_and_reconcile(backup)
    assert await h.search_source(source) == []
    assert await h.retained_raw_passages(source) == []
```

The required later revocation metadata must actually survive the restore boundary. Define where it is retained and how restore remains closed until reconciliation completes; do not let a convenience fake conceal that operational prerequisite.

## Green and refactor

- Run fresh, upgrade, restart, backup/restore, API/SSE/client, import, and hosted/local no-sign-in scenarios using the selected real adapters and controlled provider transports.
- Execute the deployment rehearsal in its actual order, validate backfills before switching readers/writers, and retain one workflow owner through compatibility windows. Do not drop data because a new class no longer reads it.
- Publish actual commands/results, versions, setup/startup, module owners, source-store/retention/backup procedures, operation/worker recovery, and unresolved limitations. Lint/types/build supplement the behavioral tests.

## Final exit gate

Every [shared completion criterion](reference-architecture-contracts.md#completion-criteria) and prior phase exit is evidenced by executed tests. Phase 1 regressions remain green; real database/vector/source, concurrency/restart/deletion, final import/interface, migration, and frontend ownership contracts pass. Required tests do not depend on paid calls; real-provider smoke tests remain separate opt-in checks.

Skipped/proposed checks, historical test counts, empty scaffolding, source inspection, or successful builds do not establish architecture acceptance. Stop and record an unresolved gate rather than labelling the migration complete.

## Completion record

Recorded 2026-10-27 on the acceptance host at commit `8bfb308`, then re-executed
after the timestamp cleanup that follows `cb70410`; the numbers below are from
the re-executed run against the tree this record ships with. Every number comes
from a command that was run in this session; nothing is projected, estimated, or
carried over from an earlier report.

### Verdict

Spec 11 exits **conditionally**, and the condition is recorded rather than
implied:

- Accepted: fresh install, Phase 1 upgrade, migration rollback/forward-recovery
  limits, byte-inclusive backup, ledger-aware restore, worker/queue recovery,
  account-free shared workspace, read-only demo guard, contract and import
  boundaries, build/type/test health.
- **Not executed:** live hosted Supabase Storage and Qdrant behavior. The
  acceptance host has no Docker and no managed Supabase/Qdrant instance, so the
  suite exercises the real adapter code against controlled HTTP transports and a
  real PostgreSQL server. See [Unresolved gates](#unresolved-gates).

The architecture is therefore accepted for `local`, and for a hosted deployment
whose operator has run the documented checklist. Claiming hosted acceptance
today would be untrue.

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `python -m pytest -q` | `backend/` | **583 passed**, 27 warnings, 1145.10 s (19:05) |
| `npm test` | `frontend/` | **37 files / 215 tests passed**, 22.51 s |
| `node node_modules/typescript/bin/tsc --noEmit` | `frontend/` | exit 0, no diagnostics |
| `npm run build` | `frontend/` | exit 0, 12 routes exported, Turbopack compile 6.0 s |
| `python -m scripts.export_openapi --check` | `backend/` | `OpenAPI matches .../openapi.json (40 paths)` |
| `python -m scripts.rehearse_clean_checkout` | `backend/` | exit 0 (details below) |

The backend suite ran alone, against a **fresh** disposable cluster
(`SABHA_TEST_PG_HOME=C:\conda_tmp\opencode\sabha-test-pg-b4`). Two concurrent
runs against the shared cluster are known to produce fixture errors, not product
failures; the recorded result is the isolated run. All 27 remaining warnings come
from third-party packages (`supabase` client `timeout`/`verify` parameters,
`pyiceberg`'s `pyparsing` arguments); Sabha code emits none.

Acceptance slice (45 tests, collected counts; all executed inside the 583):

| File | Tests | Proves |
| --- | --- | --- |
| `tests/acceptance/test_spec09_acceptance.py` | 7 | Phase 1 dataset/retrieval/deletion baseline still green |
| `tests/acceptance/test_spec11_upgrade.py` | 9 | Phase 1 data survives; missing values stay unknown, not invented |
| `tests/acceptance/test_spec11_backup.py` | 3 | SQL + original bytes + manifest checksums |
| `tests/acceptance/test_spec11_restore.py` | 7 | Ledger replay, evidence redaction, CLI refuses to guess, ledger export |
| `tests/acceptance/test_spec11_cutover.py` | 4 | Failed deploy resumes; unsafe restore is refused |
| `tests/acceptance/test_spec11_recovery.py` | 4 | Interruption and cleanup failure stay recoverable |
| `tests/acceptance/test_spec11_fresh_checkout.py` | 3 | Archive excludes local state and still boots |
| `tests/acceptance/test_spec11_shared_workspace.py` | 6 | Two anonymous visitors share one writable workspace |
| `tests/acceptance/test_spec11_setup.py` | 2 | Shipped `.env.example` is a loadable configuration |

No required test calls a paid provider: inference is a scripted provider, storage
and vector calls go through controlled HTTP doubles, and PostgreSQL is real.

### Clean-checkout rehearsal

`python -m scripts.rehearse_clean_checkout` archived the tracked tree with
`git archive HEAD` (ref `8bfb308`), extracted it to a temporary directory, and
then, in order:

1. Audited the archive: 11 required deployable files present, 0 forbidden
   local-state entries (`.env`, `node_modules`, `.next`, virtualenvs).
2. Imported the real entry points: `main:app` exposes **40** paths,
   `worker._main` is callable.
3. Started `uvicorn main:app` on `127.0.0.1:8765` and read `/health` and `/`.
4. Ran `npm ci`, `npm run sync:openapi`, `npm test` and `npm run build` in the
   extracted frontend, then confirmed `src/shared/api/generated.ts` and
   `next-env.d.ts` were produced.
5. Started the production Next server on port 3100 and read a page.

The script raises on any failed phase, so exit 0 means every step above ran.
Summary emitted by the run:

```json
{
  "ref": "HEAD",
  "checkout": "C:\\conda_tmp\\sabha-clean-checkout-2udrars_",
  "audit": { "required_files": 11, "forbidden_entries": 0 },
  "backend": { "paths": 40, "worker_main": true },
  "frontend": { "generated_types": true, "build": true }
}
```

### Versions measured on the acceptance host

| Component | Version | How measured |
| --- | --- | --- |
| Python | 3.12.10 | `python --version` |
| PostgreSQL server | 16.2 | `pgserver` cluster used by the suite |
| `pg_dump` / `pg_restore` | 16.2 | `.../pgserver/pginstall/bin/pg_dump.exe --version` |
| FastAPI | 0.128.0 | `fastapi.__version__` |
| Pydantic | 2.12.5 | `pydantic.VERSION` |
| psycopg | 3.3.6 | `psycopg.__version__` |
| httpx | 0.28.1 | `httpx.__version__` |
| Node.js / npm | 26.8.2 / 12.2.0 | `node -v`, `npm -v` |
| Next.js / React | 16.1.4 / 19.2.3 | `frontend/package.json` pins |

### Documentation delivered

- [Operations runbook](../docs/OPERATIONS.md) — runtime shape, module owners,
  configuration, start/stop, maintenance-window deploy order, migration failure
  table, backup and retention, restore steps, worker/queue recovery, readiness,
  limitations. Its commands are executable: `scripts.backup` grew
  `--export-ledger`, and `scripts.restore` is a real CLI that writes its marker
  only after zero unresolved cleanup intents.
- [Root README](../README.md) — architecture, setup, configuration table,
  migrations and access model, API inventory, hosted checklist.
- `backend/README.md`, `frontend/README.md` — per-side setup, commands, and the
  state-ownership boundary.
- `.env.example` — now a configuration that actually starts: `DATABASE_URL` is an
  accepted `Settings` field, and `CORS_ORIGINS` is the JSON array
  `pydantic-settings` parses. `test_spec11_setup.py` fails if the example drifts
  from `Settings`.

### Rollback and forward recovery (as declared)

- There are no down-migrations. Schema rollback means restoring a verified
  backup into a fresh database, not running a reverse script.
- An upgrade is deployed in a declared maintenance window: backend first, then
  frontend; old and new application versions never write to the same database
  while migrations run.
- A migration that fails part-way leaves no partial DDL and no tracking row; the
  runner resumes at the first pending version. An edited, already-applied file is
  rejected by checksum.
- A restore replays the retained deletion ledger before retrieval reopens.
  Irreversible evidence redaction is never undone by restoring a dump.

### Unresolved gates

1. **Live hosted source store and vector projection — not executed.** No Docker,
   no managed Supabase project, no Qdrant instance on this host. Upload to a real
   bucket, signed-byte restore, and Qdrant deletion remain a **manual gate**; the
   checklist is in the [README](../README.md#-hosted-verification-manual-gate).
   The adapters themselves are covered by tests against controlled HTTP
   transports, which is weaker than a hosted run and is not reported as one.
2. **No accounts or tenancy.** Deliberate: `local` and `hosted` share one
   workspace; `anon`/`authenticated` cannot write tables directly.
3. **Guided replay for `demo` is deferred.** The read-only guarantee and its
   write guard are implemented and tested; the scripted replay experience is not.
4. **`web_search` is declared but not implemented.** The tool loop returns a
   controlled "not implemented" result instead of fabricating an answer.
5. **`/health` is shallow** and restore markers do not gate HTTP traffic;
   operators keep retrieval closed externally until reconciliation finishes.
6. **Single-region assumption.** Queue leases and cleanup rely on database and
   storage clock/consistency; active-active multi-region is out of scope.

### Commit trail

`e4de8d5` boundaries and entry points · `771d071` API inventory and OpenAPI pin ·
`10be060` settings validation · `4e945c3` migration runner · `da66b0a`
Phase 1 adoption · `2edb66b` Phase 1 dataset · `90a9961` upgrade preservation ·
`25c303e` byte-inclusive backup · `dd539c4` ledger-aware restore · `4b726a6`
clean-checkout rehearsal · `c1e5420` shared anonymous workspace · `cd157d8`
interruption/cleanup recovery · `2d41512` failed deploy and unsafe restore ·
`c5feca6` runbook with executable restore/ledger CLI · `8bfb308` corrected
README/setup and hosted gate · `cb70410` this record · the timestamp cleanup that
removed the last deprecated `datetime.utcnow()` calls from
`meetings/application/meeting_service.py` and `knowledge/presentation/stacks_http.py`.
