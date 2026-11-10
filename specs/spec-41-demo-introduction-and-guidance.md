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
   **Navigation superseded by the design addendum:** scrolling replaces visible
   Back/Continue buttons; retain the other accessibility and escape guarantees.
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
branding, button-based step navigation, static visual compositions, and standalone
entry-loading presentation.
It does not supersede the existing demo stages, recovery guarantees, guidance
ownership, acknowledgement policy, or isolation of practice from meeting progress.

Navigation correction (2026-11-10): scrolling is the primary interaction and the
continuous driver of the transitions, as in the references. The earlier wording
in this addendum that retained Back/Continue buttons and made scrolling optional
was incorrect; the scroll-driven requirements below replace it.

Renderer and source-study correction (2026-11-10): **the normal-motion experience
uses Three.js/WebGL, not Canvas2D**. Both references build their depth with a
perspective camera, spatial gallery planes, shader backgrounds, and a mesh trail.
The earlier Canvas2D/CSS-only recommendation and requirement for a native vertical
scroll surface were unsupported simplifications. The source-grounded requirements
below replace them; the static accessibility/failure fallback is not the target
visual implementation.

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

### Source findings that govern the adaptation

The study covers Cosmic Trail's deployed
[JavaScript](https://cosmic-trail.vercel.app/assets/index-Dco8YSdU.js) and
[CSS](https://cosmic-trail.vercel.app/assets/index-CiA9Sm49.css), plus DepthGallery

| Mechanic | Cosmic Trail | DepthGallery | Consequence for Sabha |
| --- | --- | --- | --- |
| Input and camera | Page overflow is hidden. Wheel/touch input changes a bounded target Z; the perspective camera eases toward it. Actual plane Z positions are `-index * 5`, overriding the Z values in the entry data. | `Scroll.js` normalizes wheel units, accumulates target input, smooths current input, clamps both, and derives camera Z and signed velocity. | Use a continuous, bounded virtual depth journey, not native page scrolling or a wheel-to-next-slide controller. Bounds follow the actual scene layout. |
| Spatial composition | Nine image planes have authored X/Y offsets and perspective scale; the next plane can already be visible in the distance. Planes also have slight time-based vertical float. | `Gallery.js` places planes at fixed depth intervals, compresses horizontal spread on mobile, and adds separately smoothed pointer parallax and velocity-driven drift/breath. | Author positions, scale, visibility, and reading windows in space. Do not replace the gallery with four fixed screen layouts that merely crossfade. |
| Visibility | Image opacity depends on camera distance, fading out around passage through the plane; HTML captions have a separate proximity gate. | `getPlaneBlendData()` samples ahead of the camera; adjacent planes crossfade. Labels select the nearer member of that blend. | Separate physical placement, visual visibility, and semantic active-moment selection, but derive all three from the same camera. No inherited opacity constants or arbitrary step-index switches. |
| Colour | A full-screen fragment shader interpolates three nine-entry colour arrays from continuous camera progress: base colour plus two broad moving colour fields. | `getMoodBlendData()` blends per-plane base/field colours using a configurable camera sampling offset; the background also responds to depth and smoothed velocity. | Preserve continuous, multi-channel colour choreography, including its alignment with the approaching composition. A uniform tint behind a slideshow is not equivalent. |
| Trail | Points are laid ahead of the camera toward the approaching plane. A smoothed point history becomes a tapered 3D tube, with a particle wake. Reverse movement removes history rather than replaying an identical line. | `TrailController.js` authors a progress-dependent XYZ head path; length and edge opacity vary with progress. Reversal resets/reseeds the trail and shortens its history. `Trail.js` builds a spline-based tapered mesh. | Keep a spatial head, curved mesh, and history-sensitive wake. Use DepthGallery's explicit reversal handling rather than promising an exactly reversible 2D stroke. |
| Text | Captions are actual HTML attached to scene anchors through `CSS2DRenderer`. | `Label.js` maintains a fixed HTML overlay, changing content only when the active plane changes. | Keep essential text as semantic DOM, coordinated with the WebGL scene. `CSS2DRenderer` is not Canvas2D and does not render the gallery, background, or trail. |

Reference values describe the inspected code, not Sabha tuning targets. The
references do not supply the requested sparse ambient starfield: Cosmic Trail's
particle wake and photographic skies are not a substitute for one. Their global
listeners, tiny captions, arbitrary random sizing, frame-dependent easing, and
debug/asset-loading scaffolding are not requirements to copy.

### Art direction and typography

- Design dark-first, beginning in the homepage's near-black violet world. Entry
  should feel like going further into the homepage, not arriving at another site.
  Dark-first applies to the whole journey, not merely the first screen.
- Give each moment a distinct, rich, full-screen colour environment. Violet → deep
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
  HUD is visible during the introduction. A restrained initial scroll cue and
  non-interactive journey progress can explain navigation. Skip introduction and
  the final Enter the demo action remain legible and subordinate, not hidden or
  hover-only. Do not add visible Back/Continue buttons or a pagination bar.

### Four moments and copy baseline

The sequence is now **the idea → the value → what to try → the example**. The
example is last, immediately before entry. Use the following concise copy baseline
and communicate the remaining meaning through the card compositions.

| Moment | Headline | Supporting copy | Visual job |
| --- | --- | --- | --- |
| 1. The idea | **What if you hold a meeting and see different sides of the coin?** | You direct the meeting. Choose which AI speaks next. | Three distinct participant cards relate to one shared question; establish different AI perspectives and the user's ability to choose. |
| 2. The value | **See which findings agree with the story & which *don't*.** | Compare perspectives. Inspect sources. Keep the outcome. | Relate two contrasting positions to a source and an outcome; make disagreement inspectable rather than presenting a feature list. |
| 3. What to try | **Choose with lead to pursue using turns.** | Choose who speaks, open a source, and ask a follow-up. | Compose a compact speaker/source/follow-up example, not another paragraph or numbered checklist page. |
| 4. The example | **Let's say you wanted to analyze something complex? Like *a corporate bond*** | Explore an HDFC bond review from 2020 in this demo. | Pair the dated fact sheet with three viewpoints, distinguishing checkable terms from judgments and open questions. |

On the final moment, retain the small, readable qualifier **Historical example ·
Not investment advice.** Use the contrast between dated facts and differing
judgments to explain why this example is useful, without requiring finance
expertise or suggesting Sabha is finance-only. Do not foreground coupon/ISIN/rating
jargon or repeat investment disclaimers throughout the journey. Any such disclaimers should be placed on the bottom corners.

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

### Required WebGL scene and spatial choreography

Build one persistent **Three.js/WebGL perspective scene** for the open
introduction. The camera travels through four authored compositions. The cards
are spatial objects, not four full-screen slides animated with CSS scale to
suggest depth. Retain the references' approach → readable foreground → passage
and fade, with an upcoming composition discernible in the distance.

- Define each composition's XYZ anchors, dimensions, reading distance, visibility
  range, and colour sampling range as presentation data. Card surfaces and sigils
  occupy that space; project their semantic HTML content from the same camera.
  Perspective, camera-relative distance, and clipping determine apparent size and
  position, not unrelated per-step animation timelines.
- Do not put every card in a flat row or reuse one text-left/visual-right layout.
  Give the first moment a shared-question/participant cluster; the second a
  separated pair of contrasting positions with their evidence relationship; the
  third a closer speaker/source/follow-up composition; the fourth a dated central
  fact sheet with viewpoints around it. These are the visual jobs in the copy
  table, not miniature dashboard screenshots or additional onboarding screens.
- Compose the large Satoshi headline and short supporting passage in the negative
  space of each moment. Their HTML presentation follows that moment's camera
  range while remaining readable at foreground size. Do not copy the reference's
  8px captions or scale whole passages from illegible specks to enormous text.
  Distant previews may show card silhouettes/sigils without requiring their text
  to be read. Avoid simultaneous competing headlines.
- Author readable camera-distance windows rather than requiring a precise stop.
  Incoming cards grow into view as the camera approaches; outgoing ones fade
  before near-plane enlargement or overlap obscures the next message. Visibility
  must distinguish objects ahead of and behind the camera, not just absolute
  distance. Never let a passed card cover the next scene's text.
- Keep physical depth, opacity windows, active-moment selection, and colour lookup
  aligned through a documented camera sampling offset. The reference's one-gap
  look-ahead exists because the readable plane is ahead of the camera; sampling
  an integer step index independently would put the wrong colour/copy on screen.
- Use responsive scene layouts: reduce horizontal spread, adjust camera framing
  and card dimensions, and protect type at narrow widths. Do not merely shrink
  the desktop world until text fits. Resize/reflow must preserve journey position
  and keep the current composition accessible.

There is no automatic forward camera travel, timed advancement, or mandatory
snap. On input release the camera eases toward its existing target and stops
there, including between moments. Subtle bounded float or pointer response may
remain, as in the references, but it must not move the reading target or compete
with the headline. Velocity-driven responses decay when travel stops. Reduced
motion removes these effects rather than only slowing the camera.

### Shader colour environment and coded starfield

Use a full-viewport **shader background**, coordinated with the perspective scene.
Each moment defines a base colour and two complementary broad colour fields.
Interpolate all three channels continuously from camera depth, including the
approach to the next composition; do not switch a single CSS background at an
active-moment threshold. The reference's broad soft fields create enveloping
colour without needing a volumetric effect. Art-direct their placement and
movement so the entire screen changes character while text contrast stays stable.
Any velocity-based luminance/strength response must be restrained and must not
wash out the midpoint of a transition.

This is a **coded, colour-shifting starfield**, not a nebula. Soft colour fields
are allowed; recognizable clouds, smoke, dust lanes, procedural cloud simulation,
elaborate cloud textures, photographs, and video are not part of this direction.
Do not port Cosmic Trail's unused noise functions or treat its grain as a cloud
system. Fine grain is optional surface treatment, not a replacement for stars or
a required animated full-screen texture.

Place sparse, seeded stars in the WebGL world using a bounded point buffer and
perspective-aware point rendering. They share the camera with the cards, not a
separate screen-space star animation. Stable XYZ positions give coherent parallax,
size, and brightness changes; reverse scrolling returns through the same field.
Fade/cull stars at the near plane and keep the headline/card reading areas quiet.
No warp-speed streaks, large white discs, flashing, random reseeding on input, or
constant forward star travel. The starfield is an addition to the references, not
an excuse to flatten their gallery depth.

### Spatial flowing trail

Retain the little illuminated line crossing the scene as a **thin WebGL curved
mesh with a spatial head and a tapered wake**. It must inhabit the camera journey,
not be an SVG flourish, cursor follower, screen-space progress line, or a separate
animation played once per moment.

- Author a head path ahead of the camera that leads through the open space toward
  the approaching composition. DepthGallery's progress-driven XYZ path is the
  starting model; account for Sabha's actual card and text bounds rather than
  copying its sine amplitudes. The head's Z relation to the camera is essential
  to how the line crosses and recedes through the scene.
- Sample and smooth a bounded history of spatial head positions, form a smooth
  spline, and render its tapered tube/ribbon in the same perspective scene.
  Material colour, emission, width, history length, and edge opacity are
  art-directed together against each colour environment. Keep the result fine
  and legible, not a thick glowing cable. A particle wake is optional and must
  not turn into a second starfield or obscure the cards.
- Handle direction reversal explicitly. Reseed/trim and shorten the wake so it
  turns naturally without connecting old and new points into a long diagonal or
  tangled loop. The camera, card positions, and palette retrace their spatial
  mapping; the history-dependent trail need not reproduce identical pixels.
- Initial seeding and start/end fades should avoid an abruptly appearing or
  abruptly severed line. Continue sampling during camera easing, not only during
  wheel events. At rest the trail must not keep drawing a new forward journey;
  any remaining movement or wake decay stays subordinate to reading.
- The line never crosses essential foreground text or actionable controls. This
  is a deliberate presentation-layer constraint: do not assume the reference's
  depth settings automatically provide it. It expresses travel through the intro,
  never AI thinking, retrieval, API loading, consensus, or meeting progress.

### Scroll-driven interaction

Scrolling is essential to the experience, not an optional enhancement. Wheel,
trackpad, and touch scrolling move through a continuous spatial journey. Scroll
distance determines the card transforms, camera depth, colour blend, and line
position together. Do not convert a wheel gesture into a Next/Previous command or
trigger a fixed-duration slide animation when a threshold is crossed. Do not use
mandatory scroll snapping to turn the journey back into four discrete pages.

Use a **bounded virtual scroll controller scoped to the open introduction**.
Its data flow is normalized input → accumulated target distance → eased current
distance → camera Z. Derive journey progress and signed travel velocity from that
same current distance. Clamp target and current distance against the first/last
authored viewing positions, so overscroll cannot create hidden input debt or an
empty end of the gallery. Normalize pixel/line/page wheel units and touch drag
direction; match wheel, trackpad, and swipe direction rather than inheriting
Cosmic Trail's inconsistent keyboard signs or Home/End mapping. Use time-based
damping so response does not change with display refresh rate.

Bind input only while the intro is active and release it on dismissal. Do not
copy unrestricted window listeners or global body styles into the application.
Preserve pinch/browser zoom, focused controls, and native scrolling inside any
content that needs it. If viewport size or zoom makes the spatial reading layout
unusable, provide the same ordered HTML compositions in normal document scroll
rather than trapping the user in a fixed canvas. This is an accessibility
adaptation, not a replacement for the intended WebGL journey at normal settings.

Keyboard arrows and Page Up/Page Down adjust the same target distance; Home goes
to the start and End to the final reading position without entering the demo.
Do not use separate key-triggered slide transitions. Preserve Tab access to
actual actions and native keys in focused controls. Screen-reader content remains
in meaningful document order with all four moments available without operating a
canvas. Offscreen visual previews must not create invisible focus targets or
duplicate accessible text. Do not move focus on every scroll update or announce
every animation frame.

Journey progress reflects scroll position; an active-moment label is derived from
the readable regions, not a separate navigation state. Scrolling to the end does
not automatically dismiss the introduction or advance the meeting: the final
Enter the demo action remains explicit. Skip introduction is an escape from the
journey, not a replacement for scrolling through it.

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

The required structure is **a full-screen WebGL shader background → a Three.js
perspective scene containing card/sigil surfaces, stars, and the trail → coordinated
semantic HTML typography, card content, and controls**. Render the background
without writing scene depth, then the perspective content, then the DOM overlay.
Layering must preserve both spatial coherence and unobstructed essential text.
Do not substitute Canvas2D or CSS-only faux depth for this normal-motion path.

Isolate the renderer and scroll controller in the intro's client-side feature.
Three.js is not currently a frontend dependency; subsequent implementation must
add it explicitly. React Three Fiber, GSAP, Motion, a shader framework, and a
rewrite of the homepage's separate raw-WebGL renderer are not prerequisites.
Do not import either reference's whole app, debug panels, photography, particle
textures, or global event/lifecycle scaffolding. Retain the MIT notice for adapted
DepthGallery source; do not assume that licence covers Cosmic Trail's deployed
bundle or its assets.

Keep essential text out of GPU textures. Project semantic DOM anchors/bounds from
the actual camera and viewport so type remains selectable, accessible, and
aligned with the card surfaces. Cosmic Trail's `CSS2DRenderer` demonstrates HTML
anchoring, not perspective-scaled HTML cards. The Three.js CSS2D/CSS3D renderer
documentation limits their zoom support to 100%; copying either unmodified does
not satisfy this spec's 200% zoom requirement. Use a zoom-aware DOM projection or
the explicit reflow adaptation above, and verify it in the browser.

Use timestamp-based damping, bounded drawing-buffer resolution and star density,
reused geometry/buffers, and explicit ownership/disposal of GPU resources. The
reference rebuilds its tube geometry after point updates; preserve its curved
spatial result without requiring its allocation pattern or its arbitrary segment
counts. Avoid per-frame React state, unnecessary material recompiles, expensive
per-star blur, and unrestricted device-pixel-ratio scaling. Pause hidden work,
reset frame timing on return, and stop rendering once easing/wake effects have
settled unless a deliberately budgeted ambient effect remains. Any ambient loop
must be justified by visual review and profiling, not inherited accidentally.

Handle WebGL unavailability and context loss with the same ordered, readable HTML
compositions and normal scroll access. Controls and acknowledgement remain
operable; renderer initialization/restoration is never an entry-readiness gate.
This fallback does not authorize silently delivering a 2D approximation as the
primary experience. No performance claim is verified by choosing WebGL alone.

Keep `DemoIntroProvider` authoritative for intro lifecycle and acknowledgement.
Within that lifecycle, continuous scroll position drives the presentation and
determines the active moment; do not make the existing discrete step buttons or
step index drive the animation. This remains one intro experience, not a second
navigation or tutorial state machine. `DemoTutorialProvider` remains the sole
contextual guidance owner. Keep the existing sessionStorage acknowledgement key
and its exact refresh/soft-navigation/revisit/restart/reset semantics. A revisit must not remount
the workspace or discard drafts/playback/practice state. Keep intended URLs,
chapter deferral, focus restoration, modal isolation, and the existing
overview → setup/create → open-room journey. **Enter the demo** does not jump
directly into a meeting or complete any domain objective.

Retain Skip introduction, the final Enter the demo action, Escape behaviour, and
understandable, non-interactive journey progress. The old requirement for visible
Back/Continue buttons is superseded. No animation wait, forced reading duration,
or transition lockout may delay scrolling or usable actions. Reduced motion keeps
the same content order and scroll access but removes depth travel, parallax, and
the travelling trail; use readable, normally scrolling static compositions or an
appropriately restrained presentation, not a button-only replacement. Decorative
canvas is non-interactive and hidden from assistive technology. Maintain readable
contrast in every colour environment, keyboard operation, meaningful screen-reader
order, focus handling, small-screen scrolling, and 200% zoom reflow.

### Addendum acceptance and implementation handoff

The subsequent implementation must demonstrate:

- A continuous Cosmic Trail-like experience, not four conventional slides with a
  starfield behind them; dark-first homepage continuity and strong full-screen
  colour changes, with no visible logo/header or competing HUD.
- A real WebGL perspective scene: camera travel through authored XYZ card/sigil
  placements, coordinated HTML type, shader colour environments, perspective
  stars, and a spatial mesh trail. A Canvas2D background, CSS-scale slideshow, or
  WebGL canvas used only for decoration does not satisfy this requirement.
- Wheel, trackpad, touch, and keyboard input drive one bounded target/current
  camera journey. Partial input gives partial travel; reversal returns through
  the same spatial composition and palette; input release eases to the existing
  target without snapping. Test bounds, overscroll reversal, input-unit/sign
  normalization, and different refresh rates. No visible Back/Continue buttons,
  wheel-to-next-slide substitution, mandatory snapping, or automatic end navigation.
- Satoshi display typography and familiar Sabha cards visibly dominate; all four
  moments follow the new order/copy baseline without dense explanations, director
  titles, package jargon, fabricated evidence, or cloud/nebula effects.
- At the start, each foreground reading window, intermediate approach/passage
  positions, and the end: type/card alignment, near-plane fades, distant previews,
  active copy, and all three shader colour channels remain coherent. Review slow
  scrubbing as well as fast input; no giant outgoing card, competing headline,
  blank composition, or washed-out colour midpoint.
- Sparse seeded stars and a crossing curved mesh trail share the camera journey;
  head placement, bounded history, reversal/reseeding, start/end fades, and motion
  after input release are reviewed. No text/controls are crossed, no tangled
  reversal connection, and no trail presented as loading or AI activity.
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
  Profile GPU/drawing-buffer cost, frame pacing, allocation and idle work on
  representative devices; verify context-loss fallback and cleanup after repeated
  open/close/revisit. Choosing WebGL alone is not evidence of acceptable performance.

Update intro/loading tests and visual acceptance evidence to match this addendum
when implementation occurs. The earlier passing test counts are historical and
must not be cited as verification of this design. No implementation work or new
verification is recorded by approval of this addendum.

## Addendum implementation record (2026-11-11)

Status remains a working draft: local implementation and verification are
complete; hosted acceptance remains outstanding.

### Intro journey and wording

The introduction is now one continuous, scroll-driven Three.js journey rather
than four swapped slides. One bounded virtual-scroll controller, scoped to the
open dialog, accumulates wheel, trackpad, and touch input into a target camera
distance and eases the current distance toward it. Camera position, colour
blending, card depth, DOM projection, active moment, progress, and trail all
derive from that one distance. Arrow and Page keys move the same target;
Home/End move to the first/final reading position. There is no snapping,
auto-advance, idle travel, or automatic dismissal. The four moments are:

1. **One question. Different minds.** — *You direct the meeting. Choose which
   AI speaks next.*
2. **See where they disagree.** — *Compare perspectives. Inspect sources. Keep
   the outcome.*
3. **Choose. Question. Explore.** — *Choose who speaks, open a source, and ask
   a follow-up.*
4. **Clear facts. Different judgments.** — *Explore an HDFC bond review from
   2020 in this demo.* — *Historical example · Not investment advice.*

The final qualifier is the only small footnote. There are no eyebrows, chip
labels, captions, logo, brand header, tagline, HUD, workspace navigation,
Back/Continue buttons, or pagination bar. Visible controls are limited to
`Skip introduction`, one hairline four-segment progress cue, and the final
`Enter the demo`. The whole lower rail rests at 10% opacity and reveals on hover
or keyboard focus; touch devices keep a usable resting opacity. The progress cue
is non-interactive and hidden from assistive technology; `Step N of 4` remains
available as screen-reader-only live text. Cards are bare typography with no
surface, border, radius, or shadow. They use the actual Mira, Arjun, and Leena
identities, the dated HDFC fact sheet, and role-appropriate questions. No participant quotations, consensus,
outcomes, citations, or financial claims are invented. Coupon, ISIN, and rating
jargon are deliberately absent.

`DemoIntroProvider` remains the lifecycle and acknowledgement owner and keeps
the existing `sabha.demo.intro.v1` tab-scoped key. Acknowledgement is read after
hydration and before paint, so the first render is dark-first in both server and
client. Revisit keeps the workspace mounted behind the modal; restart, reset,
refresh, soft navigation, deep links, Escape, focus restoration, and chapter
deferral keep their prior semantics. `DemoTutorialProvider` remains the sole
contextual-guidance owner. Entering the introduction never completes a meeting
objective.

### Entry readiness and handoff

`features/demo-entry` provides one shared loader for the replay session and its
safe config. It validates the pinned package identity, meeting, initial
checkpoint, and top-level board/intake metadata; applies a 20-second deadline;
and keeps the decoded session pinned when a metadata-only retry is requested.
The homepage CTA starts this acquisition immediately on plain activation while
the existing 1050 ms departure runs. Navigation waits for both the departure
and a valid handoff. A slow request shows one purposeful `Preparing the demo.`
status instead of a blank or stuck button; success stages an in-memory handoff
and navigates once. Failure stays on the homepage with a concise inline message
and scoped retry: session failure retries the session, while metadata failure
reuses the same session and never calls `/replay/session` again. Modified and
middle clicks remain native, reduced motion still gates navigation on readiness,
and duplicate/stale/abandoned requests are ignored.

`ReplaySessionProvider` is now non-blocking and renders its children while
session and safe-config status are derived from data. The in-memory handoff,
when present, is fully decoded before use; the workspace is mounted only when
both records are ready and is keyed by the decoded package identity. The old
standalone `Loading demo` and `Loading demo details` screens are deleted. Direct
entry, refresh, new tab, and deep links render a composed full-screen entry
shell with the same atmosphere and stable geometry, an honest pending/error
line, and a scoped `Try again`; the destination URL is preserved. The intro
acknowledgement, Skip, and Escape cannot bypass readiness. The decorative
renderer is never required for entry or retry.

### Spatial scene

The normal-motion scene renders a full-screen shader background first, clears
depth, then renders the perspective scene: seeded star points, distant card
plates, and one thin tapered spatial trail. Essential copy and card content stay
in semantic HTML and are projected from the same camera and authored anchors;
no text is baked into GPU textures. The four authored compositions use separate
copy and card coordinates, responsive mobile anchors, and distinct reading
windows. Outgoing cards fade before they can cover the next composition; card
plates are suppressed so only the active composition's bare semantic cards are
visible.

Dark-first palettes move through violet, deep cobalt, muted rose, and warm
amber-violet. Each has a deliberately composed light counterpart, and both are
applied through the existing appearance provider without persistence. Base
colour and two broad fields interpolate continuously from camera depth; there
are no clouds, nebula layers, photographs, or threshold colour switches.

Stars use a bounded seeded buffer in world space with stable positions, near
fade, quiet reading areas, and a DPR cap of 2. The trail is a thin mesh with a
spatial head, bounded history, and tapered wake; it is reseeded/shortened on
reversal, lives behind DOM content, and never represents loading, retrieval,
agreement, or AI activity. Rendering stops after the camera settles, pauses
while hidden, reuses scene resources, and disposes geometry, materials, and the
renderer on unmount. Context loss and WebGL initialization failure switch to the
ordered fallback.

### Fallbacks and accessibility

Reduced motion, WebGL unavailability, context loss, compact landscape, and
unusable text zoom use the same four moments in normal document scroll with
static colour fields and no depth travel, parallax, or travelling trail. The
fallback keeps the same headings, card content, order, Skip, and readiness-gated
Enter. The canvas is decorative, non-interactive, and hidden from assistive
technology. The dialog retains a Radix title/description, meaningful reading
order, native controls, visible focus, Escape handling, and focus restoration.
Small screens, 200% text, and both appearances keep readable type, no horizontal
overflow, and the controls at the lower composition edge.

### Verification performed

- Frontend full `npx vitest run`: 137 files, 849 tests passed in 38.21 s.
- `npx tsc --noEmit` passed.
- `npm run lint -- --quiet` reported 0 errors and the same 13 pre-existing
  warnings.
- `npm run build` passed with Next.js 16.1.4 and 20 static pages.
- Production Playwright acceptance (`npm run test:e2e:prod`): 84 tests, 80
  passed, 4 skipped, 0 failed in 2.2 m. The opt-in legacy-journey and
  mixed-operator cases remain skipped. Coverage includes the scroll journey,
  deep-link Skip, WebGL-unavailable fallback, context-loss fallback, reduced
  motion, mobile/keyboard/200% text, entry pending/error and metadata-only
  retry, homepage slow/failure/retry/reduced/repeated activation, appearance,
  guidance, evidence, replay isolation/resilience, and room geometry.
- The default demo guardrail still permits only the single tab-scoped intro
  acknowledgement key and rejects other browser persistence.
- Browser review at 1366x768 and 390x844, dark and light, confirmed one-line
  desktop headlines, two-line mobile headlines, no eyebrow/chip or card-surface
  remnants, richer saturated fields, a pronounced seeded starfield, visible
  four-point trail head, a composed light counterpart, and no horizontal
  overflow at 390 px.
- Chrome DevTools traces on the Three.js scene: a scrubbed forward/back
  transition recorded CLS 0.00 with no long-task or layout warning; a 3.2 s
  settled trace recorded no performance insight, consistent with rendering
  stopping after easing.
- `git diff --check` passed.

Known limits: no committed visual-regression baseline was added; screenshots and
traces are local review artifacts. Performance evidence comes from desktop
Chrome with DevTools, not a physical low-end or mobile GPU, and no standalone
heap-allocation profile was captured. Screen-reader checks use semantic markup,
the accessibility tree, and focus behavior rather than a dedicated screen-reader
session. Hosted acceptance remains outstanding.

Changes remain uncommitted.
