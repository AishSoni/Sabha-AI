# Sabha Frontend

Next.js 16 + React 19 client for the Sabha advisory board.

## Setup

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Create `.env.local` when the API is not on the default URL or when operator
sign-in is required:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is a public key and never the
service-role/secret key. Database, storage and vector calls stay server-side.
Public replay works without either Supabase variable; `/login` and the private
route group show a safe configuration message when they are missing.
`NEXT_PUBLIC_API_URL` falls back to `http://localhost:8000/api` when unset.

## Contract and generated types

`tests/fixtures/openapi.json` is the frozen backend contract (56 paths). After a
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
