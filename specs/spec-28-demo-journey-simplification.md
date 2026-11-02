# Spec 28 (Phase 8): Concise, Open Recorded Demo Journey

## Purpose and prerequisites

Turn the recorded /demo experience into one concise, self-explanatory meeting:
the visitor can ask any prepared AI reply once, in any order, send one prepared
follow-up as **You**, and close the meeting without following a prescribed
sequence. Remove repeated explanations that compete with the interface while
retaining the disclosures needed to distinguish a recorded demo from live AI.

This spec owns the journey copy, prepared-turn selection, transcript
composition, follow-up presentation, replay-only controls and practice-success
routing. [Spec 29](spec-29-contextual-demo-tutorial.md) owns the contextual HUD,
optional event notifications and optional post-demo tours. Spec 30 owns the
combined acceptance gate.

Requires Specs [18](spec-18-guided-bond-journey.md) and
[23](spec-23-expand-existing-demo-workspace.md)–[27](spec-27-expanded-demo-acceptance.md).
Read the [runtime](reference-runtime-modes-and-credentials.md) and
[package](reference-replay-package-and-playback.md) contracts. This is a planned
assignment, not an implementation or execution record.

## Approved product decisions

These decisions are fixed for this phase:

1. The demo remains one integrated experience. The guided meeting stays the
   default; the workspace remains available without a separate entry mode.
2. The four approved canonical AI replies become a closed turn deck. Each reply
   plays exactly once, in any order, so the total number of AI turns is
   unchanged.
3. The one prepared follow-up is shown as **You**, with its exact question
   visible, followed by an explicit choice of who speaks next. All user-facing
   "Director" terminology is removed.
4. Agreement and disagreement reviews become optional notifications. They do
   not gate actions, require a Continue button or force a tab visit.
5. Verbose explanations and competing instructions are deleted or consolidated;
   necessary disclosure is stated once in context rather than repeated.
6. Queue **Cancel** is hidden in replay. **Skip to prepared result** becomes
   **Show full response**. **Close meeting** remains visible but disabled until
   the demo is ready for it. The existing live closing confirmation is retained.
7. Creating a practice setup navigates directly to the saved setup. Only the
   extra success receipt is removed.
8. Prompt-version and knowledge-stack tours are optional after the main demo and
   belong to Spec 29. They do not restart or alter the recorded meeting.

## Bounded supersession

For the new schema-3 demo package only, this spec supersedes:

- Spec 26's prohibition on arbitrary prepared turn permutations.
- The requirement that every visitor follow one active canonical intent before
  another canonical action becomes available.
- Spec 18's linear runtime ordering as a condition of completion. Its eight
  canonical beats and historical content remain the source of the approved
  replies and closing, not an action-order gate.

It does not delete approved alternative recordings. Those alternatives remain
available as explicitly labeled recorded chapters; they are not extra turns in
the guided meeting picker, because that would break the fixed total.

Schema-1 and schema-2 packages remain readable and valid. They keep their
existing checkpoint semantics; they do not acquire a turn deck by inference.

## Scope and non-goals

In scope: demo copy, disclosures, turn selection/composition, follow-up UI,
replay controls, close eligibility, practice receipt removal and focused tests.

Out of scope:

- Rewriting the bond scenario or its factual claims. Content must be made
  order-neutral where required, but the story is not being redesigned here.
- Removing the recorded setup form or intake receipt.
- Changing the live closing/vote confirmation, other than replay eligibility.
- Making archive optional.
- Changing citation link behavior or the evidence-preview interaction model.
- General visual redesign, font/color changes, new product surfaces, live
  inference, server-side demo persistence or arbitrary user-authored replies.
- Turning practice personas, prompts or documents into meeting responses.

## Grounding

Recheck these sources and their callers before editing:

- `frontend/src/features/meetings/guide/GuidedReplay.tsx` currently owns ordered
  beats, acknowledged reviews, canonical gating and the large guide panel.
- `frontend/src/features/meetings/guide/guide-actions.tsx` allows non-canonical
  actions but exposes the active canonical intent as the only canonical action.
- `frontend/src/features/meetings/runtime/replay.tsx` builds legal actions from
  checkpoint-specific transitions; repeated participants are resolved by
  intent, not a first matching participant.
- `frontend/src/features/meetings/runtime/replay-run.tsx` installs completed
  checkpoints and settles intents; closing is installed as a terminal snapshot
  before recorded closing text finishes.
