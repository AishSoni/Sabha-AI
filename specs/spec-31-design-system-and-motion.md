# Spec 31: Sabha Design System and Application-Wide Motion

## Status, ownership, and reading order

**Status: proposed specification, not an implementation or acceptance record.**
The user approved producing three detailed specs, including light and dark UI
and animation throughout the application. Values introduced here are concrete
design proposals for review, not claims that individual tokens were approved.

Read this first, then [Spec 32: Homepage](spec-32-constellation-homepage.md), then
[Spec 33: Application](spec-33-application-experience.md). These are the complete
three-document redesign set; component and acceptance requirements live inside
them, not in additional numbered design specs.

This document owns foundations, materials, reusable components, motion vocabulary,
theme behavior, and cross-cutting acceptance. Spec 32 owns homepage composition
and choreography. Spec 33 owns application layouts, task flows, and screen-level
choreography. Existing runtime, permission, evidence, and recording contracts win
over a visual proposal that would change their meaning.

## 1. Product and design contract

### 1.1 Settled direction

- One coherent Sabha language: constellation imagery, precise typography, stable
  working surfaces, and selective glass. Not a collage of named skill aesthetics.
- Light and dark are equally complete appearances of that language. Dark is the
  original homepage reference, not an excuse to ship an unfinished light mode.
- Satoshi everywhere: 400 body/transcripts/descriptions, 500 navigation/buttons/
  labels, 600 section headings/card titles, 700 major headings/homepage display.
- Glass is an accent material, never the default surface. Removing blur, stars,
  and animation must leave an intelligible, attractive, fully functional product.
- The homepage is expressive; the application is equally considered in motion
  but protects reading, attention, and user control.
- The human chooses who speaks next. Motion cannot suggest autonomous action,
  manufacture research activity, or become the clock for a domain transition.

### 1.2 Preserved boundaries

Retain the [runtime and credential contract](reference-runtime-modes-and-credentials.md),
[replay contract](reference-replay-package-and-playback.md),
[evidence contract](spec-21-in-app-evidence-previews.md), and the behavior accepted
in Specs [28](spec-28-demo-journey-simplification.md),
[29](spec-29-contextual-demo-tutorial.md), and
[30](spec-30-demo-tutorial-acceptance.md).

Recorded playback, browser-memory practice, and authorized live work remain
different capabilities. No visual redesign adds inference, provider calls,
storage writes, analytics, accounts, fabricated citations, or a live fallback.
Recorded agreement is agreement between participants, not verified truth.

### 1.3 Explicit exclusions

No framework rewrite, icon-package migration for novelty, autonomous facilitator,
new graph database, generic onboarding engine, new replay format, or brand/logo
replacement. No fake customer proof, simulated progress percentages, invented
chain-of-thought, glowing dashboard borders, nested glass panels, or motion that
requires a user to wait before repeating an ordinary action.

## 2. Grounding and implementation seams

Current frontend: Next 16.1.4, React 19.2.3, Tailwind 4, owned Radix-based
components, Lucide, TanStack Query, Zustand, and existing test tooling. No Motion
or GSAP package is currently declared in `frontend/package.json`.

Relevant seams:

- `frontend/src/app/layout.tsx`: currently forces dark and loads Inter.
- `frontend/src/app/globals.css`: semantic colors exist, but font variables refer
  to Geist and feature surfaces frequently bypass tokens.
- `frontend/src/components/ui/`: shared primitives; inspect individual components
  before extending them rather than creating a competing component kit.
- `frontend/src/features/access/ui/operator-shell.tsx` and
  `frontend/src/features/demo-workspace/ui/demo-nav.tsx`: persistent chrome.
- Feature-owned `presentation/` components: shared visual contracts between
  operator and demo adapters; do not move transport or commands into them.
- `frontend/src/features/meetings/runtime/contract.ts`: actual capabilities and
  provenance remain the room's source of truth.

