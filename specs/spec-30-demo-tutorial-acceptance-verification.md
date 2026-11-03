# Spec 30 — demo journey acceptance record

Status: local implementation and acceptance complete. The development and
production browser journeys pass, including the legacy and mixed runners.
Version 9 is published and active in the hosted replay registry. Hosted
deployment, grants and content-rights gates remain outstanding and are not
discharged by this record.

This record covers the combined Spec 28 + Spec 29 behavior required by
[Spec 30](spec-30-demo-tutorial-acceptance.md). It does not replace the Spec 19
release record or the Spec 22 operator-access record.

## Package and content review

The approved demo package is `backend/replay_packages/hdfc-ine001a07rw5-v9`,
schema 3, version `9`. Its validated content hash is
`df6cf3757a328050a1491b592008358bdcd177f3561296e0671e85fb81defb47`.

Changes from v8 are limited to the five files that carry the consensus reasoning
and the manifest hash:

- `checkpoints/checkpoint-consensus.json`
- `checkpoints/checkpoint-prepared-consensus.json`
- `manifest.json`
- `tapes/tape-consensus.json`
- `tapes/tape-prepared-consensus.json`

Version 8 was left byte-identical. Versions 1 and 2 and their published hashes
were not touched.

The content review confirmed:

- Exactly four prepared AI replies are required: Credit Analyst opening facts
  (`a0000000-0000-4000-8000-000000000402`), Downside challenge
  (`...403`), Mandate review (`...405`) and Committee alignment (`...406`).
- Exactly one prepared follow-up is required, labelled **You**, with message id
  `a0000000-0000-4000-8000-000000000404` and the approved question beginning
  "Portfolio Analyst, assume a fictional three-year mandate...".
- The closing prerequisites name `tape-closing`, `checkpoint-closed`,
  `checkpoint-archived` and all five required turn ids. A closing path that
  skips a required turn is rejected.
- Reply text, including consensus reasoning, names no previous speaker and
  claims no earlier sequence. The order-independence guard rejects phrases such
  as "previous speaker", "just heard", "building on", "first speaker" and
  "the Credit Analyst established".
- The content-hash test recomputes the manifest hash from the package files.
- Validation rejects a fifth guided turn, duplicate turn or operation ids,
  duplicate required replies, missing effects, dangling effects and label or
  content tampering.

### Hosted registry publication

Version 9 was published from `backend/replay_packages/hdfc-ine001a07rw5-v9`
with the offline provisioner credential and activated in the hosted replay
registry:

- package `hdfc-ine001a07rw5`, version `9`, status `published`;
- content hash `df6cf3757a328050a1491b592008358bdcd177f3561296e0671e85fb81defb47`;
- 33 checkpoints and 7 assets staged with verified hashes;
- registry `active_version` is `9`; versions 1, 2, 3, 6 and 7 remain published
  and unchanged.

## Executed gates

Commands were run on Windows from the repository root, `backend/` or
`frontend/` as noted.

| Check | Command | Result |
| --- | --- | --- |
| Backend suite | `cd backend; venv/Scripts/python.exe -m pytest -q` | 985 passed, 1 skipped, 21 warnings (932.59s) |
| Package validation | `cd backend; venv/Scripts/python.exe -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5-v9` | `ok: true`, version `9`, hash `df6cf3...defb47` |
| Frontend unit/integration | `cd frontend; npm test` | 105 files, 623 tests passed (24.19s) |
| Architecture | `cd frontend; npm run test:architecture` | 4 files, 29 tests passed (2.91s) |
| Types | `cd frontend; npx tsc --noEmit` | clean |
| Lint | `cd frontend; npm run lint` | 0 errors, 20 warnings (all pre-existing) |
| Build | `cd frontend; npm run build` | compiled successfully, 20 routes |
| Browser, development | `cd frontend; npx playwright test --reporter=list` | 36 passed, 2 skipped (38 total) |
| Browser, production | `cd frontend; npm run test:e2e:prod` | 36 passed, 2 skipped (38 total) |
| Legacy compatibility | `cd frontend; npm run test:e2e:legacy` | 1 passed |
| Mixed operator isolation | `cd frontend; npm run test:e2e:mixed` | 1 passed |

The two skips in the main browser run are the conditional legacy and mixed
specs; their dedicated runners passed separately. No acceptance test was
deleted or weakened to reach a green result.

## Coverage matrix

