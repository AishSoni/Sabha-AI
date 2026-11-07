# Spec 32: Constellation Homepage Experience

## Status and ownership

**Status: implemented and locally accepted on `ui-redesign` (2026-11-07).**

Depends on [Spec 31](spec-31-design-system-and-motion.md). Read
[Spec 33](spec-33-application-experience.md) for the real demo/operator
destinations. This document owns `/`: its four visible regions, both appearances,
brand assets, responsive composition, hero choreography, document constellation,
and homepage acceptance.

This revision replaces the earlier proposals. The Constellation-S logo is now
approved and implemented; the rotating second line is approved; the homepage no
longer owns appearance or motion controls; and the evidence graph, renderer,
density, and responsive behavior below describe the built experience rather than
an option for review. Exact values are recorded so later work does not have to
reconstruct them from code.

The local gates in §10 pass except for HP09's real-user/INP evidence, which is a
release-verification activity rather than outstanding implementation. Hosted
deployment, throttled field traces, screen-reader review, and physical-device
review are not claimed.

## 1. Experience and information hierarchy

The homepage communicates: **different AI perspectives, grounded in inspectable
sources, with the person choosing the direction**. It is an invitation to inspect
a prepared advisory meeting, not a claim of live autonomous research.

Hierarchy:

1. A stable invitation and an unmistakable recorded-demo action.
2. Distinct persona representations in a coherent surrounding field.
3. A legible explanation of the source/evidence relationship below the hero.
4. A quiet brand mark, operator access, and footer destinations.

The page has four visible regions: floating chrome, constellation hero, evidence
constellation, and footer. There are two semantic `<section>` elements inside
`<main>` (hero and evidence); chrome and footer are not additional sections.

No feature-card row, pricing, testimonials, fabricated customer logos,
newsletter, FAQ accordion, dashboard screenshot, or fifth region is included.
Cosmos's name, imagery, proprietary code, search input, app-download CTA, and QR
panel are not copied. The implementation is original and uses Sabha-authored
inline SVG.

## 2. Page anatomy and responsive frame

### 2.1 Chrome and the Constellation-S brand

The chrome is a floating absolute layer over the hero, not a sticky header. It
does not push the central composition down and does not become an opaque second
header on scroll. Its inner measure is `80rem` with normal Spec 31 gutters. The
only content is the brand link; there is no marketing navigation, appearance
menu, pause control, or duplicate demo CTA.

The approved brand replaces the former Sparkles placeholder everywhere the Sabha
brand appears:

- The mark is the supplied Constellation-S concept: three linked arcs, three
  nodes (plum, lilac, plum), and six small stars. It is an inline SVG with a
  `198 x 239` viewBox and no external image, `<use>` URL, raster fallback, or
  runtime color inversion.
- The wordmark reads **Sabha AI** in a heavy geometric sans at `700` weight,
  line-height `1`, and `-0.045em` tracking. The lockup is inline-flex with a
  `0.5em` gap; the mark height is `1.65em`.
- Light and night artwork are authored as separate SVG groups. CSS shows the
  appropriate group from the resolved theme rather than recoloring one group:
  explicit `data-theme` wins, and system dark applies only when no explicit
  light theme is set. Every lockup receives a unique gradient-ID prefix so two
  lockups on one page cannot collide.
- The mark itself is `aria-hidden`. The chrome link is named **Sabha home**. The
  footer lockup exposes **Sabha AI** as readable text. The wordmark is never
  re-created as an image.
- `frontend/src/app/icon.svg` is the 64px dark rounded-square app icon, using the
  night constellation. The former default `favicon.ico` was removed, so Next
  serves the SVG icon through `<link rel="icon">`.

The chrome link has a minimum `2.75rem` target. At text enlargement the lockup
grows normally with its font size. It remains legible over the field because the
mark and wordmark carry restrained shadows, not a glass capsule.

The demo CTA badge also uses the Constellation-S mark, forced to its night
variant so it remains legible on the badge's fixed violet gradient in both page
themes. There is no Sparkles brand mark. Sparkles remains only as a semantic
icon for tutorial, persona generation, and thinking states.

