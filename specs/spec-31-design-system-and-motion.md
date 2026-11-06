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

## Execution record

Implementation status: **implemented locally, not accepted.** Specs 32 and 33
remain. The entries below are actual results for the `ui-redesign` branch. No
hosted deployment, route-by-route visual review, font redistribution permission,
or performance trace is claimed.

The implemented slice includes the semantic light/dark palette and six identity
slots, self-hosted Satoshi, the memory-only System/Light/Dark owner and menu,
shared primitive/state/motion contracts, skip link and named main landmarks, and
the migration of every existing screen off its hardcoded palette. The only
intentional hardcoded brand mark is the homepage logo gradient and Sparkles.

| Check | Command/environment | Result |
| --- | --- | --- |
| Frontend unit/integration | `cd frontend; npm test` | 110 files, 652 tests passed (24.80s); no failures. Existing error-path console warnings only. |
| Architecture | `cd frontend; npm run test:architecture` | 6 files, 42 tests passed (5.62s), including 7 contrast and 6 theme-boundary checks. |
| Types/lint/build | `npx tsc --noEmit`; `npm run lint`; `npm run build` | TypeScript clean; ESLint 0 errors and 19 pre-existing warnings; production build compiled 20 routes in 5.2s. |
| Appearance journeys | `cd frontend; npx playwright test e2e/appearance.spec.ts` | 7 passed (27.5s): first-paint System, explicit Light, soft-navigation retention, reload return to System, no storage/network/URL/tutorial mutation, practice draft retention, 320px, skip link, Satoshi 400/500/600/700 plus italic, reduced motion. |
| Production browser journeys | `cd frontend; npm run test:e2e:prod` | 45 tests: 43 passed, 2 skipped (1.2m). The skips are the conditional legacy and mixed suites, run separately below. One earlier full run hit a citation click timeout under parallel load; the same test passed isolated (2.9s) and in the repeat full run (2.1s). |
| Legacy compatibility | `npm run test:e2e:legacy` | 1 passed (24.1s). |
| Mixed operator isolation | `npm run test:e2e:mixed` | 1 passed (17.2s). |
| Contrast arithmetic | `theme-contrast.test.ts` | Dark minima: muted 4.76, border-control 3.15, on-accent 8.86. Light minima: muted 4.78, border-control 3.45, on-accent 7.88. Status and identity soft pairs pass. |

| Gate | Status | Evidence and remaining work |
| --- | --- | --- |
| DS01 Theme completeness | Partial | Every existing route was migrated to semantic roles and both appearances. No route-by-route manual state review was captured; Spec 33 routes do not exist yet. |
| DS02 Theme isolation | Partial | E2E proves no storage/network/URL/tutorial change, reload return to System, soft-navigation retention, and practice-draft retention. Streaming, an open evidence preview, and a locked vault were not separately toggled. |
| DS03 Typography | Partial | Satoshi variable and italic are self-hosted; 400/500/600/700 plus italic load in the browser. Fontshare FFL forbids repository redistribution, so the woff2 files are gitignored and fetched by `npm run fonts:fetch`; fallback/font-failure rendering was not measured. |
| DS04 Contrast/material | Open | Arithmetic contrast tests pass. No browser-composited glass, worst-case asset, or forced-colors table was captured. |
| DS05 Components | Partial | Busy states, form-field wiring, accessible names, keyboard journeys, dialog focus/return, and 40/44px targets are covered. The full pointer/keyboard state matrix is not documented. |
| DS06 Motion coverage | Partial | M01–M12 vocabulary and reduced motion exist. M01, M03, M05, M06, M09, M11, and M12 are applied; M02, M04, M07, M08, and M10 are vocabulary-only or deferred to Specs 32–33. |
| DS07 Responsiveness | Partial | 320×844, 390×844, 1280×720, and 200% zoom are covered. 768, 1024×768, 1440×900, and wide layouts were not separately reviewed. |
| DS08 Runtime preservation | Local pass | Unit, integration, production browser, legacy, and mixed-operator suites pass, including no-Auth replay, no persistent demo writes, vault separation, evidence identity, durable turn, and tutorial gates. Hosted gates were not run. |
| DS09 Performance | Open | No interaction trace or asset/bundle report was captured, and no frame-loop or cleanup profile was recorded. |

No gate above is recorded as complete where its required evidence is still
missing.

## Exit and rollout

Exit when:

- every route, overlay, and native control has been reviewed in Light, Dark, and
  System, including the Specs 32–33 screens;
- theme toggles during a stream, an open preview, and a locked vault leave
  storage, network, drafts, playback, credentials, and focus unchanged;