| Required outcome | Evidence |
| --- | --- |
| One concise disclosure, no competing instructions | `demo-copy` and both guided journeys assert exactly one `Recorded responses, not live AI generation` disclosure; no guide panel, Continue or step counter. |
| Four AI replies, visitor order, once each | Journey A plays Downside, Portfolio, Credit, Committee alignment. Journey B plays Portfolio, Committee alignment, Credit, Downside. Both assert the exact message ids and count. |
| Four AI + one **You** follow-up, fixed total | Both journeys assert exactly the four selected AI ids and exactly message `...404`, with sender name `You`. |
| Follow-up text and send-then-choose | Journey A sends the follow-up before any reply; journey B sends it last. The exact approved question is asserted in both. |
| Optional disagreement/consensus notices | `demo-notices` dismisses a disagreement, opens consensus with **View**, confirms the focused tab heading, and confirms the formal tab still holds the logged item. Closing and cancellation do not gate on notices. |
| HUD-only guidance | `demo-hud` and `demo-accessibility` assert one named region, one instruction, no dialog, hidden/revealed tips, keyboard operation, anchored ring and progress from real outcomes. |
| No replay queue Cancel; **Show full response** | `replay-resilience` observes no Cancel in replay, settles one turn after double action, and uses **Show full response**; live cancel coverage remains in the live integration suite. |
| Close disabled until eligible | Both journeys assert the close button is disabled before completion and enabled only after four replies plus the follow-up; the unchanged vote confirmation then runs. |
| Practice receipt removed | `temporary-setup` and the practice integration tests create a setup, land directly on `/demo/meetings/local-*`, and find no success receipt or `Open practice setup` receipt link. |
| Optional prompt/knowledge tours | `demo-hud` completes both tours and ends either one early; `demo-accessibility` exits a tour from the keyboard. Archived state and the composed closing summary are unchanged; unit tour tests and the architecture rule keep tour code presentation-only with no workspace, live-transport or persistent mutation. |
| Isolation and compatibility | `replay-isolation` runs two browser contexts with different orders and practice edits; `legacy-journey` walks version 5; backend compatibility tests cover schema 1 and 2. |

## Browser journeys A–F

### A. Reverse-canonical order with an early follow-up

`e2e/guided-journey.spec.ts` — `journey A: follow-up first, then the remaining
replies in a chosen order`.

Starts from `/demo` with one disclosure, follows the real creation route, sends
the **You** follow-up first, then plays Downside Reviewer, Portfolio Analyst,
Credit Analyst and committee alignment. Asserts close disabled before
completion, dismisses the disagreement notice, opens consensus with **View**
without a review gate, asserts the exact played order, runs the unchanged
vote, returns to meetings, archives, finishes, and confirms the summary makes no
sequence claim. Network guard and persistence snapshot are clean.

### B. Different order with a late follow-up

`e2e/guided-journey.spec.ts` — `journey B: a different order keeps one reply per
turn and a coherent close`.

Plays Portfolio Analyst, committee alignment, Credit Analyst and Downside
Reviewer, then the follow-up. Alignment is chosen second without redirection or
an out-of-order message. The exact transcript order and single occurrence of
each id are asserted, followed by a coherent close and archive. The summary is
checked for order-neutral language.

### C. Guidance, hiding and recovery

`e2e/demo-hud.spec.ts`:

- `stays hidden through a turn and a route change, then resumes the same
  objective` hides before the first turn, plays a reply hidden, navigates to
  Personas and back, confirms no automatic pop-up, then resumes with the current
  progress.
- `suspends while an evidence dialog is open and restores the same tip` confirms
  the HUD and compact bar are absent, focus stays in the dialog, and the same
  objective returns after Escape.
- The 390x844 test confirms the card stays inside the viewport, does not cover
  the Start control, and has no required animation.
- `exploration-playback` opens certified chapters without adding a turn or
  advancing progress, then resumes the composed meeting.
- The missing-anchor case is the settings screen in `demo-accessibility`: the
  card collapses to the compact `Show tips` control instead of guessing a
  position or completing the objective.

### D. Copy and practice setup

`e2e/demo-copy.spec.ts` walks `/`, `/demo`, `/demo/new`, the practice setup, the
recorded room, Files, summary, closing, evidence preview, meetings list, persona
detail and stack detail. It fails on any user-facing "Director", old skip label,
receipt heading, step-panel vocabulary, mandatory-review copy or removed
production-only disclaimer. Required prepared/historical/authored/evidence
notices remain.

