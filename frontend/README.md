# Sabha Frontend

Next.js 16 and React 19 client for Sabha's live advisory workspace and public guided replay.

The frontend presents one room experience over two runtimes:

- **Live** — authenticated operator workspace backed by the FastAPI live API.
- **Replay** — account-free, read-only reconstruction served from a pinned recorded package.

The browser uses Supabase only for authentication. It never receives a database, storage, or vector credential.

---

## Setup

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. The API base URL defaults to `http://localhost:8000/api`.

For operator sign-in or a non-default API, create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is a public key and must never be the service-role/secret key.

Optional provider rate-limit hints:

```env
NEXT_PUBLIC_RATE_LIMIT_GEMINI=...
NEXT_PUBLIC_RATE_LIMIT_OPENROUTER=...
NEXT_PUBLIC_RATE_LIMIT_OLLAMA=...
NEXT_PUBLIC_RATE_LIMIT_DEFAULT=...
```

Public replay works without `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `/login` and the private route group show a safe configuration message when those variables are missing.

---

## Routes

| Route | Surface | Purpose |
|---|---|---|
| `/` | Public | Landing page with guided replay entry point and operator sign-in |
| `/login` | Public | Supabase Auth sign-in for the single operator |
| `/demo` | Public replay | Prepared board introduction |
| `/demo/new` | Public replay | Locked meeting-creation preset and intake view |
| `/demo/meetings` | Public replay | Recorded meeting list and archive |
| `/demo/meetings/[id]` | Public replay | Recorded room with guided checkpoints and evidence |
| `/meetings` | Operator | Live meeting list |
| `/meetings/new` | Operator | Create a meeting and choose participants |
| `/meetings/[id]` | Operator | Live meeting room, turns, closing, evidence, and summary |
| `/roster` | Operator | Persona roster |
| `/roster/new` | Operator | Create a persona |
| `/roster/[id]` | Operator | Edit persona, prompts, and knowledge-stack assignments |
| `/knowledge-stacks` | Operator | Knowledge-stack list |
| `/knowledge-stacks/new` | Operator | Create a stack |
| `/knowledge-stacks/[id]` | Operator | Stack documents and configuration |
| `/settings` | Operator | Provider configuration, system AI settings, and API-key vault |

The operator route group is implemented under `src/app/(operator)`. Public and demo routes remain outside the authenticated shell.

---

## Authentication and access

1. The browser signs in with Supabase Auth.
2. The Supabase access token is attached as a bearer token to live API requests.
3. The backend verifies the token and requires its user ID to equal `OPERATOR_USER_ID`.
4. Missing or invalid credentials produce `401`; a valid non-operator account produces `403`; Auth unavailability produces `503`.

The client treats authorization as server-owned. It does not infer access from the presence of a browser session, and it does not call the database directly.

The provider-key vault is client-side and locks on page reload. Signing in again does not unlock it; the operator must unlock it explicitly. This is a deliberate limitation of the current single-operator design.

Public replay never asks for an account and does not send live credentials. A live logout detaches the browser but does not cancel work already admitted by the backend.

---

## Architecture

```text
src/
├── app/
│   ├── (operator)/        # authenticated meetings, roster, stacks, settings
│   ├── demo/              # public recorded journey
│   ├── login/
│   └── page.tsx           # public landing
├── features/
│   ├── access/            # session lifecycle, login, operator shell, live transport
│   ├── knowledge/         # documents, stacks, upload
│   ├── meetings/          # room, turns, closing, citations, evidence, replay
│   ├── persona-catalog/   # roster and prompt editing
│   └── settings/          # providers, system AI, API keys
├── shared/
│   ├── access/            # browser session, auth lifecycle, live transport
│   ├── api/               # transport, decoding, errors, SSE, generated types
│   ├── credentials/       # client-side vault/envelope
│   ├── query/             # TanStack Query client
│   └── runtime/           # live vs replay scope
└── tests/
```

### Boundaries

- `src/app` composes routes and layouts; it does not own transport or domain state.
- `src/features` owns user-facing capabilities and feature-specific queries.
- `src/shared` owns cross-feature primitives: API transport, auth session, SSE, query client, credential vault, and runtime scope.
- `src/shared/api/generated.ts` is generated from the frozen OpenAPI fixture. Do not hand-edit it.
- `npm run test:architecture` enforces these boundaries.

### State ownership

- **TanStack Query** owns server state: meetings, participants, operations, documents, settings, and stream data.
- **Zustand** owns client and UI preferences.
- **The URL and route segment** determine runtime scope and selected meeting/checkpoint.
- Turn execution and observation are separate concerns. Submitting a turn returns an operation receipt; status and SSE events are replayed from a sequence cursor, so a reload does not lose the turn.

### Live and replay runtimes

The same room components render both surfaces through a runtime scope:

- Live clients call `/api/*` with the operator bearer token and use live query keys.
- Replay clients call the public `/api/replay/*` endpoints and never mount live providers or credential code.
- Replay turns and closing records are replayed from recorded events; the replay UI cannot submit, cancel, retry, or mutate.
- If the replay backend has no configured package, the UI surfaces a safe unavailable state rather than falling back to live data.

### Evidence and citations

Citations resolve to an exact live document revision or replay asset. The evidence viewer supports previews for the six live document formats and the guided package's recorded assets. Source HTML and Office active content are never executed in the preview.

---

## API contract

`tests/fixtures/openapi.json` is the frozen backend contract and currently contains **56 paths**. `src/shared/api/generated.ts` is generated from it.

After a backend contract change:

```bash
# from the repository root
cd backend
python -m scripts.export_openapi

cd ../frontend
npm run sync:openapi
```

`python -m scripts.export_openapi --check` fails on drift. Generated types are consumed through the shared transport and decode layer; feature code should not construct raw `fetch` calls.

---

## Commands

```bash
npm run dev                 # development server
npm run build               # production build
npm start                   # production server
npm run lint                # ESLint
npm test                    # full Vitest suite
npm run test:unit           # src-only unit tests
npm run test:architecture   # boundary checks
npx tsc --noEmit            # TypeScript check
npm run sync:openapi        # regenerate API types
```

### Browser tests

```bash
npm run test:e2e        # Next dev server
npm run test:e2e:prod   # build, then next start
```

Playwright starts its own dependencies:

- a disposable replay backend on port `8123`, provisioned by `e2e/start-backend.mjs` and `backend/scripts/e2e_provision.py`
- the frontend on port `3100`

The journeys cover the guided bond meeting, replay isolation, replay resilience, and evidence preview. They use a synthetic replay package and do not require live Supabase, a provider key, or a paid model call.

The latest recorded local acceptance passed 391 frontend tests across 68 files. Lint reported 0 errors and 29 pre-existing warnings, and the production build passed.

---

## Troubleshooting

**Private routes show a configuration message.** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then restart the dev server.

**Sign-in succeeds but live API calls return `403`.** The authenticated Supabase user is not the exact UUID configured in backend `OPERATOR_USER_ID`.

**Live API calls return `503`.** The backend cannot reach Supabase Auth. Check the backend operator-access configuration and logs.

**Replay shows an unavailable state.** The replay process has no configured package or database reader. Check `REPLAY_PACKAGE_ID`, `REPLAY_DATABASE_URL`, and the backend logs. This is not a live fallback path.

**Types are stale after an API change.** Export the OpenAPI contract from the backend, then run `npm run sync:openapi`.

For backend setup, migrations, access enforcement, replay publishing, and deployment gates, see the [backend README](../backend/README.md) and [docs/OPERATIONS.md](../docs/OPERATIONS.md).
