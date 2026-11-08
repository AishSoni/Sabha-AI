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
