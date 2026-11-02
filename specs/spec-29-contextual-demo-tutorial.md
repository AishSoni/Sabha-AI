# Spec 29 (Phase 8): Contextual Demo Tutorial HUD

## Purpose and prerequisites

Replace the large, always-expanded guided-replay panel with a small, anchored
tutorial HUD. The HUD shows one relevant instruction at a time over the real
application, points at the control that accomplishes it, and advances only when
that action actually succeeds. It never becomes a second application, a modal
tour or an action gate.

This spec also adds optional agreement/disagreement notifications and optional
post-demo tours of prompt versions and knowledge stacks. [Spec 28](spec-28-demo-journey-simplification.md)
owns the turn deck, copy cleanup, **You** follow-up, replay controls and close
eligibility. Spec 30 owns combined acceptance.

Requires Spec 28 and the existing recorded workspace from Specs
[23](spec-23-expand-existing-demo-workspace.md)–[27](spec-27-expanded-demo-acceptance.md).
Read the [runtime](reference-runtime-modes-and-credentials.md) and
[package](reference-replay-package-and-playback.md) contracts. This is a planned
assignment, not an implementation record.

## Approved product decisions

1. One integrated demo remains. The HUD is presentation only; it does not create
   an exploration mode or replace the real workspace.
2. Only one expanded prompt is visible at a time. It is public-page-style
   guidance inside the demo, not a full-height panel or a blocking modal.
3. The instruction points at the actual control and stays concise. There is no
   generic **Continue**, **Next** or acknowledgement button for normal progress.
4. Progress comes from completed application outcomes, never a timer, route
   render, refetch, scroll or automatic playback.
5. Any valid turn choice satisfies the "choose who speaks next" objective. The
   HUD does not correct the visitor toward a canonical order.
6. The visitor can hide the tutorial without changing what the demo allows, and
   resume it at the current objective.
7. Agreement and disagreement reviews become optional, dismissible toasts with
   a **View** action. Ignoring them never blocks progress.
8. After the main journey, prompt-version and knowledge-stack tours are
   independently optional and skippable. They use the same HUD and real screens,
   do not restart the meeting and do not imply practice changes affected the
   recording.
9. All existing recorded-chapter/bookmark access and recording reset behavior
   remain available, but not inside the primary HUD prompt.

## Bounded supersession

This spec replaces the expanded `GuidedReplay` panel, ordered beat acknowledgements
and mandatory review tab visits as the demo's guidance mechanism. It preserves:

- the recorded chapters and bookmark/resume path from Spec 26;
- the existing restart/reset semantics and practice isolation;
- all live application guidance outside `/demo`;
- the real room tabs, controls and evidence dialogs.

It does not alter the live app's onboarding, global navigation or visual system.

## Scope and non-goals

In scope: HUD composition, anchor registry, instructions, hide/resume, event
toasts, optional tours, accessibility, responsive positioning and tests.

Out of scope:

- Arbitrary user-authored steps, a tour editor, analytics, persistent tutorial
  progress or server-side onboarding state.
- Driver.js, React Joyride or another tour lifecycle owner.
- A blocking spotlight/mask, auto-focus, forced scrolling or simulated `.click()`
  on application controls.
- Changing meeting/turn data, scenario content, closing confirmation, archive
  semantics or practice behavior.
- Global restyling, new color/type systems or unrelated landing-page redesign.
- Using a toast library when a small local notification region is sufficient.

## Grounding

- `frontend/src/app/demo/demo-shell.tsx` composes the replay and workspace
  providers and is the correct place for a tutorial provider above the route.
- `frontend/src/app/demo/layout.tsx` currently mounts `GuidedReplay` for every
  demo route.
- `frontend/src/features/meetings/guide/GuidedReplay.tsx` renders the large panel,
  chapter list, Back/Continue/Restart controls and repeated disclosures. The
  guide contract already carries an `anchor` string at
  `frontend/src/features/meetings/runtime/contract.ts:133`, but no positioning or
  highlight implementation currently consumes it; do not mistake that field for
  a working anchor registry.
