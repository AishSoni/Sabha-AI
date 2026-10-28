# Spec 15 (Phase 3): Closing UI Integration

## Purpose and prerequisites

Make the real closing workflow reachable and coherent in the ordinary meeting room, after [runtime composition](spec-14-live-and-replay-composition.md). Provide a small shared presentation seam for recorded generated closing text; do not build a second closing engine or a new live summary execution system just for replay.

## Current behavior and boundaries

`frontend/src/features/meetings/components/ClosingPanel.tsx` implements request/progress/retry/abort UI and has standalone tests, but `MeetingRoom.tsx` does not mount it. Its summary tab renders a separate on-demand `SummaryPanel`. Generating an interim summary is not closing a meeting.

`backend/app/modules/meetings/presentation/http.py` exposes closing commands and a read-only observation route. The current GET observes; do not revive an old description in which polling drives inference. The application closing service drains active work, votes, summarizes and commits through durable checkpoints. Reuse it unchanged unless a newly tested integration defect requires a bounded correction.

## Required shared-product behavior

- Mount the real panel in the real room through an accessible, discoverable close action. Use existing feature hooks/public exports and the composed command capability. No duplicate route-level workflow.
- Preserve vote/force modes and stages: draining, voting, summarizing, completed, rejected, aborted, failed. Only show commands valid for the actual stage. Failed/rejected/aborted outcomes explain admission state and available recovery without inventing a success.
- Pending turns cancel and the executing turn drains according to existing backend policy. Navigation detaches observation; it does not abort closing. Retry/abort remain explicit commands and cannot repeat already checkpointed paid work.
- Ballots answer **whether the meeting should end**, not whether to buy the security. Render vote errors/unknown usage honestly and preserve strict-majority policy, including ties/failures.
- On completion reconcile canonical meeting status and final summary exactly once. Keep interim summaries separate. Archive is an overlay; unarchiving an ended meeting does not reopen it.
- Place essential controls/status in responsive, keyboard-accessible content, not only the desktop sidebar. Honor reduced motion and avoid scroll-stealing during generated text.

## Generated-text presentation seam

Live closing currently polls snapshots containing whole vote explanations/summary text. Preserve that behavior. Extract a narrow view/projection interface so the same panel can also render provisional recorded text followed by canonical completed content.

Spec 17 will supply typed **closing** SSE envelopes for vote explanations and final summary. Do not impersonate a participant turn, misuse its operation identity, add a fake message, or claim live closing now streams if it does not. The seam must distinguish closing ID, ballot/summary item ID, sequence, provisional text, terminal result, and source provenance. The package reference defines ordering/checkpoint rules; final wire schemas and transport belong to Spec 17.

Every generated text item in replay must arrive through that backend stream. Do not reveal full reasons or the final brief in an initial polling response and then animate them cosmetically. Recordings use honest replay copy rather than “newly committed”/“live” claims. No recorded usage enters the live accounting ledger.

## Tests to write first

1. Mount the real room with real feature hooks and a deterministic HTTP-contract backend: close entry is reachable, request uses the actual command, progress appears, and completed data reconciles. A standalone mocked panel render is insufficient.
2. Drain/vote/summary transitions, rejected/tied votes, failed stage/retry, abort, force-close, duplicate clicks, navigation/remount, and stale responses. Integrate existing backend closing contracts instead of duplicating its policy in the browser.
3. Completed/archived meetings remain read-only; unarchive preserves ended state. Interim summary generation does not mark a meeting ended.
4. Shared text renderer can accept a scoped provisional closing item and replace it once with the canonical item; duplicate/late events or a different closing ID cannot contaminate it. Full SSE is tested in Spec 17.
5. Live credential handoff remains live-only. Replay rendering/intent capability never reveals a key, submits a closing command, or starts polling live data.
6. Keyboard focus, status announcements and small-screen reachability. Stable guide anchors are semantic IDs on real controls, not selectors derived from visible prose.

## Small slices and exit gate

First reproduce the missing room integration with a failing route/feature test. Mount the existing panel and reconcile ordinary live completion. Add failure/recovery tests, then extract the minimal generated-text presentation seam with characterization coverage. Do not add an unrelated live SSE queue or rewrite vote policy.

