# Sabha Frontend

Next.js frontend for the Sabha multi-agent AI advisory board. Talks to the
FastAPI backend (default API base `http://localhost:8000/api`, see `src/lib/api.ts`).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

Meeting creation lives at `/meetings/new` (roster + document upload flow).
Server-sent turn events are consumed via `subscribeTurnEvents`
(`src/lib/turn-events.ts`), which normalizes the v2 envelope and legacy
event shapes with sequence dedup; `api.streamTurn` remains only as a
compatibility wrapper.

## Testing

```bash
npm run test -- --run   # Vitest non-watch run
npm run test:coverage   # Coverage evidence
npm run lint            # Lint check
npx tsc --noEmit        # Type check
npm run build           # Production build
```

The B-09 executable reproducer is
`src/stores/meetingStore.regression.test.ts`; no `it.fails`/skip markers
remain in the suite.
