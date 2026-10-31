# Sabha Backend

FastAPI service, durable turn worker, and operator tooling for Sabha.

The backend owns meeting state, participant configuration, the turn queue, knowledge ingestion and retrieval, coordinated closing, access enforcement, and the read-only replay graph. Postgres is the system of record; object storage holds original bytes; Qdrant is a rebuildable retrieval projection.

For the product overview and local setup path, see the [root README](../README.md). For deployment, recovery, and hosted acceptance procedures, see [docs/OPERATIONS.md](../docs/OPERATIONS.md).

---

## Runtime shape

```text
main.py                  → app.bootstrap.create_app()
                           one production container + protected live router
                           + optional replay router

worker.py                → same production container, turn runner only
                           no HTTP, refuses REPLAY_ONLY=true

app/modules/             → business capabilities
app/capabilities/        → inference, runtime supervision, configuration
app/platform/            → settings, Supabase client, database access
app/presentation/        → router assembly, dependencies, errors, timing
app/replay/              → isolated package-backed read graph
```

Every live `/api/*` route is mounted under one router guarded by `require_operator_access` and then `deny_demo_writes`. The `/api/replay/*` router is mounted separately outside that guard: it is public and GET-only, with no live container and no fallback to live data.

`GET /health` reports process liveness only. It does not probe Postgres, storage, Qdrant, or providers.

---

## Requirements

- Python 3.12
- PostgreSQL 16
- A Supabase project for Auth and private Storage
- Qdrant
- One model provider: Gemini, OpenRouter, or a local Ollama instance
- An embedding provider: Gemini, OpenAI, Cohere, or Ollama

Measured local acceptance versions are recorded in [docs/OPERATIONS.md](../docs/OPERATIONS.md). The repository intentionally pins the PDF/OCR stack, including `rapidocr==3.10.0` and `onnxruntime==1.31.1`.

---

