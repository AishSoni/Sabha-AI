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
No flashes or rapid strobing. Decorative effects are bounded and respect the
operating-system reduced-motion preference; the product intentionally exposes no
in-app animation controls. Homepage details are in Spec 32. Reduce transparency
independently of motion. Forced-colors mode uses system colors and solid
surfaces.

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

Implementation status: **implemented locally, not accepted.** Spec 32 is now
implemented and locally accepted; Spec 33 remains. The entries below are actual
results for the `ui-redesign` branch. No hosted deployment, route-by-route visual
review, font redistribution permission, or performance trace is claimed.

The implemented slice includes the semantic light/dark palette and six identity
slots, self-hosted Satoshi, the memory-only System/Light/Dark owner and menu,
shared primitive/state/motion contracts, skip link and named main landmarks, and
the migration of every existing screen off its hardcoded palette. The brand
system now uses the approved Constellation-S mark and **Sabha AI** wordmark: an
inline SVG with separate light/night groups, unique gradient-ID prefixes, and a
matching app icon. Sparkles remains only as a decorative semantic icon in the
demo CTA, not as a brand mark.

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

## Addendum B: Stellar environment, visible materials, and participant identity

### B.1 Direction, precedence, and implementation status

**Required visual direction, not implemented or accepted by this addendum.** The
foundation-only result was too plain, and the application did not visibly use
the glass material it defined. Addendum A repairs the room's composition; this
addendum supplies the shared visual language that must accompany that repair.
Neither atmosphere alone nor a usability-only rearrangement completes the
redesign. Retain the implemented Satoshi, semantic roles, appearance ownership,
and useful primitives rather than starting another foundation migration.

The following decisions are settled:

- Every non-homepage page has a **subtle animated purple-ish starfield**. The
  homepage retains its separately specified, more expressive constellation hero.
- Light and dark are first-class appearances, including atmosphere, materials,
  controls, participant marks, loading/error states, and accessibility fallbacks.
- **dddynamite by fffuel** is the selected source for geometric persona profile
  marks. Curate a coherent star/spark/burst family; do not reopen a general avatar
  pack comparison or replace the application's ordinary Lucide control icons.
- Glass remains selective, but its use must be perceptible in the intended
  composition. A declared CSS class with no actual component usage is not delivery.
- The foreground needs its own hierarchy, identity, and deliberate motion. A
  starfield placed behind the old layout is not an acceptable redesign.

This is the latest visual direction within the existing three-spec set:

| Earlier wording | Controlling clarification |
| --- | --- |
| Spec 31, section 4.2: stars primarily on the homepage and sparingly in shell margins | All non-homepage pages use the shared stellar environment; stable opaque reading surfaces determine where it is visible |
| Addendum A.5: moving stars/gradients are not acceptable fixes for blandness | Atmosphere is now required, but cannot substitute for A's composition, typography, director-dock, and record corrections |
| Addendum A.7: generic shapes until artwork is separately approved | dddynamite is selected; the exact curated subset and its normalization still require review, not new image generation |
| Spec 33, section 3.3: no moving starfield behind content | No moving stars are visible through text-bearing working surfaces; a shared animated environment outside them is required |
| Spec 33, section 12.2: solid sign-in form, not a glass card over moving stars | Keep the form solid and readable, but include the surrounding sign-in page in the shared environment |

These clarifications do not weaken runtime, credential, evidence, accessibility,
recording, or no-persistence contracts. Addendum A's room-first order and RF01-RF08
remain required. This append-only record does not rewrite earlier execution
results or mark any old or new acceptance gate complete. Other documents remain
unchanged by this edit; this precedence table resolves their visual conflicts.

Exact star density, color/opacity, final glass tint, avatar subset, geometry,
renderer, and resource budgets need measured review. Numerical candidates below
are **prototype comparisons**, not user-approved tokens or measured results.

### B.2 Research baseline and limits

The source inspection preceding this addendum found:

- `frontend/src/styles/materials.css` defines `.material-glass`, including a
  12px backdrop blur and solid fallbacks, but the inspected TSX components did
  not consume that class. The operator header's translucent background alone
  does not establish the intended filtered material.
- Existing glass fills are 88% opaque in both themes. Even when applied, that
  treatment over a uniform backdrop may be barely distinguishable from solid.
- Full-page opaque `bg-canvas` wrappers occur across shells, sign-in, feature
  pages, and replay loading/error screens. Adding a root background without
  resolving these owners can leave it entirely hidden.
- Satoshi and the semantic palette are already implemented. The room's old
  nested viewport height, narrow bubble widths, control stack, and telemetry
  rail still require Addendum A's corrections in the inspected source.
- Existing violet identity roles offer a starting family: dark identity
  `#C7B0F5` / soft `#2B1F45` / ink `#E2D6FA`, and light `#6D3BB5` / soft
  `#F0E9FB` / ink `#52288C`. These are not automatically approved for every new
  avatar or translucent background pairing.

These are source findings, not fresh browser verification. Research did not
produce a rendered prototype, performance benchmark, finalized avatar assets,
or acceptance evidence. Recheck implementation details before coding; preserve
any subsequent work rather than assuming these observations remain unchanged.