### 2.2 Section 1: persona-constellation hero

The hero is `<section class="home-hero" aria-labelledby="home-hero-title">`.
It has a minimum height of `100svh`, never a fixed clipping height. It uses
`padding: 6.75rem 1rem 5rem`; at `768px` and above the vertical padding becomes
`7rem` and `5.5rem`, and at `639px` and below it becomes `6rem` and `4.5rem`.
The hero owns the theme canvas, starfield, field, central content, and the bottom
anchor; the floating chrome sits above it.

Layer order:

1. Theme canvas and deterministic sparse starfield.
2. Persona field, softened through a measured central exclusion mask.
3. Stable central content and actions.
4. Floating brand chrome and the bottom evidence anchor.

The foreground is real server-rendered HTML and remains complete without
JavaScript, canvas, or fonts. The hero content is centered in a `75rem` measure.

| Region | Wide behavior | Compact behavior |
| --- | --- | --- |
| Foreground | Two-line title, action row, anchor | Full width with `16px` gutters; title can wrap, actions remain visible |
| Persona field | 189 rendered slots; the viewport reveals an elliptical subset | Same 189 slots, heavily cropped; no reduced density contract |
| Display text | `clamp(2.125rem, 3.6vw + 1.25rem, 4.5rem)`, line-height `1.02` | Fluid clamp continues; phrase may wrap at `<=639px` |
| Tail slot | Reserved `1.18em`; phrases do not move the CTA | Reserved `2.04em`; phrase may take two lines |
| Demo CTA | Shell `min(100%, 26rem)`; button min-height `4rem` | Shell `min(100%, 20rem)`; button min-height `3.5rem`; measured width is at least `288px` down to `320px` |
| Operator link | Quiet pill, min-height `2.75rem`, full radius | Same hierarchy and target; may fall below the first viewport at enlarged text |
| Evidence anchor | Bottom center, `1.25rem` inset | `0.8rem` inset; still a full link target |

At `1440x900` the invite, actions, and anchor occupy the first stable viewport.
At `390x844` the invite and both actions remain visible without a preliminary
scroll at default text size. At 200% text the page grows vertically and scrolls;
there is no horizontal overflow, and the CTA/operator may move below the fold.

### 2.3 Hero copy and action contract

The static accessible title is:

> **Bring more minds**
> **to your next decision.**

The second line rotates through four approved phrases:

1. `to your next decision.`
2. `before the next call.`
3. `for the hardest question.`
4. `with every source in view.`

The interval is `7000ms`; the outgoing/incoming transition is `700ms`. The H1
keeps `aria-label="Bring more minds to your next decision."` for its entire life,
so assistive technology receives one stable headline. Rotating text and the three
emblem thumbnails are `aria-hidden`; there is no live region announcing every
cycle. The visible first phrase remains the accessible description.

The headline advances through an 18-scene index (one phase per authored emblem),
while the copy itself repeats every four scenes. The interval runs only while the
headline is intersecting the viewport and motion is eligible. OS reduced motion
freezes the phrase and suppresses outgoing decorative layers. The interval
restarts from the current state when the page returns; it does not replay a
backlog of scenes.

Primary action: **Try the recorded demo** -> `/demo`.

- The link is a real Next.js link and exposes the destination without JavaScript.
- With normal motion and an unmodified click, it runs a `1050ms` sweep, then uses
  `router.push('/demo')`. It never starts a meeting, selects a persona, requests
  a model, or triggers inference.
- Modified clicks (meta/ctrl/shift/alt or non-primary button) and
  `prefers-reduced-motion: reduce` bypass the sweep and navigate normally.
- The CTA has a `3rem` badge with the night Constellation-S mark, plus particles,
  ring, and arrow. At `1440x900` the badge renders `48 x 48px` and the mark
  `21.86 x 26.39px`; the night group is visible in both page themes. Its
  decorative motion is suppressed under reduced motion.

