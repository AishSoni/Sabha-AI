# Phase 07 evidence — core frontend reliability and reusable controls

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/07-frontend-reliability.md` (draft); contracts
  `specs/CONTRACTS.md` sections 1, 6, 9, 10; requirements R-06, R-07, R-08,
  R-09, R-14; defects B-09 plus the frontend remainder of B-08.
- Backend queue/refresh/settings endpoints built in Phases 04–05 are used
  as-is; no backend behavior was changed in this phase.
- The live turn stream still emits legacy event shapes from the
  orchestrator (`text/thinking/tool_call/tool_result/citation/done/error`);
  the frontend ships a version-2-typed parser plus a legacy adapter, so the
  UI is ready for the contract stream without a second ad hoc schema in
  components. No `GET /turns/{id}`, replay-cursor, or cancel routes exist
  server-side yet: replay deduplication and terminal reconciliation are
  client-side, and navigation aborts the subscription only — server
  execution continues per CONTRACTS.md.
- No guided onboarding, bond content, exploration, visual redesign, or
  browser-test framework was introduced.

## Tasks / acceptance IDs and code/test paths

- Store identity (T01): `frontend/src/stores/meetingStore.ts`
  (meeting-keyed cache, selected-meeting/generation guards on every async
  commit, abortable turn subscription), `frontend/src/test/reset.ts`.
- Stream client (T02): `frontend/src/lib/turn-events.ts` (typed v2
  envelope, legacy adapter, incremental SSE parser, sequence dedup),
  `frontend/src/lib/api.ts` (`ApiError`, `subscribeTurnEvents`,
  queue/refresh clients).
- Turn presentation (T03): `frontend/src/components/chat/ChatArea.tsx`
  (execution-identity keys, reconnecting/failed banners, streamed
  citations), `ToolUseBlock.tsx` (execution id + outcome),
  `CitationsBlock.tsx` (unavailable state, stable keys).
- Queue UI (T04): `frontend/src/components/chat/QueuePanel.tsx`,
  store queue slice wired to `POST/GET/PATCH/DELETE
  /api/meetings/{id}/messages|queue|queue/{entry}`.
- Persona/settings UI (T05): `frontend/src/stores/settings-store.ts`
  (server persistence, saving/saved/failed, effective values),
  `frontend/src/components/settings/api-keys-section.tsx` (status +
  effective panel), `frontend/src/components/chat/RosterTab.tsx`
  (refresh preview diff + explicit apply).
- Reusable presentation (T06): `frontend/src/components/chat/SummaryTab.tsx`
  (authoritative system-transcript summaries, read-only ended state;
  mock summaries and fake generation removed).
- Accessibility (T07): `frontend/src/lib/motion.ts`
  (reduced-motion scroll path), queue focus management in `QueuePanel.tsx`.
- Verification (T08): commands below; manual core checks recorded as
  operator steps (no browser automation in scope).

## Owned bugs: red/green evidence

- B-09 red: `frontend/src/stores/meetingStore.races.test.ts` added 3
  failing cases (delayed user-send, context-stats fetch, streaming
  completion for meeting A after selecting B); all 3 failed pre-fix with
  stale A overwriting B. Green: same 3 pass after the identity-guard
  rewrite. The Phase 01 `it.fails` marker in
  `meetingStore.regression.test.ts` was converted to a normal passing test.
- B-08 frontend remainder red: no effective-settings assertion existed
  (store held browser-only values with no save status). Green:
  `frontend/src/stores/settings-store.test.ts` (4 tests: saved status +
  exact effective values, rejected save never shown as effective,
  effective-refresh failure clears stale values, preference load hydrates)
  plus `RosterTab.refresh.test.tsx` (preview diff, explicit apply,
  stale/busy conflict reload) and `SummaryTab.state.test.tsx`
  (authoritative read-only state).

## Commands, environment, results

- Env: Windows, Node (frontend `npm test`), vitest 3.2.7, jsdom; Python
  3.11.9 backend suite for regression.
- `npx vitest run` (cwd `frontend/`) → **11 files, 37 tests passed**.
- `npx tsc --noEmit` → clean.
- `npm run lint` → 2 errors + 24 warnings, all pre-existing: the 2 errors
  (`SharedDocumentsTab` static-components, `ThinkingBlock`
  setState-in-effect) are untouched files already recorded in Phase 05
  evidence; no new lint findings from this phase.
- `npm run build` → succeeds (static + dynamic routes compiled).
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest
  backend/tests -m 'not integration'` → **116 passed, 17 skipped**
  (skips are pre-existing unmarked async tests outside this phase).
- Commits (descriptive, no phase/item labels): `1b4d298` SSE frame
  parser, `e48114f` typed API errors + abortable subscriptions,
  `0818259` store identity guards, `f05de3a` execution-identity tool
  pairing, `baf3978` queue interaction tests, `d9ba333` server-persisted
  settings, `3cdb9a6` effective-settings status UI, `86d40ee` refresh +
  authoritative summaries, `b172b48` reduced motion + queue focus.

## Migration / rollback

- Browser storage uses versioned `sabha-settings` (v2) with legacy
  secret stripping; no live secrets are migrated into new state.
- A compatible API adapter is retained during rollout skew
  (`streamTurn` legacy shape still consumed via the adapter).
- Rollback = application rollback; disabling the new queue/refresh
  controls is safe because pending entries and snapshots live
  server-side. Rollback never sends old unscoped requests: queue edits
  always carry the entry revision.

## Manual acceptance and limitations

- Automated coverage: fragmented/multiline/CRLF streams, replay dedup,
  same-name tool identity, queue conflicts, refresh conflicts,
  generation invalidation, read-only ended state, keyboard/focus paths.
- Operator browser checks still to run against a local runtime (not
  covered by jsdom): switch meetings mid-stream, disconnect mid-turn and
  reconnect, edit/remove a queued message during a live turn, apply a
  persona refresh, reload with an expired session. Expected results are
  the banners/validation states implemented above; report deviations as
  new defects rather than UI adjustments.
- Limitations: jsdom does not cover real-server incremental delivery;
  sqlite/double backend suites used for cross-reference do not prove
  live latency/locking; former RLS hardening is out of scope.

## Exit decision

Passed: AC01 (B-09 closed for load/send/nonstream/streaming completion
plus parser/identity races), AC02 (editable queue and
persona/settings match server contracts including conflicts), AC03
(generation isolation, read-only states, reusable source/tool rendering,
accessibility), AC04 (Vitest/type/build green; lint shows only
pre-recorded pre-existing findings; no Playwright introduced).