### B.3 Required composition: environment, chrome, workspace, identity

Use four coordinated layers, not four independently decorated component kits:

| Layer | Job and treatment |
| --- | --- |
| Environment | Cool neutral canvas, faint purple atmospheric color, sparse stellar points; visible in deliberate margins, gaps, and through selected chrome |
| Navigation/chrome | One coherent, selectively translucent functional layer; quiet edge, controlled depth, readable controls |
| Workspace | Opaque reading/forms/lists/reports with confident Satoshi hierarchy, useful width, alignment, and spacing |
| Identity and activity | Stable dddynamite participant marks, visible names/mandates, honest selection and real operation feedback |

Environment ownership and foreground boundaries must be designed together.
Do not make every descendant transparent to expose the stars. Equally, do not
cover the complete page with an unintentional opaque wrapper and claim the
environment exists because its component is mounted. Provide meaningful exposed
areas in ordinary populated views without adding empty gutters that recreate
the room's reading-space problem. Compact layouts may expose less atmosphere;
do not sacrifice controls or reading width to match a desktop screenshot.

Use a stable reading surface, not a rounded box around every contribution.
Distinguish canvas, workspace, selected state, and primary action. Prefer
attribution, typography, spacing, and alignment over nested outlines. Glass,
purple tint, oversized radii, or stronger shadows do not replace that hierarchy.

### B.4 Shared non-homepage environment

#### Coverage and ownership

Cover all existing non-homepage routes: sign-in, demo board, meeting lists,
intake/creation, recorded and live rooms, personas and history, knowledge,
settings, and their application-owned loading, empty, error, and access states.
Application-owned not-found/error boundaries use the same static fallback where
the normal owner cannot mount. Do not promise animation during a fatal failure.
No new destination or route is required. Spec 32 owns the homepage environment;
do not stack the application field underneath its separate hero renderer.

Use a shared presentation owner whose lifecycle survives ordinary application
navigation. It must not become an owner of Auth, vault, replay, tutorial,
workspace, evidence, provider settings, or live-query state. In particular,
preserve the existing demo provider keys, package/version/content identity,
chapter bootstrap, and operation ownership. Switching theme or a background
preference cannot remount those owners, clear a draft, change a checkpoint,
close evidence, refetch content, or unlock credentials.

Audit each full-page background deliberately. Separate environmental wrappers
from opaque task surfaces rather than globally deleting `bg-canvas`. Keep
access-denied/private loading states non-revealing. A decorative environment
may be shared publicly; private chrome, text, or data must not flash during
access checks or linger in an exit animation after access loss.

#### Visual recipe and calibration

Prototype two complementary ingredients:

1. A broad, faint, asymmetric purple color wash, mostly static. It provides a
   perceptible but quiet backdrop for glass; tiny stars alone blur away.
2. Sparse points with restrained variation in size, brightness, and depth.
   They establish the stellar identity without reading as a particle demo.

Starting comparison ranges, not final tokens:

| Variable | Prototype candidate |
| --- | --- |
| Point sizes | Mostly about 1 CSS px, with occasional 1.5-2px points; test device-pixel rendering |
| Distribution | Irregular and sparse, no obvious grid or conspicuously repeated tile |
| Ambient travel | Approximately 0.15-0.3 CSS px/second; evaluate during actual reading, not only a still image |
| Depth | At most two gentle motion planes initially; depth through restrained scale/brightness, not dramatic parallax |
| Color wash | Faint, broad, mostly stationary violet/lavender; no moving luminous blob or saturated purple page flood |

Dark uses lavender/violet against cool ink; light uses restrained violet against
cool porcelain. Calibrate independently: do not invert artwork or reuse dark
opacities blindly. Purple is environmental color, not a requirement to recolor
the action accent, focus, success, warning, and disagreement roles to purple.
Do not introduce rainbow accents or turn every participant into a status color.

Initially exclude twinkling, shooting stars, flashing, animated connecting
lines, cursor attraction, cursor-following glow, hero-like spirals, and
individual avatar motion. No simulation of agents thinking or choosing turns.
The page should feel composed before the viewer notices that the field moves.
Stars are not meaningful information, a loading indicator, or an interactive
control, and must be absent from the accessibility tree and pointer handling.

#### Motion lifecycle and preferences

- The shared Appearance UI contains theme choices only. There is no in-app
  **Background animation: On / Paused** control anywhere in the product, and no
  second pause affordance in a header, footer, or settings drawer. Meeting
  playback, 1x/2x, Show full response, and genuine operation feedback remain
  separate product controls.
- With `prefers-reduced-motion: reduce`, render a static field from the outset
  and stop an existing decorative loop immediately. This operating-system
  preference is the sole authority that pauses decorative motion; no manual
  product preference overrides it.
- Suspend work while the document is hidden or the field is inactive. Resume
  from a stable position without a catch-up burst. Do not restart, reseed,
  flash, or replay an entrance on every route change, theme switch, or refetch.
- Preserve the application-field state when visiting/leaving the homepage but
  do not run a hidden application renderer there. Do not conflate it with the
  homepage hero's separate scene choreography or playback controls.
