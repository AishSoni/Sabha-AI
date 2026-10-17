# Stage D/E/F Evidence — Demo walkthrough on real routes (P10-T02..T19 surfaces)

> Scope: `specs/` (MASTER, CONTRACTS, DELIVERY, DEMO-JOURNEY) plus guide §4
> parts D ("generic guide layer"), E ("shared ending SSE + recovery") and
> F ("retire the substitute"). This document records what was implemented,
> how it was verified, and what remains honestly deferred. It does not claim
> completion of phases 00, 02 or 09, and it does not clear D-01 (the pinned
> package still carries `approval_status: pending-d01`).

## Commits

| Commit | Content |
|---|---|
| `98a80c9` | Part D D1: journey binding for recorded turns (pin/find by meeting, specialist roster resolution, finalize commit/rollback) |
| `7cce52c` | Part D D2: demo session dispatch modes (session/meeting/fork) + guide/journey-state/journey-progress routes; specialists-as-dicts fix; progress completion guard |
| `a3b8b37` | Part D D2 tests: route-level guide/journey-state/progress + mode dispatch; honest 503 on persona seed failure |
| `0fdd460` | Part D D3a: demo guide API/session/steps lib + zustand guide store + route-persistent overlay |
| `ad02803` | Part D D3b: home Try-demo session entry + meetings bootstrap credential-first + anchors on settings/stacks/roster/meetings/room |
| `4fffaa0` | Part D D3c: fork button, queue-exercise button, skip-completed pointer + guide store tests |
| `f5d1b91` | Part E backend: recorded ending ballots + brief through the shared ending workflow (no live provider on demo meetings) |
| `1504e25` | Part E frontend: shared ending journal in the demo room (202 attempt + SSE votes/brief + authoritative recovery, journey gate after commit) |
| `859276d` | Part F backend: retire substitute demo contracts (legacy `/actions`/`/sessions`/`/queue`/`/reset` routes + `perform_action` executor) |
| `6cd4c5b` | Part F frontend: retire parallel bond journey UI; keep bootstrap constants/token helpers only |

Working tree kept untracked by design: `DEMO_REMEDIATION_AGENT_GUIDE.md`
(never staged per its own note) and `untracked-bond-research/` (scanned
source PDFs + research notes). Migration `009_demo_bond_package.sql` is
staged with this evidence commit.

## Part D — one walkthrough, real routes, server-authoritative progress

### Backend

- **Journey binding.** `JourneyProgressStore.pin_meeting` anchors a session
  generation to exactly one real meeting id (re-pin to a different real
  meeting is rejected); `find_by_meeting` resolves the binding from Supabase
  (`demo_scenario_progress`) or the in-memory fallback. A synthetic
  `meeting-{sid}-{gen}` placeholder may be replaced until the first recorded
  turn pins it.
- **Strict single track.** `apply_action` enforces journey order
  (J00→J09), single instrument (`INE001A07RW5`), pinned revision, and
  idempotency keys; when all ten steps are complete it returns the view
  idempotently for repeated ids and otherwise refuses out-of-order calls.
  Recorded-turn finalization applies progress only after a successful turn;
  failed turns keep the stage retryable (`mark_failed`).
- **Session dispatch modes** (`POST /api/v2/demo/real-session`): default
  (no bearer) creates the demo session, seeds the three specialist personas
  via the normal Persona API, and returns no meeting; `mode: "meeting"`
  (bearer required) attaches/pins the walkthrough meeting idempotently per
  generation; `mode: "fork"` (bearer) honours the same-bond exploration
  fork exactly once per generation and is honestly gated: the journey
  pointer must already include `end_walkthrough` (409
  `unsupported_at_this_step` otherwise).
- **Read model for the guide layer.** `GET /api/v2/demo/guide` (auth-free)
  serves the package's journey + UI step content (J00–J09 with anchor keys,
  instrument, disclosure, snapshot date, specialist remits). The DB content
  owns the copy; anchors are frontend-owned keys and the backend refuses
  nothing else (no routes/HTML/selectors are delivered). `GET
  /api/v2/demo/journey-state` (bearer) returns the authoritative progress
  view; `POST /api/v2/demo/journey-progress` records client-observed steps.
- **Recorded turns on shared rails.** `POST /api/v2/demo/recorded-turn`
  starts a journey action through the same `TurnEngine` used by regular
  meetings (recorded provider, seed-asserting knowledge search, normal
  messages/citations persistence, chunked text deltas on the standard turn
  journal SSE). The participant is resolved by the exact specialist title
  seeded into the meeting roster; unknown specialist → honest failure.
- **Fail-closed surfaces** (`test_demo_disabled.py`): unknown scenario is
  404 `unknown_scenario`; client `X-Demo-Mode`/`X-Provider` headers and
  `mode: "live"` cannot escape the recorded fixture; unauthenticated
  journey-progress/meeting/fork/start calls are 401; unknown journey
  action is 404 `unknown_action`.

### Frontend