- the font license permits the chosen distribution and fallback/failure
  rendering is verified;
- browser-composited contrast, glass over worst-case assets, forced-colors, and
  opaque fallbacks are recorded;
- the component keyboard/pointer matrix and M01–M12 choreography are exercised
  on the actual application screens;
- 320px, 390px, 768px, 1024px, 1440px, wide, 200% zoom, and 400% reflow pass;
- local and hosted runtime-preservation gates remain green; and
- interaction traces show no animation-attributable frame loop or unbounded
  main-thread task.

Rollout is gated on the manual visual review and font-license confirmation above,
then proceeds through Specs 32 and 33 on the same token foundation. Rollback
reverts the visual and appearance commits without changing runtime data, event
contracts, credentials, or replay evidence; the appearance preference is memory
only and disappears on reload.

## Addendum A: Room-first corrective pass

### A.1 Priority, scope, and status

**Required next implementation slice: correct the meeting room before proceeding
with the homepage or a broad application redesign. This addendum is specified,
not implemented or visually accepted.**

The review of the populated, 1920x917 dark demo-room screenshot and current source
found a foundation migration, not a convincing room redesign. The new Satoshi,
semantic palette, appearance owner, and shared primitives are useful work to keep.
They do not compensate for a compressed discussion, oversized control stack,
telemetry-heavy rail, weak type hierarchy, or a tutorial covering its own task.
Screenshot proportions are observations, not browser measurements or a contrast
audit. Measure the corrected implementation as required below.

This is a bounded correction to Spec 31's actual role adoption and acceptance,
bringing forward the necessary room-layout requirements from
[Spec 33](spec-33-application-experience.md). It is not a fourth design spec or
permission to implement every Spec 33 screen. For this room, the requirements
below take precedence over earlier permissive composition language. Runtime,
permission, evidence, accessibility, and recording contracts remain controlling.
The execution record above remains historical evidence; its test passes do not
constitute acceptance of this corrective pass.

### A.2 Required composition: discussion first, controls second

The room must be recognizably recomposed, not the existing seven-tab chat layout
with another palette or radius adjustment. Use this hierarchy in both themes:

```text
Quiet global navigation                                     Appearance
Back   Meeting title                         Recorded   Details   Close
Agenda / as-of context, with access to the complete text
Named participant perspectives; compact, distinct identities
-----------------------------------------------------------------------
Discussion                                  | Meeting record [hide]
                                            | Disagreements / Consensus
Speaker, role, readable contribution         | Actual topics and reasons,
                                            | or an honest empty state
Sources attached to the contribution         | Selected record detail
                                            |
-----------------------------------------------------------------------
Who speaks next?  [Actual available participant actions]     |
Prepared question preview [Expand] [Existing send action]    |
Playback / speed / relevant status, as quiet utilities       |
```

The wireframe expresses placement, not invented data or additional commands.
The director dock belongs below the discussion, not beneath an unrelated rail.
Its live variant uses the real composer instead of a prepared-question preview.
The record is collapsible; at narrower widths, use a labelled secondary view or
overlay with a clear return to discussion. Files, roster, summary, and closing
remain reachable under their actual capabilities. Give primary discussion,
record inspection, secondary views, and meeting actions distinct hierarchy;
do not retain seven equally prominent destinations as the visual centerpiece.
Opening the Close workflow is not the act of ending a meeting.

### A.3 P0: Correct height ownership and recover reading space

- One layout owner allocates the dynamic viewport between actual global chrome
  and the room. Remove the nested `h-screen` assumption in `MeetingRoom` beneath
  `DemoNav`; account for wrapped navigation, operator chrome, and changing text
  size rather than subtracting an assumed header height everywhere.
- Make the room's flex/grid ancestry shrink correctly. At normal desktop text
  size, the room must not create an outer page scrollbar merely because a
  full-viewport child was placed below the header. Discussion scrolls within
  its own viewport; a long inspector can scroll independently.
- At 1440x900 and 1920x917, with the question collapsed, no expanded operation
  details, and no blocking error, target **at least two-thirds of the conversation
  work area's height for the scrollable discussion**. The work area is measured
  below the local heading/view controls/participant strip to the bottom of the
  room; the director dock uses the remainder. Record the actual pixel heights
  and ratio. Shrinking text or clipping controls to meet the ratio is a failure.
- Replace the current controls region that can consume `55dvh` with a compact
  resting dock. Do not impose another large viewport-height allowance as its
  normal composition. Keep required errors, queued operations, and recovery
  actions accessible through bounded disclosure where appropriate.
