# Spec 32: Constellation Homepage Experience

## Status and ownership

**Status: proposed detailed specification; no implementation is recorded here.**
Depends on [Spec 31](spec-31-design-system-and-motion.md). Read
[Spec 33](spec-33-application-experience.md) for the real demo/operator destinations.
This document owns `/`: four sections, both appearances, assets, responsive
composition, hero choreography, document constellation, and homepage acceptance.

The user locked the four-section arrangement, Cosmos-inspired persona field,
rotating second-line concept, demo CTA, quieter operator login, document graph,
Satoshi, restrained glass, and subsequently both light and dark UI. Exact copy,
persona art, palette/timing values, graph content, and implementation renderer
remain reviewable proposals. In particular, rotating-line wording has been
explicitly deferred; do not represent the draft below as approved copy.

## 1. Experience and information hierarchy

The homepage should communicate: **different AI perspectives, grounded in
inspectable sources, with the person choosing the direction**. It is an invitation
to inspect a prepared advisory meeting, not a claim of current autonomous research.

Hierarchy:

1. A stable two-line invitation and an unmistakable demo action.
2. Distinct persona representations in a coherent surrounding field.
3. A legible explanation of the source/evidence relationship below the hero.
4. Minimal navigation, appearance/effects controls, and operator access.

No extra feature-card row, pricing, testimonials, fabricated customer logos,
newsletter, FAQ accordion, dashboard screenshot, or fifth section is included.
Do not copy Cosmos's name, imagery, proprietary code, search input, app-download
CTA, or QR panel. Borrow studied behavior and composition through an original
implementation, with rights-cleared Sabha assets.

## 2. Page anatomy and responsive frame

### 2.1 Section 1: minimal header

- Brand/name at the leading edge; existing mark may receive a quieter treatment,
  but redesigning the logo itself is not authorized by this spec.
- Trailing appearance menu and **Pause animation / Resume animation** control.
  Include the state in the accessible name; do not make users discover a hidden
  settings drawer to stop perpetual effects.
- Primary demo and operator actions live in the hero; header does not repeat a
  full marketing navigation or become an additional glass capsule.
- Proposed height 64px wide, 56px compact, with Spec 31 gutters. It shares the
  hero environment rather than pushing the central composition down by another
  full header-height margin. At text enlargement it can grow normally.
- On scroll it may remain sticky with an opaque quiet surface and subtle lower
  edge; no automatic hide/reveal chasing pointer direction. Focus is never hidden
  beneath it. No second sticky header is introduced.

### 2.2 Section 2: persona-constellation hero

At 1440x900, header and hero together occupy approximately the first stable
viewport. Use a minimum height, never a fixed clipping height: enlarged text,
short laptop screens, mobile browser chrome, and wrapped controls may extend it.
At 390x844 the entire invitation, demo button, operator link, and disclosure
should ordinarily be visible without a preliminary scroll.

Layer order:

1. Theme canvas and sparse starfield.
2. Persona field, softened through a central exclusion mask.
3. Stable central content and controls.
4. Minimal header/effects controls and optional downward navigation.

Foreground is real HTML, server-renderable and operable without canvas/fonts.
The center is optically balanced, not mechanically centered between unrelated
page sections. Protect enough space for the longest approved headline, CTA,
operator access, and recorded disclosure at every supported size.

| Region | Proposed wide behavior | Proposed compact behavior |
| --- | --- | --- |
| Foreground | Max 880px; two-line title, <=3 short lead lines | Full available width, 16px gutters; keep fixed/rotating phrases readable |
| Persona field | 14–20 visible representations across depth levels, edge cropping allowed | 6–8, predominantly peripheral; omit crowded placements |
| Display text | Spec 31 display scale; second-line slot shared by outgoing/incoming copy | Responsive size; allow up to two lines for changing phrase without hiding actions |
| Demo CTA | 280–360px wide, 56px height, restrained glass | Width <=320px or available width, 52px minimum height |
| Operator login | Quieter text/outline treatment below demo CTA, >=44px target | Same hierarchy; never a tiny secondary hit target |
| Disclosure | Plain readable metadata under actions | Wrap normally, not hidden or reduced below readable size |

Visible representation counts are a proposed density budget, not the number of
available personas. Repeated artwork must not imply a larger roster or more
simultaneous meeting participants. Reduce count before shrinking essential text.

### 2.3 Hero copy and action contract