`e2e/temporary-setup.spec.ts` creates a practice setup, lands directly on the
saved setup, confirms the no-generation paragraph and that later template edits,
sample ingestion and deletion never alter the recorded prompt, citation or
transcript.

### E. Optional tours

`e2e/demo-hud.spec.ts` completes the prompt-version and knowledge-stack tours
after archiving, and can end either tour early. `demo-accessibility` starts and
ends a tour from the keyboard. The meetings list still reports the archived
meeting and the composed closing summary is unchanged. Tour selection is
presentation-only in the unit suite, and the architecture rule keeps the tour
code free of workspace mutation, live transport and persistent progress.

### F. Compatibility, isolation and failure

- `backend/tests/unit/test_replay_schema3_deck.py` keeps schema 1 and 2
  readable, confirms an empty prepared deck and closing, retained beat
  checkpoints and no turn-freedom advertisement.
- `e2e/legacy-journey.spec.ts` walks the version-5 eight-beat package on the HUD.
- `e2e/replay-isolation.spec.ts` runs two contexts with different orders and
  practice edits; reset or refresh in one leaves the other untouched.
- Failure coverage: missing workspace seed, aborted stream, corrupt session
  read, missing tape, terminal-less stream, replay backend 503, duplicate
  dispatch, reset mid-stream and invalid anchor. Each fails closed with no live
  fallback, no invented turn and no advance.
- `e2e/mixed-operator.spec.ts` confirms demo edits and reset never touch the
  operator session or vault.

## Test replacement record

| Retired coverage | Successor |
| --- | --- |
| Old mandatory eight-beat `guided-journey.spec.ts` | Rewritten as journeys A and B with the HUD, turn deck, **You** follow-up, close eligibility, archive and tours. |
| Old guide bookmark and branch actions | `exploration-playback` keeps chapter/bookmark/resume and alternative-path inspection, and asserts inspection adds no turn. |
| Old guide reset and practice isolation | `replay-isolation` keeps reset/refresh/practice isolation and adds hidden-HUD and deck-reset assertions. |
| Old success receipt and `Open practice setup` | `temporary-setup` expects direct navigation and retains no-generation/original-recording checks. |
| Old guide keyboard coverage | `demo-accessibility` operates the complete journey at 390x844 with reduced motion, keyboard-only, including tips, notice dismiss, tour exit and 200% effective viewport checks. |
| Old skip/cancel/retry coverage | `replay-resilience` expects no replay Cancel, uses **Show full response**, and proves one settlement per turn; live cancel remains in live tests. |
| Old canonical gating unit tests | Deck eligibility and repeated-participant turn-id tests remain, including Credit Analyst twice. |
| Old hidden-follow-up unit test | **You**, exact-question and send-then-choose coverage remains. |
| Old ordered beat destination test | Chapter/bookmark/resume coverage remains plus composed-state restoration. |
| Old playback skip/empty states | **Show full response**, no empty control and no duplicate settlement. |
| Old `GuidedReplay` panel assertions | Removed only after HUD, chapter access, restore and reset equivalents landed. |

## Browser state and network

Every browser journey uses the Spec 27 guard. Allowed traffic is limited to the
app origin and approved replay session, workspace seed, meeting, asset and event
reads. No Auth, provider, upload, live meeting command, analytics or third-party
fetch was observed.

Persistence checks inspected localStorage, sessionStorage, IndexedDB, caches,
service workers and cookies before and after selection, follow-up, close,
archive, hide/resume, tours, reset and refresh. All remained empty. Turn order,
hidden tips, notice dedup and tour state live in browser memory only; no
per-visitor backend record is created.

## Accessibility

- Complete keyboard-only journey at 390x844 with reduced motion: creation,
  four replies, follow-up, close, vote, archive and tour exit.
- HUD is one named `region` with one instruction; it is not a dialog and does
  not steal focus.
- Hide/Show tips, notice dismiss, tour exit and every primary control are
  reachable with visible focus.
- Evidence dialogs trap and restore focus; the HUD suspends while a modal or a
  stream is active.
- 200% effective viewport (640x360) keeps the board and recorded setup free of
  horizontal overflow while the anchored card remains usable.
- No required animation: reduced-motion mode removes the ring animation and
  transitions.

## Outstanding hosted gates

The following are not discharged here and remain owned by the earlier release
specs:

- hosted deployment and smoke checks;
- operator grants and production Auth/vault verification;
- content-rights and final editorial approval for the published package.