Migrate feature styles to semantic roles incrementally. Do not apply a global
search-and-replace to unrelated colors or turn the large room component into a
new runtime controller as part of styling.

## 3. Appearance and theme lifecycle

### 3.1 Preference model

Expose **System / Light / Dark** through a compact, labelled appearance menu in
the homepage header and application chrome. System is the initial preference.
The menu belongs in public presentation code and must not initialize Auth,
provider settings, the vault, or any live query.

For this redesign, the manual override is **memory only** in the mounted root
application. Soft navigation preserves it across public/demo/operator routes;
reload returns to System. No cookie, localStorage, sessionStorage, IndexedDB,
server preference, analytics, or cross-tab synchronization is introduced. This
avoids silently weakening the replay no-persistence contract. Persistent appearance
preferences require a separately reviewed storage-policy change, not a styling
shortcut. Existing managed Auth/vault storage is untouched.

System mode responds to operating-system changes. Explicit Light/Dark does not.
Changing appearance must not remount the room, reset playback/practice, clear a
draft, close an inspector, refetch data, unlock credentials, or restart animation.

### 3.2 First paint and switching

- Resolve System through stylesheet media rules from the first paint; do not
  serve a forced-dark root and correct it after hydration.
- Use one theme owner, with semantic colors and matching native control color
  schemes. Portalled controls must inherit the same appearance.
- No viewport-wide screenshot crossfade or bright/dark flash. Content palette
  changes together; small surface/color interpolation may use `m-feedback` only
  when it does not produce temporarily unreadable text. Reduced motion switches
  immediately. Never use `transition: all` on the document.
- Canvas effects update their palette without reloading data or reseeding paths.
  Solid fallbacks must match the resolved appearance before effects initialize.

## 4. Color and material tokens

### 4.1 Proposed semantic palette

These hex values are starting implementation targets, not measured browser
acceptance. Use role names in feature code; preserve labels and icons alongside
semantic color. Verify actual text and interactive boundaries after compositing.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `canvas` | `#090D14` | `#F5F7FA` | Page/environment |
| `surface` | `#111925` | `#FFFFFF` | Reading, forms, lists |
| `surface-raised` | `#182231` | `#EEF2F7` | Menus, grouped secondary content |
| `surface-selected` | `#1E304B` | `#E8EFFB` | Selected item, not whole transcript |
| `text-primary` | `#EDF2F8` | `#17212F` | Main content |
| `text-secondary` | `#A7B3C4` | `#46556A` | Supporting readable information |
| `text-muted` | `#8D9CB0` | `#596A80` | Tertiary labels, still readable |
| `border-subtle` | `#33445C` | `#D8E0EB` | Nonessential separation |
| `border-control` | `#667D9B` | `#6F8198` | Necessary control boundary |
| `accent` | `#93B4F5` | `#294F98` | Primary action, links, focus |
| `on-accent` | `#0B1423` | `#FFFFFF` | Filled action text |
| `success` | `#8CD6B2` | `#216345` | Actual completion/alignment |
| `warning` | `#EDC77B` | `#805D16` | Attention/nonterminal issue |
| `danger` | `#F09B9B` | `#963E46` | Failure/destructive action/conflict |

Use translucent status tints only over a known opaque surface, never as the sole
status indication. `border-subtle` is not automatically sufficient to identify an
input. Do not put muted text over a selected or glass surface without checking it.

Participant identity is independent from these action/status roles. Derive a
small theme-paired identity set from existing participant colors with accessible
label text; display the name and role even if colors coincide. Do not recolor a
participant red to imply a permanent adversarial personality. One primary brand
accent does not prohibit genuine status and participant colors.

### 4.2 Appearance-specific environment

Dark: deep cool ink, sparse pale stars, restrained atmospheric depth. Light:
cool porcelain, fine blue-gray stellar points and faint orbit/connection marks.
Do not invert photographs or persona artwork, use pure-white flares, or introduce
a separate warm editorial aesthetic. Text-bearing surfaces remain stable in both.