Draft static fallback for review: **Bring more minds / to your next decision.**
The second line is reserved for later approved rotating copy. This draft may be
revised without changing the layout contract; implementation must not invent a
bank of rotating phrases to fill the slot.

Primary action: **Explore the recorded demo** -> `/demo`.
Secondary action: **Operator sign-in** -> `/login`.
Concise disclosure: **Prepared demo · recorded responses, not live generation.**
Do not imply the homepage starts a meeting, chooses a persona, requests a model,
or triggers inference. Clicking the CTA navigates immediately; it does not wait
for the current scene or an outgoing animation to complete. A selected scene is
not passed as a hidden persona/meeting configuration.

If a lead sentence is needed, keep it product-specific and short, describing
distinct perspectives, cited evidence, and user direction. No generic AI slogans.
Avoid an additional brand wordmark above the headline if the header already names
Sabha; reserve space for the invitation itself.

Optional bottom chevron links to section 3, labelled **Explore the evidence
constellation**. It uses normal anchor behavior, appropriate sticky-header
offset, and reduced-motion-safe scrolling. It is not an autoplay/progress control.

## 3. Persona art and scene data

### 3.1 Art direction proposal and approval gate

Proposed direction: original role emblems/objects with consistent lighting,
framing, and texture, suggesting a mandate without pretending to be a human.
This is a proposal, not an approved asset style. Obtain one representative art
sheet in both themes before producing the full set; this spec authorizes no
image-generation run by itself.

No generic robot heads, fake human profile photographs, financial-only branding,
or random space stock photography. The role artwork should remain recognizable
at small scale and without a colored border. Favor distinctive silhouettes,
not tiny text baked into an image. Live custom personas need an initial/shape
fallback; the homepage shows only the curated approved public subset.

Asset manifest must record:

- Public persona/template identity, display name, role/mandate, art identity.
- Rights/license and source; approval status and intended appearances.
- Dimensions, focal point, aspect ratio, mobile derivative, compressed sizes.
- Solid/light/dark presentation and fallback; never invert artwork at runtime.
- Scene association and accessible description where it conveys real information.

No homepage import from private operator persona data or provider configuration.
Names/roles must match approved public examples; do not imply every example is
in the currently recorded meeting. If artwork repeats, use depth/placement rather
than inventing extra names. Establish all per-slot aspect ratios before loading.

### 3.2 Scene contract

A scene is data: stable ID, approved headline phrase, persona/art references,
optional supporting wording, and field-image selection. It cannot contain code,
provider calls, navigation overrides, analytics, or arbitrary remote asset URLs.

Until rotating copy is approved, ship the static fallback with the ambient field
if implementation proceeds. Once approved, pair phrase and imagery deliberately.
Do not rotate named viewpoints while leaving unrelated artwork as if it belongs
to that scene. Not every phrase needs two inline thumbnails; the user requested
persona representations in the field, not a mandatory copy of Cosmos's pair.

Second-line transitions use overlapping layers within a reserved-height slot.
The slot is based on the longest approved phrase at the current type size and
wrap allowance, not on the first phrase alone. At text enlargement, prefer a
stable static layout over clipped or endlessly resizing rotating text.

Only one logical headline is exposed to assistive technology. Decorative outgoing
copies and scene art are hidden from it. No live-region announcement every cycle.
A static accessible headline describes the product accurately across scenes.

## 4. Hero choreography and state machine

### 4.1 States

| State | Foreground | Field and scene behavior |
| --- | --- | --- |
| Initial HTML | Fallback title/actions/disclosure immediately readable | Correct theme background and deterministic static composition |
| Assets preparing | Controls remain usable | Load minimum essential art, reserve frames; no full-page spinner |
| Ready arrival | One brief optional entrance, never gated | Fade in field, short coordinated acceleration then settle |
| Ambient | Stable layout and actions | Slow shared movement; scene cycle only when eligible |
| Interacting | CTA/links respond immediately | Pause cycling on headline hover/focus and any open menu; do not move action targets |
| Offscreen/hidden | No extra work | Suspend field loop and scene scheduling; do not catch up multiple scenes on return |
| User paused | State visible in effects control | Freeze decorative field/star motion and automatic scene cycling |
| Reduced motion | Static readable composition | No automatic cycling, travel, burst, zoom, or scroll impulse |
| Degraded/error | Full usable HTML remains | Stable fallback art or stars only; no retries that block navigation |