- `frontend/src/features/meetings/runtime/recorded-participant-action.tsx` and
  `recorded-director-action.tsx` render the current prepared actions.
- `frontend/src/features/meetings/components/MeetingRoom.tsx` owns "Who speaks
  next?", the queue, the follow-up slot, scoreboard tabs, the closing entry and
  replay notices.
- `frontend/src/features/meetings/runtime/playback-controls.tsx` owns speed,
  skip and replay labels.
- `frontend/src/features/meetings/components/ClosingPanel.tsx` owns the
  recorded closing presentation and the unchanged vote confirmation.
- `frontend/src/features/meetings/runtime/recorded-summary-panel.tsx` owns the
  recorded summary inspection surface.
- `frontend/src/app/demo/page.tsx`, `demo/new/page.tsx`,
  `demo/meetings/page.tsx` and `demo/new/practice-setup-screen.tsx` carry most of
  the repeated setup and disclosure prose.
- `backend/app/replay/package/model.py` and `validate.py` define the strict
  package/checkpoint/transition contracts that currently assume a coherent
  linear graph.
- `backend/scripts/build_guided_package.py` authors the canonical replies,
  transitions, logs and closing tapes.
- Existing tests in `frontend/e2e/guided-journey.spec.ts`,
  `exploration-playback.spec.ts`, `temporary-setup.spec.ts`,
  `frontend/src/features/meetings/runtime/*.test.tsx` and the package validator
  suites assert the behavior that this spec changes.

## Requirements

### 1. One concise disclosure and one instruction at a time

The demo header may state once:

> Prepared demo · recorded responses, not live AI generation

Use the actual historical date as ordinary meeting metadata, not as another
disclaimer. Do not repeat that statement on the board, setup, room, tabs,
closing or workspace screens.

Contextual notices remain, but only where they change the visitor's decision:

| Context | Required notice |
| --- | --- |
| Practice editing | `Practice only · changes stay in this browser and never alter the recording.` |
| Practice sample | One short statement that the file is an approved sample processed for this practice workspace. |
| Evidence preview | Existing source, capture date, rights, extraction and identity details. |
| Recorded summary | `Recorded summary`, with its historical scope. |
| Live-inaccurate action | One concise reason the control is unavailable. |

Delete these categories rather than shorten every occurrence:

- Internal safeguards: filesystem writes, parser execution, bytes uploaded,
  server checkpoint mechanics, "no live fallback" implementation notes.
- Absent features and unimplemented preferences explained at length.
- Repeated independence statements that a practice edit does not rewrite the
  recorded meeting, except the one practice notice above and the one editing
  context where a visitor might otherwise assume otherwise.
- Decorative explanations of what a button is about to do when its label and the
  resulting state already show it.

Copy cleanup must not hide the prepared nature of responses, authored/private
documents, historical dates, source rights or the distinction between practice
state and the immutable recording.

### 2. Remove the competing page and guide prose

Apply at least the following concrete deletions/replacements. Keep real controls
and evidence; remove the prose around them.