- `frontend/src/features/meetings/guide/guide-actions.tsx` filters room actions
  through the active guided intent. Spec 28 removes that filter for the turn
  deck; the HUD must not reintroduce it.
- `frontend/src/features/meetings/guide/replay-destination.ts` and
  `chapter-bootstrap.tsx` provide chapter/bookmark restoration. Preserve them.
- `frontend/src/features/meetings/runtime/recorded-participant-action.tsx`,
  `recorded-director-action.tsx`, `playback-controls.tsx`, `replay-run.tsx` and
  `replay.tsx` expose the real action controls and completion state.
- `frontend/src/features/meetings/components/MeetingRoom.tsx` exposes the speaker
  region, tabs, evidence and close control that the HUD anchors to.
- `frontend/src/app/demo/page.tsx`, `demo/new/page.tsx` and
  `demo/meetings/page.tsx` provide the start, meeting and archive controls.
- `frontend/package.json` currently has no positioning, tour or toast library.
  The implementation may add `@floating-ui/react`; it must not adopt a full tour
  framework or a second notification system.
- Existing browser tests in `frontend/e2e/guided-journey.spec.ts`,
  `demo-accessibility.spec.ts`, `exploration-playback.spec.ts` and
  `temporary-setup.spec.ts` assert the old panel and must be deliberately
  replaced.

## Requirements

### 1. Separate progress, presentation and notification state

Create a demo-tutorial layer with three distinct responsibilities:

| Layer | Owns | Must not own |
| --- | --- | --- |
| Journey tracker | Completed application outcomes: meeting created, played turn IDs, follow-up sent, closing completed, archived, optional tour viewed | Meeting/checkpoint state, legal actions, copy of the transcript |
| Prompt selector | The single current objective, its anchor, short instruction and fallback | Completion mutation, route redirects, automatic clicks |
| HUD renderer | Position, highlight, hide/resume, toast stack and focus behavior | Domain state or action eligibility |

The tracker observes existing runtime/workspace events. It does not infer a turn
completed because a checkpoint mounted, a timer elapsed or a URL changed.
Completion requires the same terminal/read condition that the actual room
accepted.

Progress and hide/resume state are in browser memory for the mounted demo. They
are not written to server storage, cookies or persistent browser storage and are
not analytics. Reset demo clears them; refresh starts over according to the
existing lifetime contract.

### 2. Render one contextual HUD prompt

The HUD is a small floating card with:

- one short instruction;
- optional progress such as `2 of 4 replies`;
- **Hide** and, after hiding, a compact **Show tips** control;
- no paragraph, checklist or competing explanation;
- no generic next/continue button.

The card must not cover the control it describes. It should prefer a side or
above/below placement based on available space, and avoid covering the
transcript's active response or the primary action. A restrained outline or ring
on the target is allowed; a full-screen dimming mask is not.

The target remains fully interactive. The HUD never:
- calls `.click()` on a real control;
- steals focus when an objective changes;
- scrolls the page automatically;
- intercepts keyboard shortcuts;
- prevents the visitor from using any other visible control;
- marks an objective complete because its anchor disappeared.

Use one visual layer and one instruction card. The demo may retain a compact
`Recorded` badge or status, but not another guide panel.

### 3. Use stable anchors and resilient positioning

Add a small anchor registry used by real components. Each anchor has a stable ID
and maps to an actual element, not a coordinate or copied DOM node. Prefer a
hook/ref registration with cleanup on unmount. Do not duplicate controls just to
create anchors.

Implement positioning with `@floating-ui/react` (or an equivalent, approved
small positioning primitive):

- `autoUpdate` on scroll, resize and layout changes, including streaming text;
- `flip` to the opposite side when the preferred side does not fit;
- `shift` to keep the card inside the viewport and safe-area insets;
- `hide`/visibility handling when the target is clipped or not visible;
- a bounded maximum width and no horizontal overflow at 390px;
- one portal/floating root that does not affect page layout.