Pause and reduced motion are presentation preferences, held in memory only.
Pausing does not pause the recorded meeting on another route or alter its runtime.
User pause remains in effect across homepage visibility changes within the mounted
application. If the OS requests reduced motion, it wins over Resume; explain the
setting rather than silently re-enabling travel.

### 4.2 Proposed timing and motion behavior

| Element | Proposed behavior |
| --- | --- |
| Foreground arrival | Opacity + y <=8px, 240–400ms; no word-by-word delay; usable before/through animation |
| Field readiness | 700–1000ms opacity reveal after minimum assets are decoded |
| Field arrival | 500–700ms acceleration, settles within 2.5–3.2s; tune subtler than Cosmos for legible persona art |
| Ambient trajectory | One coherent path system; tangent-aware orientation, restrained scale-depth, fade at boundaries |
| Scene dwell | Start proposal 6s, counted only while eligible and ready; not an unconditional interval |
| Headline change | 500–650ms opacity/vertical movement <=12px; optional shallow rotateX <=12deg and blur <=4px if readable |
| Field art replacement | 650–850ms in-place mix; preserve frame/aspect/trajectory, subtle scale <=1.08→1 |
| Scroll response | Optional bounded impulse along existing trajectory, smooth rise/fall; never alter scroll position |
| Stars | Mostly static; no sparkling/strobing; if movement is retained, substantially slower than persona field |

The stronger 3D headline roll in Cosmos is a studied reference, not a required
effect. Prototype the shallow version against Satoshi and the approved text
before increasing it. Final values belong to the Spec 31 family and must remain
consistent across normal/reduced states.

### 4.3 Spatial rules and exclusion zone

Use one shared deterministic movement model rather than independent looping
keyframes. A spiral is a strong prototype candidate; a literal vortex is not a
locked requirement. Approximate arc-length travel to avoid curvature-induced
speed jumps; orientation should relate to travel with limited initial variation.
No continuous random spins, pointer-chasing, or tile collisions across controls.

Mask the persona layer with a soft elliptical center. Its dimensions derive from
the actual content bounds plus breathing room, not a single hard-coded desktop
radius. The mask must protect disclosure and controls as well as the title.
On compact layouts, use a simpler sparse arrangement if the necessary mask would
erase most art. Exclusion is transparent alpha, not an opaque/glowing rectangle.

Keep image swaps inside stable slots. New images cover-crop to the seeded slot;
never alter its silhouette midflight. Preserve draw order and opacity when mixing
images so a card does not reveal whatever is behind it halfway through a swap.
Antialias corners/edges so moving diagonals do not crawl. Avoid fake depth through
giant drop shadows or glass frames around every representation.

### 4.4 Eligibility, loading, and interruption

Cycle only while visible, document active, not reduced/paused, no headline
hover/focus, no open menu, and next required assets ready. Waiting for assets
extends the current scene; a slow load is not permission to show empty frames.
After a bounded wait of 10s, skip an unavailable candidate or retain the current
scene. No fetch/retry loop should accumulate while hidden.

On resume, begin a fresh dwell rather than instantly replacing the phrase being
read. User navigation cancels pending scene work. Resize updates geometry without
restarting the arrival burst or reselecting imagery. Theme changes recolor only
the environment/frames, preserving timing and scene identity.

Optional scroll impulse is based on measured scroll velocity, smoothed and capped.
It must not cause a burst after programmatic anchor navigation or returning from
the background. Omit it on reduced motion and resource-constrained fallback.
No pointer parallax is specified; it was an earlier unverified hypothesis, not
the behavior found in the inspected Cosmos field.

## 5. Section 3: document/evidence constellation

### 5.1 Purpose and composition

Communicate how distinct perspectives can draw on shared and assigned material,
and how a person can inspect cited evidence. It resembles a carefully composed
Obsidian-style knowledge graph expressed as a constellation, not a live database
visualization or decorative galaxy with unexplained connecting lines.

Proposed heading: **Different perspectives. Traceable sources.** Draft supporting
copy must distinguish available knowledge from material actually cited. Use a
large graph area with an adjacent/underneath compact explanation, not three cards
inside another glass panel. Maximum content width follows Spec 31; graph may
bleed modestly within the section while labels stay within readable gutters.

### 5.2 Content and relationship semantics

