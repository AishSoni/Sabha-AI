# Spec 41: Demo Introduction and Screen Guidance

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–40. Owns T09 and D01; owns P03, contributes P06/P12/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and D01

Explain what Sabha is, why it exists, what this example is, why this bond was
chosen, and what the demo covers. Introduce this after the session and required
metadata load but before exposing the main interface. Preserve the existing
overview → setup/create → open-room stages; the user explicitly retained them.

Resolve D01: final step count/copy, revisit entry, refresh, and full-reset re-entry.
Four short steps are a proposal, not an approved count or final script:

1. What Sabha is: a human-directed meeting with different AI expertise.
2. Why use it: compare arguments, disagreements, sources, and a documented outcome.
3. **A HDFC Bond Review Demo**: a historical example with checkable terms, downside,
   and portfolio mandates. Explain why it illustrates Sabha without assuming
   finance expertise or implying the product is only for finance.
4. What to try: shared material, speaker choice, evidence, disagreement, and the
   resulting checklist; introduce personas/prompts, knowledge, and settings too.

## Requirements

1. Give the introduction a strong, coherent style using the existing Satoshi,
   constellation marks, purple atmosphere, selective glass, and solid readable
   working surfaces. Develop one recognizable composition through short messages
   and meaningful visuals; do not produce a generic carousel of text cards.
2. Do not invent another palette/logo, generated portraits, orbiting actors, fake
   retrieval/thinking, or an animation wait before a usable control. Purposeful
   motion is interruptible, reduced-motion-safe, and never domain progression.
3. Provide Back, Continue, Skip, and understandable position/progress. No automatic
   timer advancement or forced reading duration. Hide competing nav/HUD behind the
   introduction; support keyboard, screen reader, mobile, text zoom, and focus.
4. Preserve the intended destination for direct/deep links. Intro acknowledgement
   does not complete a creation/turn/closing step. Do not repeat the introduction
   on ordinary soft navigation or every turn restart; provide a deliberate revisit.
   Do not introduce new persistent tutorial state without an explicit decision.
5. T09: session success alone is insufficient when required safe-config metadata
   failed. Distinguish loading from independent metadata failure, expose retry,
   preserve pinned package identity and requested destination, and never leave the
   board indefinitely displaying Loading. Session failure recovery still works.
6. Use the existing guidance owner, not a competing tour state machine. Expand
   meaningful coverage to overview/setup, meeting lists, room, personas, prompt
   history, stacks/documents, and settings. Explain value and consequences, not
   merely the label of the next button. Specs 42/43 supply their phase/sample steps.
7. Keep contextual guidance hideable/resumable and suspend it during blocking
   dialogs/streaming where appropriate. No mandatory evidence/tab acknowledgement
   after each turn; optional exploration is not a hidden completion requirement.
   Progress observes real reads/results, never route rendering or timers.

## Local acceptance

- Resolve D01 and review the actual bite-sized script/composition in both themes.
- Initial load, required-metadata failure/retry, deep link, Skip, Back, revisit,
  soft navigation, refresh, restart, and full reset follow the agreed entry policy.
- No interface flash with competing HUD; no missing destination or fake meeting
  progress. Metadata retry cannot mix package versions or reset unrelated work.
- Every retained screen has useful guidance or a documented deliberate exception;
  later Specs 42/43 complete their integrated coverage before Spec 46 acceptance.
- Test focus, screen-reader order, reduced motion, mobile/small laptop, and zoom;
  no timer-driven advancement or new persistent demo state.