If the target is absent after a route/tab change, suspend the expanded card,
keep the objective, and leave a compact **Show tips** control. Do not render at a
guessed position and do not advance. Wait for the actual anchor to register.

When a Radix dialog, alert dialog, menu or evidence preview is open, hide the HUD
(and toast stack if necessary) above the modal layer. Restore it when the modal
closes only if the objective is still current. Do not place HUD content inside a
dialog or change the dialog's focus trap.

If an active recorded turn is streaming, hide the expanded prompt until terminal
settlement to avoid covering the streaming response. Restore the next relevant
prompt after completion.

If HUD rendering fails, the room and meeting controls must continue to work. An
error boundary around the tutorial layer is appropriate; it must not swallow a
real meeting error.

### 4. HUD objective catalogue

The main journey has these prompts. Wording may be adjusted for approved copy,
but it must remain one short instruction and may not become a paragraph.

| ID | Surface / anchor | Instruction | Completes when | Fallback |
| --- | --- | --- | --- | --- |
| `main-start` | Start control on `/demo` | **Start the meeting** | The recorded setup route is open | Compact tips control if the control is not mounted |
| `main-create` | Create control on `/demo/new` | **Create the recorded meeting** | The recorded intake receipt is open | Keep the actual prepared form; do not auto-submit it |
| `main-open-room` | Room link on the intake receipt | **Open the meeting room** | The recorded room route is open | Keep the receipt and one concise recovery link |
| `main-speaker` | Speaker action region in the room | **Choose who speaks next** | The selected prepared turn reaches terminal settlement and its reply is composed | Keep instruction and progress; do not treat a failed/interrupted turn as complete |
| `main-followup` | **You** follow-up card | **Send your follow-up** | The prepared question message is sent exactly once | If sent earlier, skip this objective |
| `main-close` | Visible close control | **Close the meeting** | The close panel is open with its eligible action | Do not target a disabled close control; wait until eligibility |
| `main-vote` | Close panel's primary close/vote control | **Vote to end the meeting** | The recorded closing terminal is reached | If the panel is directly opened, use one concise unavailable reason |
| `main-return` | **Go to meetings** action | **Return to the meetings list** | The list route is open | Keep the completed close state |
| `main-archive` | Archive control on the ended meeting | **Archive the meeting** | The archive action succeeds | Do not infer archive from the list route alone |
| `main-complete` | Completion card, no target required | **Demo complete** | No mutation; offers optional tours | Must not block the room or nav |

The `main-speaker` objective remains active until all four prepared replies are
played. Its progress line reflects the count. The HUD must accept any unplayed
reply and must never say that one order is the correct next step.

The `main-followup` objective is only selected when the four replies are done
and the follow-up is still unsent. The follow-up card remains available earlier;
the HUD must not force it or hide the speaker choice. If the visitor sends it
early, the tracker records that fact and skips this prompt later.

The **Close meeting** control is visible but disabled before eligibility per Spec
28. While disabled, the HUD keeps the relevant speaker/follow-up objective; it
does not anchor an instruction to a disabled control. When the close prerequisite
is met, the same control enables and the `main-close` prompt appears.

### 5. Hide and resume

- **Hide** collapses the expanded card and removes the target ring. A compact,
  keyboard-reachable **Show tips** control remains.
- While hidden, progress continues to update from real actions, but no prompt
  reappears automatically. Do not repeatedly re-issue an ignored instruction.
- **Show tips** restores the current objective at its current anchor. It does not
  restart the journey or replay a completed turn.
- Hiding guidance never changes legal actions, completion state or the
  availability of practice/workspace controls.
- On route navigation, the hidden/collapsed state is preserved for the mounted
  demo workspace. On reset or refresh, it follows the workspace reset rules.
- Escape may collapse a focused HUD card but must not close a modal or navigate.

### 6. Optional agreement and disagreement notifications