- The ratio is a baseline desktop gate, not a fixed-height rule for enlarged
  text, short viewports, expanded questions, or the on-screen keyboard. Those
  states must reflow or use an explicitly labelled scroll region without hiding
  content, actions, focus, or source links. Do not create three competing nested
  scroll regions in the ordinary resting conversation column.
- Preserve existing near-tail behavior: follow new content only while the user
  is already at the tail. Never substitute page-level `scrollIntoView`, forced
  scrolling after every token, or a reset to the latest message on panel changes.

### A.4 P0: Consolidate the director and playback controls

- Keep speaker actions, the director action, operation feedback, and playback
  utilities in one coherent dock rather than separate full-width bands and cards.
  Present the real next action prominently; replay speed and replay-last-turn
  are secondary utilities, not additional major sections.
- The recorded question rests as a concise, read-only preview, normally no more
  than two visual lines, with an explicit labelled Expand/Collapse disclosure.
  Expanding exposes the complete, exact prepared text and works by keyboard.
  Do not represent a fixed question as an editable, permanently three-row form.
  Collapsing must not make the full text unobtainable to assistive technology.
- Keep the existing send action and its actual busy/unavailable semantics. A
  disclosure does not submit, select a participant, advance playback, or become
  a new prerequisite for sending. Do not defer the question's availability until
  all prepared replies are complete if the runtime already permits it earlier.
- Selection and immediate action must remain distinguishable. Do not add a new
  select-then-confirm stage to controls that currently start an admitted turn.
- Move closing eligibility guidance into the closing action/workflow or a
  concise contextual status. Remove the permanent separate closing-guidance
  band from the resting discussion, without hiding the actual reason when the
  user needs it or removing the route to the Close view.
- Preserve Show full response, Replay last turn, 1x/2x, legal prepared actions,
  live operation observation/recovery, and all capability gates. Observation
  cancellation is not operation cancellation. No autoplay, auto-next speaker,
  synthetic progress, or newly invented Cancel/Skip command.

### A.5 P0: Apply typography and surface hierarchy to the actual content

The presence of font files and CSS roles is not sufficient. Apply the roles to
the rendered room and record computed styles in both appearances:

| Role | Required room treatment at ordinary desktop size |
| --- | --- |
| Meeting heading | Satoshi 600 or 700, 24-28px with suitable line height; distinct from navigation, without forcing the full instrument name onto one toolbar line |
| Discussion | Satoshi 400, 17px/28px; compact baseline 16px/26px; actual Markdown paragraphs and lists inherit the role, not `prose-sm` overrides |
| Speaker attribution and controls | Satoshi 500, normally 14px/20px; role/name remain readable and distinguishable |
| Time, as-of, secondary technical data | Satoshi 400/500, normally 13px/18px; not the primary reading style |

Keep the complete title and agenda accessible through wrapping or an explicit
disclosure, not hover-only access to a permanently truncated string. The room
heading is a context-specific use of the scale, not a requirement to put a 36px
general page title into an already constrained toolbar.

Remove the repeated `max-w-[80%]` restriction inside the already constrained
discussion column, including the active projection. Use a readable contribution
measure around 60-74ch, available width at compact sizes, and consistent alignment
between historical and streaming content. Wide screens must not produce a thin
message column floating in unused space. Code and tables retain local overflow.

Use `canvas` for the environment and a stable opaque reading surface for the
discussion. Separate contributions primarily through spacing, attribution, and
typography, not another rounded rectangle around every AI response. The dock is
part of that work surface, not an additional glass card. Use a quiet divider for
the record and clear selected/primary states. Borders must communicate grouping,
not outline every nested region. Retain measured semantic tokens; more blur,
brighter outlines, moving background stars, and decorative gradients are not
acceptable fixes for blandness.

### A.6 P1: Replace the telemetry rail with a useful meeting record

- The ordinary wide room uses the record position for actual disagreement topics,
  reasons, targets/status, consensus topics, participants, and recorded strength.
  It must support inspecting substantive items, not merely repeat counts.
- If no events exist, say so plainly. Do not generate an extra AI summary, invent
  source associations, imply that agreement verifies truth, or fill the rail
  with fabricated example content. Existing files remain reachable separately.
- Move cost, token utilization, message counts, and other operational telemetry
  into Meeting details. Remove the permanently exposed context meter and the
  repeated stack of participant cards from the main record position.
- Preserve current record selection, evidence identity, contribution scroll
  anchor, drafts, focus, and active operation while opening or closing the rail.
  Keep the shared evidence dialog by default; this pass does not require a new
  evidence renderer or a second simultaneously mounted viewer.

### A.7 P1: Give participants distinct, restrained Sabha identity

