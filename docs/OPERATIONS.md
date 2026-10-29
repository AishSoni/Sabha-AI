# Sabha Operations Runbook

Operator procedures for the final Sabha architecture. Every command below was
executed on the acceptance host during Spec 11 unless it is explicitly marked
as a **manual gate**. The acceptance record, including the exact test results
and the gates that remain unproven, lives in
[the Spec 11 record](../specs/spec-11-upgrade-and-architecture-acceptance.md#completion-record).

## 1. Runtime shape

| Piece | Entry point | Responsibility |
| --- | --- | --- |
| HTTP API | `backend/main.py` (`main:app`) | Live `/api/*` routes, server-sent events, `/health` |
| Recorded replay API | `backend/main.py` (`/api/replay/*`) | Read-only recorded graph; independent of the live container |
| Turn worker (optional) | `backend/worker.py` | Claims and executes queued turns; no HTTP |
| Web client | `frontend/` (Next.js) | Meeting UI, uploads, operation observation |
| Application store | Supabase Postgres | Authoritative records, queue, grants, RPCs |
| Source store | Supabase Storage bucket (`KNOWLEDGE_BUCKET`, default `knowledge-sources`) | Original document bytes |
| Vector projection | Qdrant (`QDRANT_URL`) | Retrieval index; never the source of truth |

The live API and the worker share one composition root (`app/bootstrap.py`).
Running both is safe: admission, ordering, leases, fences and publication are
enforced in Postgres, so two processes cannot execute the same turn.
`TURN_RUNNER_ENABLED` selects whether the API also runs inference inline.

Live and recorded replay are separate request graphs in the same process.
`/api/*` resolves only the live container; `/api/replay/*` resolves only the
replay container and rejects every non-GET request before an adapter runs. A
request header, workspace id, route parameter or `RUNTIME_MODE` value cannot
switch either graph to the other. Cohosted live startup recovery, providers and
workers remain legitimate; dispatching a replay request neither starts nor
invokes them.

At this gate the replay graph accepts only an explicitly injected, validated
recorded source. The production entry point composes no recorded source yet, so
`/api/replay/*` answers `503 replay_not_configured` rather than falling back to
live data. The packaged reader, checkpoint and paced streaming implementation
belong to Spec 17.

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

Measured on the acceptance host with the commands in section 11:

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
| pypdf | 6.6.2 |
| pypdfium2 / Pillow | 5.14.0 / 13.0.0 |
| RapidOCR | 3.10.0 (bundled PP-OCRv6 models) |
| onnxruntime | 1.31.1 |
| psutil | 7.2.2 |

`backend/requirements.txt` uses lower-bound ranges; the frontend is pinned by
`frontend/package-lock.json`. `pg_dump`/`pg_restore` must be the same major
version as the server, otherwise the restore scripts refuse to guess.

## 4. Configuration

Create `backend/.env` (or export the variables) from `.env.example`:

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_KEY` | yes | Kept for project configuration; the live server never uses it as a database credential |
| `SUPABASE_SERVICE_KEY` | yes | Server database client, bytes, backup, restore. Migration `030` removes all live `PUBLIC`/`anon`/`authenticated` access, so the API fails clearly without it. Server-only; never expose to the browser |
| `QDRANT_URL`, `QDRANT_API_KEY` | yes / cloud only | Vector projection |
| `DEFAULT_LLM_PROVIDER` | yes | `ollama`, `openrouter` or `gemini` |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` | yes | `gemini`, `openai`, `cohere` or `ollama` |
| `RUNTIME_MODE` | yes | `local`, `hosted` or `demo`; live policy only, never a replay selector |
| `REPLAY_ONLY` | no | `true` starts without the live composition; requires a composed recorded source, otherwise replay returns 503 |
| `KNOWLEDGE_BUCKET` | yes | Must match the bucket that holds existing bytes |
| `TURN_RUNNER_ENABLED` | no | `false` when inference runs only in `worker.py` |
| `TURN_LEASE_SECONDS` | no | Default 60 |
| `TURN_EXECUTION_TIMEOUT_SECONDS` | no | Default 300 |
| `TURN_GLOBAL_CONCURRENCY` | no | Default 1 |
| `TURN_MAX_QUEUED_PER_MEETING` | no | Default 10 |
| `TURN_POLL_SECONDS` | no | Idle claim interval, default 2; a successful claim drains immediately and errors back off |
| `TURN_EVENT_FLUSH_MS` | no | Streamed-delta batch interval, default 200 |
| `DB_THREAD_POOL_SIZE` | no | Bounded worker pool for blocking Supabase calls, default 8 |
| `PERSONA_CACHE_TTL_SECONDS` | no | Persona-list cache TTL, default 45; invalidated on every catalog write |
| `REPLAY_POOL_MIN_SIZE`, `REPLAY_POOL_MAX_SIZE` | no | Replay reader pool, defaults 2 and 8; direct/session mode only |
| `REQUEST_TIMING_ENABLED` | no | Per-request `duration_ms`/`db_ops` log line, default true |
| `DATABASE_URL` | scripts | Direct/session-mode PostgreSQL URL, not the transaction pooler |
| `REPLAY_DATABASE_URL` | replay only | Dedicated login role in `sabha_replay_reader`; server-only, never `DATABASE_URL` or the service key |

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
bootstrap. `demo` is strictly read-only — every live write route returns 403 and
no credential prompt is issued. `demo` is a write guard on the live graph, not
the recorded replay graph. The browser route `/demo/meetings/[id]` composes the
recorded room against `/api/replay/*`; it does not change `RUNTIME_MODE` or
grant replay behavior to live URLs. Invalid `RUNTIME_MODE`, provider or
embedding values fail at process start with a validation error; the application
never silently substitutes a provider.

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

To start a replay-only API process, set `REPLAY_ONLY=true` before starting the
same entry point. It skips live route mounting, live provider/Qdrant/service-role
construction and startup recovery. It is only useful with a composition that
injects a recorded source; the current production entry point does not, so the
replay surface answers 503. Never run `worker.py` in this mode: it exits with a
refusal instead of claiming live turns.

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

   A database that stopped earlier, at the knowledge-stack schema (no queue,
   closing or cleanup tables), uses the legacy path. It verifies the 003
   sentinels, records `000..003`, then applies `004..029`:
   ```powershell
   python -m scripts.migrate --adopt-legacy
   ```
   If it reports a missing 003 marker, finish that migration first: the legacy
   history was pasted by hand, so it can stop half-way through a file.
4. Apply the migrations:
   ```powershell
   python -m scripts.migrate
   python -m scripts.migrate --status
   ```
   `--to 021` stops after a named version. Each file and its tracking row
   commit in one transaction; the whole run is serialized by a Postgres
   advisory lock, so a second deployer waits instead of interleaving DDL.
5. Start the API, confirm `/health` and one authenticated-free read, then start
   the worker. Confirm `OpenAPI matches ... (46 paths)`:
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
| `migration failed: database does not have the complete 003 schema; missing …` | Legacy paste stopped mid-file | Apply the missing 003 statements, then `--adopt-legacy` |
| `migration failed: database has moved past the legacy schema …` | Untracked database newer than 003 | `--adopt-phase-one` after verifying its sentinels |
| Migration raises part-way | That file rolled back; earlier files remain applied | Fix the file in a new release and rerun; the runner resumes at the first pending version |
| Two deployers ran | Advisory lock serialized them | Expect one to report `applied N ...`, the other `database is up to date` |
| API logs `permission denied for table …` / `for function …` (`42501`) at startup | The server connected with the anonymous key. Migrations after `003` revoke `anon` and `authenticated` and grant the objects to `service_role` | Set `SUPABASE_SERVICE_KEY` to the service role key and restart; the schema is already correct, so `--status` will show every version applied |

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

## 10. PDF extraction and OCR

PDF extraction runs inside the ingestion worker, not the request path. The
bounded extractor tries the embedded text layer first (plain, then layout
mode) and uses local OCR only for pages whose text is missing or unusable.
Text PDFs never load the OCR engine. Mixed documents are decided page by page,
so a document can publish with `extraction_method = "pypdf+ocr"` and an
`ocr_page_count` below its `page_count`.

### Installation and probe

`pip install -r requirements.txt` is sufficient. There is no Tesseract,
Poppler, Ghostscript, cloud OCR or runtime model download. RapidOCR ships the
three PP-OCRv6/PP-OCRv4 models inside its wheel; the extractor checks those
files before constructing the engine and fails as a dependency error if they
are absent. OCR runs with network access irrelevant and ONNX/OMP threading
pinned to one thread.

Run the startup probe on every worker host after installation:

```powershell
cd backend
python -m scripts.pdf_extraction_probe
```

It prints `"status": "ok"` with package versions, the model directory, the
bundled model names, probe text and scores. Failures exit non-zero: missing
package (2), missing models (3), OCR execution error (4), or empty OCR output
(5). A successful probe proves the dependency is installed and can execute; it
does not prove throughput on that host.

Re-run the decision benchmark on the target worker before advertising
scanned-PDF support:

```powershell
python scripts/pdf_extraction_benchmark.py
```

Record its output with the deployment. The recorded Windows acceptance
measurement and the selected/rejected alternatives are in
[PDF_EXTRACTION.md](PDF_EXTRACTION.md).

### Budgets

| Limit | Value |
| --- | --- |
| Upload size | 50 MiB (existing admission limit) |
| Pages per PDF | 200 |
| OCR pages per PDF | 30 |
| OCR render | 200 DPI, at most 8,000,000 pixels per page |
| Extracted characters | 2,000,000 |
| OCR page timeout | 20 seconds |
| Whole-extraction deadline | 90 seconds, below the 120-second ingestion lease |
| OCR child RSS | 1 GiB |
| Concurrent parses | 2 per worker process (`parse_slots`) |

Each PDF is extracted in a spawned child process with bounded pipes. On
deadline, cancellation or RSS excess the parent terminates, joins, and if
needed kills the child; no OCR process or partial vector write survives the
attempt. The source bytes remain immutable and the extracted text is recorded
separately with its page locator and extraction method/version.

A blank or decorative page may be accepted without OCR. Any other page that
still has no usable text — unsupported script, low OCR confidence, malformed
content — fails the whole revision with an actionable `error_message` rather
than publishing an empty or partial revision. Retry uses the same durable
operation/revision contract and republishes only after extraction succeeds.

### Replay and failure boundaries

The live parser is constructed only inside the live knowledge composition.
`REPLAY_ONLY=true` builds no live container or parser, and the replay namespace
resolves only recorded data. This is covered by
`tests/integration/test_replay_surface.py::test_replay_only_startup_never_constructs_the_live_composition`.

If OCR is unavailable, image-only pages fail clearly while text-layer pages
continue to ingest. Hosted worker deployment still requires the operator to run
the probe and benchmark in that environment; local evidence alone is not a
deployment proof.

## 11. Verification commands

```powershell
# backend
cd backend
python -m pytest -q
python -m scripts.migrate --status
python -m scripts.export_openapi --check
python -m scripts.pdf_extraction_probe
python -m scripts.rehearse_clean_checkout

# frontend
cd ..\frontend
npm test
npx tsc --noEmit
npm run test:e2e
npm run build
```

`python -m scripts.rehearse_clean_checkout` archives the tracked tree with
`git archive`, therefore excluding author-local `.env` files, virtualenvs,
`node_modules`, `.next` and untracked files. It then installs, generates types,
runs the backend/frontend suites, builds and starts both entry points.

## 12. Database roles and replay reader

Migration `030_database_read_isolation` runs in the normal ordered history. It
removes live `USAGE`, table, sequence and function privileges from `PUBLIC`,
`anon` and `authenticated`; drops the legacy all-row read policies; grants the
live capability explicitly to `service_role`; and records safe default
privileges for future objects created by the migration owner. The live backend
therefore requires `SUPABASE_SERVICE_KEY` and never falls back to the anon key.
The detailed matrix and evidence are in
[DATABASE_PERMISSIONS.md](DATABASE_PERMISSIONS.md).

Replay roles are cluster-level and provisioned separately with an administrator
connection:

```powershell
cd backend
python -m scripts.replay_roles --reader-login sabha_replay_login
python -m scripts.replay_roles --reader-login sabha_replay_login --check
```

The script is idempotent, refuses privileged group membership, and leaves
publication grants to Spec 17. Hosted Postgres grants `CREATEROLE` without
`SUPERUSER` (Supabase's `postgres` role included), and only a superuser may
change `SUPERUSER` or `BYPASSRLS` -- even to remove them. The script therefore
re-asserts only the attributes the connecting role is allowed to change, and
fails loudly if a role still carries either privileged attribute. Closing the
provisioner's future objects also needs membership in that role *with the `SET`
option* -- `CREATE ROLE` records only an ADMIN option for the creator, so
`pg_has_role(..., 'MEMBER')` is already true while
`ALTER DEFAULT PRIVILEGES FOR ROLE` is still refused. The script grants
membership whenever the caller lacks `USAGE` on the role, then adjusts default
privileges. The replay
runtime uses a dedicated login role in `sabha_replay_reader`:

```text
REPLAY_DATABASE_URL=postgresql://sabha_replay_login:<password>@<host>:5432/postgres
```

Use a direct/session connection, not the transaction pooler. The URL is
server-only and must never be `DATABASE_URL` or the service key.
`app.platform.replay_database.connect_replay_reader()` rejects superuser,
`BYPASSRLS`, `service_role` membership and live `public` access, then forces a
read-only session. A missing URL or rejected identity fails clearly; there is no
live fallback.

Rotation: create a new login role, grant `sabha_replay_reader`, update the
secret, restart the replay runtime, then drop the old login. Re-run `--check`
and the inventory command.

```powershell
python -m scripts.inventory_permissions --format markdown
```

On hosted Supabase, applying `030`, creating roles/schemas and confirming
default privileges are operator-authorized steps. Local evidence does not
prove the hosted project's default ACLs, network path or Storage policy; those
remain in the hosted checklist and Spec 17.

### Replay packages (spec 17)

Migration `032_replay_package` creates the `replay` tables and the
reader-facing `v_published_*` views. It fails with an actionable message unless
`scripts.replay_roles` has already run for that database. The runtime reader
gets `SELECT` on those views only; retired versions stay readable so pinned
runs keep working, while staged rows are invisible.

Assets live in a public read-only Supabase Storage bucket under immutable,
content-addressed keys (`<package>/<version>/<sha256>.<ext>`). Every asset must
be demo-safe; "private" in a package means "not shown to other participants",
not confidential from the internet. The runtime never holds a Storage
credential and renders only passive public URLs.

Publish from a clean checkout with the offline provisioner credential:

```powershell
cd backend
python -m scripts.replay_roles --reader-login sabha_replay_login `
    --provisioner-login sabha_replay_publisher
python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5
python -m scripts.replay_package --database-url $env:REPLAY_PROVISIONER_DATABASE_URL `
    publish replay_packages/hdfc-ine001a07rw5
python -m scripts.replay_package --database-url $env:REPLAY_PROVISIONER_DATABASE_URL `
    activate hdfc-ine001a07rw5 1
python -m scripts.replay_package --database-url $env:REPLAY_PROVISIONER_DATABASE_URL `
    prune --older-than-days 30
python -m scripts.replay_package --database-url $env:REPLAY_PROVISIONER_DATABASE_URL list
```

Two credentials are operator-only and must stay out of `backend/.env`, which
`Settings` parses with `extra="forbid"` (an unknown key aborts startup) and
which the runtime reads at boot:

- `REPLAY_PROVISIONER_DATABASE_URL` -- the publisher login, used only by the
  commands above. Keep it in the shell or in `backend/.env.provisioner` (matched
  by the same `.env*` ignore rule, never loaded by the app).
- `REPLAY_STORAGE_URL` and `REPLAY_STORAGE_SERVICE_KEY` -- the offline Storage
  credential `publish` uses to upload and re-hash assets. The URL falls back to
  `SUPABASE_URL`; the key has no fallback on purpose, so publication never
  inherits the live backend credential silently.

Both logins connect through the shared pooler as `[ROLE].[PROJECT-REF]` (for
example `sabha_replay_login.dlqmevmnckdhphyzykob`), session mode on port 5432.
Set their passwords once with `ALTER ROLE <role> PASSWORD '<secret>'` from an
administrator connection.

`publish` validates the manifest, hashes, DTOs, identities, policies and
assets; uploads and re-hashes assets; stages every row; and only then exposes
the version in one transaction. Publishing the same version with different
content is refused. `retire` refuses the active version; activate another
published version first. A missing, corrupt, incompatible, or unregistered
package answers `503 replay_package_unavailable` (retired active runs that are
still pinned keep serving); there is no live fallback. `prune` deletes retired
versions past the retention window and their asset objects; the active version
can never be retired or pruned, and a registry reference makes the delete fail
rather than strand a pinned run.

Runtime configuration:

```text
REPLAY_DATABASE_URL=postgresql://sabha_replay_login:<password>@<host>:5432/postgres
REPLAY_PACKAGE_ID=hdfc-ine001a07rw5
REPLAY_PACKAGE_VERSION=1              # optional; registry default otherwise
REPLAY_PACKAGE_SHA256=ced67209984ff87088119f58f5b2bcc643fd9240623dfbe02e03ab761c1fb07f
REPLAY_ONLY=true                      # serve no live graph
REPLAY_STREAM_MAX_PER_CLIENT=2
REPLAY_STREAM_MAX_GLOBAL=8
REPLAY_STREAM_MAX_BYTES=262144
REPLAY_STREAM_MAX_SECONDS=120
```

`python -m scripts.e2e_provision --serve` provisions a disposable local
database, publishes the guided package by default, and serves the replay-only app
for `npm run test:e2e`; it owns the embedded Postgres for the lifetime of the
process. Pass `--package replay_packages/placeholder-analyst` to exercise the
synthetic backend fixture instead. Install the browser once with
`npx playwright install chromium`.

### Guided bond journey (spec 18)

The guided package is `backend/replay_packages/hdfc-ine001a07rw5` version `1`
with content hash `ced67209984ff87088119f58f5b2bcc643fd9240623dfbe02e03ab761c1fb07f`.
It was approved through
[the content ledger](../specs/spec-18-guided-bond-journey-content.md): short
attributed source excerpts, exact locators, a source register, and no untracked
research bytes. Regenerate it only with the tracked builder:

```powershell
cd backend
python -m scripts.build_guided_package
python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5
```

The browser routes are `/demo` (prepared board), `/demo/new` (locked creation
preset and recorded intake), `/demo/meetings` (recorded list and archive), and
`/demo/meetings/[id]` (real room with guide tab hints). The guide owns only the
step order, anchors, Continue/Back/Restart, and route/tab coordination; it never
synthesizes clicks or writes progress. Refresh and deep links reset to the entry
checkpoint. A non-secret `sabha:experience` browser preference only controls the
first-visit live/replay prompt.

The isolated browser suite is `frontend/e2e/guided-journey.spec.ts`:

```powershell
cd frontend
npm run test:e2e -- e2e/guided-journey.spec.ts
```

It covers the full eight-beat journey, source disclosure, private-scope
separation, small screens, reduced motion, keyboard operation, back/restart,
deep-link reset, and the absence of live meeting mutations. `replay-isolation`
adds two browser contexts at different beats, and `replay-resilience` adds
double actions, refocus/poll, stream abort and resume, mid-stream restart and
deep-link refresh. Run the journey against the production build separately:

```powershell
cd frontend
npm run test:e2e:prod -- e2e/guided-journey.spec.ts
```

The placeholder package remains a backend fixture; it is not the demo default.

On hosted Supabase, applying `032`, creating the bucket, publishing with the
provisioner key, and confirming Storage/network policy remain operator steps.
Local evidence does not prove the hosted project's bucket visibility or reader
credential separation; those remain in the hosted checklist and Spec 19.

### Hosted replay acceptance runbook (spec 19)

The local release decision is recorded in
[the Spec 19 completion record](../specs/spec-19-replay-release-acceptance.md).
Public replay release stays blocked until an operator runs every step below
against the real hosted project, records the results in that same record, and
re-checks the reader credential after any grant change. Use an approved
non-destructive environment; these checks are read-only unless a step says
otherwise. Never paste keys or private payloads into the record.

1. **Effective identity and grants.** Run the read-only inventory with an
   operator connection, not the replay reader:

   ```powershell
   cd backend
   python -m scripts.inventory_permissions `
       --database-url $env:HOSTED_DATABASE_URL `
       --role anon --role authenticated `
       --role sabha_replay_login --role sabha_live_login `
       --format markdown --output ..\reports\hosted-permissions.md
   python -m scripts.replay_roles --database-url $env:HOSTED_DATABASE_URL --check
   ```

   Confirm the reader is a member of `sabha_replay_reader` only, has no
   `SUPERUSER`/`BYPASSRLS`, cannot `SELECT` live tables or `storage.objects`,
   cannot write anything, and reads only published, version-pinned replay
   objects. Confirm every replay table has RLS enabled and forced, views do not
   run as their owner with live access, and security-definer functions pin a
   safe `search_path`. Confirm `PUBLIC` and browser roles hold no historical
   grants. There is no service-role fallback: the replay runtime credential is
   `REPLAY_DATABASE_URL`, never `SUPABASE_KEY`.

2. **Storage visibility.** In the hosted project confirm the `replay-assets`
   bucket exists, is public-read, and has immutable object paths. Upload,
   overwrite and delete must be denied to the reader and to browser roles.
   Fetch an approved asset through the CDN (`200`, expected bytes) and a
   missing/retired asset (`404`). Confirm a publication that fails asset
   verification stages no rows and exposes no version.

3. **Reverse-proxy SSE.** With the deployed replay URL and package, request
   `GET /api/replay/meetings/<meeting>/turns/<operation>/events` through the
   proxy and record: `content-type: text/event-stream`, `cache-control:
   no-cache`, `x-accel-buffering: no`, incremental frame arrival, Unicode
   payloads, ordering, resume with `after`, bounded concurrency (`429`), and
   disconnect cleanup. Repeat for `closing/events` and confirm the closing
   reason and final brief arrive as terminal events. A local socket run is not
   a substitute.

4. **Browser journey.** Run the eight-beat journey against the deployed
   production build, not `next dev`: source disclosure, private-scope
   separation, keyboard-only completion, a 390 px viewport, reduced motion,
   back/restart and deep-link reset. Confirm there is no next-step timer,
   credential prompt, live meeting mutation, or console error.

5. **Independent visitors.** Open two fresh browser contexts at different
   beats. Confirm distinct ephemeral run IDs, that back/restart/refetch in A
   cannot move or overwrite B, and that no backend run/session rows are
   created. Package/version/run scope must prevent cache collisions.

6. **Mixed live and replay.** With an active live turn and an unlocked
   synthetic vault, open replay in another context. Switching detaches replay
   observation only; the live turn keeps executing, its cache/cooldown
   survives a replay restart, and replay never reads the vault, leaks a key,
   or cancels the live job. If the hosted app cannot host both graphs, record
   the row as unexecuted rather than inferring it from local tests.

7. **Publication and rollback.** Publish a second small package, pin an active
   run, retire the old version, and confirm the active run is unaffected and a
   failed publication is never selected. Rehearse rollback by disabling the
   replay entry/publication or repinning an intact package; never roll back
   live records or reopen an ended meeting. Retain old immutable versions
   under the documented retirement window.

Record each step as passed, failed or unexecuted with the date, environment,
package identity/hash, command, and sanitized result. Only then replace the
conditional local decision.

## 13. Unresolved limitations

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
  `authenticated` cannot read or write live tables directly, and the replay
  reader is limited to explicitly published replay objects.
- **Packaged replay is local-first and publicly blocked.** Spec 17 ships the
  package format, offline publication, checkpoint reads, paced SSE, closing
  transport, and the packaged analyst slice. Spec 18 adds the approved
  `hdfc-ine001a07rw5` journey and its browser acceptance slice. Spec 19 records
  conditional local acceptance only: hosted reader grants, Storage bucket
  visibility, reverse-proxy SSE, hosted browser/mixed-mode journeys, and
  deployed publication/rollback remain unexecuted operator steps in the
  [hosted runbook](#hosted-replay-acceptance-runbook-spec-19). Public replay
  release stays blocked until those steps pass.
- **OCR deployment proof is host-specific.** The probe and benchmark run on
  the Windows acceptance host; a hosted worker must repeat both after installing
  the pinned wheels and record the result. Passing local tests does not prove
  that host's CPU, memory or process policy can run the OCR fallback.
- **`/health` is shallow.** It does not probe dependencies.
- **Restore markers do not gate traffic.** Closing retrieval is an operator
  step, not a platform-enforced state.
- **Single-region assumption.** Queue leases and cleanup rely on database and
  storage clock/consistency; multi-region active-active deployment is out of
  scope.
- **Cross-region API/database placement is a documented latency defect.** The
  Spec-20 baseline was measured with the API client edge in Mumbai and the
  database in `ap-southeast-2` (Sydney): ~290 ms per authenticated round trip.
  Co-locate the API with the database; the round-trip budgets below assume it.

## 14. Data-access latency (spec 20)

### Region placement

The API process and the database must run in the same region. A cross-region
deployment multiplies every round-trip budget below by the WAN cost; it is a
deployment defect, not a tuning problem. The server-side budget is single-digit
milliseconds per round trip.

### Round-trip budgets

| Endpoint | Database round trips | Notes |
| --- | --- | --- |
| `/health` | 0 | shallow; no dependency probe |
| `/api/settings/providers` | 0 hot, 1 cold | System AI policy TTL cache |
| `/api/meetings` | 1 | explicit columns only |
| `/api/meetings/{id}` | 1 | `read_meeting_bundle` |
| `/api/meetings/{id}/context-stats` | 1 | reuses the meeting bundle |
| `/api/meetings/{id}/closing` | 1 | `read_meeting_closing` |
| `/api/personas` | 3 fixed, 0 hot | independent of row count; TTL cache |
| `/api/participants/templates` | 0 | static |
| `/api/replay/session` | 0 hot, 1 cold | immutable package cache |
| replay turns/events | 0 hot | checkpoint and tape cache |

The regression gate is `backend/tests/integration/test_round_trip_budgets.py`
plus the unit budget suites. Adding a fixture row must not add a call.

### Idle polling

| Path | Interval |
| --- | --- |
| Turn runner | 2 s ± 20 %, immediate drain after a claim, exponential backoff on errors |
| Turn event stream | 0.5 s while the stream is open |
| Closing view (frontend) | 3 s while a stage is advancing |
| Turn list/detail (frontend) | 4 s while an operation is active |

### Measuring

`python -m scripts.latency_probe --base-url http://127.0.0.1:8000 --samples 5`
prints p50/p95 per endpoint. `--mode responsiveness --load-path
/api/meetings/{id}/closing --load 5` measures `/health` while load is in
flight. The request timing middleware logs one line per request with
`duration_ms`, `db_ops`, `db_ms` and `db_max_ms`; a request whose `db_ops`
exceeds its budget is a regression even when it feels fast locally.

Hosted re-measurement needs a co-located deployment and operator credentials.
Record the environment, region pair, date and round-trip counts with the
result; any unexecuted check stays marked unexecuted.