Keep the existing Disagreements and Consensus tabs as the authoritative record.
Replace mandatory `GuideReviewBanner` visits and Continue clicks with optional
notifications.

When a completed prepared turn produces a new formal disagreement or consensus:

- show a dismissible toast: **Disagreement logged** or **Consensus logged**, with
  a **View** action and a close button;
- do not block the room, HUD, transcript or next action;
- do not move focus or open the tab automatically;
- **View** opens the relevant existing tab and moves focus to its panel heading;
- closing the toast only dismisses the notification; the formal item remains in
  the tab;
- ignoring or dismissing it never advances/prevents any objective.

Only notify for newly composed events from the visitor's played turns. Do not
emit a burst for every historical log when a chapter or archived snapshot is
first installed. Deduplicate by stable event/log identity for the lifetime of
the workspace, including replay, tab switches and return from a chapter. Reset
demo clears seen identities.

Use a small local notification stack rather than a new toast dependency. Keep at
most three visible; queue additional events and promote them when a slot clears.
Toasts must not auto-disappear on a timer, so a visitor can read or dismiss them
at their own pace. They should not cover the HUD, the close control, mobile safe
areas or a modal. If a modal is open, queue until it closes.

The old guide review banner, required review tabs and Continue-to-acknowledge
flow are removed. The visitor may still open Disagreements or Consensus at any
time.

### 7. Optional post-demo tours

After `main-archive` completes, the HUD shows a compact **Demo complete** card
with two independent options and a **Finish** action:

- **Explore prompt versions**
- **Explore knowledge stacks**

Selecting one starts that tour with the same HUD. They are optional; neither is
required for completion.

#### Prompt-version tour

Use the real workspace screens:

1. Anchor the **Personas** navigation link; instruction **Open a persona**.
2. Anchor the selected persona/roster item; instruction **Open its prompt
   versions**.
3. Anchor the prompt-history control; instruction **View an earlier version**.
4. On viewing a revision, show **Tour complete** with **Finish tour** and
   **Back to demo**.

Inspection only. The visitor may edit if the real screen allows it, but the tour
does not require saving or activating a version. Copy must not suggest that a
practice revision changes the recorded meeting.

#### Knowledge-stack tour

Use the real workspace screens:

1. Anchor the **Knowledge** navigation link; instruction **Open a knowledge
   stack**.
2. Anchor a stack; instruction **Inspect a document**.
3. Anchor the document preview/status; instruction **View who can retrieve it**.
4. On the access/binding view, show **Tour complete** with **Finish tour** and
   **Back to demo**.

No upload, deletion or assignment is required. If the visitor makes a practice
change, it remains browser-only and does not affect the recorded meeting.

Each tour can be abandoned at any point with **End tour**. Finishing or ending a
tour returns to the demo-complete card; it must not restart the meeting, replay a
turn, clear practice edits or change the archived result. Starting the second
tour after the first is allowed. The optional tours do not change the main
journey's completed status.

If a tour's target is not present (for example a persona or stack was discarded),
show a safe **Back to demo**/retry choice rather than a missing-coordinate card.
Do not silently mark the tour complete.

### 8. Preserve chapter/exploration access

Moving guidance out of the large panel must not remove recorded exploration:

- Keep recorded chapter links, bookmark restoration and the recorded summary
  reachable through a compact **Explore recording** entry in the HUD's collapsed
  menu or another existing demo control.
- Visiting a chapter is an explicit inspection. It does not advance the HUD and
  does not insert a turn into the composed meeting.
- **Resume current meeting** restores the composed turn deck state, not a guessed
  later checkpoint.
- **Restart recording**/Reset demo remains available with its existing semantics:
  restarting the recording preserves practice edits where the workspace contract
  says it does; reset clears them.

Old ordered-beat **Back** and **Continue** controls are retired because they
assume a canonical sequence. They are replaced by chapter/bookmark navigation,
not by a new mandatory step sequence.

### 9. Accessibility and motion