- With JavaScript, asset, or renderer failure, a theme-correct static canvas
  remains. All text, links, forms, dialogs, and runtime controls still work.

### B.5 Make selective glass perceptible and trustworthy

Use one coherent application navigation/chrome treatment. Where global navigation
and room toolbar are visually related, design a joined treatment, not a stack of
independently blurred cards. Chrome may adapt to the page; the requirement is
material coherence, not a new fixed-height enclosure around every toolbar.

Discussion, composer/director dock, documents, forms, lists, meeting record,
menus, and dialogs remain solid/raised by default. A non-homepage route such as
sign-in does not need a fabricated glass header merely to meet a coverage count.
Its shared environment and solid form are enough; glass has to serve navigation
or layering, not be a quota applied to every screen.

Calibrate the actual material, not just its CSS declaration:

- Compare **65%, 75%, and 88% tint opacity** with the same backdrop and blur in
  both themes. These are experimental samples, not three shipping variants or
  permission to globally lower all surface opacity.
- Begin with the existing roughly 12px blur budget, theme-aware tint, restrained
  upper-edge highlight, and soft depth shadow. Decide the final fill by readable
  compositing and visual review, not by choosing the most transparent sample.
- Use alpha in the background fill, not `opacity` on the whole control/container;
  text, icons, focus indicators, and necessary control boundaries stay opaque.
- Retain subtle background color transmission without making moving points or
  content sharply visible behind labels. Test the brightest permitted backdrop
  beneath each label and control, including hover, selected, and focus states.
- Inspect backdrop-root/stacking ancestry. Ancestor opacity, filters, masks,
  clipping, blending, or an already filtered surface can prevent the intended
  sampling. Do not solve a hidden backdrop by nesting more filters.
- Test top/side edges, sticky positioning, corner clipping, scroll sampling,
  seams between chrome regions, and portal/dropdown layering. If an extended
  masked sampling layer is genuinely needed, keep it bounded, decorative, and
  `pointer-events: none`; it must not cover nearby click or scroll targets.
- No nested glass, full-page blur, refractive SVG displacement, chromatic fringes,
  animated highlights, bright dashboard outlines, or default doubled filters.

Keep the existing unsupported-filter, reduced-transparency, explicit opaque,
and forced-colors fallbacks. Because `prefers-reduced-transparency` is not
universally supported, expose **Solid surfaces** as a memory-only Appearance
choice as well. Standard mode respects the OS preference where supported;
Solid surfaces always wins over the decorative material. Replace the fill and
edge treatment appropriately, not just the blur. This choice is independent of
appearance theme and motion preference and must leave actions, spacing,
selection, and focus intact.

### B.6 dddynamite participant marks

#### Curation and provenance

Use one curated dddynamite star/spark/burst family, not a collage of its entire
decorative collection. A candidate set of approximately 12-16 distinct marks is
a review starting point, not an approved quantity or finalized catalog. Favor
clear silhouettes that remain distinguishable at compact sizes. Exclude overly
intricate hatching, unrelated doodles, and offset sticker effects if they break
the shared optical language. No fake human portraits or generated artwork.

