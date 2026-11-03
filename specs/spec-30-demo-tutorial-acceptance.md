# Spec 30 (Phase 8): Revised Demo Journey Acceptance

## Purpose and prerequisites

Prove that [Spec 28](spec-28-demo-journey-simplification.md) and
[Spec 29](spec-29-contextual-demo-tutorial.md) work together as one concise,
open recorded-meeting experience rather than as separate demos or an unchanged
canonical path behind a new overlay.

This is independent acceptance, not permission to weaken previous isolation,
package or accessibility gates. It does not add product scope beyond the two
preceding specs. Requires the approved schema-3 package and both implementation
specs to have local evidence; only this document records the combined result.

Read the [runtime](reference-runtime-modes-and-credentials.md) and
[package](reference-replay-package-and-playback.md) contracts and retain the
outstanding hosted gates from Specs [19](spec-19-replay-release-acceptance.md)
and [22](spec-22-operator-only-live-access.md). This is a planned acceptance
gate, not an execution record.

## Non-goals locked out of acceptance

Failure to preserve these boundaries is a failure, not a future enhancement:

- The recorded setup form and intake receipt remain.
- The existing close/vote confirmation remains; replay only gains eligibility
  gating and loses replay-inaccurate controls/copy.
- Archive remains required for the main journey.
- Citation link/preview behavior is unchanged except for approved copy cleanup.
- Practice edits remain browser-memory only and never generate recorded replies.
- No second demo mode, scenario selector, arbitrary reply generation or
  persistent tutorial progress is introduced.
- No general font/color/layout redesign is required or accepted as a substitute
  for the specific journey changes.

## Required coverage matrix

| Approved outcome | Acceptance evidence |
| --- | --- |
| One concise disclosure, no competing instructions | Rendered copy/path review plus automated assertions on the named screens |
| Four prepared AI replies play once in arbitrary order | Two different browser orders, fixed count, transcript/log assertions |
| Total turns unchanged | Four AI replies plus one **You** follow-up in every completed run |
| Prepared follow-up shown as **You** with exact text | Browser inspection, send-then-choose flow, no Director labels |
| Optional agreement/disagreement notifications | Toast View and dismiss paths; no mandatory tab/Continue |
| HUD-style contextual guidance | Anchored prompt, hide/resume, target highlight, real-action progression |
| Queue Cancel hidden and skip relabeled | Browser assertion in replay; live regression remains |
| Close visible but disabled until eligible | Before/after eligibility assertions, unchanged vote confirmation |
| Practice receipt removed | Direct navigation to saved setup after creation |
| Optional prompt-version and knowledge-stack tours | Both tours independently started, skipped and completed |
| Isolation and compatibility | Network/state/package/legacy checks retain earlier guarantees |

## Browser journeys against the real application

### A. Reverse-canonical order with an early follow-up

From a fresh context:

1. Open `/demo`. Confirm the single prepared-demo disclosure and that no guide
   panel is present.
2. Start the recorded meeting through the real creation route.
3. Send the **You** follow-up before all AI replies, then choose Downside
   Reviewer, Portfolio Analyst, Credit Analyst and committee alignment in that
   order.
4. Confirm exactly four AI replies and one user message are composed in the
   chosen order; each reply can be selected once only.
5. Dismiss one agreement/disagreement toast without viewing it and use **View**
   on another. Confirm the corresponding tab opens, no review gate appears and
   the journey continues either way.
6. Confirm **Close meeting** was visible but disabled before completion and
   enables only after the fourth reply plus follow-up.
7. Complete the unchanged closing/vote flow, return to meetings, archive and
   finish. Confirm the summary does not claim an unplayed sequence or omit a
   selected reply.

### B. Different order with a late follow-up

Repeat with a materially different order: Portfolio Analyst, committee
alignment, Credit Analyst, Downside Reviewer, then the follow-up. Assert the
same total count, no repeated turn, the composed transcript in the selected
order and a coherent close/archive. This journey must not be corrected,
redirected or completed differently because it differs from journey A.

### C. Guidance, hiding and recovery

Walk the main journey while testing the HUD:

- Hide the tutorial before the first turn; complete at least one reply and one
  route transition while it is hidden. Confirm no automatic pop-up and no change
  to legal actions.
- Resume tips at the current objective. Confirm it is not the first step and does
  not restart the meeting.
- During a streamed reply and while an evidence dialog is open, confirm the HUD
  does not cover the response/dialog and does not steal focus.
- Resize to 390x844, scroll the speaker/close regions and use keyboard-only
  input. Confirm flip/shift/hide behavior, visible focus and no horizontal
  overflow.
- Open a recorded chapter and return. Confirm the HUD objective and composed
  played set are unchanged, and no historical log toast is replayed.
- Force a missing/misconfigured anchor in a test build and confirm the tutorial
  suspends rather than completing the step.
- Repeat with reduced motion and verify no decorative animation is required to
  understand or complete a step.