- The HUD is a named `region`, not a tooltip or dialog. Do not use
  `aria-describedby` to make a button's accessible name depend on floating
  position.
- Announce only instruction changes with a polite live region. Do not announce
  every position calculation, scroll or count update.
- HUD controls and toast buttons are keyboard reachable with visible focus.
  No automatic focus transfer on prompt appearance.
- The anchor's focus outline remains visible; the highlight ring is never the
  only indication of the target.
- `prefers-reduced-motion`: no pulse, bounce, scale or animated ring; reposition
  without decorative motion.
- Support 200% zoom and a 390x844 viewport. Keep the card inside the viewport and
  do not cover the target or safe-area controls.
- When a toast changes tabs, focus the tab panel heading and announce the tab
  context. When it is dismissed, leave focus where it was.
- Do not auto-dismiss tutorial cards or toasts on timers.

### 10. Copy and competing instructions

The HUD owns the journey instruction. Page prose must not repeat it. During the
HUD implementation:

- remove the entire expanded `GuidedReplay` panel, its Documents-in-this-step
  section, chapters list, progress explanation, disclosures and Continue/Back
  controls from the main view;
- remove `GuideReviewBanner` and mandatory review copy;
- keep one demo-level prepared-recording disclosure from Spec 28;
- keep the HUD instructions short (target: one imperative sentence, usually
  2–8 words);
- use the application's real labels for actions after the HUD hands off, without
  restating their implementation.

The HUD must not show internal words such as "canonical", "checkpoint",
"settled intent", "guide step", "recording paused" or "journey not advanced".

## Tests to write first

### Unit/component

- Tracker advances only on the named terminal/read outcome; timers, route
  renders, refetches and mount events do not advance.
- Any of the four prepared turns completes `main-speaker`; a different order does
  not produce a correction or reset.
- Follow-up sent early skips `main-followup`; close does not enable until all
  required replies and the follow-up exist.
- Hidden state persists across route changes in the mounted workspace; Show tips
  resumes the current objective; hiding does not change legal actions.
- Missing anchor leaves the objective unresolved; no completion is recorded.
- Modal open suspends HUD; closing restores only the current objective.
- Toast deduplication by event identity; dismiss/ignore never advances;
  View opens the correct tab; queued notifications respect the three-item limit.
- Optional tours can be skipped, ended, completed in either order and do not
  change the archived/composed meeting state.
- No persistent storage, analytics or network request is introduced.

### Browser

- Verify one card only, anchored to the real control, with a target ring that
  does not intercept clicks. Run at desktop and 390x844, with scroll/resize and
  streaming layout changes.
- Verify the card flips/shifts at viewport edges, does not cover the speaker
  region/close control or streamed answer, and disappears during evidence
  dialogs and active streams.
- Keyboard-only: Hide, Show tips, toast View, tour controls and Finish have
  visible focus; no focus is stolen on appearance; Escape behaves as defined.
- Reduced-motion: no decorative animation; progress and completion still update.
- Missing/misconfigured anchors fail safely with no false completion.
- Chapter navigation and resume do not advance the HUD or duplicate logs.
- The old panel, mandatory review banner and Continue flow are absent.

## Implementation slices and exit gate

1. Add the tutorial provider/state observation, anchor registry and a minimal
   nonmodal floating card without changing action eligibility.
2. Replace `GuidedReplay` with the HUD composition; preserve chapter/reset access
   and remove stale guide copy.
3. Add hide/resume, resilient positioning, modal/stream suspension and
   accessibility behavior.
4. Add optional log toasts with deduplication and tab focus.
5. Add the prompt-version and knowledge-stack tours after main completion.
6. Run component, browser, keyboard, reduced-motion, small-screen and isolation
   tests; record results only after execution.

Exit when one concise prompt is anchored to the real next control, all valid
prepared choices satisfy it, optional notifications never gate progress, the
demo can be completed with the HUD hidden, and optional tours use the real
workspace without restarting or altering the recording.

No execution evidence is claimed until the suites have actually run.