Default proposed approach: a small, authored **illustrative** graph built from
rights-cleared public examples, explicitly labelled as illustrative. It does not
import live knowledge, initialize replay, or claim to depict the current recording.
If approved recorded examples are used instead, freeze their validated public
identities/relationships at build time and label the package/as-of context; that
choice requires an approved content manifest before implementation.

| Node/edge | Meaning | Must not imply |
| --- | --- | --- |
| File node | Named example source/document, readable type/label | Automatically cited, verified, or freshly retrieved |
| Persona node | Named AI role represented in the example | A human, autonomous actor, or active generation |
| Scope grouping | Shared meeting material or participant assignment | Published demo inputs are confidential to anonymous visitors |
| Assignment edge | Material is available to the named role/scope | The role retrieved or cited every connected file |
| Citation edge | Specific authored/recorded contribution cites a source; only if backed by approved identities | Similarity, assignment, or proximity equals a citation |

Do not draw file-to-file semantic links from imagination. If illustrative links
are used, label their relationship as an example and explain it in the legend.
No private filenames, unapproved source bytes, fabricated retrieval scores, or
unsupported citation counts. Hash/retention identity is not factual validation.

### 5.3 Interaction and animation

- Proposed desktop graph: 8–12 nodes at stable authored positions; smaller
  screens show a reduced but semantically complete arrangement with a full
  accessible relationship list underneath/on request.
- No force-directed settling loop, compulsory dragging, zoom-to-read labels, or
  continual node jitter. Choose layouts so text fits at its readable default.
- First entry may reveal the graph in a single 400–600ms sequence: nodes fade,
  then relevant edges resolve. Use no repeated per-scroll replay; reduced motion
  shows it immediately. It is not pinned.
- Selection by click or keyboard highlights connected nodes/edges in 180ms and
  updates one solid detail region. Selection does not move the whole graph.
- Hover can preview the same emphasis, but never owns unique information.
  Focus has an equivalent visible state. Touch tap selects, not drag-only input.
- Distinguish selected relation with thickness/style and text, not only hue.
- Use semantic buttons/list controls or an equivalent accessible DOM structure;
  a canvas-only graph with no relationship alternative fails acceptance.
- A selected example opens a description in place. Only approved public assets
  may offer a real evidence preview using the shared renderer. Otherwise explain
  that it is illustrative; never render a dead **Open file** action.

An optional **Inspect evidence in the demo** link may navigate to `/demo` below
the explanation. It is not a second primary CTA above the fold, and does not
pretend to open an exact recording claim without an approved deep-link contract.

### 5.4 Hero-to-graph transition

Default: normal scrolling, continuous palette, generous but controlled spacing,
and a visual change from scattered persona field to organized graph. The hero
can fade at its section boundary; it does not morph personas into files and
thereby imply unsupported relationships. A more literal transformation would
need a separately reviewed mapping and performance proof. No scroll hijacking,
mandatory pinning, or forced multi-screen animation sequence.

## 6. Section 4: footer

Keep a fine divider, Sabha name, short accurate product description, and real
destinations only. A quiet demo/operator pair is acceptable but not compulsory
duplication of every header action. Appearance/effects controls remain accessible
from the sticky header; do not build a footer link farm or disabled legal links.
Include repository/legal links only when their actual destinations and content
exist and are approved. No made-up copyright/company claims.

## 7. Light/dark, responsive, and fallback contracts

Dark hero: cool near-black canvas, restrained stars, persona imagery carries the
foreground detail. Light hero: cool porcelain canvas, ink-blue fine stars/lines,
same composition and imagery with theme-appropriate edges. No inverted art or
separate rainbow/light-mode identity. Glass CTA must remain a clearly identifiable
control against the brightest/darkest passing assets; fall back to solid when
needed rather than adding a luminous border.

At 1024x768 reduce field density and display size before hiding content. At 320px
allow the title/action column to grow vertically and simplify the field. At 200%
text or 400% zoom use readable flow, not a clipped fixed-height cinematic scene.
Graph nodes may switch to a structured connection list at narrow widths. Both
forms preserve meaning and selection detail.

JavaScript/canvas failure leaves title, disclosure, navigation, and normal links.
Font failure leaves a stable readable fallback. Asset failure leaves deterministic
reserved frames or a reduced field, not broken-image icons around the headline.
No live effect or third-party fetch repairs missing public assets.

## 8. Rendering and performance contract

