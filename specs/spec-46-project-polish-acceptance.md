# Spec 46: Project Polish Acceptance and Rollout

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: local gates in Specs 34–45 and decisions D01–D07 resolved.
This is integrated verification and package rollout, not a second implementation.

## Acceptance ledger

Retain these original gate IDs. Every gate is currently **unverified**. Attach
executed checks, outcomes, conditional skips, artifacts, and outstanding limits.

| Gate | Required integrated result | Implementation owners |
| --- | --- | --- |
| P01 | Consistent domain vocabulary across UI/backend without template/snapshot collapse | 34 |
| P02 | Demo-only visible mode copy across routes, errors, accessible names, package fields, previews, tests, and current docs | 34; feature owners finish their copy |
| P03 | Stylish concise intro, skip/revisit/deep-link/recovery behavior per D01 | 41 |
| P04 | Main-journey sample readiness/shared visibility; obsolete separate flow removed | 43 |
| P05 | Arbitrary speaker choice and unified phase/count/admission/closing policy per D03 | 42 |
| P06 | Meaningful all-screen guidance and outcome finale per D04; Demo-only scores hidden | 41, 42, 43 |
| P07 | Friendly authored names, stable visual provenance, consistent shared cards | 39 |
| P08 | Safe full-item version inspection, explicit activation, dirty guards, scoped errors | 39 |
| P09 | Discoverable on-demand Live navigation, no demo link, preserved runtime/drafts | 40 |
| P10 | Useful settings, no Coming soon, usable vault, truthful privacy and Demo limits | 37, 38 |
| P11 | Safe prerequisite visibility, fresh test results, effective provider and closing credential capability | 37, 38 |
| P12 | Truthful uploads/creation/chat/queue/closing/context and read/mutation recovery | 35, 36, 40, 41 |
| P13 | Approved homepage preserved with better copy and tested headline/graph/renderer lifecycle | 44 |
| P14 | Architecture, exact evidence/clipping, security, IME, accessibility, geometry, performance, and package rollout | All; 45 owns preview clipping |

## Route and state sweep

Cover both appearances and applicable live/demo variants:

- Homepage, login, access-status/loading/unavailable states.
- Demo session/metadata loading, intro/revisit, overview, and setup/creation.
- Meeting lists, empty/error/mutation states, room discussion, dock, record,
  details, files, closing/ballots, summary/history, archive and unarchive.
- Persona list/new/editor; prompt history, diff, inspection, activation, drafts,
  and demo participant/snapshot exploration where retained.
- Knowledge stack list/new/detail; document/sample picker, ingestion states,
  retry, deletion/revocation, and source preview.
- Live/demo settings, vault, provider tests, System AI, safe diagnostics,
  appearance and navigation; unavailable controls say Only available in live.
- Cross-route dialogs, confirmation, notices, guidance hide/resume, deep links,
  retired-package/fallback/compatibility compositions, reset and restart.

No screen may silently turn a failed read into success, absence, or a valid empty
state. Preserve useful prior content/drafts and scoped recovery. Test permission
loss and background/late responses, not only initial successful rendering.

## Regression evidence

Use the owned tests in Specs 34–45 and audit T01–T31 as the checklist. Include real
controller/observer integration, not only mocks of the boundary being tested.
Exercise stream loss and >100 operations; commit/lost response/retry for messages,
creation and uploads; partial batches; status refetch versus ingestion restart;
vault/provider races and closing capability/observation; editor drafts/auxiliary
failure; sample/progression/reset; identity continuity; honest context and clipped
evidence; headline visibility, inspector focus, and failed WebGL initialization.

Preserve architecture/import-boundary tests, public-demo network isolation,
private authorization/byte revocation, encrypted credential policy, exact-revision
evidence, immutable package validation, and existing compatible journeys. Replace
obsolete flow tests with their useful guarantees under the new owner; never just
delete failure/isolation coverage or loosen assertions to pass new labels.

## Visual and accessibility evidence

Verify mobile and small laptop, 1440×900 and 1920×917, keyboard/screen reader,
touch targets, visible focus, reduced motion, both themes, text scaling and zoom.
Re-measure the Spec 31 two-thirds resting discussion-height requirement after
dock/nav changes. Check single viewport ownership and composited text contrast,
solid reading/fallback surfaces, unsupported effects, and late/empty/error layouts.
Record browser/device and performance evidence; outstanding hosted/field checks
from Specs 31/32 are not erased or satisfied by a local unit-test run.

## Package and release gate

1. Re-scan and disposition every row of the [copy inventory](reference-project-polish-audit.md).
   Keep negative checks and update fixtures that positively demand old aliases.
2. Repair the authoring generator first, then produce a new validated package with
   approved names/copy/chapters, source metadata, coherent projections and hashes.
   Do not assume v9 is the deployment selector or mutate retained published bytes.
3. Record active selector, supported/retired versions, compatibility/fallback copy,
   deployment verification, rollback, and outstanding conditional acceptance.
4. Confirm all seven decisions and every gate with actual evidence. Documentation
   existence, implementation numbering, or a historical completion record is not
   proof that this polish release is accepted.
