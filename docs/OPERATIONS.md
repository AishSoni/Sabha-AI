# Sabha Operations Runbook

Operator procedures for the final Sabha architecture. Every command below was
executed on the acceptance host during Spec 11 unless it is explicitly marked
as a **manual gate**. The acceptance record, including the exact test results
and the gates that remain unproven, lives in
[the Spec 11 record](../specs/spec-11-upgrade-and-architecture-acceptance.md#completion-record).

## 1. Runtime shape

| Piece | Entry point | Responsibility |
| --- | --- | --- |
| HTTP API | `backend/main.py` (`main:app`) | All `/api/*` routes, server-sent events, `/health` |
| Turn worker (optional) | `backend/worker.py` | Claims and executes queued turns; no HTTP |
| Web client | `frontend/` (Next.js) | Meeting UI, uploads, operation observation |
| Application store | Supabase Postgres | Authoritative records, queue, grants, RPCs |
| Source store | Supabase Storage bucket (`KNOWLEDGE_BUCKET`, default `knowledge-sources`) | Original document bytes |
| Vector projection | Qdrant (`QDRANT_URL`) | Retrieval index; never the source of truth |

The API and the worker share one composition root (`app/bootstrap.py`). Running
both is safe: admission, ordering, leases, fences and publication are enforced
in Postgres, so two processes cannot execute the same turn. `TURN_RUNNER_ENABLED`
selects whether the API also runs inference inline.

## 2. Module owners

| Area | Path | Owns |
| --- | --- | --- |
| Meetings | `backend/app/modules/meetings/` | Meeting lifecycle, participants, messages, disagreement/consensus, durable turn queue, closing |
| Persona catalog | `backend/app/modules/persona_catalog/` | Templates, prompt history/activation, template stack assignments |
| Knowledge | `backend/app/modules/knowledge/` | Upload, ingestion, retrieval, publication, deletion and cleanup, source store and vector adapters |
| Settings | `backend/app/modules/settings/` | System AI provider settings, credential non-disclosure |
| Access | `backend/app/modules/access/` | Write guards (including the read-only demo mode) |
| Capabilities | `backend/app/capabilities/` | Inference providers, runtime supervision, configuration resolution |
| Platform | `backend/app/platform/` | Settings loading, Supabase client, process configuration |
| HTTP composition | `backend/app/presentation/` | Router assembly, route dependencies |
| Operators' scripts | `backend/scripts/` | Migrate, backup, restore, clean-checkout rehearsal, OpenAPI export |

`backend/app/api/`, `app/core/`, `app/llm/`, `app/models/`, `app/services/` and
`app/infrastructure/` were removed in Spec 10. A local checkout may still hold
stale `__pycache__` directories there; no Python source remains.

## 3. Supported versions

Measured on the acceptance host with the commands in section 10:

| Component | Version |
| --- | --- |
| Python | 3.12.10 |
| PostgreSQL server, `pg_dump`, `pg_restore` | 16.2 |
| FastAPI | 0.128.0 |
| Pydantic | 2.12.5 |
| psycopg | 3.3.6 |
| httpx | 0.28.1 |
| Node.js | 26.8.2 |
| npm | 12.2.0 |
| Next.js | 16.1.4 (pinned) |
| React / React DOM | 19.2.3 (pinned) |
| TypeScript | 5.x |

`backend/requirements.txt` uses lower-bound ranges; the frontend is pinned by
`frontend/package-lock.json`. `pg_dump`/`pg_restore` must be the same major
version as the server, otherwise the restore scripts refuse to guess.

## 4. Configuration

Create `backend/.env` (or export the variables) from `.env.example`:

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_KEY` | yes | Anonymous key used by the server client |
| `SUPABASE_SERVICE_KEY` | for bytes, backup, restore | Server-only; never expose to the browser |
| `QDRANT_URL`, `QDRANT_API_KEY` | yes / cloud only | Vector projection |
| `DEFAULT_LLM_PROVIDER` | yes | `ollama`, `openrouter` or `gemini` |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` | yes | `gemini`, `openai`, `cohere` or `ollama` |
| `RUNTIME_MODE` | yes | `local`, `hosted` or `demo` |
| `KNOWLEDGE_BUCKET` | yes | Must match the bucket that holds existing bytes |
| `TURN_RUNNER_ENABLED` | no | `false` when inference runs only in `worker.py` |
| `TURN_LEASE_SECONDS` | no | Default 60 |
| `TURN_EXECUTION_TIMEOUT_SECONDS` | no | Default 300 |
| `TURN_GLOBAL_CONCURRENCY` | no | Default 1 |
| `TURN_MAX_QUEUED_PER_MEETING` | no | Default 10 |
| `DATABASE_URL` | scripts | Direct/session-mode PostgreSQL URL, not the transaction pooler |

Frontend (`frontend/.env.local`):

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_RATE_LIMIT_GEMINI=5
NEXT_PUBLIC_RATE_LIMIT_OPENROUTER=5
NEXT_PUBLIC_RATE_LIMIT_OLLAMA=2
NEXT_PUBLIC_RATE_LIMIT_DEFAULT=5
```

`NEXT_PUBLIC_API_URL` falls back to `http://localhost:8000/api` when unset.

`local` and `hosted` are both writable and account-free: two fresh visitors
share one workspace with no sign-in, no user token, and no anonymous Auth
bootstrap. `demo` is strictly read-only — every write route returns 403 and no
credential prompt is issued. Invalid `RUNTIME_MODE`, provider or embedding
values fail at process start with a validation error; the application never
silently substitutes a provider.

## 5. Start and stop

From `backend/`, with the virtual environment active:

```powershell
python -m scripts.migrate --status     # confirm the schema version first
uvicorn main:app --host 0.0.0.0 --port 8000
python worker.py                       # only when running a dedicated worker
```

From `frontend/`:

```powershell
npm ci
npm run sync:openapi                   # regenerate types from the frozen contract
npm run build
npm start
```

For development use `npm run dev` instead of `build`/`start`.

Health and readiness are different things: `/health` returns
`{"status": "healthy"}` without touching Postgres, Qdrant or the bucket. A
real readiness check is a read (`GET /api/meetings`) plus a worker log line
showing recovery completed.

Startup reconciliation (`app/bootstrap.py`) recovers interrupted ingestions,
retries cleanup and sweeps abandoned staging objects. Its failure mode is a
loud warning and a retry at the next boot; it never blocks serving. Turn
recovery runs at startup when a runner exists, otherwise the API still calls
`recover_turn_operations` so stale leases do not stay `processing`.

## 6. Deploying an upgrade

**Declared maintenance window.** Sabha does not implement a dual-reader or
dual-writer compatibility window. The ordered history tightens grants (009),
adds guard functions (024) and introduces the closing/turn RPCs the API calls
directly. Deploy behind a short maintenance window, backend first, then the
frontend. Do not run old and new application versions against the same
database while a migration is in progress.

Order of operations:

1. Announce the window and stop accepting writes: stop the frontend, then the
   API, then the worker. Let in-flight turns drain or accept that they become
   `interrupted` (see section 8).
2. Take a verified backup **before** migrating, and keep the deletion ledger
   outside the backup directory:
   ```powershell
   python -m scripts.backup --output D:\backups\sabha-2026-10-27 --label pre-upgrade
   python -m scripts.backup --verify --output D:\backups\sabha-2026-10-27
   python -m scripts.backup --export-ledger D:\ledgers\deletion-events.json
   ```
3. Inspect the target:
   ```powershell
   python -m scripts.migrate --status
   ```
   A database that holds Phase 1 tables but no migration history is reported
   as such and must be adopted deliberately:
   ```powershell
   python -m scripts.migrate --adopt-phase-one
   ```
   Adoption records the Phase 1 history without replaying DDL; it refuses when
   any Phase 1 sentinel table, column or function is missing.
4. Apply the migrations:
   ```powershell
   python -m scripts.migrate
   python -m scripts.migrate --status
   ```
   `--to 021` stops after a named version. Each file and its tracking row
   commit in one transaction; the whole run is serialized by a Postgres
   advisory lock, so a second deployer waits instead of interleaving DDL.
5. Start the API, confirm `/health` and one authenticated-free read, then start
   the worker. Confirm `OpenAPI matches ... (40 paths)`:
   ```powershell
   python -m scripts.export_openapi --check
   ```
6. Deploy the frontend, run a smoke meeting, then re-export the deletion ledger
   so the next restore point covers deletions made during the window.

### Failure during the window

| Symptom | Meaning | Action |
| --- | --- | --- |
| `migration failed: checksum mismatch ...` | An already-applied file changed | Restore the original file from the release tag; never edit applied SQL |
| `migration failed: database contains application tables but no migration history` | Phase 1 database, untracked | `--adopt-phase-one` after verifying sentinels |
| Migration raises part-way | That file rolled back; earlier files remain applied | Fix the file in a new release and rerun; the runner resumes at the first pending version |
| Two deployers ran | Advisory lock serialized them | Expect one to report `applied N ...`, the other `database is up to date` |

There are **no down-migrations**. Rolling the schema back means restoring a
verified backup into a fresh database (section 7), not running a reverse
script. Code rollback alone is only safe while the previous release still
matches the applied schema.

## 7. Backup

A backup contains the SQL dump, the manifest with checksums and row counts, the
deletion ledger, and **the actual original source bytes** for every live
revision:

```powershell
python -m scripts.backup --database-url $env:DATABASE_URL `
  --output D:\backups\sabha-2026-10-27 --label nightly
python -m scripts.backup --verify --output D:\backups\sabha-2026-10-27
```

Requirements: `SUPABASE_SERVICE_KEY` (byte access) and a `pg_dump` matching the
server major version. `--verify` recomputes every checksum; a backup is not a
restore point until it verifies.

Retention:

- Keep one verified backup per release and a daily rotation for the agreed
  retention period, off the database host.
- Keep the **deletion ledger append-only and independent of dumps**. Restore
  replays it after the SQL, which is the only reason a pre-deletion backup
  cannot resurrect deleted knowledge. The copy inside a backup directory is
  stale by definition.
- Never delete the ledger when pruning old dumps.

## 8. Restore

Use during disaster recovery or when a schema rollback is unavoidable. Retrieval
must stay closed until the command exits 0 and the marker exists.

Preconditions: the frontend is stopped or behind maintenance, the target
database is empty or disposable, `SUPABASE_SERVICE_KEY` is set, Qdrant is
reachable, and `pg_restore` matches the server.

```powershell
python -m scripts.restore `
  --backup D:\backups\sabha-2026-10-27 `
  --database-url $env:DATABASE_URL `
  --ledger D:\ledgers\deletion-events.json `
  --marker D:\restores\sabha-2026-10-27.json
```

The command performs these steps in order and fails closed at each one:

1. Verify the backup manifest and every checksum.
2. `pg_restore --clean --if-exists --no-owner --no-privileges`.
3. Restore original bytes into the configured bucket.
4. Insert ledger events (`ON CONFLICT DO NOTHING`).
5. Replay deletion events, which revokes affected documents/revisions and
   redacts retained raw passages before retrieval can reopen.
6. Drain cleanup intents (up to 10 passes of 200) and require zero unresolved
   intents.
7. Write the completion marker.

If cleanup cannot drain, the command exits non-zero and writes no marker. Keep
retrieval closed and retry: cleanup is idempotent and each intent records its
attempts and last error.

> **Never omit `--ledger`.** The fallback is the copy inside the backup, which
> predates deletions made after the backup. An acceptance test demonstrates
> that this choice lets deleted knowledge reappear.
>
> **The marker is advisory.** It does not stop HTTP traffic. The operator keeps
> retrieval externally closed until reconciliation has finished.

Irreversible redaction is not undone by any restore: raw passages redacted at
revocation stay redacted, and the replayed ledger re-revokes the affected
revisions even though the dump still contains them.

## 9. Operation and worker recovery

Queue state is durable. A crash never requires a provider call to recover:

| Situation | Durable result | Operator action |
| --- | --- | --- |
| Worker dies after claiming, before any provider call | Operation returns to `pending` with a `recovered_before_provider` event | Restart the worker; it will be claimed again |
| Worker dies after the provider call starts | Operation becomes `interrupted` with `unknown_outcome`; the attempt becomes `unknown` | Decide whether to retry explicitly; the platform will not replay a possibly billed call |
| Execution exceeds its deadline | Runner interrupts with `execution_timeout` | Inspect the meeting and retry if needed |
| Participant or meeting removed while queued | Operation becomes `interrupted` at recovery | No action; the record stays visible |
| Closing interrupted | `ClosingService` reconciliation reopens the attempt after its lease | Restart the API; check `meeting_closings` |

Useful reads while diagnosing (read-only):

```sql
SELECT id, status, claimant, lease_expires_at, execution_started_at,
       attempt_count, error_code
FROM operations WHERE meeting_id = '<meeting>' ORDER BY admission;

SELECT id, attempt_number, status, provider, model, claimant, error_code
FROM operation_attempts WHERE operation_id = '<operation>' ORDER BY attempt_number;

SELECT sequence, type, payload FROM operation_events
WHERE operation_id = '<operation>' ORDER BY sequence;
```

Do not delete queue rows to "unstick" a meeting. Cancellation and recovery are
the supported transitions, and every one of them is recorded as an event.

Knowledge cleanup failure is equally durable: unresolved `knowledge_cleanup`
rows keep `attempts` and `last_error`, evidence redaction succeeds
independently of storage/vector availability, and retrying the cleanup worker
resolves the remaining source and vector intents. Uploads left in `staging/`
are swept at startup and by `KnowledgeLifecycle.sweep_staging`.

## 10. Verification commands

```powershell
# backend
cd backend
python -m pytest -q
python -m scripts.migrate --status
python -m scripts.export_openapi --check
python -m scripts.rehearse_clean_checkout

# frontend
cd ..\frontend
npm test
npx tsc --noEmit
npm run build
```

`python -m scripts.rehearse_clean_checkout` archives the tracked tree with
`git archive`, therefore excluding author-local `.env` files, virtualenvs,
`node_modules`, `.next` and untracked files. It then installs, generates types,
runs the backend/frontend suites, builds and starts both entry points.

## 11. Unresolved limitations

- **Hosted source-store and vector verification is a manual gate.** The
  acceptance host has no Docker and no managed Supabase/Qdrant instance, so the
  suite exercises the real adapter code against controlled HTTP transports and
  real Postgres. Live hosted upload, signed-byte restore and Qdrant deletion
  must be re-run by an operator with real credentials before that claim is
  made. The procedure is documented in
  [the README](../README.md#-hosted-verification-manual-gate).
- **No down-migrations.** Recovery is forward, or a restore into a fresh
  database. Irreversible redaction is never undone.
- **No accounts or tenancy.** The workspace is deliberately shared; `anon` and
  `authenticated` cannot write tables directly.
- **Guided replay is deferred.** `demo` implements the read-only guarantee and
  the write guard; it is not a scripted replay experience.
- **`/health` is shallow.** It does not probe dependencies.
- **Restore markers do not gate traffic.** Closing retrieval is an operator
  step, not a platform-enforced state.
- **Single-region assumption.** Queue leases and cleanup rely on database and
  storage clock/consistency; multi-region active-active deployment is out of
  scope.