| Surface | Current problem | Required change |
| --- | --- | --- |
| `frontend/src/app/page.tsx` | Describes a "live disagreement" and repeats the journey in a second block | Say the demo is a prepared recorded meeting; remove the duplicate "What the journey covers" block. Do not restyle the landing page. |
| `frontend/src/app/demo/page.tsx` | Repeats scenario context and carries a large frozen-snapshot essay | Keep one short agenda/context summary. Delete the snapshot essay. Practice independence moves to the practice editor. |
| `frontend/src/app/demo/new/page.tsx` | Repeats "editing disabled", no-writes, no-bytes, no-filesystem/no-parser and checkpoint explanations | Keep the prepared form and intake receipt. Use one sentence under the heading that this is the recorded creation record; remove the repeated implementation explanations. |
| `frontend/src/app/demo/meetings/page.tsx` | Always explains the overlay, unavailable unarchive/delete and recording state | Keep the list, tabs, status badges and archive action. Remove the standing implementation footer and redundant overlay paragraph. |
| `frontend/src/app/demo/settings/page.tsx` | Long explanations of unavailable preferences | Keep the operator-provider boundary and workspace lifetime in one short statement each; delete paragraphs for controls that do not exist. |
| `frontend/src/features/meetings/components/MeetingRoom.tsx` | Repeats the read-only notice in several regions and exposes replay-inaccurate server-continuation copy | Keep one compact `Recorded` status. Remove the repeated read-only footers and the "turn continues on the server" notice. |
| `frontend/src/features/meetings/runtime/recorded-summary-panel.tsx` | Explains at length that the summary is not generated now | Keep the recorded-summary label, date/scope and content; delete the "no result/no generation" paragraph. |
| `frontend/src/features/meetings/components/ClosingPanel.tsx` | Shows a long unavailable explanation and a replay disclaimer | The panel is reachable only when eligible; show one concise reason if it is directly opened early. Delete the replay disclaimer. Do not change the vote confirmation. |
| `frontend/src/features/meetings/evidence/dialog.tsx` | Repeats read-only/no-change and "secondary action only" implementation prose | Keep provenance, source, locator, excerpt and actions. Delete the two implementation-facing sentences. |
| `frontend/src/features/demo-workspace/ui/demo-nav.tsx` | Permanent practice-lifetime disclaimer in the global nav | Keep the nav and Reset demo. Move the practice notice into practice editing. |
| `frontend/src/features/persona-catalog/local/demo-persona-detail.tsx` and `demo-snapshot-panel.tsx` | Repeats snapshot independence and seeded-history explanations | Keep one practice notice at the screen level; remove repeated explanations from each panel. |
| `frontend/src/features/knowledge/local/demo-stack-detail.tsx` | Repeats access-policy prose and retrieval caveats | Keep actual document status, counts, bindings and "Who can retrieve"; delete the policy essay. |
| `frontend/src/app/demo/new/practice-setup-screen.tsx` | Repeats browser/no-generation warnings and a long "what this does not do" section | Keep one practice-only sentence in the header and the real saved setup content. Remove the repeated warning and the entire absent-feature list. |

Do not turn this into a copy-only reskin: removing the large guide panel and its
competing instructions is owned by Spec 29.

### 3. Use a closed prepared-turn deck

The guided meeting uses exactly the four approved canonical AI replies:

1. Credit Analyst opening facts.
2. Downside Reviewer challenge.
3. Portfolio Analyst mandate review.
4. Credit Analyst committee alignment.

The deck is closed. A reply appears only while unplayed and disappears or becomes
a non-actionable completed item after playback. Selecting a speaker never
chooses a different, unnamed reply because of the current checkpoint.

Rules:

- Each reply plays at most once. Re-selecting it, double-clicking, replaying its
  animation or refreshing cannot add a second copy.
- The order is entirely the visitor's choice. All four unplayed replies are
  available from the open meeting, regardless of which reply played first.
- The total is always four AI replies plus one **You** follow-up. Alternative
  branch replies are not inserted into this meeting.
- While one reply is streaming, other turn actions are disabled. After terminal
  settlement, the remaining unplayed actions return.
- Skip/Show full response settles the same reply exactly once. Replay this turn
  does not remove it from the played set.
- Closing requires every deck reply plus the follow-up. It is unavailable
  before then.
- Branch/closing alternatives remain inspectable through their recorded chapters
  and are clearly labeled as alternative recorded paths, not missing turns in
  the current meeting.

The package must not use a participant ID alone as the action identity. A
participant with two prepared replies needs a stable turn ID and an explicit
label for each reply.

### 4. Add a strict prepared-turn contract

Introduce schema version 3 for the prepared-turn demo. Keep schemas 1 and 2
readable and behaviorally unchanged.

A schema-3 manifest includes a validated `prepared_turns` collection. Each turn
records at least:

| Field | Meaning |
| --- | --- |
| `turn_id` | Stable unique identity used for the played set |
| `participant_id` | The approved participant snapshot |
| `label` | Short user-facing topic, not a hidden intent name |
| `operation_id` | The prepared replay operation whose tape is streamed |
| `intent_id` / `tape_id` | The prepared request and recorded stream |
| `result_checkpoint` | An isolated read snapshot containing the meeting plus this reply, with no other deck reply |
| `reply_message_ids` | Exact message identities produced by the turn |
| `effect_ids` | Operations, tool traces, citations, disagreements/consensus and other immutable artifacts produced by the turn |
| `required` | Whether closing requires this turn |

Validation must reject:

- duplicate turn IDs;
- duplicate required canonical replies;
- a turn whose isolated result contains another deck reply;
- a reply with no tape/message/artifact identity;
- more or fewer than the approved required count for this package;
- a closing path that does not require every required turn;
- any branch-only reply advertised as a fifth guided turn;
- text or effects that claim a turn happened when it was not selected, where
  the package can validate that claim against the deck.