Exit when the vanilla room reaches and completes the real workflow, existing closing/accounting tests stay green, and the scoped text seam is ready for Spec 17. Update inventory/generated artifacts only if a real API contract changed. Record browser integration evidence separately from component evidence.

## Completion record

### Verdict

The live meeting room now mounts the real closing panel, reaches it from the
ordinary tab bar and a footer shortcut, observes durable closing progress,
pauses turn admission while a close is open, and reconciles canonical meeting
status and the final summary once the close completes. Failure, rejection,
abort, vote, and force paths retain explicit recovery rather than implying
success.

The generated-text seam is present and scoped to a closing identity and item
identity. It is ready to accept recorded closing events, but no closing SSE
transport, wire schema, or replay closing capability was added; those remain
Spec 17 work.

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `npm test` (final full run) | `frontend/` | **45 files / 263 tests passed**, 10.60 s |
| `npm run test:architecture` | `frontend/` | **15 tests passed**, 2.46 s |
| `npx tsc --noEmit` | `frontend/` | exit 0, no diagnostics |
| `npm run lint` | `frontend/` | exit 0, 0 errors, 19 pre-existing warnings |
| `venv\Scripts\python.exe -m pytest -q` (full suite) | `backend/` | **630 passed**, 0 failed, 23 warnings, 687 s |
| `venv\Scripts\python.exe -m pytest -q tests/acceptance/test_spec11_fresh_checkout.py` | `backend/` | **3 passed**, 29.63 s |

The first full backend run after the frontend work exposed one stale
acceptance baseline: the clean-checkout rehearsal still expected **40**
OpenAPI paths although the current application and the upgrade acceptance
test expose **46**. Commit `6d3a96d` aligned the rehearsal, its acceptance
test, and `docs/OPERATIONS.md` with the current public surface. The rerun above
is green. No OpenAPI schema, generated frontend type, or backend closing code
changed in this spec.

### Route and feature integration evidence

These are jsdom route/feature tests using the real `MeetingRoom`, real
`LiveMeetingsRuntimeProvider`, real feature hooks, and a deterministic
HTTP-contract fetch router. They are not a deployed-browser E2E journey.

- `frontend/tests/integration/meeting-room-closing.test.tsx` (6 tests):
  - The close entry is reachable and opens the real panel. Starting a vote
    sends exactly one `POST /meetings/{id}/closing` with the actual mode and a
    request key, and no API-key field.
  - Draining progress interrupts turn submission, completion refreshes the
    canonical meeting, renders the final summary exactly once inside
    `#closing-panel`, shows the read-only notice, and never calls abort.
  - A failed close pauses turn controls, announces `role="status"` and
    `aria-live="polite"` text, explains retry/abort recovery, and returns the
    composer only after an explicit abort command.
  - A rejected close stays visible while the room returns to active work;
    rejection is not presented as success.
  - Force close submits the composed force command rather than faking a vote.
  - The Close tab is a real button in the main tab bar with stable anchors;
    remounting reattaches by GET without replaying a closing command.
- `frontend/tests/integration/meeting-room.test.tsx` (9 tests) covers archived
  read-only rendering, an interim summary that does not POST closing or end
  the meeting, and scroll behavior: a reader away from the bottom is not
  moved, while a near-bottom reader receives an immediate scroll when reduced
  motion is requested.
- `frontend/tests/integration/replay-runtime.test.tsx` (7 tests) proves a
  recording renders no Close tab or close shortcut, makes no `/closing`
  request, and performs no non-GET replay request.

### Standalone component evidence

- `ClosingPanel.test.tsx` (15 tests) covers advancing-stage rendering without
  work submission, completed reload, scoped recorded-item replacement,
  different-closing isolation, archived read-only state, abstentions and
  failed ballots, pending-only spinners and honest unknown usage, vote and
  force requests, ambiguous-5xx key reuse, definitive-4xx fresh keys, explicit
  retry/abort, duplicate confirm clicks, and restart after rejection.
- `closing-text.test.ts` (7 tests) covers live-snapshot projection,
  provisional-to-canonical replacement, ordering, malformed sequences,
  duplicate/stale/late events, wrong closing/provenance rejection, and ballot
  and summary lookup.
- `ClosingGeneratedText.test.tsx` (2 tests) proves one DOM node is updated in
  place and that no item or empty text renders nothing.
