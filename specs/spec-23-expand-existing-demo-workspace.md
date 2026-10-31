# Spec 23 (Phase 7): Expand the Existing Demo Workspace and Navigation

## Purpose and prerequisites

Expand the current public `/demo` experience so visitors can explore the
implemented application screens and return to the existing guided HDFC bond
journey. This is an additive integration, not a replacement demo, a second
application, or a new scenario-selection platform. Preserve the canonical
board-to-archive journey, its evidence, recordings, closing and archive behavior.

Read Specs [14](spec-14-live-and-replay-composition.md),
[17](spec-17-replay-package-and-streaming.md),
[18](spec-18-guided-bond-journey.md),
[21](spec-21-in-app-evidence-previews.md), and
[22](spec-22-operator-only-live-access.md), plus the
[runtime](reference-runtime-modes-and-credentials.md) and
[package](reference-replay-package-and-playback.md) references. Characterize the
current production-package journey before extracting shared presentation.
Prerequisite local gates remain mandatory; outstanding hosted gates in Specs
19 and 22 are not discharged by this implementation sequence.

**Decision supersession:** Specs 23–27 supersede the earlier single-linear-UI,
guide-gated-navigation and universally non-editable-demo restrictions only for
the explicitly specified additions. Permit browser-memory practice mutations;
do not permit server writes, persisted demo state, arbitrary uploads, credentials
or inference. The original guided journey remains available. Earlier completion
records and immutable published package versions remain historical evidence.
These documents are planned assignments, not implementation records.

## Grounding

- `frontend/src/app/demo/layout.tsx` unconditionally composes `ReplayRunProvider`
  and `GuidedReplay`. Existing routes are `/demo`, `/demo/new`,
  `/demo/meetings`, and `/demo/meetings/[id]`.
- `features/meetings/guide/GuidedReplay.tsx` derives progression from ordered
  checkpoints and supplies the active-intent restriction. It is not currently
  optional help layered over unrestricted feature navigation.
- `features/meetings/runtime/contract.ts` already separates room reads,
  capabilities, commands and presentation slots. Reuse this seam.
- `features/persona-catalog/ui/` and `features/knowledge/` directly consume live
  clients/hooks and hardcoded live navigation. Their root barrels also export
  live dependencies; adding demo routes alone is unsafe.
- `shared/runtime/scope.tsx` distinguishes runtime identity and epoch. Replay
  increments its epoch on checkpoint changes; practice edits must not be lost
  whenever a recorded turn settles.
- `backend/app/replay/package/model.py` uses strict versioned models;
  `safe_config` is not a validated persona/document workspace contract.
- `frontend/tests/architecture/replay-boundaries.test.ts` walks selected roots,
  not automatically every future demo route. Feature-root import rules also
  remain applicable during extraction.

Recheck these source locations and their callers before editing.

## Scope and non-goals

Own the integrated shell, navigation, lifecycle, typed seed delivery, safe
presentation/data seams, and foundational tests. Specs 24 and 25 fill in local
persona/knowledge workflows; Spec 26 expands recorded choices. Do not implement
those workflows as temporary successful no-ops in this spec.

No live schema/ownership changes, public API mutation endpoints, browser Auth
bootstrap, telemetry writes, provider discovery/probes, generic plugin system,
or visual redesign. Do not unlock unimplemented product features just to claim
complete screen coverage.

## Requirements

### 1. Preserve entry points and integrate navigation

- Keep all four current demo URLs valid and preserve their guided actions. The
  first visit still offers the original guided HDFC journey prominently, with
  an additional freely navigable exploration affordance in the same shell.
- Provide persistent links to the board, meeting creation/list, roster,
  knowledge stacks and safe settings explanation. Add `/demo/roster`,
  `/demo/roster/new`, `/demo/roster/[id]`, `/demo/knowledge-stacks`,
  `/demo/knowledge-stacks/new`, `/demo/knowledge-stacks/[id]`, and
  `/demo/settings` as their feature assignments land. Do not ship dead links
  or link public feature actions to operator routes.
- The guide can be collapsed and resumed. Visiting roster or stacks must not
  reset the recording or mark a guided step complete. Returning from a feature
  preserves the prior guide position, practice drafts and workspace records.