### D. Copy and practice setup

- Create a practice setup from `/demo/new`. Confirm the old success receipt is
  absent and the saved browser-memory setup opens directly.
- Confirm the setup still states that it does not generate responses and that
  editing it does not alter the recording.
- Inspect the board, recorded setup, room, closing, summary, evidence dialog,
  meetings list, persona detail and stack detail. Assert the approved verbose
  explanations are gone and the necessary prepared/historical/authored/evidence
  notices remain.
- Search rendered demo copy plus accessible names for user-facing "Director",
  the old skip label, the receipt heading and the removed production-only
  disclaimers. Internal code identifiers may retain `director_follow_up`.

### E. Optional tours

After archiving in a fresh journey:

- Start **Explore prompt versions**, open a persona and inspect an earlier
  revision. Do not save or activate anything. End the tour and return to the
  completed demo.
- Start **Explore knowledge stacks**, inspect a stack, document status/preview
  and who can retrieve it. Do not upload anything. Complete the tour.
- Confirm either tour can be skipped before starting or ended mid-tour; no tour
  is required for completion.
- Confirm the archived state, composed meeting and practice edits are unchanged,
  and no copy implies the inspected practice materials produced the recording.

### F. Compatibility, isolation and failure

- Run the schema-1/2 compatibility fixture at the package/runtime boundary and
  confirm it remains readable, retains its checkpoint semantics and does not
  advertise turn freedom it does not support.
- Repeat a fresh visitor run with the network guard from Spec 27: only approved
  app/replay reads are allowed; no Auth, provider, upload, live meeting command,
  analytics, persistent storage or third-party fetch is observed.
- Two visitors choose different orders and make different practice edits; reset
  or refresh one and confirm the other is unaffected.
- Exercise a missing/corrupt deck, duplicate turn ID, missing tape, terminal-less
  stream, invalid anchor, dialog during stream and backend outage. The demo must
  fail safely with no live fallback, no invented turn and no advance.
- Confirm the live application, operator auth/vault and existing practice
  workflows remain unaffected.

## Test replacement plan

The old ordered-guide tests cannot simply be deleted. Replace every assertion
with a deliberate successor and keep the historical legacy coverage.

| Existing coverage | Required successor |
| --- | --- |
| `frontend/e2e/guided-journey.spec.ts` mandatory eight-beat path, Continue buttons and review tabs | Rewrite for the HUD, four-turn deck, **You** follow-up, close eligibility, archive and at least one optional tour. Keep separate package/runtime legacy compatibility coverage rather than the retired guide UI. |
| `frontend/e2e/exploration-playback.spec.ts` guide bookmark and branch actions | Keep chapter/bookmark/resume coverage; assert chapter inspection does not add a turn or advance the HUD; retain alternative recorded-path inspection. |
| `frontend/e2e/replay-isolation.spec.ts` guide reset and practice isolation | Keep reset/refresh/practice isolation and add hidden-HUD and turn-deck reset assertions. |
| `frontend/e2e/temporary-setup.spec.ts` success receipt and "Open practice setup" | Expect direct navigation to the saved setup; keep no-generation, discard and original-recording checks. |
| `frontend/e2e/demo-accessibility.spec.ts` guide keyboard behavior | Add HUD hide/resume, toast View, anchor focus, small-screen/reduced-motion and tour accessibility. |
| `frontend/e2e/replay-resilience.spec.ts` skip/cancel/retry | Expect no queue Cancel in replay; keep live cancel regression; use **Show full response** and assert no duplicate turn. |
| `frontend/src/features/meetings/runtime/recorded-participant-action.test.tsx` canonical gating | Replace with turn-deck eligibility and repeated-participant turn-ID tests. |
| `frontend/src/features/meetings/runtime/recorded-director-action.test.tsx` hidden later follow-up | Replace with **You**, exact question, send-then-choose and no auto-speaker tests. |
| `frontend/src/features/meetings/guide/replay-destination.test.ts` ordered beat destinations | Retain only chapter/bookmark/resume cases that still apply; add composed-state restoration tests. |
| `frontend/src/features/meetings/runtime/playback-controls.test.tsx` old skip/empty state | Expect **Show full response**, no empty control and no duplicate settlement. |
| `frontend/src/features/meetings/guide/GuidedReplay.tsx` panel assertions | Remove only after HUD replacement, chapter access and reset behavior have equivalent tests. |

Add focused suites or cases for:

- schema-3 package validation and content-hash validation;
- arbitrary-order composition and duplicate prevention;
- HUD objective selection, hide/resume and missing anchors;
- notification deduplication and non-gating;
- optional tours and their independence from archive;
- copy suppression of the specific removed statements;
- practice direct routing;
- policy/architecture checks that keep tutorial code inside the demo shell and
  do not add live transport, Auth, vault or persistent progress.

