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