- Explain when a navigation action would interrupt active playback. Use Spec
  26's explicit chapter/resume policy for timeline changes; do not infer guide
  completion from the largest checkpoint a visitor has inspected.
- Retain current deep-link recovery where no approved chapter selector exists.
  Invalid IDs never fall through to live reads. Spec 26 adds explicit chapter
  deep links without removing legacy route behavior.

### 2. Separate practice state from recorded state inside the same demo

Compose one demo-workspace lifecycle above the existing replay controller.
It owns a volatile workspace identity, the pinned package identity/hash, local
catalog/document/setup state, guide bookmark and cancellable simulated work.
The existing replay controller retains checkpoint, stream cursor, projection
and playback-epoch ownership. Do not create competing playback controllers.

| State | Lifetime and authority |
| --- | --- |
| Published recording and evidence | Immutable package; read-only replay authority |
| Practice templates, stacks, documents and setups | Browser memory for this mounted demo workspace |
| Stream projections and checkpoint caches | Current replay run/epoch/checkpoint |
| Guide progress/bookmark | Explicit canonical guided actions within this workspace |

- Practice query keys include workspace identity and data domain. Replay keys
  retain package/run/epoch/checkpoint scope. Matching UUIDs must not alias live,
  practice and recording records; use distinct typed references/provenance.
- Local commands return explicitly local outcomes, not fake HTTP/live-persistence
  success or live operation receipts. Shared read DTO shapes may be reused.
- Enforce initial workspace ceilings: 16 templates, 16 stacks, 64 document
  records including removed tombstones, 8 practice setups, 16 revisions per
  template, 16,384 characters per prompt and 524,288 total stored prompt
  characters. Run at most two simulated document operations concurrently; queue
  only within the document-record limit. Count seeds toward these limits and
  validate them on admission. Explain a reached limit and offer removal/reset
  where appropriate, never silently evict history. Raising a ceiling requires
  reviewed policy and boundary tests, not an override in seed data.
- Full **Reset demo** aborts reads, streams, simulations and previews, invalidates
  stale completions, restores the approved seed and original guide entry, and
  releases blob URLs. Offer confirmation when edits would be lost.
- **Restart guided recording** resets playback and its guide bookmark only;
  practice edits remain. Label these two actions distinctly.
- Both reset actions retain this workspace's pinned package version/hash. A
  refresh or explicit re-entry may select a newly approved version. If the pin
  has been retired, explain the failure and offer a fresh workspace; never mix
  a new recording with the old seed or silently repin an active visitor.
- Refresh starts a fresh demo workspace. Do not persist edits/progress in local
  or session storage, IndexedDB, cookies, a service worker or backend session.
  Preserve the unrelated existing non-secret experience preference.
- A stale response or timer cannot repopulate an ended workspace, even if abort
  was ignored. Reset in visitor A cannot change visitor B or any operator state.

### 3. Introduce a validated, immutable workspace seed

Extend package support with package schema version 2 for expanded packages,
while retaining version-1 package support and the current guided fallback.
This is a package-schema change, not permission to change read/event wire
versions unnecessarily. Keep existing published versions and hashes intact.

The version-2 manifest references a strict, data-only workspace seed and,
later, Spec 26's exploration metadata. Include both in validation, hashing,
publication and restricted reads. Do not hide these contracts in arbitrary
`safe_config` dictionaries or load production seed data from test fixtures.

The workspace seed has its own `seed_version`, a maximum decoded JSON size of
1 MiB and contains bounded, linked:

- Persona templates, immutable prompt revisions and active revision references.
- Stack records, seeded practice documents/revisions/operations and assignments.
- Practice setup presets and explicit links to corresponding recorded examples.
- Approved uploadable sample references and simulation-scenario identifiers.
- Non-secret display metadata and truthful practice/recording disclosures.

Validate identities, single-active revisions, scope references, eligible
document states and every referenced public asset. Seeds contain no actual
provider configurations/keys, live identifiers with private data, executable
callbacks, arbitrary fetch destinations or policy overrides. Sample and
simulation records are fully constrained in Spec 25.

