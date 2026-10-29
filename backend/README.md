# Sabha Backend

FastAPI service, durable turn worker and operator scripts for Sabha.


## Setup

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
```

Configure `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`,
`QDRANT_URL`, `RUNTIME_MODE` and at least one provider. The full variable table
is in the [root README](../README.md#-configuration).

## Database

`supabase_schema.sql` is the baseline (`000_baseline`); every file in
`migrations/` must also be applied. Use the runner rather than pasting only the
baseline into the SQL editor:

```bash
python -m scripts.migrate --status
python -m scripts.migrate
```

A Phase 1 database without `schema_migrations` history is adopted explicitly:

```bash
python -m scripts.migrate --adopt-phase-one
```

A database that stopped at the older knowledge-stack schema (no queue, closing,
or cleanup tables yet) uses the legacy path, which verifies the 003 markers,
records `000..003`, and applies the rest:

```bash
python -m scripts.migrate --adopt-legacy
```

Each migration commits atomically with its tracking row, applied files are
checksum-verified, and concurrent deployers serialize on an advisory lock. There
are no down-migrations: recover forward, or restore a verified backup.

## Run

```bash
uvicorn main:app --reload --port 8000   # API (runs inference inline by default)
python worker.py                        # optional dedicated turn worker
```

Set `TURN_RUNNER_ENABLED=false` when inference should run only in the worker.
Both placements are safe because Postgres arbitrates claims, leases and fences.

## Test

```bash
python -m pytest -q
python -m scripts.export_openapi --check
python -m scripts.rehearse_clean_checkout
```

The suite needs a PostgreSQL server for the disposable-database fixtures. It
uses `pgserver` by default; point `SABHA_TEST_PG_HOME` at a writable directory to
reuse a test cluster. Required tests never call a paid provider: inference is a
scripted provider and storage is a controlled HTTP double.

## Operator scripts

| Command | Purpose |
|---|---|
| `python -m scripts.migrate` | Apply/inspect the ordered SQL history |
| `python -m scripts.backup --output DIR` | Dump SQL, original bytes, manifest and ledger |
| `python -m scripts.backup --verify --output DIR` | Recompute every checksum |
| `python -m scripts.backup --export-ledger FILE` | Retain the append-only deletion ledger |
| `python -m scripts.restore --backup DIR ...` | Restore, replay deletions, drain cleanup, write a marker |
| `python -m scripts.export_openapi` | Refresh or `--check` the frozen frontend contract |
| `python -m scripts.rehearse_clean_checkout` | Archive, install, test, build and start from a clean checkout |

Deploy order, retention, recovery and the manual hosted gate are documented in
[docs/OPERATIONS.md](../docs/OPERATIONS.md).

## Layout

```
app/
├── modules/          # meetings, persona_catalog, knowledge, settings, access
├── capabilities/     # inference, runtime supervision, configuration
├── platform/         # settings, Supabase client
└── presentation/     # router assembly, dependencies
```

Routes call application services; adapters and routes do not bypass the
transactional invariants enforced in Postgres. The former `app/api`, `app/core`,
`app/llm`, `app/models`, `app/services` and `app/infrastructure` layers were
removed in Spec 10.