Secondary action: **Operator sign-in** -> `/login`. It is a quiet full-radius
pill, not a second primary button.

Bottom anchor: **Explore the evidence constellation** -> `#evidence`. It uses
normal anchor behavior, is a full link target, and is not a carousel/progress
control.

There is no hero disclosure line. The claim that the demo is prepared and
recorded lives in the evidence section's visible label:

> **Illustrative view of the prepared demo · not a live retrieval record**

The homepage never says it is generating live responses. The absence of the old
disclosure is intentional and covered by tests.

## 3. Persona art and scene system

### 3.1 Authored emblems

The field contains 18 original role sigils, authored as inline SVG: strategist,
investor, operator, analyst, engineer, designer, legal, scientist, writer,
founder, researcher, marketer, finance, risk, product, data, people, and
wildcard. Each has a distinct silhouette, internal parts, and accent. There are
no robot heads, human profile photographs, stock space imagery, or remote asset
URLs. The unit suite enforces 18 unique IDs and inline-safe markup with no
external `href`, `src`, or `<image>`.

The 189 field slots repeat those 18 sigils. Repetition conveys depth and
composition, not a claim that 189 personas are present. No names are attached to
individual field cards.

### 3.2 Slot and scene contract

`HOME_FIELD_SLOTS` is a deterministic list of 189 slots at every breakpoint. The
`data-density` value is `wide` at `>=1200px`, `medium` at `>=768px`, and `compact`
below that, but the slot count is deliberately one-for-one. The renderer's
`setDensity()` is a no-op: the viewport changes which part of the constellation
is visible, not the roster count. This replaces the earlier proposal of 14–20
visible representations wide and 6–8 compact.

Each slot has a seeded position, scale, opacity, and spiral phase. The layout is
deterministic, so screenshots and tests are stable. The spiral samples positions
along one shared path; orientation follows the radial direction rather than
random spin. Adjacent slots may overlap, but the central exclusion keeps them out
of the title and controls.

The scene index is also deterministic. The headline's 18-phase index selects
three emblem thumbnails from the same 18-sigil set. A phrase does not imply that
the pictured roles are speaking in the current recording.

### 3.3 Renderer and static fallback

The DOM always renders all 189 `.home-slot` spans with inline emblem markup. A
lazy-loaded WebGL2 canvas overlays them for the ambient field:

- The engine requests `webgl2`; if unavailable it throws and the field records
  `data-webgl="failed"`. There is no Canvas2D or DOM animation fallback.
- The engine packs the 18 glyphs into an 18-layer texture array. It uses one
  instanced draw with stride `11`, radius `16`, texture size `256`, and the
  spiral scene contract above.
- `data-webgl` is `static` before the engine resolves, `ready` after a successful
  context, and `failed` after an initialization or context-loss failure.
- The static 189-slot composition stays visible whenever the canvas is not
  running. The canvas fades over it rather than replacing the HTML.
- Device pixel ratio is capped at `1.5` below `768px` and `2` at wider sizes.

The hero starfield is 72 deterministic stars across a `1600 x 1000` field. It is
not an independently animated particle system and does not respond to pointer
movement.

## 4. Hero choreography and state

### 4.1 Runtime states

`data-activity` exposes the field's current reason:

| State | Condition | Behavior |
| --- | --- | --- |
| `reduced` | OS reduced motion | Static field; no arrival, ambient travel, scroll surge, or phrase cycling |
| `hidden` | `document.hidden` | Loop and phrase scheduling suspend; no catch-up on return |
| `offscreen` | Hero not intersecting | Loop and phrase scheduling suspend |
| `fallback` | WebGL2 unavailable or context lost | Static field remains; links and headline continue |
| `static` | Engine module still loading, or canvas not ready | Static field is readable immediately |
| `running` | Visible, eligible, engine ready | Ambient spiral runs and the phrase interval is active |

Precedence is exactly `reduced -> hidden -> offscreen -> fallback -> static ->
running`. The same conditions drive `data-motion` (`reduced` or `full`) and
`data-webgl` independently.

