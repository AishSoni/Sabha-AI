# Sabha Frontend

Next.js 16 + React 19 client for the Sabha advisory board.

## Setup

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Create `.env.local` only when the API is not on the default URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

There are no Supabase keys in the browser bundle: every database, storage and
vector call is server-side. `NEXT_PUBLIC_API_URL` falls back to
`http://localhost:8000/api` when unset.

## Contract and generated types

`tests/fixtures/openapi.json` is the frozen backend contract (40 paths). After a
backend contract change:

```bash
# from the repository root
cd backend && python -m scripts.export_openapi
cd ../frontend && npm run sync:openapi
```

`python -m scripts.export_openapi --check` fails on drift, and
`npm run test:architecture` guards the transport/state boundaries.

## State ownership

- TanStack Query owns server state (meetings, participants, operations, streams).
- Zustand owns client/UI preferences.
- Turn execution and observation are separate: submitting returns an operation
  receipt; status and SSE events are replayed from a sequence cursor.

## Commands

```bash
npm run dev                 # development server
npm test                    # full vitest suite
npm run test:unit           # src-only unit tests
npm run test:architecture   # boundary checks
npx tsc --noEmit            # type check
npm run build               # production build
npm start                   # production server
npm run lint                # eslint
```

Required tests do not call paid providers or a live backend; they use controlled
fetch transports and fixtures.