Prototype a bounded renderer with independent HTML content. The reference's
WebGL2/worker strategy is evidence, not a mandate to overengineer Sabha's smaller
field. Pick between DOM/Canvas2D/WebGL only after measuring the proposed density,
image mixing, central mask, and device profiles. Record the decision inside this
spec's implementation notes, not in a fourth design spec.

- No per-frame component state; deterministic seed for stable screenshots.
- Canvas/effect implementation lazy-loaded; core content and controls do not
  depend on its download. Dynamic code/assets stay out of application routes
  that do not need them.
- Proposed incremental animation code budget <=80 KiB compressed. Initial hero
  art <=600 KiB combined desktop, <=300 KiB compact; additional scenes deferred.
  Fonts have a separate measured budget and first-paint strategy.
- Proposed DPR cap 1.5 compact / 2 desktop; reduce for constrained resources.
- Target effect frame work <=8ms reference desktop / <=16ms constrained profile;
  capture actual traces including texture upload and scrolling. Never claim a
  frame-rate guarantee from this specification alone.
- Fail progressively: fewer representations, lower resolution, omit scroll
  impulse, then static composition. Content/action quality never degrades first.
- Proposed page goals on an agreed reproducible mobile profile: CLS <=.1,
  LCP <=2.5s, INP <=200ms. Lab evidence informs release; field outcomes require
  actual measurement and do not justify adding forbidden analytics to replay.

## 9. Reference study: verified versus proposed

The current Cosmos hero was inspected in public delivered code and Chromium,
including mobile/reduced motion. Its field uses a shared spiral, tangent rotation,
arc-length sampling, center alpha mask, entry impulse, scroll-velocity response,
scene preparation, and stable slot image mixing. Hover pause/resume was observed.
Reduced-motion scheduling and additional visibility rules were traced in code;
not every rule was independently instrumented in a browser.

Despite an exported `Canvas2D` component name, the inspected renderer prefers
WebGL2, with an OffscreenCanvas worker on supported desktops and other fallbacks.
No original public source repository or reuse license was established. No basis
was found to require Three.js, GSAP, or pointer parallax for this hero.

First-party delivered code, hashed URLs subject to change:

- [Hero controller](https://www.cosmos.so/_next/static/chunks/3su7vj9lrcgpa.js)
- [Renderer and motion selection](https://www.cosmos.so/_next/static/chunks/2sd0cwht6lyv2.js)
- [WebGL renderer](https://www.cosmos.so/_next/static/chunks/0fcpv0clz792h.js)
- [Worker renderer](https://www.cosmos.so/_next/static/chunks/1voqwqpqltjc1.js)

The values and behaviors proposed earlier in this document are Sabha decisions
for review, not a transcription of Cosmos configuration or permission to reuse
its implementation/assets.

## 10. Acceptance and remaining decisions

| Gate | Required evidence |
| --- | --- |
| HP01 Composition | Exactly four sections; stable center; visible primary action/disclosure; no generic added marketing sections |
| HP02 Appearance | Complete Light/Dark/System review at Spec 31 viewports; stars/art/glass work in both; no inversion trick |
| HP03 Geometry | Longest approved phrase, font swap, resize, enlarged text; no CTA jumping or clipped phrases |
| HP04 Motion | Arrival/ambient/pause/resume/offscreen/hidden/reduced and rapid navigation; no automatic app action |
| HP05 Loading | Slow/missing next scene, image decode failure, font failure, JS/canvas unavailable; usable real links throughout |
| HP06 Semantics | Accurate disclosure, real destinations, noninteractive moving art, one accessible headline, keyboard-equivalent graph |
| HP07 Graph truth | Approved node/edge ledger, scope/citation distinction, illustrative label or exact recorded provenance, no private/live dependency |
| HP08 Continuity | Theme/resize preserves scene; image mixing preserves aspect/opacity/draw order; no resetting arrival on refocus |
| HP09 Performance | Measured asset/code budgets, profile traces, no perpetual hidden work, no unnecessary work on app routes |
| HP10 Isolation | Public page/demo path has no Auth/vault bootstrap, provider calls, persistent writes, or third-party asset runtime dependency |

Before final visual implementation, review: persona art style and curated roster;
baseline/rotating copy; final trajectory and density; graph illustrative versus
recorded content; exact motion values after a bounded prototype. The homepage
can have a complete static state while those creative choices remain unresolved;
do not confuse a documented open decision with implementation permission to
invent final content.