- `scroll.test.ts` (3 tests) pins the near-bottom threshold and the
  reduced-motion behavior.
- `closing-queries.test.tsx` (6 tests) remains green with the runtime-scoped
  hooks and proves retry/abort seed snapshots without replaying the original
  request.

### What the tests prove

1. **Closing is composed, not duplicated.** Reads and commands flow through
   the meetings runtime. Live implements them with the existing closing
   client; replay supplies read-only rejections and keeps `closing: false`.
2. **The room owns admission.** While draining, voting, summarizing, or failed,
   the composer and turn controls are withheld and a live status region points
   to the panel. Rejected and aborted closes return control to the active
   meeting. Completed, ended, and archived meetings stay read-only.
3. **Completion reconciles once.** The room observer invalidates canonical
   meeting detail and turn data once per settled closing attempt, keyed by
   `closing_id + stage`. The final summary is rendered once, not duplicated by
   polling or a remounted panel.
4. **Commands remain explicit and bounded.** Retry and abort are user actions,
   not automatic retries. Request-key reuse survives ambiguous failures, and a
   duplicate confirm click produces one request. Checkpointed work is not
   replayed by the browser.
5. **Ballots keep their product meaning.** Copy states that a ballot decides
   whether the meeting ends, not whether a proposal is approved. The browser
   renders backend outcomes, including abstentions, failures, unknown usage,
   and rejection; strict-majority policy remains in the backend.
6. **Generated text is scoped and honest.** Live polling still presents
   snapshot reasons and summaries. An optional projection can replace them with
   provisional recorded items and one canonical replacement, while a different
   closing ID or non-increasing event cannot contaminate the item. Recorded
   provenance never falls back to live snapshot prose in the panel path tested.
7. **Accessibility is part of the controls.** The Close tab is keyboard
   reachable in the main content, the panel is not confined to the desktop
   aside, status cards and room notices are polite live regions, stable
   semantic IDs exist on the real controls, and message scrolling respects
   reader position and reduced motion.
8. **Replay stays credential- and command-free.** The replay import graph and
   runtime test remain free of live settings, vault access, provider-key
   strings, closing polling, and closing commands.
9. **Backend closing and accounting remain green.** The full backend suite
   exercises the unchanged closing service, strict-majority tally, checkpointed
   stages, and live accounting alongside this frontend composition.

### Deliberate scope and manual rollback

- No closing SSE envelopes, event transport, recorded package reader, or
  numbered-sequence wire schema were added. Spec 17 owns those and must feed
  the existing `textProjection` seam with recorded provenance.
- Replay closing remains disabled (`closing: false`). A recording cannot open
  the panel, poll live closing, or submit a command until Spec 17 supplies the
  real recorded closing surface.
- No summary-settings UI was added to the room; live requests keep server
  defaults. No provider credential was added to the closing request.
- No closing engine, vote-policy calculation, or checkpoint rule was moved
  into the browser. The backend service and routes were reused unchanged.
- No OpenAPI regeneration or generated-type update was required because no API
  contract changed.
- This record claims route/feature integration and standalone component
  coverage, not a deployed multi-user browser journey.
- `HOSTED_STORAGE_VERIFICATION.md` remains an unrelated pre-existing untracked
  file and was not modified.
- Manual rollback: revert `6d3a96d` and `3559ae4` through `552139d` in reverse
  order, tests and docs together. No schema migration or hosted state needs to
  be unwound.

### Outstanding gates

- Spec 17 must provide typed closing event envelopes and the recorded transport,
  including ordering/checkpoint rules and terminal interruption semantics. The
  current panel projection is intentionally transport-agnostic.
- Recorded closing text has not been exercised end to end because no recorded
  closing stream exists yet. The seam is unit- and component-tested only.
- The live closing panel still observes whole snapshots; it does not claim
  token streaming, and this spec did not add one.
- Keyboard reachability, live regions, stable anchors, and small-screen
  placement are covered in jsdom. No real-browser keyboard or viewport audit
  was executed.
- No hosted deployment, real provider close, or multi-user concurrent close
  was exercised in this spec.
- The full frontend and backend suites are green, but lint retains 19
  warnings from pre-existing files and dependencies.

Next: [PDF extraction quality](spec-16-pdf-extraction-quality.md).