There is no in-app background-animation control anywhere in the product. The
homepage does not own a pause preference and the Appearance menu contains theme
choices only. `prefers-reduced-motion` is the sole authority that pauses the
decorative field, phrase rotation, atmosphere, and CTA particles.

### 4.2 Timing and motion

| Element | Implemented behavior |
| --- | --- |
| Field ambient | Base velocity `0.32` along the shared spiral; tangent/radial orientation |
| Arrival burst | Multiplier `20` for `3200ms`, ramped in over `700ms` |
| Scroll response | Passive measured deltas, ramp `220ms`, hold `140ms`, bounded multiplier; never changes scroll position |
| Resume | Resets the frame clock and resumes at the current offset; does not replay the arrival burst |
| Phrase dwell | `7000ms`, only while visible and eligible |
| Phrase transition | `700ms`; no outgoing layers are scheduled under reduced motion |
| CTA sweep | `1050ms` before `router.push('/demo')`; bypassed for reduced motion and modified clicks |
| Static/reduced | No travel, burst, zoom, scroll impulse, or phrase cycling |

There is no hover-pause requirement for the headline or field. Pointer movement
does not steer the field and does not create a parallax.

### 4.3 Exclusion and geometry

The central exclusion is an ellipse measured from the rendered headline range
plus the CTA and operator rectangles. The core receives `88px` horizontal and
`112px` vertical breathing room. The fade band spans `96–210px`; the plateau is
`55–88%` of the measured area. This is computed at runtime rather than hard-coded
to one desktop composition.

On resize, the `ResizeObserver` updates the canvas and mask and draws once when
paused. It does not reselect the scene or restart the arrival burst. Theme changes
recolor the environment only.

## 5. Section 2: document/evidence constellation

### 5.1 Composition

The section is `#evidence`, headed **Different perspectives. Traceable
sources.** It explains that the prepared demo gives every role the same shared
material, then a private working set; dashed lines show assignment and solid
lines show an example citation from a prepared turn.

The desktop presentation is a full-bleed `.home-graph__map` with authored
positions, SVG edges, and semantic `<button>` nodes. It bleeds to the viewport
edge while its heading and labels keep readable gutters. The map uses 170
deterministic background stars, separate from the hero's 72.

There is no permanent detail panel and no force-directed simulation. Selection
highlights edges and opens an overlay; the graph itself does not move.

### 5.2 Content and relationship truth

The graph is illustrative, not a live retrieval record. It contains exactly nine
nodes and thirteen edges:

- Personas: The Credit Analyst, The Downside Reviewer, The Portfolio Analyst.
- Shared material: Shared fact sheet.
- Private working sets: Credit evidence, Downside worksheet, Portfolio mandate.
- Cited sources: Crisil annexure, HDFC FY20 MD&A.

Six assignment edges show availability through the shared or private stack.
Seven citation edges show a prepared response citing a source, with notes such as
`C10`, `C1, C2, and C12`, or `C3`. There are no file-to-file semantic links, no
`source-register`, no SHA-256 values, no retrieval scores, and no fabricated
citation counts. The unit suite enforces the node/edge counts, the assignment vs
citation distinction, and the absence of file-to-file edges.

The visible illustrative label is part of the section, not a tooltip:

> **Illustrative view of the prepared demo · not a live retrieval record**

The graph does not import live knowledge, initialize replay, or claim to depict
the current recording.

### 5.3 Interaction

- Hovering or focusing a node previews connected edges and opens the overlay with
  `data-pinned="false"`. Moving away removes an unpinned overlay.
- Clicking or pressing Enter/Space on a node pins the overlay. The pressed node
  has `aria-pressed="true"`; only one node is pressed at a time.
- The overlay labels the selection **Selected example**, shows the node name,
  kind, description, and connection groups, and includes a `<details>` element
  labelled **Read all connections**.
- Escape clears the pinned overlay. Clicking the graph backdrop also clears it.
- Focus has the same visible emphasis as hover. Touch tap pins; drag is not
  required.