Use a compact strip of named participant perspectives with readable mandates,
and carry the same identity into contribution attribution and actual record
participants. Repeating the first character of each name is not sufficient when
all three participants become `T`.

Until artwork is separately approved, use existing identity slots plus distinct
role marks/shapes and full names. Do not generate new assets or invent human
portraits as part of this addendum. Color alone cannot encode identity. Any
active-speaker emphasis must reflect actual runtime state, not a decorative
orbit, simulated agent activity, or an implication that the system chooses turns.
This participant system is the room's constellation signature; stars need not
move behind paragraphs for the room to feel like Sabha.

### A.8 P1: Make the tutorial coexist with the task

The tutorial must not cover the next-speaker actions, question disclosure/send
action, or source control it is teaching. Use a collision-safe adjacent position
when space exists; otherwise reduce to the existing compact hint/fallback or
hide it until the anchor is usable. Do not reserve a large empty region that
recreates the reading-space problem. Keep Hide available.

Preserve one real instance of each tutorial anchor, including
`room.tab.disagreements` and `room.tab.consensus`, on the actual applicable
control. Regrouping views must update anchor placement rather than create hidden
duplicate controls. Missing/clipped anchors and modal/streaming states retain
their existing suspension behavior. Do not auto-open panels, scroll the page,
steal focus, or advance the tutorial on an animation timer to stage a screenshot.

### A.9 Motion must explain this new structure

Apply the existing vocabulary to real interactions: M03 for actual selection,
M04 for question/details disclosure, M05 for the record, M06 for the existing
evidence dialog, and M08/M09 for genuine operation feedback and new errors.
Keep the viewport and resting dock stable; preserve the contribution anchor
during a bounded inspector resize. No entrance cascade for retained history,
per-token fades, historical toast replay, or theme-triggered remounts.

Test interruption midway through expand/collapse and record open/close. Actions
remain immediately operable; reduced motion changes placement immediately while
retaining state, focus, feedback, and all functions. Motion is required polish
around a corrected hierarchy, not a substitute for the hierarchy.

### A.10 Room-first verification and release gate

Implement and review this slice before extending the visual rollout. Use actual
public recorded content and a permitted synthetic/live fixture where necessary;
never place private operator data in review artifacts. Capture matching light
and dark views with the same meeting and checkpoint so composition is comparable.

| Gate | Required evidence; all are initially open |
| --- | --- |
| RF01 Height and reading space | 1440x900 and 1920x917 resting-room screenshots plus measured work-area/discussion heights and ratio; no accidental outer page scroll; compact dock and accessible utilities |
| RF02 Real type adoption | Browser-computed heading, historical Markdown, streaming projection, attribution, and metadata styles; full title/agenda access; readable measure without nested 80% restriction |
| RF03 Recomposition | Before/after populated screenshots show the discussion-first hierarchy, distinct surfaces, compact participants, secondary telemetry, and substantive or honestly empty record; a token-only reskin fails |
| RF04 Director behavior | Collapsed and expanded exact question, actual send/busy/unavailable states, speaker actions, playback utilities, and closing guidance; availability and command counts unchanged; live draft/queue/recovery retained |
| RF05 Tutorial and evidence | Tutorial visible beside each applicable task without collision; compact fallback; selected citation and record states; evidence error/retry and close/focus return; no duplicate anchors/viewers |
| RF06 Responsive accessibility | 320px, 390x844, 768px, 1024x768, and wide layouts; 200% text and 400% zoom/reflow; keyboard traversal, long text, on-screen keyboard, solid/forced-colors fallback; no clipped actions or horizontal page overflow |
| RF07 Motion and continuity | Normal/reduced motion, interrupted transitions, stream in progress, scrolled-up transcript, theme change, and inspector resize preserve focus, selection, draft, operation, and reading anchor; no page jump |
| RF08 Runtime and truth | Existing replay, practice, operator/vault, durable turn, evidence identity, closing, and tutorial suites remain passing; no new Auth/provider/storage calls from public replay; record relationships remain grounded |

Review the resting room, expanded question, long contribution, actual pending/
error state, record open and closed, tutorial visible, and evidence open in both
themes. Incompatible states can be separate captures; do not fabricate a single
impossible fixture to show all states at once. Include a short interaction trace
for disclosure, inspector, and streaming continuity, not screenshots alone.

Passing tests is necessary but does not establish that the page was redesigned.
The room-first gate also requires a recorded visual review against A.2-A.8.
Document measured results and remaining failures in this spec; do not mark RF
gates complete based on the earlier foundation execution record. Retain the
existing foundation work, fix and validate this room first, then resume Specs
32-33 without using their broader scope to defer these corrections.
