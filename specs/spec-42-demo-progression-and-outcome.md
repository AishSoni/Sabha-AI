# Spec 42: Demo Progression, Discussion Dock, and Outcome

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–41. Owns T07 and D03/D04; owns P05, contributes P06/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and decisions

Make the deterministic discussion understandable without imposing a fixed speaker
order. The user accepts noncontextual fixed replies; this does not authorize live
generation or free-form follow-up inference.

- D03: decide the completed-step threshold, repeat-count policy, phase boundaries,
  and fixed follow-up availability. Do not assume four steps or that each click,
  repeated playback, or failed attempt counts.
- D04: decide the finale trigger and whether archive is optional or required.
  The payoff must be the discussion's useful outcome, not archival bookkeeping.

## Requirements

1. Initial controls choose the next participant by friendly name, role, and mark.
   Do not expose end-stage challenge/review/alignment titles at the beginning or
   force a prescribed participant order. Use Spec 39's approved authored names.
2. Unlock later challenge, review, alignment, and related actions only after the
   agreed completed-step policy. One authoritative policy must drive visible
   availability, runtime admission, count/repeats, guidance, follow-up, closing,
   retry/cancel/reset, checkpoint restore, branch access, and rapid/direct calls.
   Hiding a button while runtime admission accepts it does not satisfy this spec.
3. T07: eliminate the current mismatch between all played replies as numerator,
   required replies as denominator, and separate closing required-ID checks.
   Actual accepted outcomes own completion; playback timers/animations do not.
   Preserve immutable prepared data and coherent retained branch semantics.
4. Keep a compact integrated dock within Spec 31's discussion-first height budget.
   Use one concise contextual instruction, not a prominent competing HUD box or
   focus outline around the whole region. Actual controls retain visible focus.
5. Keep a collapsed exact question preview with Expand and Send when relevant to
   the agreed policy. Do not silently broaden into editable live questioning or
   infer follow-up phase behavior before D03. Queue/repeat controls stay secondary.
6. Guide attention to evidence, substantive disagreement, alignment, and the
   checklist/outcome, not click completion alone. Keep source inspection available
   without forced acknowledgement or mandatory tabs after every turn.
7. End with the useful saved result. Proposed reflection: different mandates,
   inspectable evidence, conflicts resolved or retained, research checklist, and
   useful next destinations. Preserve real ballot/closing/summary outcomes and
   honest restart behavior; final content/trigger follow D04.
8. Hide severity/strength scores in Demo only. Keep live scores and underlying
   records; never relabel them as confidence, truth, or probability.

## Local acceptance

- Resolve D03/D04 with a small phase/count/availability table and rationale.
- Arbitrary initial speaker order works; later actions remain unavailable until
  the agreed accepted outcomes, including runtime/direct-command checks.
- Repeats, failures, cancellation, stream completion, restore, branches, reset,
  and rapid clicks agree across UI, guidance, counters, and closing eligibility.
- Summary/outcome delivers the finale without falsely equating archive with the
  value demonstrated. Demo scores are absent; live rendering is unchanged.
- Exact question expansion/send, keyboard focus, and contextual guide coexist
  without obscuring controls. Re-measure room geometry at 1440×900 and 1920×917,
  mobile/small laptop, and text zoom; do not assume the existing tight ratio holds.

## D03 decision: one accepted-outcome progression

The prepared deck uses one authoritative progression policy. Its required outcome
set is `prepared_closing.required_turn_ids`; it is not reconstructed from a reply
count plus a separate closing check.

| Phase | Entry condition | Available actions | Visible labels | Accepted outcomes | Closing |
| --- | --- | --- | --- | --- | --- |
| Opening | Deck attached at the prepared base checkpoint | Each participant's first required reply, in any order | Mark, friendly name, and role only | 0–3 of 5 | Disabled |
| Deliberation | Every participant with a required reply has at least one accepted required reply | Remaining required replies | Authored stage title may be revealed | 3–4 of 5 | Disabled |
| Follow-up | All required reply turns accepted | The fixed follow-up only | Exact question, collapsed with Expand and Send | 4 of 5 | Disabled |
| Closing | Every `required_turn_ids` entry accepted | Close and vote | Closing prompt | 5 of 5 | Enabled |
| Closed | Closing bundle accepted | Inspection and optional archive | Outcome | Complete | Ended |

