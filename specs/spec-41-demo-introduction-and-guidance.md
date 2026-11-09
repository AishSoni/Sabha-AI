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

## Design addendum: a dark-first spatial introduction (2026-11-09)

Status: approved design direction for subsequent implementation. This addendum
is documentation only; the implementation and verification record above describes
the earlier version, not completion or testing of this redesign.

This section supersedes the earlier introduction's step order, wording, visible
branding, static visual compositions, and standalone entry-loading presentation.
It does not supersede the existing demo stages, recovery guarantees, guidance
ownership, acknowledgement policy, or isolation of practice from meeting progress.

### Primary reference and design intent

Use [Cosmic Trail](https://cosmic-trail.vercel.app/) as the primary spatial and
atmospheric reference, with [DepthGallery](https://tympanus.net/Tutorials/DepthGallery/)
as the supporting reference for the flowing line and depth-linked transitions.
Stay close to their spacious, continuous journey rather than putting a decorative
background behind a conventional four-slide onboarding carousel.

Preserve the references' negative space, deliberate depth placement, enveloping
colour changes, and continuity between moments. Replace their photographs and tiny
gallery captions with Sabha's participant/content cards and prominent, readable
typography. No reference photographs, videos, site navigation, credits, analytics,
or debug UI belong in the introduction. Retain applicable licence notices if
reference source code is adapted.

The governing hierarchy is **headline and cards first; colour second; stars and
line third**. Atmosphere should be strong without becoming something the user
must study. The user should understand each idea at a glance.

### Art direction and typography

- Design dark-first, beginning in the homepage's near-black violet world. Entry
  should feel like going further into the homepage, not arriving at another site.
  Dark-first applies to the whole journey, not merely the first screen.
- Give each stop a distinct, rich, full-screen colour environment. Violet → deep
  cobalt → muted rose → warm amber-violet is a starting palette study, not an
  approved set of final colours. Art-direct endpoints and intermediate blends;
  avoid muddy transitions, a cream/daylight opening, or almost-black screens with
  only faint coloured corners. Harmonize these environments with existing Sabha
  materials rather than inventing a replacement brand palette.
- Dark-first is the primary design target, not permission to overwrite an explicit
  appearance preference or change application-wide theme persistence. Preserve
  existing appearance controls and provide a deliberately composed light
  counterpart; the opening must match the homepage's effective appearance.
- Use the established Satoshi family and weights: 700 for display headlines, 600
  for meaningful card labels, and 400–500 for supporting text and controls. Follow
  the homepage's approximately 34–72px responsive display scale, tight tracking
  (around -0.04em), and compact leading (around 1.02), adapting for actual line
  breaks and zoom. Do not simply retain the smaller intro page-title treatment.
- Headlines should usually occupy one or two lines at desktop size. Supporting
  copy is one short passage, not a second explanation of the visual. Never shrink
  essential text into the reference's tiny caption treatment to preserve layout.
- Our familiar sigils, distinct participant identities, and violet card materials
  replace the reference's image planes. Cards are the content, not an enclosing
  presentation panel. Avoid nested boxes, generic dashboard mockups, repeated
  text-left/visual-right templates, and generated portraits.
- No Sabha logo, brand header, tagline, competing workspace navigation, or tutorial
  HUD is visible during the introduction. Necessary controls and progress remain
  legible and subordinate at the lower composition edge, not hidden or hover-only.

### Four moments and copy baseline

The sequence is now **the idea → the value → what to try → the example**. The
example is last, immediately before entry. Use the following concise copy baseline
and communicate the remaining meaning through the card compositions.

| Moment | Headline | Supporting copy | Visual job |
| --- | --- | --- | --- |
| 1. The idea | **One question. Different minds.** | You direct the meeting. Choose which AI speaks next. | Three distinct participant cards relate to one shared question; establish different AI perspectives and the user's ability to choose. |
| 2. The value | **See where they disagree.** | Compare arguments. Inspect sources. Keep the outcome. | Relate two contrasting positions to a source and an outcome; make disagreement inspectable rather than presenting a feature list. |
| 3. What to try | **Choose. Question. Explore.** | Choose who speaks, open a source, and ask a follow-up. | Compose a compact speaker/source/follow-up example, not another paragraph or numbered checklist page. |
| 4. The example | **Clear facts. Different judgments.** | Explore an HDFC bond review from 2020. | Pair the dated fact sheet with three viewpoints, distinguishing checkable terms from judgments and open questions. |

On the final moment, retain the small, readable qualifier **Historical example ·
Not investment advice.** Use the contrast between dated facts and differing
judgments to explain why this example is useful, without requiring finance
expertise or suggesting Sabha is finance-only. Do not foreground coupon/ISIN/rating
jargon or repeat investment disclaimers throughout the journey.

Do not call the user a **director** or assign that title to a visual node. The
plain-language explanation **you direct the meeting** is intentional. Do not
introduce replay-package terminology or technical playback explanations into the
intro or entry-status copy. This copy restriction does not authorize false claims
of live generation or removal of necessary factual disclosures elsewhere.

Visual snippets must use actual applicable meeting/source content when presented
as quotations or facts. Otherwise make their illustrative nature clear. Do not
invent participant quotations, citations, financial claims, consensus, or outcomes
for visual effect. Existing contextual guidance continues to cover the shared fact
sheet, disagreements, resulting research checklist, personas, prompt history,
knowledge stacks, and settings; short intro copy does not remove that coverage or
make optional exploration mandatory.

### Continuous space, starfield, and flowing line

The atmosphere is a **coded, colour-shifting starfield**, not a nebula. No cloud
layers, smoke, dust lanes, procedural cloud generation, photographs, or video are
required. Broad tonal variation is acceptable without recognizable cloud/blob
shapes or elaborate background textures.

- Place sparse stars at several stable depths. Perspective should produce gentle
  differences in movement, apparent size, and brightness; avoid warp-speed streaks,
  hyperspace effects, flashing, or large stars crossing the reading area.
- Tie star positions and camera depth to journey position, not continuous forward
  travel or random regeneration. Back retraces the same space. Fade/cull nearby
  stars before they become large distracting discs.
- Preserve the little animated line crossing the scene. It is one thin, softly
  illuminated curve with a leading tip and tapered, fading tail, travelling through
  open space around the cards rather than through readable text.
- The line, starfield depth, card movement, and colour blend follow one shared
  transition progress. The line responds to direction, reverses naturally with
  Back, and remains continuous when motion is interrupted. It settles with the
  scene instead of looping for attention.
- The line expresses movement through the introduction, never AI thinking,
  retrieval, loading progress, agreement, or an action performed in the meeting.
- Use brief depth travel between four readable stops. Compositions resolve and
  settle so users can read; no automatic advancement or idle forward camera drift.
  Preserve continuity without giant outgoing cards obscuring incoming content.
- Keep essential headings, card text, and controls as semantic HTML. They must not
  become tiny receding labels or text rasterized into a canvas texture.

Continue and Back provide dependable step navigation. Wheel/touch movement may
support the spatial experience, but is not the only way to advance and must not
copy the reference's unrestricted global input interception. It must not consume
scrolling needed for small-screen/zoomed content or disrupt focus and native
controls. All input methods address the same four moments; no second navigation
or tutorial state machine is introduced.

### Homepage departure and readiness handoff

Remove both standalone pre-introduction loading screens: **Loading demo** and
**Loading demo details**. Do not replace them with another interstitial spinner.

For normal activation of the homepage **Try the demo** link:

1. Start session acquisition immediately on activation. Once the session is
   available, fetch and validate its required safe-config metadata using the same
   pinned identity and initial checkpoint.
2. Run the existing homepage CTA departure treatment while those requests proceed.
   Extend it with a purposeful pending phase if necessary. Merely increasing the
   existing 1050ms timeout is insufficient: its one-shot arrow disappears before
   the timeout ends, leaving a blank glowing button.
3. Hold the existing departure transition on the homepage until both results are
   valid and ready. No generic spinner, fabricated percentage, simulated work, or
   artificial minimum loading period. Finish the departure and navigate only once
   readiness is achieved; do not navigate first and then perform those requests.
4. Hand the ready session and metadata to the demo entry without refetching them,
   selecting another session, or introducing an intermediate loading flash. Keep
   this handoff ephemeral/in memory; do not add browser or server persistence.

Keep recovery truthful and scoped. Session failure offers retry on the homepage;
metadata-only failure retries metadata for the same pinned session rather than
calling the session endpoint again. Restore usable interaction on failure, show a
concise inline explanation, and do not leave the departure animation stuck
indefinitely. Internal package/version/hash integrity remains mandatory even
though technical package terminology is absent from product copy. Guard against
duplicate activation, stale results, abandoned requests, and retry races.

Reduced motion still gates navigation on API readiness, without requiring the
departure animation. Preserve ordinary modified-click/new-tab link behavior.
Direct URLs, new tabs, refresh, and deep links cannot rely on a homepage handoff:
acquire the same required data inside an intentionally composed entry shell with
the same atmosphere and stable geometry, honest pending/error status, and scoped
retry. Do not resurrect the two standalone loading cards or expose incomplete
workspace content. Intro acknowledgement, Skip, or Escape never bypasses readiness.
The decorative renderer must not become another prerequisite for entry.

### Implementation boundaries and retained behaviour

The recommended lightweight structure is **CSS colour environments → transparent
Canvas2D stars and line → HTML cards, wording, and controls**. No new Three.js,
GSAP, Motion, shader framework, or rewrite of the homepage renderer is required by
this design. Treat that as the preferred approach, not a verified performance
claim. If a different renderer is proposed, justify it against the same result
and constraints rather than importing the reference's entire application.

Use stable seeded positions, timestamp-based animation, bounded pixel resolution
and star density, and cached drawing primitives where useful. Avoid per-star
expensive blur, unbounded device-pixel-ratio scaling, per-frame React state, or
accumulated opaque canvas trails that mask the changing CSS background. A bounded
redrawn tail and prepared colour layers are sufficient starting techniques.
Pause hidden work, avoid jumps after resuming, release resources on unmount, and
stop redrawing settled scenes. Provide the same readable composition if canvas
is unavailable; rendering must never block the controls.

Keep `DemoIntroProvider` authoritative for intro state; rendering interpolates
presentation only. `DemoTutorialProvider` remains the sole contextual guidance
owner. Keep the existing sessionStorage acknowledgement key and its exact
refresh/soft-navigation/revisit/restart/reset semantics. A revisit must not remount
the workspace or discard drafts/playback/practice state. Keep intended URLs,
chapter deferral, focus restoration, modal isolation, and the existing
overview → setup/create → open-room journey. **Enter the demo** does not jump
directly into a meeting or complete any domain objective.

Preserve Back, Continue, Skip introduction, Enter the demo, Escape behaviour, and
understandable `Step N of 4` progress. No animation wait, forced reading duration,
or transition lockout may delay usable controls. Reduced motion removes depth
travel, parallax, and the travelling trail while preserving content and state;
use static compositions or an appropriately restrained transition. Decorative
canvas is non-interactive and hidden from assistive technology. Maintain readable
contrast in every colour environment, keyboard operation, meaningful screen-reader
order, focus handling, small-screen scrolling, and 200% zoom reflow.

### Addendum acceptance and implementation handoff

The subsequent implementation must demonstrate:

- A continuous Cosmic Trail-like experience, not four conventional slides with a
  starfield behind them; dark-first homepage continuity and strong full-screen
  colour changes, with no visible logo/header or competing HUD.
- Satoshi display typography and familiar Sabha cards visibly dominate; all four
  moments follow the new order/copy baseline without dense explanations, director
  titles, package jargon, fabricated evidence, or cloud/nebula effects.
- Sparse perspective stars and the crossing, tapered line follow shared progress;
  forward/backward and interrupted transitions remain coherent and settle to read.
- Homepage success, slow-session, slow-metadata, failure, scoped retry, reduced
  motion, and repeated-click cases: no early navigation, duplicate session,
  refetch/loading flash after handoff, mixed identity, or permanently stuck CTA.
- Direct entry, new tab, refresh, and deep-link pending/error recovery use the
  composed entry shell, preserve the destination, and retain independent metadata
  retry. Neither old loading screen returns.
- All existing acknowledgement/reset/revisit and no-fake-progress guarantees still
  hold; optional guidance remains under its existing owner.
- Actual browser review on small laptop and mobile, both appearances, keyboard,
  screen-reader order/focus, 200% zoom, reduced motion, and renderer fallback.
  Profile motion and idle cost on representative devices; Canvas2D alone is not
  evidence of acceptable performance. Review intermediate colour blends too.

Update intro/loading tests and visual acceptance evidence to match this addendum
when implementation occurs. The earlier passing test counts are historical and
must not be cited as verification of this design. No implementation work or new
verification is recorded by approval of this addendum.