The [dddynamite page](https://www.fffuel.co/dddynamite/) explicitly declares MIT
licensing for these shapes. The [general fffuel license](https://www.fffuel.co/license/)
has an "unless otherwise noted" condition and separate redistribution restrictions;
retain the pack-specific declaration and recover/preserve the proper applicable
copyright and MIT permission notice when incorporating the selected assets.
The linked MIT destination was not a usable notice in the earlier research.
Do not treat public availability, the general license alone, or an unrelated
GitHub mirror as proof that public-repository redistribution is already cleared.
Pack selection is settled; asset-level notice verification is an incorporation
gate, not a reason to restart pack discovery.

Self-host only the selected trusted SVGs. Do not call a remote avatar generator,
send persona IDs to an external service, or ship the complete source collection
unnecessarily. Record source, selected shape identifier, notice/provenance,
catalog version, normalization, and fallback mapping alongside the assets.

#### Normalize for actual profile sizes

The inspected generator uses a 200x200 viewBox with configurable fills/strokes
and offsets. Its default 2.5-unit stroke becomes only **0.4 CSS px at 32px**;
the default 10-unit offset becomes 1.6px. These are scale calculations, not a
claim of a rendered visual test. Do not simply shrink the default illustrations.

- Prefer a filled silhouette, optionally with a deliberately legible outline.
  Begin with zero decorative offset for compact marks; normalize stroke weight,
  visual bounds, optical centering, and padding across the curated set.
- Review at **24px, 32px, and 40px**, on light and dark surfaces, selected states,
  monochrome, and solid/forced-color fallbacks. Mathematical centering alone is
  insufficient. Avoid star points clipping the frame or appearing much smaller
  than a neighboring rounded mark.
- Use the same geometry and assigned identity across themes. Recolor through
  semantic avatar foreground/detail/background roles, starting from the existing
  violet family where appropriate; do not invert with CSS filters or adopt the
  generator's default pink/blue palette as a new application theme.
- Inline trusted SVGs or a controlled local component may consume `currentColor`
  and explicit theme-role fills. An SVG loaded through an external `<img>` does
  not inherit the parent's `currentColor`; choose an explicit recoloring method.
  Do not inject unreviewed SVG markup, scripts, remote resources, or event handlers.

#### Identity behavior and reuse

An apparently random assignment is made once and remains stable; it is not
randomized on render, route change, refetch, theme switch, or roster reorder.
Use a versioned catalog and immutable persona/meeting-snapshot identity, not the
display name. Preserve existing assignments when adding participants; allocate
unused distinguishable marks where possible rather than reshuffling the roster.
If the set is exhausted, names/roles remain definitive; do not silently mutate
previous identities to manufacture uniqueness.

Recorded attribution follows the immutable meeting snapshot, not a later edit
to the practice template. Use presentation derivation or existing memory owners;
do not add persistent browser storage, rewrite a recording, or require a replay
schema migration merely to save avatar choices. Document the mapping/version and
test reload/restart consistency and collisions before accepting the catalog.

Carry the same mark/name into persona profiles, participant selection, the room
perspective strip, contributions, and actual recorded-agreement participants.
Full names and readable roles accompany marks where identity matters. A mark is
not a claim about expertise or a new status indicator. Adjacent decorative SVGs
are hidden from assistive technology; standalone identity controls have a real
accessible name. Shapes, not color alone, distinguish people. No per-avatar
animation, glow, or miniature starfield; ambient motion belongs to the environment.

### B.7 Foreground composition and application-wide motion

Implement Addendum A's room together with this language: large opaque discussion,
actual type-role adoption in historical and active Markdown, compact named
perspectives, integrated director dock, contextual evidence, and a collapsible
substantive meeting record. Preserve the two-thirds resting discussion target,
real prepared-question behavior, tutorial collision handling, and all RF gates.
Do not present a starfield/glass-only change as closing the room-first pass.

The same vocabulary supports different tasks, not one universal card dashboard:

| Screen family | Foreground structure |
| --- | --- |
| Meeting index/board | Readable meeting rows or a concise actual prepared-meeting introduction, accurate runtime labels and real next actions |
| Personas | Identity-led profiles with marks, names, mandates, versions, and actual scope; preserve prompt inspection versus activation |
| Knowledge | Source-library structure with processing/access states and the shared evidence viewer; no invented relationship graph or citation |
| Settings/access | Focused solid groups/forms and real controls; no disabled product scaffold, fake account flow, or credentials in public practice |
| Meeting/closing/report | Discussion, actual decision record, and readable saved results, not operational telemetry or fabricated executive summaries |

Spend visual emphasis on headings, participant identity, primary actions, and
selection; keep utility metadata secondary but readable. The signature comes
from the relationship of environment, selective material, perspectives, and
content, not extra pills, hairline boxes, giant gaps, or a logo repeated everywhere.

Use M01-M12 throughout real interactions: navigation/press, selected state,
disclosure, record inspector, evidence dialog, accepted mutations, real progress,
and errors. Keep retained shell state and reading position. No per-token effects,
historical message cascades, replayed historical toasts, magnetic controls,
cursor-chasing, or animation-driven domain completion. Transitions are brief,
interruptible, and never make the user wait to act. Reduced motion retains the
same information and functions without spatial choreography.

### B.8 Rendering, resource use, and failure strategy

Prototype a small number of precomposed SVG/CSS planes before choosing Canvas or
WebGL. Internal pages do not automatically inherit Cosmos's hero renderer,
scene scheduler, dependencies, or asset count. Keep decorative work outside
per-frame React state and outside feature runtime controllers. Use the existing
stack and motion vocabulary; a new animation library requires a demonstrated
need and review, not a simultaneous GSAP/Motion installation.

Keep the field viewport-bounded rather than allocating full-document-height
textures. Avoid large continuously animated blurred gradients. Use compositor-
friendly transforms where appropriate, but **moving content beneath a backdrop
filter can still be expensive**. Profile the combined effect, not just each part
in isolation. Do not apply `will-change` or forced layer promotion everywhere.
If a bitmap/canvas is selected, document resolution/DPR limits, resize behavior,
context-loss handling, memory use, and cleanup; do not silently use uncapped DPR.

Compare four controlled configurations on the same populated screens:

1. Static environment plus solid chrome: baseline.
2. Moving environment plus solid chrome: field cost.
3. Static environment plus glass chrome: material cost.
4. Moving environment plus glass chrome: actual combined shipping candidate.

Use representative desktop and constrained/mobile hardware, not only headless
screenshots. Record browser/version, device, viewport/DPR, asset/code bytes,
main-thread tasks, paint/composite behavior, frame-time distribution, and memory
or layer growth. Keep section 7.4's performance targets; do not import Spec 32's
homepage asset budget as an already measured application budget. Establish and
record an application-specific budget before accepting the chosen renderer.

Inspect scroll and stream performance, sticky chrome, inspector resize,
route/theme changes, and repeated mount/unmount. Hidden documents and inactive
environments do no decorative frame work. No accumulated animation callbacks,
listeners, nodes, or leaked textures after navigation. Prefer fewer points,
fewer/lower-resolution planes, smaller filtered areas, then static/solid fallback
over reducing text legibility or blocking interaction. A complete shutdown path
must clean up work; failure cannot invoke a remote service or live-data fallback.

### B.9 Required tests and visual acceptance

All gates below start **OPEN**. Existing unit/build/architecture passes and
opaque token contrast calculations do not establish composited contrast,
perceptible glass, subtle movement, usable avatars, or a completed redesign.

Use the same real public meeting/checkpoint and rights-cleared content for
matching light/dark comparisons. Use permitted synthetic fixtures for live
draft/operation/credential states; never capture private operator data, keys,
or unapproved source material. Capture incompatible states separately rather
than inventing an impossible fixture.

| Gate | Required checks and evidence |
| --- | --- |
| ST01 Coverage and composition | Inventory every existing non-homepage route plus owned loading/error/empty/access states. Capture board, populated index, persona, knowledge, settings, solid sign-in, and the corrected room in both themes. Show deliberate exposed environment, selective chrome, and opaque working surfaces; no accidental full-page cover or transparent paragraph backdrop. Homepage is not double-rendered. |
| ST02 Atmosphere calibration | Compare static/animated captures and a sustained reading interaction. Record final density, point size, drift, wash, and theme-specific values. Inspect irregularity, repeat seams, flicker/aliasing, foreground distraction, and bright patches. Test light independently, not by inversion. A pleasant still is insufficient evidence that motion is subtle. |
| ST03 Material calibration and contrast | Compare 65%/75%/88% tint samples at a controlled backdrop/blur in both themes. Record chosen values and actual text/control/focus contrast over the brightest permitted moving background, selected/hover states, and portal menus. Verify visible transmission without sharp stars behind labels; no label opacity, clipping seams, or nested filters. Retain WCAG AA thresholds from section 8. |
| ST04 Avatar catalog | Provide a provenance/notice record and visual contact sheet at 24/32/40px, both themes, monochrome and solid fallback. Inspect optical size, centering, distinguishable silhouettes, clipping, legible outlines and focus. Verify local safe assets, theme-role recoloring, names/roles, stable mapping through reorder/add/remove/theme/navigation/reload/restart, collision handling, and immutable recorded identity. |
| ST05 Preferences and accessibility | Keyboard/assistive-technology checks for Appearance and Solid surfaces. No animation control is exposed; OS reduced motion produces static first paint and halts loops; reduced transparency, explicit opaque, unsupported blur and forced colors produce coherent solid surfaces. Choices stay memory-only and independent from playback speed, real feedback and feature state. |
| ST06 Responsive/input | Exercise 320px, 390x844, 768px, 1024x768, 1440x900, 1920x917 and wide, plus 200% text and 400% zoom/reflow. Test long names/agenda, wrapped chrome, keyboard focus, touch, virtual keyboard, menus/dialogs, short viewports, and no horizontal page overflow or decorative hit interception. Reading width and operable controls take priority over matching exposed desktop margins. |
| ST07 Continuity and interruption | Trace soft navigation, theme/System changes, OS reduced motion, Solid surfaces, tab hiding/resuming, and homepage entry/return. No field reseed/entrance burst, catch-up, flash, duplicate renderer, feature remount, refetch, draft loss, focus loss, checkpoint change, or evidence reset. Interrupt disclosure/inspector transitions and stream while scrolled up; retain the contribution anchor and Addendum A's behavior. |
| ST08 Cross-browser/failure | Exercise supported Chromium, Firefox and WebKit targets, with actual browser versions recorded and real-device follow-up for relevant mobile behavior. Inspect sticky/backdrop sampling, corner/ancestor overflow, top-edge flicker, stacking/portal seams, click/scroll hit testing, and responsive fallback. Test JS/asset/renderer/context failure where applicable; content and real actions remain usable without the effect. |
| ST09 Combined performance | Record the four B.8 configurations on reference desktop and constrained hardware, including sustained reading/scrolling/streaming, inspector interaction and repeated routes. Compare frame/paint/composite cost, tasks, resolution, bytes and memory/layers; verify hidden and reduced-motion states stop work and cleanup is bounded. Document degradation choices and final application budget; an assumed GPU acceleration claim does not pass. |
| ST10 Runtime isolation and room-first completion | Keep RF01-RF08 and existing replay/practice/live/vault/evidence/closing/tutorial tests passing. Verify no new provider/Auth/settings/bootstrap/network calls or persistent writes caused by decoration/preferences/avatars; no command-count or prepared-action availability changes. Actual record relationships and access-loss behavior remain truthful. Visual completion requires Addendum A plus this material/identity review, not only passing tests. |

At minimum, room evidence includes resting and expanded question, long historical
and active contributions, record open/closed, tutorial visible/fallback, evidence
open/error/retry, and real pending/error controls in both themes. Include the
computed type and measured discussion-height evidence from A.10. Do not stage
these by auto-advancing the tutorial, faking events, or making unavailable actions
look available. The shared evidence viewer remains singular and revision-safe.

Include interaction recordings/traces, not just stills: ordinary background
movement while reading, reduced-motion fallback, material scroll edges, question expansion,
record open/close, theme switch during streaming, reduced/opaque fallbacks, and
avatar identity continuity. Record a visual decision for each gate with failures
and open questions. Mark a gate complete only against new evidence for this pass.

### B.10 Delivery order and evidence record

1. Recheck current source and preserve subsequent user work. Establish explicit
   environment/workspace ownership and a local comparison of background, material,
   and normalized participant marks in both themes. Do not change domain flows.
2. Apply the shared treatment to the **Addendum A room-first slice** and validate
   its actual populated states, height, type, dock, record, and tutorial. Do not
   defer its composition while polishing the environment or homepage.
3. Use that accepted vocabulary for Spec 33's remaining task-specific screens,
   covering every non-homepage page rather than only the room. Spec 32 retains
   the separately studied homepage composition and motion system.
4. Complete the route/state, accessibility, combined-performance, asset-notice,
   and regression evidence above before declaring the redesign accepted.

Record final values, selected catalog/version and notices, implementation choices,
comparison artifacts, computed contrast, traces, test commands/results, unresolved
failures, and visual review **in this spec's execution evidence**, keeping earlier
records intact. The current addendum only specifies that work. No application
implementation, SVG incorporation, benchmark, or new gate completion is implied
by its presence. Retain exactly three numbered redesign specs.

### B.11 Research references and how to use them

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui):
  use the method of reviewing environment, appearance, hierarchy and populated
  view types together, not its branding, navigation layout, or font as a template.
- [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
  and [Motion](https://developer.apple.com/design/human-interface-guidelines/motion):
  content-first material placement and purposeful optional motion. Native Liquid
  Glass adaptation is not an automatic capability of CSS on the web.
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
  and [Josh W. Comeau: Backdrop Filter](https://www.joshwcomeau.com/css/backdrop-filter/):
  backdrop sampling, boundaries, readability and edge pitfalls. Demonstration
  techniques do not mandate extra filters or constitute a measured performance
  guarantee in Sabha.
- [WCAG 2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
  and [web.dev: Motion accessibility](https://web.dev/learn/accessibility/motion):
  persistent automatic decorative movement normally needs an operable
  pause/stop/hide answer. This revision deliberately removes in-app animation
  controls; any future persistent decoration must be reviewed against this
  criterion, with OS reduced motion as the current mitigation rather than a
  claim of conformance.
- [MDN: prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency):
  support is limited; retain explicit and unsupported-browser solid fallbacks.
- [web.dev: Animations guide](https://web.dev/articles/animations-guide): profile
  layout/paint/compositing and use transforms/promotion judiciously; do not infer
  cheap combined blur from a transform-only background animation.
- [IBM: UI icon usage](https://www.ibm.com/design/language/iconography/ui-icons/usage/):
  optical alignment and small-size legibility principles, not a requirement to
  adopt Carbon icons, its font, or native size conventions.
- [dddynamite](https://www.fffuel.co/dddynamite/) and
  [fffuel license](https://www.fffuel.co/license/): selected asset source and
  notice verification, not a new pack search or evidence of completed vendoring.

## Addendum A execution record

Status: **implemented locally, not accepted**. This record covers Addendum A only.
Addendum B, Specs 32 and 33, the full RF01-RF08 visual evidence set, browser-
composited material evidence, and performance traces remain outstanding. The
earlier Spec 31 execution record above is historical and does not accept either
addendum.

### Implemented slice

- Single viewport ownership in the demo and operator shells; the room fills the
  remaining height instead of nesting `h-screen`. Ordinary pages still scroll in
  the shell content region, and the room has no page-level scrollbar.
- Room recomposition: full title and agenda, Recorded status, Details and Close in
  the room header; a compact named-perspective strip; a discussion-first surface
  with a collapsible substantive meeting-record rail; a quiet Chat/Roster/Files/
  Summary strip; queue and operation detail in bounded disclosure; telemetry moved
  to Meeting details.
- Director dock: speaker actions, director action, prepared question, playback
  utilities, queues and errors in one surface. The prepared question is an exact
  read-only two-line preview with labelled Expand/Collapse and an unchanged Send
  action. Closing guidance is contextual in the dock/Close state rather than a
  permanent full-width band.
- Room type roles and Markdown: separate room title, body, attribution and metadata
  roles; contributions use a 74ch measure without a nested 80% cap or a rounded
  bubble around every AI response.
- Six-shape participant mark derived from stable identity, alongside full names and
  roles. Color remains supplementary and active emphasis only reflects the runtime
  participant.
- Tutorial collision handling: the card avoids speaker, prepared-question and
  source controls plus the dock, with compact/hidden fallback and existing
  modal/streaming suspension. Record-tab anchors remain real controls.

Commits on `ui-redesign`:

| Commit | Scope |
| --- | --- |
| `280cd34` | `feat(meetings): make the room discussion-first` |
| `6aedbf4` | `fix(demo): keep tutorial tips clear of the room dock` |

### Verification

| Check | Command/environment | Result |
| --- | --- | --- |
| Types | `cd frontend; npx tsc --noEmit` | clean |
| Unit/integration | `cd frontend; npm test` | 111 files / 659 tests passed |
| Architecture | `cd frontend; npm run test:architecture` | 6 files / 42 tests passed |
| Lint | `cd frontend; npm run lint` | 0 errors, 19 pre-existing warnings |
| Build | `cd frontend; npm run build` | 20 routes compiled |
| Production browser journeys | `cd frontend; npm run test:e2e:prod` | 47 tests: 45 passed, 2 conditionally skipped |
| Room reading space | `frontend/e2e/room-reading-space.spec.ts` | 1440x900: work 669px, discussion 463px, ratio 0.6921; 1920x917: work 720px, discussion 514px, ratio 0.7139; no outer scroll; 320/390/768/1024 mobile checks passed |

Skipped journeys are the conditional legacy-journey and mixed-operator suites.
No failure was observed in the final production run.

Follow-up (user request): the recorded 1x/2x speed control and the frontend
playback-speed state were removed entirely. Recorded observation now always uses
the default 1x pacing; backend speed query support is untouched. The room retains
Show full response and Replay last turn. After this removal the frontend
unit/integration suite is 111 files / 657 tests, and the exploration journey is
named "expands a reply and resumes the composed meeting". This supersedes only the
speed-control part of A.4; the rest of Addendum A is unchanged.

### Gate status

| Gate | Status | Evidence / remaining work |
| --- | --- | --- |
| RF01 height/reading space | Partial | Measured desktop ratios and no outer scroll pass; compact dock present. Resting screenshots and manual state review not captured. |
| RF02 real type adoption | Partial | Room type roles and Markdown implemented; computed type and visual review of historical/streaming content not captured. |
| RF03 recomposition | Partial | Discussion-first composition, record rail, compact perspectives and secondary telemetry implemented; populated before/after captures not produced. |
| RF04 director behavior | Partial | Exact prepared text, disclosure, send/busy/unavailable semantics and command paths covered by tests; full interaction capture not produced. |
| RF05 tutorial/evidence | Partial | Collision-safe placement, compact fallback, anchors and existing evidence dialog pass browser tests; capture set and all evidence error/retry states not recorded. |
| RF06 responsive accessibility | Partial | 320/390/768/1024 browser checks and keyboard journeys pass; 200% text, 400% zoom/reflow and forced colors not separately reviewed. |
| RF07 motion/continuity | Partial | M03/M04/M05/M06/M08/M09 classes applied; reduced-motion suites pass; interruption traces and reading-anchor captures not recorded. |
| RF08 runtime/truth | Local pass | Replay, practice, evidence, closing, tutorial and production journeys pass locally. Hosted gates remain unexecuted. |

### Exit and rollout

Addendum A exits only when the RF01-RF08 evidence above is completed against the
actual recomposed room and the result is reviewed. Passing automated suites alone
does not establish the redesign. At the time of the Addendum A record, no
starfield, glass chrome, dddynamite asset, background-animation control,
Solid-surfaces preference or full non-homepage environment sweep was part of the
accepted scope. The later room refinement record below supersedes that visual
scope; Addendum B and Specs 32-33 remain separate work items.

Rollback is the two Addendum A commits; it does not require runtime, credential,
replay-evidence or stored-data changes. Appearance remains memory-only.

## Room refinement execution record

Status: **implemented locally, not accepted**. This record covers the requested
room layout refinement and a bounded first slice of Addendum B (shared atmosphere,
background-animation pause, and dddynamite participant marks). The pause control
was later removed by the animation-control removal record below. It does not
claim the full Addendum B route sweep or ST01-ST10 completion, and it does not
accept Addendum A or Spec 31.

Commits on `ui-redesign`:

| Commit | Scope |
| --- | --- |
| `a28d216` | `feat(design): add the shared stellar atmosphere and a pause control` |
| `629cb2d` | `feat(identity): add curated dddynamite participant marks` |
| `9348684` | `feat(meetings): tighten the room layout and inline guidance` |

### Implemented slice

- Shared atmosphere: deterministic purple-tinted star planes and broad wash in
  `components/atmosphere`, mounted behind the demo and operator shells. The field
  is fixed, decorative, `aria-hidden`, and pointer-events-none. Navigation chrome
  is selectively translucent; discussion, dock, and record surfaces stay opaque.
- At this stage Appearance owned a memory-only
  `Background animation: On / Paused` choice, independent of replay;
  `prefers-reduced-motion` forced the resolved state to paused and disabled
  manual On. No storage, cookie, network, Auth, provider, or query access was
  added. The manual choice was later removed; OS reduced motion remains the only
  pause authority.
- Ten local dddynamite star/spark/burst silhouettes, assigned deterministically
  from participant identity. Names and roles remain visible; color is
  supplementary; no initials or generic letter shapes are used. The director uses
  a mark from the same family. Source, generator MIT claim, and the general
  fffuel redistribution restriction are recorded in `dynamite-marks.ts`; the user
  accepted the asset terms. This is not a claim of general redistribution
  permission.
- Room header consolidates title, agenda, status, actions, and named perspectives.
  Chat/Roster/Files/Summary stay grouped at the left; Meeting record is the
  trailing toggle. Close keeps its existing workflow and eligibility.
- Contributions share one structure: mark, name, timestamp, then text. AI and
  director contributions are left-aligned without repeated rounded message
  containers or a large blue director bubble. Prepared reasoning and source
  disclosures are quiet inline rows.
- The dock is independently constrained rather than inheriting the 74ch
  transcript measure. Reply actions wrap without a horizontal speaker scrollbar;
  the prepared question uses an exact read-only preview with full-width expansion
  and a separated Send action; utility feedback remains, with no speed controls.
- Room guidance is an inline strip beside the reply controls. Help expands only on
  request, Hide remains available, and the trailing recording menu stays
  reachable. The floating card is suppressed for room reply prompts when the
  inline anchor is present; compact/missing-anchor fallbacks remain.

### Verification

| Check | Command | Result |
| --- | --- | --- |
| Types | `cd frontend; npx tsc --noEmit` | clean |
| Unit/integration | `cd frontend; npm test` | 112 files / 662 tests passed |
| Architecture | `cd frontend; npm run test:architecture` | 6 files / 42 tests passed |
| Lint | `cd frontend; npm run lint` | 0 errors, 19 pre-existing warnings |
| Build | `cd frontend; npm run build` | 20 routes compiled |
| Production browser journeys | `cd frontend; npm run test:e2e:prod` | 48 tests: 46 passed, 2 conditionally skipped |
| Identity contract | `npx vitest run src/components/identity/participant-mark.test.tsx` | 4 tests passed |
| Appearance/starfield | `e2e/appearance.spec.ts` | 8 tests passed at this record; the current suite has 13 and the manual pause was later removed |

Room reading space at 1440x900 remains above the two-thirds threshold: work area
674px, discussion 450px, ratio **0.66766**, with no outer page scroll. The
320x844, 390x844, 768x1024, and 1024x768 operability checks pass. The desktop
measure is tight; any added header or dock row must be re-measured rather than
assumed.

### Gate status

| Gate | Status | Evidence / remaining work |
| --- | --- | --- |
| ST01 coverage/composition | Partial | Demo/operator shells and room populated states are covered by browser journeys; no full non-homepage route inventory or capture set. |
| ST02 atmosphere calibration | Partial | Shared field, drift, wash, and reduced-motion behavior implemented; no sustained-reading or seam/alias capture series. |
| ST03 material calibration/contrast | Partial | Chrome uses translucent surface with opaque working surfaces; no 65/75/88% tint comparison or browser-composited contrast table. |
| ST04 avatar catalog | Partial | Ten local marks, stable assignment, silhouette/no-initial contract, and 24/32/40px component test exist; no both-theme contact sheet, forced-colors review, or complete provenance package. |
| ST05 preferences/accessibility | Partial | Keyboard/AT theme menu, OS reduced-motion handling, and no-persistence e2e pass; no animation control remains in the UI. Explicit Solid-surfaces preference remains unimplemented. |
| ST06 responsive/input | Partial | 320/390/768/1024 and room reading-space checks pass; 200% text, 400% zoom/reflow, forced colors, and virtual-keyboard states not separately reviewed. |
| ST07 continuity/interruption | Partial | Theme toggles, practice draft retention, soft navigation, and tutorial state pass; no interruption trace for streaming, scroller, and inline help. |
| ST08 cross-browser/failure | Open | Chromium production run only; Firefox/WebKit, real-device, and renderer-failure tests absent. |
| ST09 combined performance | Open | No four-configuration traces, asset budget, paint/composite report, or memory/layer growth measurement. |
| ST10 runtime isolation/room-first completion | Partial | Full local runtime suites pass and no persistence/network was added; hosted gates and visual review remain open. |

### Animation-control removal record

Status: **implemented locally on `ui-redesign` (2026-11-07).**

- The shared Appearance menu now contains theme choices only. The
  `Background animation` section, On/Paused options, memory-only manual
  preference, and its setter were removed from `menu.tsx` and `provider.tsx`.
- `data-background` is now derived solely from `prefers-reduced-motion`. No page
  exposes an in-app animation toggle.
- The homepage persona field and headline no longer expose a paused state. They
  still suspend when offscreen or document-hidden and remain static under
  reduced motion.
- The homepage demo CTA badge now uses the night Constellation-S mark instead of
  Sparkles.

Verification: `npm test` 114 files / 685 tests; `npm run test:architecture`
7 files / 52 tests; `npx tsc --noEmit` clean; `npm run lint` 0 errors and 19
pre-existing warnings; homepage + appearance development E2E 29 passed;
production E2E 69 tests: 67 passed and 2 conditional skips; production build
compiled 20 routes in 5.2s. The appearance E2E explicitly asserts that the menu
has no `Background animation` text and no On/Paused radio items.

### Exit and rollout

This refinement is ready for review, not acceptance. Review must include populated
room states in both themes with the question collapsed and expanded, record open
and closed, inline guidance visible, and an operation pending. Browser-composited
material evidence, cross-browser/failure checks, performance traces, and the full
Addendum B route sweep remain outstanding.

Rollback is the three refinement commits. It does not change runtime data, event
contracts, credentials, replay evidence, or the memory-only appearance model.