Do not replace assertions by weakening them to "the page loads." Each removed
mandatory review must be replaced by a positive test that the task is optional,
and each new turn order must be asserted against exact message/log identities.

## Package, content and state evidence

- Publish a new immutable schema-3 package; do not mutate version 1/2 or any
  earlier content hash. Include the turn deck, isolated reply results, explicit
  required-turn closing prerequisites and the approved follow-up in the content
  ledger, validation and publication path.
- Review every prepared reply for order independence. The content gate rejects
  claims such as "the previous speaker" or a conclusion that requires a turn
  that was not selected. The closing summary/brief may summarize the set of
  completed replies and must not invent a sequence.
- Validate exactly four required AI turns and one follow-up for the approved
  demo; reject a fifth guided turn, duplicate required reply, missing effect,
  dangling citation/log or closing path that skips a required turn.
- Inventory browser state before/after turn selection, follow-up, close, archive,
  HUD hide/resume, tours, reset and refresh. Only the approved ephemeral workspace
  state may change; no persistent storage, cookie, IndexedDB, service worker or
  backend per-visitor record.
- Capture browser requests across all journeys and retain the existing
  `/demo` read-only boundary. A new HUD, toast or tour must not introduce an
  analytics or live API call.

## Accessibility, failure and regression gates

Run the complete journeys with keyboard-only input, 390x844, 200% zoom and
reduced motion. Verify:

- one HUD region and one instruction, not a second dialog or competing panel;
- visible focus, accessible names, polite instruction announcements and no
  automatic focus stealing;
- anchored target highlight is not the only cue; target remains operable;
- hide/resume is not hidden from keyboard or screen-reader users;
- toast View/dismiss, tab focus and queued notifications are usable;
- optional tours can be exited; their temporary absence does not strand the
  visitor;
- no horizontal overflow, obscured close/speaker controls or forced scrolling.

Failure gates include missing anchor, missing tape, corrupt package, duplicate
turn request, offline replay backend, stream EOF without terminal, dialog opened
during stream, reset during pending work and route remount. Each must remain
safe, explain the immediate recovery, and avoid a false completion or live
fallback.

Keep green: live meeting creation/retry, closing/vote, summary, persona versioning,
knowledge/document workflows, evidence redaction, operator Auth/vault, reader
denial, archive and package compatibility. A passing demo must not be achieved
by disabling live regressions.

## Execution record

Do not add pass counts, screenshots, hashes or timestamps until actually run.
When implementation is complete, record:

| Check | Command/environment | Result |
| --- | --- | --- |
| Backend suite | `cd backend; venv/Scripts/python.exe -m pytest -q` | 985 passed, 1 skipped, 21 warnings (932.59s); no failures. |
| Package validation | `venv/Scripts/python.exe -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5-v9` | `ok: true`; package `hdfc-ine001a07rw5`, version `9`, content hash `df6cf3757a328050a1491b592008358bdcd177f3561296e0671e85fb81defb47`. |
| Frontend unit | `cd frontend; npm test` | 105 files, 623 tests passed (24.19s); no failures. |
| Architecture | `npm run test:architecture` | 4 files, 29 tests passed (2.91s). |
| Types/lint/build | `npx tsc --noEmit`; `npm run lint`; `npm run build` | TypeScript clean; ESLint 0 errors and 20 pre-existing warnings; production build compiled 20 routes. |
| Browser journeys A–F | development: `npx playwright test`; production: `npm run test:e2e:prod` | Development 36 passed, 2 skipped; production 36 passed, 2 skipped. The two skips are the conditional legacy and mixed suites, executed separately below. |
| Legacy compatibility | `npm run test:e2e:legacy` | 1 passed (version-5 package, eight recorded beats on the HUD). |
| Mixed operator isolation | `npm run test:e2e:mixed` | 1 passed (demo edits and reset never touch the operator session or vault). |

Record separate passed, failed, skipped and unexecuted results. Do not copy the
historical Spec 27 evidence as a current result. Hosted deployment, grants,
immutable-package publication and content-rights checks remain governed by the
earlier release specs and are not discharged by this local acceptance.

## Exit and rollout

Exit when:

- the main meeting has exactly four prepared AI replies plus one **You**
  follow-up, any order, fixed total and no duplicate;
- two materially different orders produce coherent transcripts, logs and closure;
- the HUD is the only journey guidance, hides/resumes safely and never gates;
- notifications and tours are genuinely optional;
- close eligibility and the unchanged vote confirmation behave correctly;
- practice creation reaches the saved setup directly without the old receipt;
- the required disclosures survive the copy deletion;
- schema-3 validation, isolation and legacy compatibility pass;
- the combined browser journeys pass on the real development and production
  builds, with unexecuted hosted gates clearly separated.

Rollout pins the approved schema-3 package only after content review and package
validation. Rollback repins the last intact compatible package and disables the
new turn deck/HUD behavior without deleting live records or widening demo access.