Expose the seed through an additive public **GET
`/api/replay/workspace-seed`**, resolved with the existing pinned package/version
selection mechanism. Return a typed envelope identifying package ID, version,
content hash and seed version. Fetch once per workspace, validate it, then make
local commands without HTTP writes. Reject mismatched identity/version rather
than combining assets from a different package.

Use the existing offline publisher and dedicated runtime reader. If storage
representation requires a migration, restrict it to immutable replay objects
with effective reader permissions tested; never reuse live catalog tables.
Initial-checkpoint behavior remains safe-config-only for existing meeting
reads. A missing optional expansion on a legacy package disables additions
with explanation while its guide works; a corrupt declared expansion fails
closed, not to live data or an unrelated seed.

### 4. Extract safe reusable feature interfaces

- Separate pure feature contracts/decoders, shared screen presentation and
  injected data/navigation operations from live HTTP/hook wrappers. Live and
  demo compositions use the same feature presentation, not copied lookalikes.
- Keep feature ownership and root-public-interface rules. Restructure safe
  exports and explicitly named live adapters rather than permitting arbitrary
  cross-feature internals or weakening transitive import tests.
- Generic transport, shared UI and pure types must not import Auth, credential
  stores or demo state. Local demo capabilities are not the server's replay
  mutation-capability booleans; server writes remain false/rejected.
- Extract only the seams needed by Specs 24–26. Preserve live signatures via
  adapters where useful and characterize live behavior before moving it.
- `/demo/settings` explains operator-only provider setup and demo limitations
  using auth-free presentation. No key fields, vault access, test-connection
  actions or fake connected state. Existing Appearance/Notifications/Privacy
  placeholders remain explicitly unavailable, not invented implementations.

### 5. Make provenance understandable without splitting the experience

Use a persistent Demo label and contextual wording: edits are temporary, sample
ingestion is simulated, and meeting replies/evidence are prepared recordings.
Show this distinction near transitions from edited setups to recordings, not
only in a distant disclaimer. Historical as-of/source dates remain visible.
Never suggest that an edited prompt, new persona or sample generated existing
recorded text. No fabricated token usage, charges, savings or current research.

## Tests to write first

- Characterization of the original eight-beat route journey and current package
  contracts before refactoring; retain an explicit legacy-package fixture.
- Integration against the actual `/demo` provider composition: edit local state,
  navigate across routes, settle a recorded checkpoint, resume guide, restart
  recording and reset workspace. Verify the distinct reset scopes.
- Stale JSON/SSE/timer completions after reset and rapid reset/navigation; no
  duplicate provider initialization or cross-domain cache collisions.
- Valid schema-2 seed publication/read, schema-1 fallback, invalid refs/hashes,
  unsupported seed versions, interrupted publication and old-version pinning.
- Enumerate every demo route/layout/provider import graph. Reject transitive
  live access/settings/credentials/stores dependencies, including barrels;
  allow only deliberately extracted safe presentation, never the live graph.
- Shared-screen live regressions and unchanged root/feature dependency rules.
- Keyboard/mobile navigation, guide collapse/resume, focus restoration, reduced
  motion and accessible status announcements. No scroll-stealing overlay.

## Small implementation slices and exit gate

1. Pin legacy behavior and route/import boundaries with failing tests.
2. Add strict schema-2 seed validation, restricted read delivery and schema-1
   compatibility; publish only disposable/test data during development.
3. Introduce workspace identity/local command contracts, separate cache scopes
   and reset/stale-completion protection around the existing replay provider.
4. Extract safe feature seams and integrate shell/navigation/guide resume. Add
   feature links only when their real adapters are usable.
5. Add safe settings explanation and run original journey/shared-live gates.

Exit when the original demo works unchanged in its canonical path, a single
integrated shell can host the additional features, and workspace lifetime does
not depend on replay checkpoints. Record executed checks only after execution.
Feature completeness belongs to Specs 24–26; release acceptance to Spec 27.
Rollback disables expansion links/selection and serves the intact compatible
guided package; it never restores public live access or discards live data.

Next: [Persona and prompt-version exploration](spec-24-demo-personas-and-prompt-versions.md).
