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

## Implementation record (2026-11-09)

Status remains a working draft: local implementation and verification are
complete; hosted acceptance remains outstanding.

### D01 disposition

The introduction has four approved steps:

1. **One director. Three expert minds.**
2. **Disagreement you can inspect.**
3. **A HDFC Bond Review Demo**
4. **What to try**

Acknowledgement is stored in `sessionStorage` under `sabha.demo.intro.v1`.
This is the only approved demo persistence: it is tab-scoped, survives a
refresh in that tab, and is discarded when the tab closes. No cookie,
`localStorage` entry, server write, or cross-session tutorial state was added.

The deliberate revisit entry is the **How this demo works** control in the demo
navigation. It opens the introduction at step 1 without remounting the
workspace. The initial load renders the introduction before any workspace
chrome; a revisit leaves the workspace mounted behind a modal, inert layer so
playback, drafts, and practice state survive.

`Skip introduction` acknowledges the intro and reveals the requested route.
`Back` is disabled at step 1; `Continue` advances; the final control is
**Enter the demo**. No timer advances the intro or delays a control. Escape
closes the modal and returns focus to the invoking navigation control.

An immediate **Reset demo** with no practice edits keeps the introduction
dismissed. A **Reset and discard changes** confirmation clears the
acknowledgement and reopens the introduction at step 1. **Restart demo**
remains playback-only and never reopens the introduction. Direct and deep
links keep their URL; `ChapterBootstrap` installs any requested chapter only
after the introduction is dismissed.

Intro acknowledgement does not mark `demo.intake`, settle an intent, complete
a turn, complete closing, or switch a checkpoint.

### Composition and accessibility

The introduction is one full-screen composition rather than a carousel of
cards. It reuses `SabhaMark`, abstract participant marks, the existing
Starfield, Satoshi type classes, semantic tokens, and solid material surfaces.
The four visuals are a static director/participant constellation, a meeting
record excerpt, a dated HDFC term sheet with explicit known/unknown rows, and a
short try-it checklist. There are no generated portraits, orbiting actors,
fake retrieval states, or new palette/logo.

The modal is built with the existing Radix dialog dependency. It provides a
dialog title, focus trap, Escape handling, and focus restoration. The heading
receives focus on open; the route's main region receives focus after first
entry; a revisit returns focus to the nav control. Step position is visible as
`Step N of 4` plus non-interactive dots. Controls are native buttons and render
before any transition. Reduced motion removes decorative transitions without
changing state or delaying controls. The layout stacks on mobile, scrolls
within the intro, and remains usable at 200% zoom. The title and body are the
accessible description; visuals use real text where the terms or checklist
carry meaning.

### T09 - required metadata recovery

`ReplaySessionProvider` now owns independent session and safe-config states:

- `safeConfigStatus` is `idle`, `loading`, `ready`, or `error`.
- `retry()` re-reads the session and resets metadata.
- `retrySafeConfig()` re-reads only safe config for the same pinned session.
- A metadata retry never calls `/replay/session` again, remounts the workspace,
  changes package/version/hash, or changes the URL.
- A 404 is reported as missing package metadata; transient failures use their
  scoped message. Neither is rendered as an endless board loading state.
- The board's own missing-board fallback now shows **Demo board unavailable**
  with retry instead of **Loading demo…**.
- Workspace seed loading remains independent and non-blocking for legacy
  packages. Session failure keeps its own **Demo unavailable** recovery.

### Contextual guidance

The existing `DemoTutorialProvider` and HUD remain the only guidance owner. No
second tour state machine was added. `TutorialPrompt` gained an optional
short consequence/detail line rendered in the floating card; inline room
strips omit it so the Spec 31 two-thirds discussion-height constraint is
preserved.

Screen guidance is selected by route and only replaces the main journey prompt
when the route is not the main-stage screen. After the journey is archived, the
outcome finale remains primary so optional tours still return to **Demo
complete**. Screen prompts carry no numeric progress and never complete an
objective. Coverage:

| Screen | Guidance |
| --- | --- |
| Board | Main start/create/open-room prompt, with the board/evidence consequence |
| Setup | Main create/open-room prompt, with practice-isolation consequence |
| Meeting list | Active/ended/archived meaning and archive consequence |
| Room | Existing speaker, follow-up, close, and vote prompts with detail in the card |
| Personas | Templates vs captured meeting participants |
| Persona detail | Standing prompt vs recorded snapshot |
| Prompt history | Earlier versions are inspection; activation affects future meetings |
| Knowledge stacks | Shared vs private scope; browser-state counts |
| Stack detail | Document revocation and unchanged recording |
| Settings | Operator-only providers and workspace lifetime |

Anchors were added for `meetings.list`, `screen.setup`, `settings.providers`,
and `settings.lifetime`; the existing `roster.persona` anchor is now registered
by the first roster card. Settings keeps its server metadata wrapper and moves
its client anchor sections into a client component. Hide/resume, modal and
streaming suspension, and optional tours are unchanged.

Local practice meeting rooms remain temporary Spec 43 surfaces. They are
deliberately excluded by the existing other-meeting route guard, so the
recorded journey's prompt never appears over a practice room; their own screen
copy remains the source of guidance until Spec 43 removes or replaces the
practice path. Roster and stack creation screens use the roster/knowledge screen
guidance while retained.

### Verification performed

- Frontend full `npm test`: 135 files, 839 tests passed.
- `npx tsc --noEmit` passed.
- `npm run lint` passed with 0 errors and the same 13 pre-existing warnings.
- `npm run build` passed with Next.js 16.1.4 and 20 static pages.
- Playwright default suite: 73 passed, 4 skipped (the legacy-package and mixed
  operator runs remain opt-in). Focused coverage includes the first-load intro,
  four-step navigation, Skip/Back/Enter, deep-link preservation, refresh,
  soft navigation, restart, immediate reset, confirmed reset re-entry, nav
  revisit with focus return, keyboard/mobile/zoom/reduced motion, required
  metadata failure/retry with one session read, missing metadata, and screen
  guidance on every recorded demo screen.
- The default demo E2E guardrail continues to reject browser persistence other
  than the single approved intro acknowledgement key.
- Spec 31 room geometry was rechecked after adding guidance detail: inline room
  strips remain at the previous height and the discussion viewport keeps at
  least two-thirds of the room work area.

Known limits: hosted acceptance remains outstanding. The v5 legacy journey and
mixed operator suite were not part of the default Playwright run; their package
and context paths were updated to seed the same tab-scoped acknowledgement.
Browser zoom is exercised through the existing CSS-pixel reflow and 200% intro
check; no separate visual-regression baseline was added.

### Commits

`3c152ea` metadata recovery; `882d7ed` four-step introduction; `f7d4c30`
workspace gate and revisit; `a911da4` screen guidance; `432a103` inline room
geometry; `c7fa5d1` E2E and integration coverage.
