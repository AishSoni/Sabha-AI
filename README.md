# Sabha Your Personal AI Advisory Board

> *"Don't ask one AI. Convene a board."*

Sabha is an open-source, multi-agent collaborative workspace where you host **structured meetings** with a roster of distinct AI personas. Unlike a standard chatbot, Sabha's agents have persistent personalities, private knowledge bases, and formal roles. They debate, disagree, and reach consensus — all trackable in real time on a live scoreboard.

---

## ✨ What Makes Sabha Different

| Feature | Standard Chatbot | Sabha |
|---|---|---|
| Number of AIs | 1 | Multiple (full roster) |
| Turn control | AI-controlled | **User-directed** |
| Disagreements | Ignored | First-class tracked objects |
| Knowledge | Shared | Private per-agent + shared meeting docs |
| Grounding | Hallucinations possible | Durable RAG with revision-level eligibility |
| Cost tracking | None | Per-message & per-meeting |
| Durability | A dropped connection loses the answer | Accepted turns survive disconnects and worker restarts |

---

## 🗺️ Table of Contents

1. [Core Concepts](#-core-concepts)
2. [Architecture](#-architecture)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Getting Started](#-getting-started)
6. [Configuration](#-configuration)
7. [Database, Migrations, and Access](#-database-migrations-and-access)
8. [LLM Providers](#-llm-providers)
9. [Knowledge Pipeline](#-knowledge-pipeline)
10. [API Reference](#-api-reference)
11. [Operations](#-operations)
12. [Hosted Verification (Manual Gate)](#-hosted-verification-manual-gate)
13. [Testing and Acceptance](#-testing-and-acceptance)
14. [Agent Specification](#-agent-specification)
15. [Roadmap](#-roadmap)
16. [Contributing](#-contributing)

---

## 🧠 Core Concepts

### The Meeting
A **Meeting** (Sabha) is the primary workspace. It has:
- A **name** and an **agenda** that every participant sees
- A **roster** of AI participants, each with a unique persona
- A **shared document pool** (meeting-scope knowledge)
- A live **Disagreement Scoreboard** and **Consensus Log**
- A running **cost tracker** backed by recorded inference events
- A durable **turn queue**: submitted turns are accepted, then executed by a worker

### The Roster
Your **AI Roster** is a library of reusable personas. Each persona has:
- A **name** and **role** (e.g., "The Investor", "The CTO")
- A versioned **system prompt** defining personality, focus, and tone
- Optional **Knowledge Stack** assignments — documents only assigned agents can retrieve
- A **provider configuration** (provider, model, generation settings), snapshotted into the participant at meeting creation

### Turn-Taking (User-Controlled Orchestration)
Sabha does not auto-run. You are the **Director**: you choose which AI speaks next. Submission is admission only — the turn is durably queued and the answer is observed through a separate, replayable stream. A disconnect never cancels accepted work, and reading a status never triggers generation. There is no auto-facilitate mode.

### Disagreements & Consensus
These are **first-class tracked objects**, not just text. When an agent calls `log_disagreement` or `log_consensus`:
- The event is persisted with the meeting
- The scoreboard updates in real time
- Disagreements carry a **severity** (1–5); consensus carries a **strength** (1–5)

### Account-Free Workspace
There is **no sign-in**. `local` and `hosted` runtimes are writable and share one workspace: two fresh visitors see the same meetings, uploads, operation status, and streams. No user-auth tokens, accounts, or anonymous Auth bootstrap are involved. `demo` is a strict read-only runtime — every write route is denied — and the guided replay experience is still deferred. See [Configuration](#-configuration).

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Sabha Application                         │
│                                                                    │
│  ┌──────────────┐   REST/SSE    ┌──────────────────────────────┐   │
│  │  Next.js 16  │◄─────────────►│  FastAPI API                 │   │
│  │  React 19    │               │  routes → application →      │   │
│  │  TypeScript  │               │  domain → adapters           │   │
│  │  TanStack Q. │               └───────┬──────────────┬───────┘   │
│  │  Zustand     │                       │              │           │
│  └──────────────┘                       │              │           │
│                                 ┌───────▼────────┐  ┌──▼────────┐  │
│                                 │ Worker         │  │ Postgres  │  │
│                                 │ (optional)     │  │ (Supabase)│  │
│                                 └───────┬────────┘  └──┬────────┘  │
│                                         │              │           │
│                    ┌────────────────────┼──────────────┘           │
│                    │                    │                          │
│              ┌─────▼──────┐      ┌──────▼──────┐   ┌────────────┐  │
│              │ Qdrant     │      │ Supabase    │   │ LLM APIs   │  │
│              │ (vectors)  │      │ Storage     │   │ OpenRouter │  │
│              └────────────┘      │ (bytes)     │   │ Gemini /   │  │
│                                  └─────────────┘   │ Ollama     │  │
│                                                    └────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Durable turn lifecycle

```
1. SUBMIT    → POST /api/meetings/{id}/turns with a participant and request key
2. ADMIT     → Postgres records the operation, idempotency key, FIFO position,
               per-meeting queue limit, and an admission event
3. CLAIM     → The API's inline runner or a dedicated worker claims the operation
               under a lease and a monotonically increasing fence
4. ATTEMPT   → A durable attempt row is written before any provider call
5. EXECUTE   → Bounded context + tools (knowledge search, disagreement, consensus)
6. PUBLISH   → Fenced publication of the message, evidence, usage, and events
7. TERMINAL  → completed | failed | interrupted | cancelled
```

Observation is independent of execution: `GET .../turns/{op}` returns status and
`GET .../turns/{op}/events` replays the stream from a sequence cursor.

### Recovery semantics

- A worker that dies **before** a provider call: the operation is requeued at
  startup, with no provider call and no charge.
- A worker that dies **after** a provider call starts: the operation becomes
  `interrupted` / `unknown_outcome`. Sabha never guesses whether the call was
  billed, so it never replays it automatically. A retry is a new operation.
- Physical deletion failures stay visible in `knowledge_cleanup` with attempts
  and errors; retries are idempotent. Evidence redaction does not depend on
  storage or vector availability.
- Restore replays the retained deletion ledger **before** retrieval reopens.

---

## 🛠️ Tech Stack

Versions measured on the acceptance host (see [Testing and Acceptance](#-testing-and-acceptance)):

### Frontend
| Tech | Version | Purpose |
|---|---|---|
| Next.js | 16.1.4 | React framework + App Router |
| React / React DOM | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Radix UI | latest | Accessible headless components |
| TanStack Query | 5.x | Server-state cache |
| Zustand | 5.x | Client/UI state |
| `react-markdown` | 10.x | Markdown rendering |

### Backend
| Tech | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| FastAPI | 0.128 | REST API + SSE |
| Pydantic | 2.12 | Validation and settings |
| PostgreSQL | 16.2 | Authoritative store, queue, RPC guards |
| psycopg | 3.3 | PostgreSQL driver |
| Qdrant | 1.16.x client | Vector projection |
| `sse-starlette` | 3.2+ | Server-Sent Events |
| `tiktoken` | 0.5+ | Token counting |
| `pypdf`, `python-docx`, `openpyxl` | latest | Document parsing |
| `langchain-text-splitters` | latest | Text chunking |
| `cohere`, `openai` | latest | Embedding providers |

---

## 📁 Project Structure

```
Sabha/
├── .env.example                    # Backend environment template
├── AGENTS.md                       # Agent architecture & tool specification
├── docs/OPERATIONS.md              # Deploy, backup, restore, recovery runbook
├── specs/                          # Implementation specs and contracts
│
├── backend/
│   ├── main.py                     # FastAPI entry point
│   ├── worker.py                   # Optional dedicated turn worker
│   ├── supabase_schema.sql         # Baseline migration (000_baseline)
│   ├── migrations/                 # Ordered 002…029 SQL history
│   ├── scripts/
│   │   ├── migrate.py              # Checksummed migration runner
│   │   ├── backup.py               # SQL + bytes + deletion ledger
│   │   ├── restore.py              # Restore, replay, cleanup, marker
│   │   ├── export_openapi.py       # Contract snapshot check
│   │   └── rehearse_clean_checkout.py
│   └── app/
│       ├── modules/
│       │   ├── meetings/           # Lifecycle, participants, messages,
│       │   │                       # durable turns, closing
│       │   ├── persona_catalog/    # Templates, prompt history, stacks
│       │   ├── knowledge/          # Upload, ingest, retrieve, delete
│       │   ├── settings/           # Provider settings
│       │   └── access/             # Write guards (demo mode)
│       ├── capabilities/           # Inference, runtime, configuration
│       ├── platform/               # Settings, Supabase client
│       └── presentation/           # Router assembly, dependencies
│
└── frontend/
    ├── src/app/                    # App Router pages
    ├── src/features/               # Feature-scoped API + components
    ├── src/shared/                 # Transport, generated API types
    ├── src/stores/                 # Client state
    └── tests/fixtures/openapi.json # Frozen 40-path contract
```

The former `app/api`, `app/core`, `app/llm`, `app/models`, `app/services` and
`app/infrastructure` layers were removed in Spec 10. Only stale `__pycache__`
directories may remain locally.

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.12**
- **Node.js 20+** and npm
- A [Supabase](https://supabase.com) project (Postgres + Storage)
- A [Qdrant](https://qdrant.tech) instance — cloud or local via Docker
- At least one provider: local Ollama, an OpenRouter key, or a Gemini key

### 1. Clone and install

```bash
git clone https://github.com/your-username/Sabha.git
cd Sabha/backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure the backend

```bash
cp ../.env.example .env
```

Fill in `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`,
`QDRANT_URL`, the provider settings and `RUNTIME_MODE`. See
[Configuration](#-configuration).

### 3. Apply the SQL history

Do **not** run only `supabase_schema.sql`: it is the `000_baseline` migration,
and the remaining `backend/migrations/*.sql` files add the queue, closing,
knowledge and cleanup schema. Apply the ordered history with the migration
runner:

```bash
python -m scripts.migrate --status
python -m scripts.migrate
python -m scripts.migrate --status   # every version must be applied
```

A database that already holds Phase 1 tables but no `schema_migrations` history
must be adopted deliberately:

```bash
python -m scripts.migrate --adopt-phase-one
```

A database that stopped at the older knowledge-stack schema (the state produced
by pasting `supabase_schema.sql` and the first numbered files by hand) uses the
legacy adoption path instead. It verifies the complete 003 markers, records
`000..003`, and applies `004..028`:

```bash
python -m scripts.migrate --adopt-legacy
```

Both adoption paths are idempotent and refuse to record history for a schema
whose markers do not match what they claim to adopt.

The runner records a checksum per version, commits each file atomically with its
tracking row, and serializes deployers with a Postgres advisory lock. See
[Database, Migrations, and Access](#-database-migrations-and-access).

Create a **private** Storage bucket named `knowledge-sources` (or set
`KNOWLEDGE_BUCKET`). The adapter can create it when the service key is
configured, but creating it explicitly keeps the deployment auditable.

### 4. Start the backend

```bash
uvicorn main:app --reload --port 8000
```

API: `http://localhost:8000` · Docs: `http://localhost:8000/docs`

By default the API also runs inference inline. To run a dedicated worker
instead, set `TURN_RUNNER_ENABLED=false` and start:

```bash
python worker.py
```

The database arbitrates between both placements; running the API runner and a
worker concurrently is safe.

### 5. Start the frontend

```bash
cd ../frontend
npm ci
npm run sync:openapi
npm run dev
```

Frontend: `http://localhost:3000`

Create `frontend/.env.local` only when the API is not on the default URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

`/health` returns `{"status":"healthy"}` without probing dependencies. Use a
real read (`GET /api/meetings`) plus worker logs as the readiness check.

---

## 🔐 Configuration

All backend variables live in `backend/.env` (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | required | Supabase project URL |
| `SUPABASE_KEY` | required | Anonymous key; used by the server only when `SUPABASE_SERVICE_KEY` is empty |
| `SUPABASE_SERVICE_KEY` | empty | Server database client, byte access, backup and restore. Required on hosted Supabase: migrations after `003` revoke `anon`; never expose it to the browser |
| `DATABASE_URL` | scripts | Direct/session PostgreSQL URL for scripts and restore |
| `DEFAULT_LLM_PROVIDER` | `ollama` | `ollama`, `openrouter` or `gemini` |
| `OLLAMA_BASE_URL` / `OLLAMA_DEFAULT_MODEL` | `http://localhost:11434` / `llama3.2` | Local inference |
| `OLLAMA_ALLOWED_ORIGINS` | empty | SSRF allowlist for user-supplied Ollama origins |
| `OPENROUTER_API_KEY` / `OPENROUTER_DEFAULT_MODEL` | empty / Claude Sonnet | OpenRouter |
| `GEMINI_API_KEY` / `GEMINI_DEFAULT_MODEL` | empty / `gemini-1.5-flash` | Google Gemini |
| `QDRANT_URL` / `QDRANT_API_KEY` | `http://localhost:6333` / empty | Vector projection |
| `EMBEDDING_PROVIDER` | `ollama` | `gemini`, `openai`, `cohere`, `ollama` |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSION` | `nomic-embed-text` / 768 | Must match the collection |
| `OPENAI_API_KEY`, `COHERE_API_KEY` | empty | Embedding providers |
| `KNOWLEDGE_BUCKET` | `knowledge-sources` | Original-byte bucket |
| `RUNTIME_MODE` | `local` | `local`, `hosted` (writable) or `demo` (read-only) |
| `CORS_ORIGINS` | `http://localhost:3000` | JSON array of browser origins (e.g. `["https://app.example.com"]`) |
| `TURN_MAX_QUEUED_PER_MEETING` | 10 | Admission limit |
| `TURN_GLOBAL_CONCURRENCY` | 1 | Worker parallelism |
| `TURN_LEASE_SECONDS` | 60 | Claim lease |
| `TURN_POLL_SECONDS` | 0.5 | Worker poll interval |
| `TURN_RUNNER_ENABLED` | true | Inline runner in the API |
| `TURN_EXECUTION_TIMEOUT_SECONDS` | 300 | Per-turn deadline |
| `CLOSING_ATTEMPT_LEASE_SECONDS` | 120 | Vote/summary attempt lease |
| `CLOSING_DRAIN_TIMEOUT_SECONDS` | 300 | Graceful drain |

Runtime modes:

| Mode | Writes | Accounts | Notes |
|---|---|---|---|
| `local` | allowed | none | Default developer runtime |
| `hosted` | allowed | none | Hosted deployment; identical account-free contract |
| `demo` | denied (403) | none | Strict read-only; guided replay deferred |

Invalid runtime, provider or embedding values fail at process start. Sabha
never silently switches a provider or truncates data to fit a configuration.

Frontend variables:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Backend base URL |
| `NEXT_PUBLIC_RATE_LIMIT_<PROVIDER>` | — | Client-side pacing hints (`GEMINI`, `OPENROUTER`, `OLLAMA`, `DEFAULT`) |

Frontend configuration contains **no Supabase keys**. All database and storage
access is server-side.

---

## 🗄️ Database, Migrations, and Access

### Ordered history

- `backend/supabase_schema.sql` is recorded as `000_baseline`.
- Numbered files in `backend/migrations/` follow in lexical order (through
  `029_internal_table_rls`).
- `schema_migrations` stores version, checksum, applied time and duration.
- Each migration and its tracking row commit in one transaction; a failure
  leaves no partial DDL and no tracking row.
- A run holds a Postgres advisory lock, so two deployers serialize.
- An edited, already-applied file is rejected by checksum instead of silently
  diverging from the deployed schema.
- There are **no down-migrations**. Forward recovery is to fix the step and
  rerun; a schema rollback means restoring a verified backup.

### Access model

- Supabase Postgres is authoritative; Qdrant is a rebuildable projection.
- `anon` and `authenticated` cannot write application tables directly. Writes
  go through the backend with the service key and narrow RPCs.
- RLS and grants are part of the migration history (`009_tighten_rls_to_backend_writes`,
  `024_archive_turn_guards`), so an empty install and an upgraded install end in
  the same permission state.
- There is no Auth bootstrap, no user token, and no per-user ownership filter.
- Provider credentials entered by a browser are held in process memory only for
  the duration of an operation and never written to the database, logs, or
  operation events.

### First run versus upgrade

| Starting point | Command |
|---|---|
| Empty database | `python -m scripts.migrate` |
| Phase 1 database without history | `python -m scripts.migrate --adopt-phase-one` |
| Knowledge-stack-era database without history | `python -m scripts.migrate --adopt-legacy` |
| Database with history | `python -m scripts.migrate` (resumes pending versions) |
| Inspect only | `python -m scripts.migrate --status` |

Full deploy, backup and restore procedures live in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

---

## 🤖 LLM Providers

Sabha uses a pluggable provider adapter. Every provider implements `complete()`
and `stream()`.

| Provider | Config Value | Notes |
|---|---|---|
| **Google Gemini** | `gemini` | Streaming + thinking tokens |
| **OpenRouter** | `openrouter` | Claude, GPT, Mistral, and 100+ models |
| **Ollama** | `ollama` | Fully local; no API key |

Per-participant overrides are stored in `provider_config` and snapshotted at
meeting creation:

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-opus-4",
  "temperature": 0.7
}
```

Blank values fall back to the saved system AI settings, then to the environment.
Provider settings and test-key probes are served by `/api/settings/providers`,
`/api/settings/models` and `/api/settings/test-key`; secrets are never returned.

---

## 📚 Knowledge Pipeline

```
Upload → staged source object → parse → chunk → embed → revision publish
       → Qdrant upsert → eligible retrieval → evidence recorded
```

- **Source of truth:** original bytes live in Supabase Storage under
  `sources/{scope}/{owner_id}/{document_id}/{revision_id}/{file_name}`.
  Unfinished uploads live under `staging/` and are swept at startup.
- **Revisions:** documents are immutable revisions. Publishing a new revision
  retires the old one; retrieval revalidates eligibility against Postgres
  before dispatching context, so a stale vector cannot leak a revoked revision.
- **Scopes:** meeting documents are visible to every participant in that
  meeting; stack/persona documents are visible only to assigned participants.
- **Deletion:** revocation closes eligibility first, then physical cleanup
  removes the source object and vector points and redacts retained raw
  passages. Failed physical steps remain durable and retryable.
- **Restore:** backups include SQL, actual bytes, and the deletion ledger.
  Restore replays the ledger and drains cleanup before retrieval reopens, so an
  older backup cannot resurrect deleted knowledge or raw passages.

Supported formats: `.pdf`, `.docx`, `.xlsx`.

---

## 📡 API Reference

Interactive docs: `http://localhost:8000/docs`. The frozen contract is
`frontend/tests/fixtures/openapi.json` (40 paths) and is checked by
`python -m scripts.export_openapi --check`. The frontend regenerates types with
`npm run sync:openapi`.

| Area | Endpoints |
|---|---|
| Meetings | `GET/POST /api/meetings`, `GET/DELETE /api/meetings/{id}`, `POST .../message`, `POST .../summary`, `POST .../archive`, `POST .../unarchive`, `GET .../context-stats` |
| Turns | `POST/GET .../turns`, `GET .../turns/{op}`, `POST .../turns/{op}/cancel`, `GET .../turns/{op}/events`, `POST .../turn`, `POST .../turn/stream` |
| Closing | `GET/POST .../closing`, `POST .../closing/retry`, `POST .../closing/abort` |
| Records | `GET .../disagreements`, `GET .../consensus` |
| Roster | `GET/POST /api/personas`, `GET/PUT/DELETE /api/personas/{id}`, `GET/POST /api/personas/{id}/prompts`, `POST /api/personas/{id}/prompts/{version}/activate` |
| Participants | `POST /api/participants`, `GET /api/participants/templates` |
| Knowledge stacks | `GET/POST /api/knowledge_stacks`, `GET/PUT/DELETE /api/knowledge_stacks/{id}` |
| Documents | `POST /api/documents/upload`, `GET .../operations/{op}`, `POST .../operations/{op}/retry`, `GET .../meeting/{id}`, `GET .../persona/{id}`, `GET .../stack/{id}`, `GET/DELETE .../{document_id}`, `POST /api/documents/search` |
| Settings | `GET /api/settings/providers`, `PUT /api/settings/system-ai`, `POST /api/settings/models`, `POST /api/settings/test-key` |
| Health | `GET /health`, `GET /` |

`POST /api/meetings/{id}/turns` returns an operation receipt; execution is
server-owned. The legacy `POST .../turn` and `.../turn/stream` routes remain for
compatibility and delegate to the same durable path.

---

## 🧰 Operations

The full runbook is [docs/OPERATIONS.md](docs/OPERATIONS.md). Summary:

```bash
cd backend
python -m scripts.migrate --status
python -m scripts.backup --output /backups/sabha-2026-10-27 --label pre-upgrade
python -m scripts.backup --verify --output /backups/sabha-2026-10-27
python -m scripts.backup --export-ledger /ledgers/deletion-events.json
python -m scripts.restore --backup /backups/sabha-2026-10-27 \
  --database-url "$DATABASE_URL" \
  --ledger /ledgers/deletion-events.json \
  --marker /restores/complete.json
```

- **Deploy:** declared maintenance window; backend first, then frontend.
- **Backups:** SQL dump + original bytes + manifest checksums + deletion ledger.
- **Restore:** fails closed; writes a completion marker only after every cleanup
  intent is resolved. Keep retrieval closed until then.
- **Ledger:** retain it independently and append-only. Omitting `--ledger` uses
  the stale in-backup copy, which can let deleted knowledge reappear.
- **Recovery:** interrupted turns and failed cleanups are visible and retryable;
  provider calls are never replayed automatically.

---

## 🔒 Hosted Verification (Manual Gate)

The automated acceptance suite exercises the real adapter code against real
PostgreSQL and controlled HTTP transports. The acceptance host has **no Docker
and no managed Supabase/Qdrant instance**, so live hosted behavior has **not**
been executed. This is a recorded gate, not a completed check.

Run this checklist once against a real project before claiming hosted
acceptance:

1. Create the Supabase project, the private `knowledge-sources` bucket, and a
   reachable Qdrant instance. Set `RUNTIME_MODE=hosted`.
2. Apply the migration history and confirm `python -m scripts.migrate --status`
   reports every version applied.
3. Upload a real PDF to a meeting; confirm the operation reaches `ready`, the
   object exists under `sources/`, and retrieval returns its content.
4. Open two independent browsers with no sign-in: create a meeting in one,
   observe it in the other, upload in one, and watch status/SSE in the other.
5. Take a verified backup with the service key; confirm the manifest lists the
   uploaded object and its checksum.
6. Revoke the document, export a fresh ledger, restore the backup into a fresh
   database, and confirm the passage is redacted, the revision is revoked, and
   retrieval returns nothing.
7. Confirm Qdrant no longer holds the deleted revision and that
   `knowledge_cleanup` has no unresolved rows.

Record the executed results in the Spec 11 completion record. Until then, hosted
source-store and vector verification remains an unresolved gate.

---

## ✅ Testing and Acceptance

```bash
# backend (run from backend/)
python -m pytest -q
python -m scripts.export_openapi --check
python -m scripts.rehearse_clean_checkout

# frontend (run from frontend/)
npm test
npx tsc --noEmit
npm run build
```

- Required tests never call a paid provider. They use a scripted provider and
  fake storage transports, with real PostgreSQL where durability matters.
- `rehearse_clean_checkout` archives the **tracked** tree with `git archive`, so
  it proves the runtime does not depend on author-local `.env` files, virtualenvs,
  `node_modules`, `.next`, or untracked seed documents.
- The OpenAPI check fails on contract drift.
- Executed results and unresolved gates are recorded in
  [the Spec 11 completion record](specs/spec-11-upgrade-and-architecture-acceptance.md#completion-record).

---

## 🤖 Agent Specification

See [`AGENTS.md`](./AGENTS.md) for the agent architecture, base system prompt,
default personas, and tool contracts. Runtime prompts live in
`backend/app/modules/meetings/application/prompts.py`; the tool loop lives in
`backend/app/modules/meetings/infrastructure/turns.py`.

| Persona | Focus | Tone |
|---|---|---|
| **The Investor** | ROI, TAM, CAC/LTV, exit strategy | Direct, skeptical, numbers-first |
| **The CTO** | Tech stack, scalability, security, debt | Analytical, buzzword-averse |
| **The Analyst** | User trends, competitor data, citations | Neutral, data-driven |

`search_knowledge_base`, `log_disagreement` and `log_consensus` are implemented.
`web_search` is declared to agents but **not implemented**: the tool loop tells
the model to answer without it rather than fabricating a result.

---

## 🗺️ Roadmap

### ✅ Phase 1 — Core loop
Multi-meeting workspace, roster, streaming, disagreements/consensus, provider
selection, per-agent model overrides, cost accounting.

### ✅ Phase 2 — Durable architecture
- [x] Domain/application/infrastructure boundaries and composition root
- [x] Durable turn queue with leases, fences, events and recovery
- [x] Durable knowledge revisions, source bytes, redaction and cleanup
- [x] Coordinated meeting closing and checkpointed summaries
- [x] Byte-inclusive backup, ledger replay, fail-closed restore
- [x] Migration history, empty-install and Phase 1 upgrade acceptance
- [x] Account-free hosted/local shared workspace; read-only demo guard

### 🔄 Deferred
- [ ] Guided replay for `demo` runtime (read-only guard is implemented)
- [ ] Web search provider integration
- [ ] Context compression for very long meetings
- [ ] Fork/replay a meeting from an arbitrary point
- [ ] Cost dashboard and billing overview
- [ ] Auto-facilitate mode
- [ ] Multi-user accounts and tenancy (deliberately out of scope; the workspace
      is shared by design)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes following the module boundaries (routes → application →
   domain → adapters)
4. Add or update tests; required tests must not call paid providers
5. Run the commands in [Testing and Acceptance](#-testing-and-acceptance)
6. Open a Pull Request with a clear description

### Development Tips

- **Backend hot-reload:** `uvicorn main:app --reload`
- **API docs:** `/docs` (Swagger) and `/redoc`
- **Contract:** edit the backend, then `python -m scripts.export_openapi`, then
  `npm run sync:openapi`
- **Types:** `npx tsc --noEmit` in `frontend/`
- **Agent behavior:** edit `backend/app/modules/meetings/application/prompts.py`
- **Schema change:** add the next numbered file in `backend/migrations/`; never
  edit an applied migration

---

## 📄 License

This project is currently unlicensed. All rights reserved by the author.

---

<div align="center">
  <p>Built with ❤️ — <em>Your personal AI advisory board</em></p>
</div>