Update the backend package models, validator, loader and replay read DTOs,
frontend contracts/decoders and package fixtures together. Keep strict parsing;
do not add unvalidated keys to the schema-2 shapes. Update generated API types
only if the exposed read contract actually changes.

The package builder, content hash, content ledger, publication path and local
validator must include the turn deck. Immutable published versions are never
edited in place. The current approved package remains available for
compatibility until a schema-3 package passes content approval.

### 5. Compose the transcript in the visitor's order

The runtime owns a volatile `played_turn_ids` set and an ordered list of
completed turn results. The displayed meeting is composed from the initial
prepared state plus those results in selection order.

- Do not enumerate a checkpoint graph for every permutation. A schema-3 turn is
  streamed by its approved `operation_id` through the existing replay
  `/turns/{operationId}/events` path; the server verifies that the operation
  belongs to the published turn deck. Marking a deck turn selected is a local
  visibility/settlement decision, not a new server write command. This is still
  package replay, never live inference. The existing transition-gated
  `startIntent` path remains for legacy packages and recorded chapters.
- After terminal settlement, merge that turn's isolated result and mark the turn
  ID played. Do not install a later canonical checkpoint as the meeting state.
- The chosen order is visible in the transcript. A later turn must not appear
  above an earlier one because a canonical snapshot is installed.
- Messages, thinking blocks, tool runs, citations, disagreement/consensus logs
  and status badges are merged by stable identity. Replay, skip, chapter return
  or screen refresh during the same mounted run cannot duplicate them.
- Scoreboard counts and the roster's "has spoken" state derive from the composed
  result, not from the largest checkpoint ordinal inspected.
- The summary/closing presentation remains a recorded artifact. Its content
  must be order-neutral or derived from the set of completed turns; it must not
  claim a sequence the visitor did not create.
- The closing ballot and final brief remain the existing approved recorded
  content. The live closing workflow's confirmation is not simplified.
- Refresh starts a fresh demo workspace and a fresh meeting, consistent with the
  existing lifetime contract. Practice edits are not persisted.
- Chapter inspection is a separate snapshot. Returning from it restores the
  composed meeting and its played set; inspecting a chapter never adds a turn.

No server-side per-visitor state is created. The turn deck and all outcomes are
immutable package data; composition and played/unplayed state are browser
memory only.

### 6. Make the follow-up **You**

Replace the user-facing "Director follow-up" with a **You** turn.

- Show the exact approved prepared question in a read-only field. Do not ask the
  visitor to retype it and do not imply that free text is accepted.
- The primary label is **Send question**. After it sends, the question appears as
  the user's message; do not automatically choose the Portfolio Analyst or any
  other speaker.
- The visitor then chooses any unplayed AI reply. The follow-up is one fixed
  turn, available once and required before closing.
- It may be sent before, between or after the AI replies. It does not consume or
  reorder the four AI replies.
- Render only currently available prepared follow-up choices. Do not show a
  catalogue of unavailable alternatives merely to explain that they are absent.
- Remove "Director" from all user-facing labels, instructions, headings, guide
  copy, accessible names and prepared transcript speaker labels. Internal
  identifiers such as `director_follow_up` may remain in code and package data.
- The old behavior that sends the follow-up and queues a specific portfolio
  reply is replaced by send-then-choose.

### 7. Correct replay-only controls

- Hide the queue **Cancel** control whenever replay capabilities report that
  cancellation is unavailable. Do not render a disabled button that rejects the
  action. Live behavior is unchanged.
- Rename **Skip to prepared result** to **Show full response** when a prepared
  response is streaming. Reuse the same validated settlement path.
- Remove the empty playback box and the "No prepared turn at this state"/
  canned replay explanation. If no prepared turn can be replayed, render no
  playback control (speed may remain available where a stream supports it).
- Keep **Replay last turn** only when there is a completed prepared turn to
  replay. It restores the same approved turn and does not add a played count.
- Keep the **Close meeting** control visible at all times in the room, including
  before it is eligible, but disabled with one short reason. Do not hide the
  tab/footer merely to simplify the demo, and do not let an early click open a
  dead-end closing panel. Enable it only when all required AI replies and the
  follow-up are complete. Then use the existing close/vote confirmation.
- Archive remains the final step. Do not make it optional in this spec.