- **Single route-persistent guide layer.** `DemoGuide`
  (`components/demo`) mounts at the root layout next to `DemoWatermark`,
  reads its step content from `GET /guide` (package copy) merged by
  `lib/demoGuideSteps.ts` (`UI00..UI08` interleaved with `J00..J09`,
  frontend-owned anchors like `home.try-demo`, `room.chat`,
  `room.ending`). One short action + reason + compact expandable technical
  note per step, non-blocking placement (bottom-left card above the
  watermark), no focus steal, no timers used as success conditions.
- **Server-authoritative steps.** `demoGuideStore` hydrates
  `journey-state`, and the pointer only advances past a journey step when
  the server reports it complete (resync after `journey-progress`,
  recorded-turn terminal, and the ending commit). UI-observation steps are
  recorded locally. Pausing/dismissing leaves normal controls and the
  watermark; exit clears demo client state (storage keys) and returns to
  `/`; resume re-hydrates from authoritative state, so completed actions
  are never replayed.
- **Real actions only.** Queue teaching (J05) runs against the real queue
  endpoints (enqueue while a turn runs, edit, remove, re-add, drain);
  specialist turns are real recorded turns on the normal room UI; the
  follow-up fork (J09) creates a bounded same-bond meeting via
  `mode: "fork"`. No link in the guide flow performs saves the server
  does not record.

## Part E — shared ending workflow, recorded material, real recovery

- **Backend.** `POST /api/meetings/{id}/ending-attempts` already runs the
  shared journal workflow; demo meetings (`user_id == "demo-visitor"`)
  now inject recorded material at the provider boundary only: each
  specialist's vote comes from `ending_ballot_text` (a parseable recorded
  ballot; unknown participant → error, honest `invalid` vote), and the
  summary provider replays the recorded brief (`end_walkthrough`
  `final_text`). Everything else is the shared path: `ending_started` →
  `vote_delta`/`vote_recorded` (persisted first) → `summary_started` →
  `summary_delta` before the atomic commit → exactly one terminal; lease,
  idempotency, duplicate handling, stale attempt recovery, and the
  authoritative-state fallback are unchanged. No live LLM provider is
  touched for demo meetings (test asserts `get_provider` is never called).
- **Frontend.** The demo room's Summary tab records the ending through the
  shared workflow: `startEndingAttempt` (202 + events url, Bearer
  `demo-visitor`), `subscribeEndingJournal` (replay + live, sequence
  dedup, EOF-without-terminal reported and never treated as completion),
  incremental vote lines and brief, then either the committed transcript
  (authoritative reload + `journey-progress` for `end_walkthrough`) or an
  honest failure/decline message with the meeting restored active and the
  attempt retryable. `getEndingAttempt` recovery path is used when the
  stream ends without a terminal event.

## Part F — the substitute is gone

- Backend: removed the response-only executor and routes the old UI used
  (`POST /sessions`, `GET /session`, `POST /reset`, `POST /actions`,
  `GET /queue`, `PATCH/DELETE /queue/{entry_id}`, `perform_action`,
  in-memory queue plumbing). Surviving demo surface: real-session mode
  dispatch, recorded-turn, guide, journey-state, journey-progress.
- Frontend: deleted `BondJourney.tsx`, `useBondJourney.ts`,
  `journeyClient.test.ts`, `session-contract.test.ts`, `disabled.test.ts`,
  `types.ts`; `journeyClient.ts` remains only as bootstrap support
  (scenario constants + sessionStorage credential helpers consumed by the
  watermark and entry points). Vitest went from 62 to 47 tests because the
  15 tests of the retired contracts were removed with them.

## Verification

- Backend demo suites (recorded-turn, real-session modes, ending,
  fail-closed, package/determinism/composition/source-artifacts, manifest,
  migration 008, ending endpoints): **60 passed** in 221.7s.
- Full backend sweep: **245 passed, 17 skipped** in 236.7s
  (`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests -q -p anyio
  -p no:cacheprovider`, workdir `backend`).
- Frontend gates: `npm test` → 13 files / **47 passed** (includes guide
  store/steps tests and 4 ending-journal tests); `npx tsc --noEmit` clean;
  `npm run lint` 0 errors (23 pre-existing warnings); `npm run build`
  succeeds.
- Manual walkthrough remains required for the evidence directory's G4
  gating and is listed below under deferrals.

## Honest deferrals

- **D-01 (pending).** The demo bond package is still
  `approval_status: pending-d01`; the lightweight final research check has
  not been closed, so no "approved" claim is made anywhere in the UI.
- **Public release gating** (`DEMO_ENABLED`/`P10-TEST12`) was part of the
  retired substitute module; release gating now waits on the hosted
  checks without a local flag.
- **Durability depends on Supabase.** Without admin credentials the
  journey/sessions stores fall back to in-process memory; restart loses
  demo walkthrough state in that mode (fail-honest catalog unaffected).
- **Manual walkthrough + network audit** over the running app
  (deterministic replay of the ten journey steps, queue exercise,
  recorded ending, fork) has not been executed by an operator in this
  session; the automated coverage above is the implemented substitute,
  not a claim that a human ran it.
- Phases 00/02/09 evidence remains absent (unchanged from Stage A).