## Setup

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
```

Configure at least:

```env
SUPABASE_URL=...
SUPABASE_KEY=...                    # project anon/publishable key
SUPABASE_SERVICE_KEY=...            # server-only
OPERATOR_USER_ID=...                # exact Supabase Auth user UUID
SUPABASE_AUTH_PUBLISHABLE_KEY=...   # public key for /auth/v1/user verification
DATABASE_URL=...                    # direct/session URL, not a transaction pooler
QDRANT_URL=...
DEFAULT_LLM_PROVIDER=gemini
RUNTIME_MODE=local
```

The live HTTP graph **fails closed** when `OPERATOR_USER_ID` or `SUPABASE_AUTH_PUBLISHABLE_KEY` is missing or unsafe. `REPLAY_ONLY=true` skips live composition and operator configuration; `worker.py` refuses that mode.

The full variable reference is [`.env.example`](../.env.example) and [docs/OPERATIONS.md](../docs/OPERATIONS.md). Invalid runtime modes, provider values, and embedding values fail startup rather than silently falling back.

---

## Database and storage

`supabase_schema.sql` is migration `000_baseline`. The remaining ordered history lives in `migrations/` and currently ends at `036_batched_turn_events`.

Do not apply only the baseline. Use the runner:

```bash
python -m scripts.migrate --status
python -m scripts.migrate
python -m scripts.migrate --status
```

The runner:

- verifies a checksum for each applied version
- commits each migration atomically with its tracking row
- serializes concurrent deployers with a Postgres advisory lock
- never performs down migrations

Adoption is explicit for databases that predate tracking:

```bash
python -m scripts.migrate --adopt-phase-one   # Phase 1 tables, no history
python -m scripts.migrate --adopt-legacy      # knowledge-stack-era schema
```

Both paths validate schema markers before recording history. Add new schema as the next numbered file; never edit an applied migration.

Create a **private** Supabase Storage bucket named `knowledge-sources`, or set `KNOWLEDGE_BUCKET`. Source bytes are stored under:

```text
sources/{scope}/{owner_id}/{document_id}/{revision_id}/{file_name}
```

Staging objects are swept at startup. Document revisions are immutable. Publishing a revision retires the previous one, and retrieval revalidates eligibility against Postgres before returning anything.

---

## Run

### API with inline inference

```bash
uvicorn main:app --reload --port 8000
```

Swagger is at <http://localhost:8000/docs>.

### API plus dedicated worker

Set `TURN_RUNNER_ENABLED=false` in `backend/.env`, then run:

```bash
uvicorn main:app --port 8000
python worker.py
```

Both placements are safe to run at the same time. Postgres arbitrates admission, claims, leases, and fences, so duplicate execution cannot publish twice.

### Replay-only process

A replay process needs no live Supabase, provider, or operator configuration. Set `REPLAY_ONLY=true` and configure the replay source:

```env
REPLAY_ONLY=true
REPLAY_DATABASE_URL=...      # login in sabha_replay_reader
REPLAY_PACKAGE_ID=hdfc-ine001a07rw5
REPLAY_PACKAGE_VERSION=2
REPLAY_PACKAGE_SHA256=5fb2a800c907f4de3be69c4b4b1262e32b1570b0abe03f8819ed783baac9bc82
```

Then start the same app. The live graph is not mounted; `/`, `/health`, and the replay routes remain available.

If no replay source is configured, `/api/replay/*` returns `503` with `replay_not_configured` or `replay_package_unavailable`. There is no live fallback.

---

## Access model

Live routes require a Supabase Auth bearer token whose user ID exactly matches `OPERATOR_USER_ID`.

| Condition | Result |
|---|---|
| Missing, malformed, expired, or wrong-project token | `401` |
| Valid Supabase account that is not the configured operator | `403` |
| Supabase Auth unavailable | `503` |
| `RUNTIME_MODE=demo` | Operator is admitted; writes are denied with `403` |
| `RUNTIME_MODE=local` or `hosted` | Normal operator access |
| `REPLAY_ONLY=true` | Live graph is not mounted |

The token is verified at Supabase `/auth/v1/user` using `SUPABASE_AUTH_PUBLISHABLE_KEY`. That key must be the public/publishable or legacy anon key, never the service-role secret.

Migration `030_database_read_isolation` closes PUBLIC, anon, and authenticated database access. The live database client requires `SUPABASE_SERVICE_KEY` and never falls back to the anon key. The browser receives only the public Auth key and never connects directly to the database.

The replay reader is a separate server-only login in `sabha_replay_reader`; offline package publishing uses `sabha_replay_provisioner`. See [docs/DATABASE_PERMISSIONS.md](../docs/DATABASE_PERMISSIONS.md).

Live responses are marked `Cache-Control: private, no-store`.

---

## Module layout

| Path | Ownership |
|---|---|
| `app/modules/access` | Operator policy, Supabase Auth verifier, session probe, demo write guard |
| `app/modules/meetings` | Meeting lifecycle, participants, messages, disagreements/consensus, durable turns, closing |
| `app/modules/persona_catalog` | Templates, persona CRUD, prompt history and activation, stack assignment |
| `app/modules/knowledge` | Upload, ingestion, retrieval, publication, deletion and cleanup, source/vector adapters |
| `app/modules/settings` | System AI settings and provider inventory |
| `app/capabilities/inference` | Provider contracts and inference adapters |
| `app/capabilities/runtime` | Runtime supervision and configuration validation |
| `app/platform` | Settings, Supabase client, database helpers, replay database access |
| `app/presentation` | Router assembly, dependencies, error mapping, timing, demo guard |
| `app/replay` | Cache, contracts, reads, source, storage, streaming, package validation |
| `app/replay/package` | Manifest issues, loader, model, validation |

Routes call application services. Adapters must not bypass the transactional invariants enforced in Postgres.

---

## Turn lifecycle

A durable turn is an operation, not a long-held request:

1. **Admit** — `POST /api/meetings/{meeting_id}/turns` creates an operation with idempotency, FIFO ordering, and `TURN_MAX_QUEUED_PER_MEETING` enforcement.
2. **Claim** — a runner leases the operation and receives a monotonic fence.
3. **Attempt** — a durable attempt row is written before the provider is called.
4. **Execute** — bounded context is assembled and the participant may call `search_knowledge_base`, `log_disagreement`, or `log_consensus`.
5. **Publish** — message, evidence, usage, and events are written under the claim fence.
6. **Terminate** — the operation becomes `completed`, `failed`, `interrupted`, or `cancelled`.

Clients observe independently through `GET .../turns/{operation_id}` and `GET .../turns/{operation_id}/events`, replaying from a sequence cursor. A runner death before the provider call permits requeue without charge. A death after the call starts produces `interrupted` with an unknown outcome and is never automatically replayed. A retry is a new operation with its own identity.

The closing service uses the same durability principles: a lease, checkpoints for votes and summary work, and explicit retry or abort paths.

### Agent tools

| Tool | Status |
|---|---|
| `search_knowledge_base` | Implemented; scoped to meeting-shared and participant-private documents |
| `log_disagreement` | Implemented; persisted against the turn invocation |
| `log_consensus` | Implemented; persisted against the turn invocation |
| `web_search` | Declared but not implemented; runtime returns a safe “not implemented” result |

The default tool set excludes `web_search`. Prompts and the tool loop live in `app/modules/meetings/application/` and `app/modules/meetings/infrastructure/`.

---

## Knowledge pipeline

```text
upload → staged object → parse → chunk → embed → publish revision
       → Qdrant upsert → eligibility-checked retrieval → evidence
```

Supported source formats are PDF, DOCX, XLSX, CSV, TXT, and Markdown.

PDF extraction first uses pypdf. Pages that cannot be read reliably are rendered with pypdfium2 at 200 DPI and processed by RapidOCR's bundled PP-OCRv6 models in a bounded child process. The OCR path uses no network service and no system OCR installation. English/Latin text is supported; a page outside that range fails the revision rather than publishing degraded content.

Provenance records the chosen method, page count, OCR page count, and page locators for each chunk. See [docs/PDF_EXTRACTION.md](../docs/PDF_EXTRACTION.md).

Deletion is two-phase: eligibility closes first, then physical bytes and vectors are cleaned up and metadata is redacted. Cleanup is durable and retryable. Backups include SQL, original bytes, and the append-only deletion ledger; restore replays the ledger before retrieval reopens.

---

## API surface

The frozen contract is `frontend/tests/fixtures/openapi.json` and currently has **56 paths**.

| Group | Routes |
|---|---|
| Health | `GET /`, `GET /health` |
| Access | `GET /api/access/session` |
| Meetings | List/create, read/delete, message, disagreements, consensus, context stats, archive, unarchive, summary |
| Turns | Submit/list, status, cancel, event stream; legacy turn routes remain for compatibility |
| Closing | Start/read, retry, abort |
| Personas | List/create, read/update/delete, prompt history, prompt activation |
| Participants | Templates, create participant |
| Documents | Upload, operation status/retry, meeting/persona/stack lists, document and revision reads, search |
| Knowledge stacks | List/create, read/update/delete |
| Settings | Provider inventory, system AI settings, model listing, key test |
| Replay | Session, meetings, records, documents, safe config, closing, turns, events, assets |

After any contract change:

```bash
python -m scripts.export_openapi
cd ../frontend && npm run sync:openapi
```

`python -m scripts.export_openapi --check` fails on drift.

---

## Tests

```bash
python -m pytest -q
python -m scripts.export_openapi --check
python -m scripts.rehearse_clean_checkout
```

- The required suite uses disposable PostgreSQL through `pgserver`.
- Set `SABHA_TEST_PG_HOME` to a writable directory to reuse a test cluster.
- Inference is a scripted provider and storage is a controlled HTTP double.
- Required tests never call paid providers.
- `rehearse_clean_checkout` archives the tree, installs from a clean checkout, tests, builds, and starts the app.

The latest recorded local acceptance passed 924 tests with 1 skipped.

---

## Operator scripts

Run from `backend/` with the virtual environment active.

| Command | Purpose |
|---|---|
| `python -m scripts.migrate` | Apply or inspect the ordered SQL history |
| `python -m scripts.migrate --status` | Show applied and pending versions |
| `python -m scripts.migrate --adopt-phase-one` | Adopt a Phase 1 schema without history |
| `python -m scripts.migrate --adopt-legacy` | Adopt the knowledge-stack-era schema |
| `python -m scripts.backup --output DIR` | Dump SQL, source bytes, manifest, and ledger |
| `python -m scripts.backup --verify --output DIR` | Recompute backup checksums |
| `python -m scripts.backup --export-ledger FILE` | Export the append-only deletion ledger |
| `python -m scripts.restore --backup DIR ...` | Restore, replay deletions, drain cleanup, write marker |
| `python -m scripts.export_openapi` | Refresh the frozen frontend contract; `--check` fails on drift |
| `python -m scripts.rehearse_clean_checkout` | Full clean-checkout install, test, build, and start rehearsal |
| `python -m scripts.inventory_permissions` | Inventory hosted database/storage permissions |
| `python -m scripts.latency_probe` | Probe data-access latency |
| `python -m scripts.pdf_extraction_benchmark` | Benchmark extraction and OCR |
| `python -m scripts.pdf_extraction_probe` | Inspect a single PDF's extraction path |
| `python -m scripts.build_guided_package` | Rebuild the deterministic guided replay package |
| `python -m scripts.replay_package validate DIR` | Validate a replay package |
| `python -m scripts.replay_package publish DIR` | Publish a package to replay storage |
| `python -m scripts.replay_package activate ID VERSION` | Activate a package version |
| `python -m scripts.replay_package prune --older-than-days N` | Remove old package versions |
| `python -m scripts.replay_package list` | List published packages |
| `python -m scripts.replay_roles --reader-login ... --provisioner-login ...` | Provision replay database roles |
| `python scripts/e2e_provision.py --serve` | Start a disposable replay backend for browser tests |

Backup, restore, role provisioning, and hosted acceptance details are in [docs/OPERATIONS.md](../docs/OPERATIONS.md). Never use `DATABASE_URL` as the replay reader credential, and never put the service key in a browser or replay package.

---

## Related documentation

- [Root README](../README.md)
- [Operations runbook](../docs/OPERATIONS.md)
- [Database permissions](../docs/DATABASE_PERMISSIONS.md)
- [PDF extraction](../docs/PDF_EXTRACTION.md)
- [Agent specification](../AGENTS.md)
- [Specifications](../specs/README.md)