Star/graph line opacity is decorative and must not establish a control boundary.
Application reading panes have no moving star layer behind their text. Stars
belong primarily on the homepage and, very sparingly, unoccupied shell margins.

### 4.3 Material hierarchy and glass budget

| Material | Recipe/behavior | Allowed locations |
| --- | --- | --- |
| Solid content | Opaque `surface`, no backdrop blur | Transcript, documents, forms, tables, reports |
| Solid raised | `surface-raised`, fine edge, restrained shadow | Menu, dialog, grouped controls |
| Selective glass | Dark `rgba(17,25,37,.88)` / light `rgba(255,255,255,.88)`, 12px blur maximum, quiet theme edge | Homepage demo CTA; optionally one unified app chrome layer |
| Scrim | Theme-appropriate neutral dimming | Actual modal background, never tutorial spotlight |

Glass is optional on application chrome. If used, the toolbar/composer/inspector
must not become three independent blurred sheets. A glass ancestor cannot contain
another glass panel. Dialogs, evidence, and the composer default to solid, not
glass. Thin inset highlights are acceptable; luminous outlines and pulsing glows
are not. Shadows belong to genuinely floating layers, not every list row.

Fallback: no supported blur, forced colors, reduced-transparency preference, or
an explicit transparency test override => replace glass with opaque `surface`
and `border-control` where necessary. Do not merely remove blur and retain a
low-opacity fill. Contrast testing includes the brightest and darkest background
assets behind glass. No essential visual distinction may depend on refraction.

## 5. Typography, spacing, and geometry

### 5.1 Font delivery and roles

Use first-party Satoshi variable assets, normal and italic, self-hosted after
license/redistribution verification. Preserve required attribution/license files.
Fontshare's variable range includes 600; its listed static faces do not include
a separate 600 face. Do not synthesize semibold, retain stale Inter/Geist CSS
references, or use a live font-CDN request during public replay.

