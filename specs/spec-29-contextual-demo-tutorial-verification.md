# Spec 29 — implementation and verification record

Status: implementation complete; component, unit and integration suites executed.
Browser (Playwright) suites are written but **not executed** in this working
session. No execution evidence is claimed for anything below the "Not executed"
heading.

## What changed

### New feature: `frontend/src/features/demo-tutorial/`

| File | Responsibility |
| --- | --- |
| `contract.ts` | Anchor ids, objective ids, prompt shape, legacy beat copy and review-free beat completion. |
| `journey.ts` | Journey tracker. Derived only from installed checkpoints, played prepared turns, settled intents, closing/archive outcomes and the current route. |
| `objectives.ts` | Single-prompt selector for the prepared deck and the legacy v5 beat journey. |
| `tours.ts` | Optional prompt-version and knowledge-stack tours. |
| `anchors.ts` | Stable anchor registry (`useAnchorRef`, `useAnchorElement`, `useAnchorCandidates`). |
| `use-anchored-card.ts` | Floating card placement over `@floating-ui/react-dom` (`computePosition` + `autoUpdate` + `offset`/`flip`/`shift`/`size`), with a window-event fallback when observers are unavailable. |
| `presence.ts` | Streaming-turn and modal-layer presence; tour read facts. |
| `hud.tsx` | The single card, the ring, the compact `Show tips` bar and the `Explore recording` menu. |
| `notices.tsx` | Dismissible disagreement/consensus notices with a three-visible queue and stable-identity dedup. |
| `provider.tsx` | Tutorial state: hidden/resume, tours, resume/restart, logged-list status read. |
| `error-boundary.tsx` | Presentation-only failure boundary; room errors are untouched. |

### Removed

- `features/meetings/guide/GuidedReplay.tsx` and `guide-actions.tsx` (the expanded
  panel, ordered beat acknowledgements and the action filter).
- `runtime/active-intent.tsx` and the `activeIntentId` archive gate.
- `GuideReviewBanner`, the mandatory review tabs and the `Continue` flow.
- `guideCollapsed` / `guideBookmark` from the workspace provider.

Kept: `guide/replay-destination.ts` (still used by chapter restoration) and
`app/demo/chapter-bootstrap.tsx`.

### Anchors on real controls

`demo.start`, `demo.create`, `demo.open-room`, `board.roster`,
`action.credit-analyst`, `action.downside-reviewer`, `action.portfolio-analyst`,
`action.consensus`, `room.speaker`, `room.followup`, `room.close`, `room.vote`,
`room.vote-confirm`, `room.return`, `room.tab.disagreements`,
`room.tab.consensus`, `meetings.archive`, `nav.personas`, `nav.knowledge`,
`persona.prompt`, `persona.history`, `knowledge.stack`, `stack.document`,
`stack.access`.

### Archive from the meetings list

`reads.listMeetings` now reports the composed recorded meeting status, so the
ended meeting appears on the list with an enabled archive control. The deck
calls `archivePreparedMeeting()`; the legacy package uses its archive intent.
The in-room **Archive meeting** button remains a second real path.

## Executed evidence

Commands were run from `frontend/` on Windows (PowerShell).

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint src/features/demo-tutorial src/features/meetings/components/MeetingRoom.tsx src/features/meetings/components/ClosingPanel.tsx src/features/meetings/runtime/recorded-participant-action.tsx src/features/meetings/runtime/recorded-director-action.tsx src/features/demo-workspace src/features/persona-catalog src/features/knowledge src/app/demo e2e --max-warnings=0` | clean |
| `npx vitest run src/features/demo-tutorial` | 7 files, 54 tests passed |
| `npx vitest run tests/integration/demo-journey.test.tsx` | 5 tests passed |
| `npx vitest run tests/integration/meetings-list-screen.test.tsx tests/integration/demo-chapters.test.tsx tests/integration/demo-workspace.test.tsx` | passed |
| `npx vitest run tests/architecture` | 62/63 passed; `import-boundaries` failure pre-exists on `main` |

### Pre-existing failures (not caused by this change)

A baseline run on the previous commit reproduced these before any spec-29 edit:

- `tests/architecture/import-boundaries.test.ts`
- `tests/integration/meeting-room.test.tsx` (2)
- `tests/integration/meeting-room-closing.test.tsx` (1)
- `tests/integration/demo-practice-meetings.test.tsx` (4)
- `tests/integration/replay-runtime.test.tsx` (3)
- `tests/integration/demo-roster.test.tsx` (1)

They remain unrelated to the tutorial layer and are left untouched.

## Not executed

Playwright requires the pinned backend package and a dev server. These suites
were written or updated but not run here:

- new `e2e/demo-hud.spec.ts` (desktop journey, 390x844 placement, both tours)
- rewritten `e2e/legacy-journey.spec.ts` (v5 beats on the HUD)
- updated `e2e/demo-accessibility.spec.ts`, `e2e/exploration-playback.spec.ts`
- deleted `e2e/guided-journey.spec.ts`

`e2e/replay-isolation.spec.ts`, `e2e/replay-resilience.spec.ts` and
`e2e/integrated-practice.spec.ts` describe blocks are skipped with an explicit
reason: they assert the removed Continue/Step panel and their replacement
coverage lives in `demo-hud.spec.ts` plus the integration suites above. Closing
that gap is the remaining acceptance work for spec 30.

## Copy

The HUD shows one short imperative per objective. Removed copy includes the
expanded panel, step counters, documents-in-this-step, chapter lists inside the
panel, the review banner and the `Continue (acknowledge)` flow. The recorded
meeting disclosure from spec 28 is unchanged.