### 8. Remove only the extra practice-success receipt

In `frontend/src/app/demo/new/practice-setup-screen.tsx`, creating a practice
setup currently shows an intermediate "Practice setup created" screen with
several paths. Remove that receipt state. On successful creation:

- navigate directly to `/demo/meetings/{local-setup-id}` using the existing
  browser-memory practice route;
- show one concise practice-only notice on the saved setup screen;
- keep the existing setup, original-recording link, discard behavior and
  no-generation semantics;
- rename the submit label from **Create practice meeting** to **Create practice
  setup**;
- do not remove practice creation, sample staging or the recorded setup path.

If navigation fails, show an actionable error instead of silently falling back
to the old receipt.

### 9. Preserve isolation and compatibility

No turn selection, follow-up, close, toast, tour or guide interaction may issue a
live command, provider call, upload, indexing request, credential lookup or
persistent demo write. The composed transcript is local. Replay-only startup,
public package reads, evidence previews, practice isolation and reader denial
remain unchanged.

Schema-1/2 packages remain readable and valid at the package/runtime boundary,
with their existing checkpoint semantics. The public demo pins a schema-3 package
only after its content and package validation pass. Compatibility fixtures must
not pretend to offer a turn deck; they do not require retaining the retired guide
panel as a second public journey.

## Tests to write first

### Package and unit

- Schema-3 package validation accepts exactly four unique required turns and one
  follow-up; rejects duplicate IDs, duplicate required replies, a fifth guided
  turn, an isolated result containing another reply, missing closing
  prerequisites and dangling artifact IDs.
- Content-hash and content-ledger tests prove the deck is part of the immutable
  package and old versions remain unchanged.
- Composition tests select the same four turns in at least two materially
  different orders, including the follow-up first/elsewhere, and assert four AI
  turns plus one user message, stable order, no duplicate messages/logs and
  coherent closed/archived state.
- Repeated click, double terminal, skip, replay, interrupted stream, retry,
  refresh and chapter-return tests cannot add a reply twice.
- A participant with two replies is resolved by turn ID, not first match.
- The replay stream accepts an approved turn-deck operation ID and rejects an
  operation, intent or tape that is not a member of the published deck. No live
  command/provider path is reachable through the turn-deck route.
- Legacy schema-1/2 tests remain green and do not expose schema-3 turns.

### Browser

- Complete the meeting in reverse-canonical and mixed order; verify the
  transcript follows the selected order and every prepared reply is used once.
- Verify the follow-up is shown as **You**, displays the exact question, sends
  without choosing a speaker, and then permits any remaining reply.
- Verify **Close meeting** is visible but disabled before completion, enables
  exactly at completion, and retains the existing confirmation afterward.
- Verify scoreboards, citations, tool traces and summary remain coherent
  regardless of order; disagreement/consensus toast behavior is covered in
  Spec 30.
- Verify queue **Cancel** is absent, **Show full response** settles the turn, and
  empty playback controls render nothing.
- Verify practice creation goes directly to the saved setup, with no success
  receipt or second click.
- Run keyboard-only and 390x844 checks for the changed controls after the HUD is
  integrated, with no horizontal overflow.

### Copy

Add a focused source or rendered-copy assertion for the removed user-facing
terms where practical: no "Director", no "live disagreement", no "Practice setup
created" receipt, no old skip label, and no repeated implementation disclaimers
in the named screens. Do not make the test a brittle whole-page snapshot; assert
the specific approved strings and required disclosures.

## Implementation slices and exit gate

1. Add the strict schema-3 turn-deck records, validator, content hashing and
   compatibility tests; author the isolated replies and order-neutral closing
   content without mutating earlier published packages.
2. Implement browser-memory composition and turn selection, remove canonical
   action gating for schema 3, and prove no duplicate state.
3. Convert the follow-up to **You**, adjust close eligibility and replay-only
   controls, and remove the mandatory review flow.
4. Apply the copy reductions and practice-success routing.
5. Replace ordered-journey tests with arbitrary-order, control, copy and
   practice tests; leave Spec 29's HUD and Spec 30's combined acceptance gate
   as the remaining prerequisites.

Exit when a visitor can start the prepared meeting, choose any of four prepared
AI replies once in any order, send the single **You** follow-up, close and
archive without a prescribed sequence; the copy is concise and truthful; and no
live or persistent demo effect is introduced.

Do not record execution evidence in this document until the commands and browser
journeys have actually run.
