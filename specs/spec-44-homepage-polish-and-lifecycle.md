# Spec 44: Homepage Copy and Lifecycle Polish

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–43. Owns T19–T21; owns P13, contributes P02/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope

Targeted copy and lifecycle fixes, not another homepage redesign. Preserve Spec
32's approved logo, 18-emblem field, four regions, renderer/static fallback,
headline composition, and 1,050 ms CTA sweep. Spec 34 supersedes qualified Demo
wording. Do not add marketing sections, motion controls, or appearance controls.

## Requirements

1. Improve the evidence section's message rather than lead with an all-caps
   implementation disclaimer. Proposed heading: “Different perspectives. Sources
   you can inspect.” Proposed body: “Give AI participants shared documents and
   additional material for their roles. Compare their reasoning, then follow
   citations back to the supporting sources.” Final text remains a copy decision,
   not an approval inferred from these examples.
2. Use a small Demo example label where appropriate and a clear interaction hint.
   Preserve honest assignment-versus-citation meaning; proposed legend is
   Available to the participant / Cited in a response. The graph is illustrative,
   not a live retrieval trace. Do not invent links or expose runtime/private reads.
3. T19: suspend the rotating headline itself when the document is hidden, as well
   as honoring viewport/reduced-motion behavior. Test the phrase/dwell lifecycle,
   not just the animated field's data-activity attribute.
4. T20: separate transient hover/focus highlighting from a stable selected
   interactive inspector. Hovering/focusing B must not silently replace a pinned
   A's readable content or unmount controls during keyboard transfer. Define
   selection, dismissal, focus entry/return, and compact-list equivalents; verify
   in-browser. The source risk is not a claim that the whole graph is inaccessible.
5. T21: clean up partially allocated WebGL resources if asynchronous initialization
   fails before a destroy owner is returned. Preserve the complete static fallback
   and disposal of late successful initialization after unmount. Verify responsive
   DPR caps after resize, including wide-to-compact transitions. A source-level
   cleanup risk is not a measured GPU leak or performance result.
6. Preserve useful HTML fallback, local asset/security policy, stable accessible
   headline, reduced-motion immediate actions, and homepage/app lifecycle separation.

## Local acceptance

- Copy follows Spec 34 while graph roles, assignment/citation distinction, and
  illustrative status remain accurate without repetitive qualifications.
- Hidden/visible, offscreen, reduced-motion, and return-to-page tests observe the
  actual headline, not only field animation. Existing approved CTA behavior stays.
- Pin A, hover/focus B, Tab into inspector/disclosure, dismiss, return focus, and
  use the compact list: stable understandable selection without detached focus.
- Fail glyph decode/resource allocation/initialization, unmount during async work,
  lose context, and resize across DPR regimes: cleanup/fallback stay correct.
- Record browser, fallback, accessibility, and performance evidence; do not mark
  Spec 32's previously outstanding hosted/device/field gates complete by inference.

## Implementation record

The evidence section now leads with the approved message rather than the
implementation caption. The heading is "Different perspectives. Sources you can
inspect.", followed by the body copy about shared documents, additional role
material, reasoning, and citations. A small "Demo example" eyebrow, the interaction
hint "Select a role or source to inspect its connections.", and the legend
"Available to the participant" / "Cited in a response" frame the graph. The
illustrative caption follows the explanatory copy as a sentence-case note above
the graph. `edgeKindLabel()` returns the same legend labels, so the pinned
inspector and the complete relationship list cannot contradict the key. No links,
runtime reads, or private retrieval claims were added.

T19 is resolved in the headline itself, not only in the field. `HomeHeadline`
tracks `document.hidden` through `visibilitychange` and suspends the 7-second
rotation while hidden, in addition to the existing viewport and reduced-motion
guards. A clock-controlled browser test keeps the page hidden for 22 seconds and
asserts the visible phrase is unchanged, then returns the page and observes the
next phrase after a dwell. Existing offscreen and reduced-motion tests continue
to assert the rendered phrase.

T20 now separates highlighting from inspection. Hover and keyboard focus only
drive node/edge emphasis; they never replace a selected inspector. Selection
alone opens the interactive overlay, which carries a stable region id, heading
association, close control, and the disclosure list. While nothing is selected,
hover and focus can show a non-interactive, `aria-hidden`, pointer-events-none
preview that has no controls. Node and compact-list buttons expose
`aria-expanded`/`aria-controls`; Escape and the close control dismiss the
inspector and return focus to the originating control only when it is rendered at
the current breakpoint. The browser test pins Crisil, hovers and focuses Mira,
tabs into the disclosure, dismisses with Escape, and verifies both the unchanged
pinned content and the restored focus. The compact list selects the same
inspector and restores focus to its own row.

T21 is resolved with a single resource ledger. `releaseFieldResources()` deletes
the glyph texture, both buffers, the vertex array, and the program, and is used by
both successful teardown and the initialization failure path. Program creation
now deletes a compiled vertex shader if fragment compilation fails and both
shaders if program creation or linking fails. The glyph texture array deletes its
texture if storage, decode, or upload throws. Initialization also rejects a
context lost during the asynchronous texture build. The browser tests inject a
`texStorage3D` failure, an SVG decode failure, and `WEBGL_lose_context`, and each
observes `data-webgl="failed"`, the static fallback, and nonzero delete calls for
the resources allocated before the failure. A separate test delays emblem decoding,
leaves the homepage through the client-side demo link during boot, and verifies
the late engine's resources are destroyed and the canvas is gone.

The DPR cap now lives in `fieldDprCap(viewportWidth)` and is recomputed inside
`resize()` from the current viewport rather than captured once at creation.
Unit tests cover the 767/768 boundary; a browser test with device scale factor 3
observes a 2.0 backing ratio at 1440 px, 1.5 at 390 px, and 2.0 again after
returning to 1440 px without a reload.

No backend, package, or data changes were required.

## Executed checks

- `npx tsc --noEmit`: passed.
- `npx vitest run`: 142 files, 882 tests passed.
- `npm run test:architecture`: 7 files, 52 tests passed.
- `npm run lint`: 0 errors (13 pre-existing warnings).
- `npm run build`: passed (Next.js 16.1.4).
- `npx playwright test e2e/homepage.spec.ts e2e/evidence-preview.spec.ts e2e/homepage-cta-readiness.spec.ts`:
  31 tests passed in Chromium at 1440x900 and 390x844, including the clock-based
  headline lifecycle, pinned-inspector keyboard transfer, injected field failures,
  context loss, late-engine teardown, no-JavaScript fallback, and DPR resize.
- The cleanup checks count WebGL delete calls after injected failures; they are
  source-level teardown evidence, not a measured GPU-memory or performance result.
- No hosted deployment, throttled field trace, screen-reader session, physical
  device review, or real-user INP measurement was performed. Spec 32's outstanding
  hosted/device/field gates remain open.