- Edge style and the legend's **Assigned / available** and **Example citation**
  labels distinguish relationship kinds without relying on hue alone.

Below the desktop map, the **Inspect evidence in the demo** link navigates to
`/demo`. It is not a second hero CTA and does not pretend to deep-link to an exact
claim.

### 5.4 Compact presentation and transition

At `767px` and below the positional map is hidden and a structured
`.home-graph__mobile` list presents the same nodes and relationships. Selecting a
list item opens the same overlay behavior. This is a semantic alternative, not a
decorative simplification: all nine nodes and their connection information remain
available.

The hero-to-evidence transition is normal scrolling with a continuous palette.
There is no scroll hijacking, mandatory pinning, persona-to-file morph, or
replayed reveal per scroll. The graph is visible in the initial HTML.

## 6. Footer

The footer has a fine divider, the Constellation-S lockup, a short accurate
description, and only real destinations:

- Description: **A prepared advisory meeting you can inspect — roles, shared
  material, and cited sources in one recorded session.**
- **Explore the recorded demo** -> `/demo`
- **Operator sign-in** -> `/login`

The footer does not repeat every header action, add disabled legal links, invent
copyright claims, or host appearance controls. Those controls are not present on
the homepage; the shared Appearance menu remains available on application routes
with theme choices only.

## 7. Appearance, responsive, and fallback contracts

### 7.1 Light and dark

Dark uses the deep near-black canvas, pale ink, violet accent, and night logo
group. Light uses the porcelain canvas, deep ink, darker violet accent, and light
logo group. Both use the same composition, emblem art, and hierarchy; artwork is
not inverted at runtime and there is no separate light-mode identity.

The theme switch is driven by explicit `data-theme` with a System fallback. The
logo variant, page tokens, stars, CTA, overlay, and graph colors all follow the
same resolved theme. The browser test verifies the correct logo group is visible
and the page background changes between `rgb(7, 4, 15)` and
`rgb(246, 241, 248)`.

Forced-colors mode hides the field, starfield, and decorative effects and uses
`CanvasText` borders so controls remain identifiable.

### 7.2 Responsive and enlarged text

Verified breakpoints are `320x800`, `390x844`, `768x900`, `1024x768`, and
`1440x900`. At every size there is no horizontal overflow and all 189 static
slots remain rendered. The operator link remains within the first viewport at
default text size; the CTA is at least `288px` wide at `320px` and at least
`320px` above that.

A one-off 200% text audit at `1280x900`, `1024x768`, and `390x844` found no
horizontal overflow. At the two narrower sizes the CTA/operator move below the
fold and the page scrolls; this is accepted rather than clipping the cinematic
hero. The phrase slot grows to `2.04em` at compact widths and to about `140px` at
200% on mobile.

A one-off `320px` transition audit sampled four phrase changes: the tail slot
stayed `69.359375px` high, the CTA top stayed `439.96875px`, and scroll width
stayed equal to the viewport. This supports the no-jump contract but is recorded
as an audit, not as a permanent test.

### 7.3 Degraded states

- **No JavaScript:** server-rendered H1, wordmark, demo link, static field, map,
  nodes, and footer remain. The overlay is absent.
- **WebGL2 failure/context loss:** `data-webgl="failed"`, canvas opacity `0`,
  `data-activity="fallback"`, static field and links intact.
- **Font failure:** Satoshi falls back; H1, demo link, and logo remain visible and
  readable.
- **Reduced motion:** static field, no canvas animation, no phrase cycling, and
  `data-background="paused"` stops the shared atmosphere and CTA effects.
- **Missing artwork:** there is no remote hero artwork to fail. All emblem and
  logo geometry is inline; the only network font assets have a fallback.

No live effect or third-party request repairs missing assets.

## 8. Rendering and performance contract

The homepage uses a WebGL2-only ambient engine because the measured 189-slot,
18-texture field fits it and the static DOM is a complete fallback. The engine is
dynamically imported only by the homepage and does not enter other routes.

- No per-frame React state; rendering is driven inside the engine's animation
  frame and seeded layout.