Only accepted results count: a stored reply result, the sent follow-up, and the
accepted closing. Active playback, timers, animations, repeats, failed attempts,
and cancellation do not count. Repeating a completed turn re-opens playback but
does not append a message or change the count. Showing the full prepared response
does count once because it accepts the prepared result.

The opening phase makes the first required reply for each participant available.
This permits any initial speaker order while keeping later turns locked. In the
v11 package the opening set is Mira, Arjun, and Leena; Mira's committee alignment
is the deliberation turn. Progress is reported as accepted outcomes over required
outcomes; reply counts are a detail rather than a second denominator.

## D04 decision: closing is the finale; archive is optional

The accepted closing (`checkpoint-closed`, or the deck closing bundle) triggers the
finale. The closing tab then shows the saved outcome reflection: the participants'
different mandates, inspectable evidence, conflicts retained or resolved,
alignment, the recorded research checklist, useful next destinations, and an
honest browser-memory/restart note. The recorded closing summary remains the
artifact; the reflection adds links and framing rather than replacing it.

Archive remains an optional list action. It is not required for `Demo complete`
and is not presented as the discussion's value. The guided deck flow completes
when the closing is accepted, not when the meeting is archived. Legacy packages
keep their existing beat-based journey.

## Policy consequences

- One pure progression function drives visible availability, runtime admission,
  journey/guidance, counters, follow-up, closing eligibility, repeats, reset, and
  direct or rapid calls.
- Deck actions are admitted only while the prepared base checkpoint is attached.
  Result checkpoints and branches are read-only inspection.
- The follow-up is available only after the required replies are accepted. It is
  the exact prepared question with a collapsed preview; it is not editable.
- Demo cards omit severity and strength scores. Live cards and underlying records
  are unchanged; no score is relabelled as confidence, truth, or probability.

## Implementation record

The deck uses `frontend/src/features/meetings/runtime/progression.ts` as the only
phase/count/admission policy. Room controls, follow-up, closing, journey
guidance, progress, and direct/rapid calls read the same result. Repeats and
active playback do not change accepted outcomes; stored reply results, the sent
follow-up, and the accepted closing do.

The deck journey is eight positions (start, create, open room, speaker,
follow-up, close, vote, complete). The legacy ten-position journey remains for
older packages. Completion is the accepted closing; archive remains an optional
list action. The closing tab shows the saved outcome reflection and the recorded
research checklist. Prepared buttons use Spec 39 names, roles, and marks; the
authored stage titles appear only when the policy reveals them. The follow-up
shows a collapsed exact preview with Expand and Send, and never becomes editable.

## Executed checks

- `npm test` (Vitest): 140 files, 874 tests passed.
- `npm run test:architecture`: 7 files, 52 tests passed.
- `npx tsc --noEmit -p tsconfig.json`: passed.
- `npm run lint`: 0 errors (13 pre-existing warnings).
- Playwright: `prepared-deck`, `room-reading-space`, `guided-journey`,
  `demo-hud`, `demo-accessibility`, `demo-notices`, `exploration-playback`,
  `replay-resilience`, `replay-isolation`, `demo-failure`, `evidence-preview`,
  `integrated-practice`, `temporary-setup`, and `demo-guidance` passed. The
  version-5 `legacy-journey` case remains skipped by its existing guard.
- Room geometry passed at 1440×900, 1920×917, and 1024×768 with the
  discussion/work-area ratio at or above 2/3. At 200% text at 1440×900 the
  discussion remained visible (39px) and the dock scrolled within a 224px cap;
  there was no horizontal overflow. The dock is no longer in the tab order.
- No replay package was changed; package v11 remains immutable.