Source: [Satoshi](https://www.fontshare.com/fonts/satoshi) and the
[first-party variable CSS](https://api.fontshare.com/v2/css?f%5B%5D=satoshi%40variable&display=swap).
Fallback is a readable system sans stack. Match fallback metrics where feasible;
font readiness may refine composition but must not delay access to controls.

| Role | Compact size / line height | Wide size / line height | Weight |
| --- | --- | --- | --- |
| Homepage display | 36 / 40 px | 72 / 76 px; cap 80 / 84 on large screens | 700 |
| Page title | 28 / 34 px | 36 / 42 px | 700 |
| Section title | 22 / 28 px | 24 / 30 px | 600 |
| Item title | 17 / 24 px | 18 / 26 px | 600 |
| Transcript/body | 16 / 26 px | 16 / 26 px; optional 17 / 28 reading size | 400 |
| Descriptive lead | 18 / 28 px | 20 / 30 px | 400 |
| Controls/navigation | 14 / 20 px | 14 / 20 px | 500 |
| Metadata | 13 / 18 px | 13 / 18 px | 400 or 500 by role |

Implement scalable sizes in rem, with a 16px default root; the px values above
describe the reference size, not a locked user zoom. No essential 10/11px labels.
Avoid broad all-caps navigation. Display tracking about -0.035em, titles -0.02em,
body neutral; verify Satoshi optically rather than applying one tracking value.
Prose target 60–72 characters per line; transcript ceiling 74ch. Balance short
headings; preserve authored paragraphs, lists, citations, and code blocks. Use
tabular numerals for counts/time/cost. Code and raw structured data may use the
existing system monospace fallback, not a second display identity.

### 5.2 Layout primitives

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 reference px.
- Page gutters: 16 compact, 24 medium, 32 wide; respect safe-area insets.
- General content maximum 1280px; homepage field may bleed to viewport edges.
- Default form reading width 720px; room layout is viewport/task based.
- Radii: 6px small labels, 8px controls, 12px grouped surfaces, 20px major
  floating dialog; full pill only for the homepage CTA or an actual compact
  selector, not every label/card.
- Common controls: 40px desktop height with at least 44px touch target; 48px
  compact primary controls. Dense icons may be visually 20px but keep an adequate
  hit area and spacing. No hover-only essential actions.
- Breakpoints are content-driven: compact <768px, medium 768–1199px, wide
  >=1200px are proposed layout bands, not device detection rules.

## 6. Shared component contracts

| Component | Required anatomy and behavior |
| --- | --- |
| Button/link | Real action vs navigation semantics; one clear primary per task region; labelled busy state; preserve width during work; no magnetic pointer behavior |
| Icon control | Lucide retained, consistent stroke/size; accessible name; tooltip when helpful, not a substitute for naming; focus-visible equal to hover |
| Input/textarea | Persistent label; helpful description; validation tied to field; error text and summary where appropriate; input never relies on placeholder as label |
| Select/menu | Familiar keyboard behavior; current choice indicated by text/check; solid popup; do not use a bespoke constellation picker for routine settings |
| Tabs | Correct selected/tab/panel semantics; visible keyboard focus; scrollable only within the tab strip if necessary, not the page; no hidden essential desktop-only panels |
| List/table | Stable identity; headings/columns where meaningful; separators rather than nested cards; responsive equivalent retaining actions and metadata |
| Participant identity | Stable artwork/initial fallback, name, role; color supplementary; distinguish AI from You; never fake human portrait identity |
| Status | Text and optional icon plus color; exact runtime status mapped honestly; unknown status gets neutral wording, never optimistic success |
| Citation | Named source/action; selected state; resolvable identity retained; external action distinct from in-app preview |
| Inspector/dialog | Clear title/close; stable size constraints; appropriate modal semantics only when modal; preserve return target/reading position |
| Notice/error | Concise specific cause and available next step; inline first, toast only secondary; no transient-only blocking error |
| Skeleton | Layout-matched, short-lived placeholder; no fake progress; no perpetual shimmer when content is available |
| Empty state | Explain this actual scope and offer a supported next action; not a large marketing illustration on every screen |

Focus ring: 2px minimum visible accent/appropriate high-contrast ring, 2px offset,
not clipped by container overflow. Focus contrast must remain adequate against
adjacent colors. Selected and focused are distinct states. Destructive actions
use explicit wording and existing confirmation semantics; color is not consent.

Layer order: base content 0, local selection 10, sticky chrome 20, tutorial
highlight 30, tutorial/notification 40, modal scrim 50, dialog 60, dialog-owned
popup/tooltip 70. Nesting contexts must be deliberate. Tutorial hides while a
modal is open; its numeric layer is not permission to paint over a focus trap.

## 7. Motion system: throughout the product

### 7.1 Intent and tokens

Motion has four jobs: orient, connect cause to result, show real state, and
provide tactile feedback. Every screen in Spec 33 has choreography; the solution
is not an animated homepage around an otherwise abrupt application.

| Token | Duration | Default use |
| --- | --- | --- |
| `m-instant` | 0ms | Urgent state/security changes, reduced-motion spatial changes |
| `m-feedback` | 120ms | Hover, press release, local color response |
| `m-state` | 180ms | Selection, disclosure content, inline feedback |
| `m-enter` | 240ms | Panel/dialog entry, settled new item |
| `m-exit` | 160ms | Closing a transient surface |
| `m-layout` | 280ms | Intentional panel/layout adjustment, not every text reflow |
| `m-scene` | 650ms | Homepage scene crossfade; Spec 32 may refine |

Curves: enter/settle `cubic-bezier(.22,1,.36,1)`; exit
`cubic-bezier(.4,0,1,1)`; reciprocal state `cubic-bezier(.2,0,0,1)`; linear only
for true determinate progress or ambient movement. A spring is permitted for
hero text or a small selector if critically damped/near non-overshooting;
routine app panels do not bounce. These are proposed starting values, tuned as
a family rather than varied arbitrarily screen by screen.

### 7.2 Reusable choreography

| ID | Trigger | Normal behavior | Reduced motion |
| --- | --- | --- | --- |
| M01 Control | Hover/press/focus | Color/edge 120ms; pointer press at most scale .985; keyboard focus immediate | Color only; immediate focus |
| M02 Page | Successful navigation | New content opacity 0→1, y 6→0, 180ms; shell stays; no waiting for old exit | Immediate content; normal focus/navigation |
| M03 Selection | Tab/item/speaker selection | Local indicator/color 180ms, selected content 120ms opacity; no full-page slide | Immediate, selected label retained |
| M04 Disclosure | User expand/collapse | Bounded region size 180ms and content fade; interruption returns from current size | Immediate size change |
| M05 Inspector | User open/close | Solid panel x 12→0 and opacity over 240ms; close 160ms; one bounded layout resize up to 280ms | Immediate placement; same focus/selection |
| M06 Dialog | Open confirmation/evidence/menu | Dialog opacity/scale .985→1 in 180–240ms; scrim fades; no blur animation | Opacity <=80ms or immediate |
| M07 Mutation | Actual accepted create/save/archive | Local state swaps 180ms; at most 4px item settling, no whole-list stagger | Immediate result and announcement |
| M08 Progress | Actual operation starts/updates | Quiet status indicator; real progress fill up to 180ms; indeterminate only when unknown | Static activity icon plus text; numeric updates intact |
| M09 Notice | New error/toast/event | Opacity + y 4→0 in 180ms; never shake a form or pulse the viewport | Immediate/<=80ms opacity |
| M10 Reorder | Actual sort/filter/returned order | Preserve keyed rows; FLIP-style movement <=240ms only after explicit action | Immediate order; announce result count |
| M11 Skeleton | Unresolved initial read | Static tonal blocks; optional low-amplitude 1.6s opacity cycle while loading | Static placeholders + loading text |
| M12 Theme | Appearance change | Shared palette swap; optional 120ms local surface change; paths/content stable | Immediate palette swap |

### 7.3 Interruption, streaming, and correctness

- Dispatch an action on activation, not `animationend`. Completion comes from
  runtime/query settlement, not a timer, visual percentage, or closed panel.
- Rapid open/close/select cancels or reverses from the current visual state.
  Do not queue animations until the interface falls behind input.
- Prevent duplicate submissions using actual operation state/idempotency. An
  animated disabled button alone is not an admission guard.
- Never animate every streamed token/word, restart an entrance on refetch, or
  use client-side typewriting as a replacement for the real SSE stream.
- Preserve keyed DOM, text selection, focused controls, scroll anchors, draft
  contents, and citations while adding motion. No animation-driven remounts.
- Keep focus and accessible availability correct while closing. A visual exit
  must not leave invisible tabbable controls or a ghost modal blocking the page.
- Rehydrated historical records do not replay event notifications or entrances.
  Animate at most the newly observed item; a long list never cascades on load.
- Logout/private access loss clears/hides private content immediately, without
  an exit animation that retains private text or preview bytes.

### 7.4 Delivery and performance policy

Use current CSS transitions/keyframes and a small shared imperative animation
helper where needed. No new animation dependency is mandated by these specs.
If a library becomes necessary, review its scoped benefit, bundle cost, and
compatibility before adding it; do not introduce GSAP and Motion in parallel.

Prefer transform/opacity; bounded disclosure/layout animation is an explicit
exception that must be profiled. Avoid animated filters/backdrop blur in the
working app. Canvas/hero rendering is lazy and isolated from transcript updates.
No per-frame React state for particles or per-token layout measurement. Stop
ambient work offscreen/hidden, clean up observers/frames on unmount, and cap DPR.

Proposed acceptance budgets: ordinary interaction animations <=300ms; no motion
added delay before an action is operable; no animation-attributable main-thread
task >50ms in the agreed interaction traces; aim for <=16.7ms frame work on the
reference desktop and <=33ms on the constrained mobile profile. Profile actual
traces; these are targets, not claims of measured performance.

## 8. Accessibility and complete states

Target WCAG 2.2 AA: normal text >=4.5:1, large text >=3:1, required non-text
boundaries/state indicators >=3:1. Measure real composites, not just palette hex
pairs. Disabled controls still explain unavailable reasons where needed.

All tasks work keyboard-only; include skip-to-main, semantic landmarks, page
headings, labelled controls, predictable dialog focus/return, and visible current
navigation. Test 200% text enlargement and 400% browser zoom/reflow at a 1280px
desktop viewport. Essential content must remain usable at 320 CSS px; large data
tables/documents may scroll within a labelled region, not force page overflow.

Reduced motion disables spatial travel, ambient loops, parallax, shimmer, and
automatic headline cycling; it does not remove completion feedback or functions.
No flashes or rapid strobing. Infinite decorative effects need a reachable pause
control; homepage details are in Spec 32. Reduce transparency independently of
motion. Forced-colors mode uses system colors and solid surfaces.

For each component, test: initial/loading, ready, empty, active/pending, success,
recoverable error, terminal/unavailable, permission loss where applicable, and
keyboard focus. Long names, multi-paragraph text, filenames, and localized-like
expanded strings cannot silently vanish behind permanent truncation.

## 9. Verification and acceptance

No acceptance is implied by writing these files. During implementation, retain
the existing frontend architecture/unit/browser suites and add focused checks.

Specification-authoring check: calculated sRGB contrast for the opaque palette
keeps the seven text/accent/status foreground roles at >=4.5:1 against all four
listed solid backgrounds in both appearances. `on-accent` also exceeds 4.5:1,
and `border-control` exceeds 3:1 against the listed solid backgrounds. This is
arithmetic validation only; glass composites, focus placement, assets, disabled
states, and browser rendering still require the acceptance evidence below.

| Gate | Required evidence |
| --- | --- |
| DS01 Theme completeness | Every route in Spec 33 and both homepage appearances reviewed in Light/Dark/System; overlays/native controls consistent |
| DS02 Theme isolation | Toggle during a stream, practice edit, open preview, and locked vault; no mutation/refetch/reset/unlock; storage/network inventory unchanged |
| DS03 Typography | Self-hosted licensed variable font; actual 400/500/600/700 rendering; fallback/font failure; no stale Inter/Geist dependency |
| DS04 Contrast/material | Browser-composited contrast table; glass over worst-case assets; opaque/forced-color fallback; no nested glass |
| DS05 Components | Keyboard and pointer state matrix; focus ring visible; labelled icon controls; touch targets; no hover-only action |
| DS06 Motion coverage | M01–M12 exercised on actual screens; rapid reversals, back/forward, refetch, reduced motion, and animation-disabled operation |
| DS07 Responsiveness | 320px, 390x844, 768px, 1024x768, 1440x900, and wide layout; enlarged text/zoom; no unintended page overflow |
| DS08 Runtime preservation | Existing no-Auth replay, no persistent demo writes, vault separation, evidence identity, durable turn, and tutorial gates remain passing |
| DS09 Performance | Captured interaction traces and asset/bundle report; no frame loop tied to React streaming updates; cleanup verified |

## 10. Review decisions and implementation sequence

User-locked: constellation direction, restrained glass, Satoshi roles, both
appearances, four homepage sections, application-wide animation. Proposed here:
palette, type sizes, spacing, radii, timings, theme preference lifetime, and
retaining Lucide. Review these before broad implementation.

Sequence within this spec: validate token contrast/font licensing; establish
appearance and primitives; prove one animated form/list/dialog/inspector pair
in both themes; integrate the shared motion hooks; then apply Specs 32–33.
Do not ship component changes that temporarily erase replay disclosures, actual
error states, or focus behavior to obtain a cleaner screenshot.