- The engine chunk is separate from the homepage client chunk.
- No raster hero assets. Emblems, logo, starfield, and favicon are inline or SVG.
- Fonts are self-hosted Satoshi variable and italic; font redistribution remains
  governed by Spec 31 and is not re-licensed by this spec.
- DPR caps: `1.5` compact, `2` desktop.
- No hidden work: offscreen, hidden-document, and reduced-motion states stop the
  loop. A paused resize draws one frame rather than restarting the loop.
- The page targets CLS `<=0.1`, LCP `<=2.5s`, and INP `<=200ms` on an agreed
  reproducible mobile profile. Lab evidence informs release; field outcomes
  require measurement and are not inferred from this document.

Measured in the production build:

| Item | Measurement |
| --- | --- |
| Homepage client chunk | `43,603 B` raw / `13,828 B` gzip |
| Lazy WebGL engine chunk | `10,688 B` raw / `4,417 B` gzip |
| Satoshi variable + italic | `42,588 B` + `43,844 B` total `86,432 B` |
| Raster hero art | `0 B` |
| Animation code increment | `4.4 KiB` gzip, within the `<=80 KiB` budget |
| Hero art budget | `0 KiB` against `<=600 KiB` desktop / `<=300 KiB` compact |

A local unthrottled Chromium sample of the final production build at `1440x900`
measured LCP `248ms` (the headline line), CLS `0`, one long task, 41 resources,
and `633,290 B` transfer. A second, cache-warm `390x844` load measured LCP
`124ms`, CLS `0`, and zero long tasks. Neither sample is a throttled field
trace, and INP was not measured. The numbers demonstrate that the local build is
not blocked by the budgets; they do not support a real-user performance claim.

## 9. Reference study: verified versus proposed

The Cosmos hero was inspected in public delivered code and Chromium, including
mobile and reduced motion. Its field uses a shared spiral, tangent rotation,
arc-length sampling, a center alpha mask, an entry impulse, scroll-velocity
response, scene preparation, and stable slot image mixing. Hover pause/resume was
observed. Reduced-motion scheduling and additional visibility rules were traced
in code; not every rule was independently instrumented in a browser.

Despite an exported `Canvas2D` component name, the inspected renderer prefers
WebGL2, with an OffscreenCanvas worker on supported desktops and other fallbacks.
No original public source repository or reuse license was established. No basis
was found to require Three.js, GSAP, or pointer parallax for this hero.

First-party delivered code, hashed URLs subject to change:

- [Hero controller](https://www.cosmos.so/_next/static/chunks/3su7vj9lrcgpa.js)
- [Renderer and motion selection](https://www.cosmos.so/_next/static/chunks/2sd0cwht6lyv2.js)
- [WebGL renderer](https://www.cosmos.so/_next/static/chunks/0fcpv0clz792h.js)
- [Worker renderer](https://www.cosmos.so/_next/static/chunks/1voqwqpqltjc1.js)

Sabha's implementation is an original, bounded interpretation of those observed
behaviors. The values in §4 are Sabha decisions, not a transcription of Cosmos
configuration or permission to reuse its implementation or assets.

## 10. Acceptance gates

| Gate | Status | Evidence and remaining work |
| --- | --- | --- |
| HP01 Composition | Pass (local) | E2E asserts one chrome region, zero `<header>` elements, two main sections, one footer, full-bleed map, and no permanent detail region. Screenshots at 1440 and 390 confirm the hierarchy. |
| HP02 Appearance | Pass (local) | E2E switches System dark/light and verifies the correct logo group, page background, and foreground tokens. CSS provides light/dark tokens for every homepage surface. No route-by-route manual review at every viewport is claimed. |
| HP03 Geometry | Pass (local) | E2E covers five viewports, no horizontal overflow, CTA width, operator position, and 189 slots. One-off 320px phrase audit and 200% text audits found no clipping or horizontal overflow. |
| HP04 Motion | Pass (local) | E2E covers the 7s phrase change, reduced motion, offscreen and hidden suspension, and client navigation. Source review confirms resume resets the clock and does not replay the arrival burst; that specific resume path is not browser-instrumented. |
| HP05 Loading | Pass (local) | E2E covers WebGL2 failure, font failure, no-JavaScript, reduced motion, and static fallback. There are no scene/image fetches to delay, so the former slow-next-scene case is not applicable. |
| HP06 Semantics | Pass (local) | One stable H1 name, decorative rotation hidden, named brand link, real `/demo` and `/login` destinations, keyboard graph selection with `aria-pressed`, Escape clear, and a `<details>` relationship list. No screen-reader pass is claimed. |
| HP07 Graph truth | Pass (local) | Unit tests enforce 9 nodes, 6 assignment edges, 7 citation edges, no file-to-file links, and no source-register/hash/retrieval-score strings. The visible label says illustrative and not a live retrieval record. |
| HP08 Continuity | Pass (local) | Theme switching is CSS-only; resize uses `ResizeObserver` and draws once when paused; source review confirms theme/resize do not restart the arrival burst or reselect a scene. Browser tests cover theme swap and reduced/running transitions. |
| HP09 Performance | Partial (local) | Production chunks are 13,828 B and 4,417 B gzip; animation increment is 4.4 KiB; raster hero art is 0 B; fonts are 86,432 B. Local LCP/CLS sample passes, CLS is 0, and hidden/offscreen loops stop. INP, throttled traces, and real-user field data remain unmeasured. |
| HP10 Isolation | Pass (local) | E2E asserts no public persistence and no third-party requests; architecture tests enforce homepage boundaries. The page does not bootstrap Auth/vault, call providers, or initialize replay. |

Local implementation gates are complete. HP09's field/INP evidence is explicitly
a release-verification item, not a missing feature; do not convert this partial
row into a claim of production performance.

## 11. Execution record

Implementation lives in `frontend/src/features/homepage/`, with the shared brand
in `frontend/src/components/brand/sabha-logo.tsx` and
`frontend/src/styles/brand.css`.

| Check | Command/environment | Result |
| --- | --- | --- |
| Full unit/integration | `cd frontend; npm test` | 114 files, 685 tests passed (28.50s); existing console warnings only |
| Architecture | `cd frontend; npm run test:architecture` | 7 files, 52 tests passed (2.96s) |
| Homepage + appearance E2E, dev | `npx playwright test e2e/homepage.spec.ts e2e/appearance.spec.ts --reporter=line` | 29 passed (1.1m); 16 homepage, 13 appearance |
| Full production E2E | `cd frontend; npm run test:e2e:prod` | 69 tests: 67 passed, 2 skipped (1.8m); all 16 homepage tests passed |
| Types | `npx tsc --noEmit` | Clean |
| Lint | `npm run lint` | 0 errors, 19 pre-existing warnings in unrelated files |
| Build | `npm run build` / production E2E build | Next.js 16.1.4; compiled in 5.2s; 20 static routes; `/icon.svg` present |
| App icon | production HTML inspection | `<link rel="icon" href="/icon.svg?...">` present |

The production Playwright skips are the existing conditional `legacy-journey`
and `mixed-operator` suites, not homepage failures. The homepage suite covers
composition, logo/theme, CTA mark, rotation, responsive geometry,
persistence/network isolation, lifecycle suspension, WebGL fallback, font
fallback, graph selection/overlay/keyboard, compact list, reduced motion,
no-JavaScript behavior, and the absence of appearance or motion controls. The
appearance suite additionally asserts that the shared menu exposes theme choices
without `Background animation` or On/Paused items.

## 12. Remaining verification outside this close-out

- Hosted deployment and route-by-route visual review after deployment.
- Throttled performance traces, INP measurement, and real-user field data.
- Screen-reader and physical-device review.
- Font redistribution permission remains a Spec 31 release item.
- Spec 33's application routes remain separate; this document only closes `/`.

No open creativity or implementation decision remains in this spec. The logo,
copy, density, motion values, graph content, and renderer are recorded above and
are covered by the local test suite.
