# Spec 24 (Phase 7): Demo Personas and Prompt-Version Exploration

## Purpose and prerequisites

Make persona management and prompt versioning prominent, usable additions to
the existing demo. Visitors can edit temporary templates, inspect revisions,
save a new revision and activate an older one, then understand how meeting
participants retain independent configuration snapshots.

Requires [Spec 23](spec-23-expand-existing-demo-workspace.md)'s workspace,
seed and safe feature interfaces. Preserve
[Spec 06](spec-06-persona-catalog-and-participants.md)'s catalog/snapshot rules
and [Spec 22](spec-22-operator-only-live-access.md)'s public/private boundary.
This assignment adds local practice operations, not public persona HTTP writes
or inference. It does not replace the existing prepared-board screen.

## Grounding

- `frontend/src/features/persona-catalog/ui/roster-screen.tsx` directly lists,
  duplicates and deletes through `personaClient`; links use `/roster`.
- `ui/new-persona-screen.tsx` and `ui/persona-editor-screen.tsx` also import live
  `stackClient`. The editor has metadata/prompt tabs and stack checkboxes.
- `persona-editor-screen.tsx` saves immutable prompt versions and activates
  them; selecting an inactive history item currently activates it immediately.
  There is no inspect-only revision view or existing diff viewer.
- `backend/app/modules/persona_catalog/application/use_cases.py` creates an
  initial prompt revision and makes newly saved revisions active.
- `backend/app/modules/meetings/application/construct_participants.py` copies
  composed prompt, metadata and stack bindings into participants. It does not
  currently persist the source prompt revision number.
- `ui/persona-editor-screen.test.tsx` already tests single-active save/activation
  and preservation of a draft after failed save.

Recheck these contracts before extracting or extending presentation.

## Requirements

### 1. Integrate the real catalog screens and useful seed content

- Serve roster, creation and detail at `/demo/roster`, `/demo/roster/new` and
  `/demo/roster/[id]` through shared feature screens with local data/navigation
  adapters. Keep operator `/roster` routes and API behavior intact.
- Link the existing board's prepared participants to relevant catalog examples
  and snapshot explanations. Do not silently replace recorded participants with
  mutable template objects or substitute edited names in historical messages.
- Seed the three HDFC roles with meaningful, non-secret template descriptions,
  current stack defaults and at least three distinguishable revisions for one
  highlighted persona. Other personas have valid initial revision histories.
- Explain the authored reason for each highlighted revision: for example,
  stronger evidence requirements or clearer treatment of missing liquidity
  data. Do not claim these edits caused existing authored replies.
- Add an optional guide detour that explicitly visits prompt history and returns
  to the original board/beat. It cannot gate or replace the original journey.

### 2. Match catalog command semantics in memory

The local catalog adapter supports list/get/create/update/duplicate/delete,
list revisions, save a new revision and activate an existing revision. Reuse
pure validation and read contracts where available without importing the live
client. All mutations are scoped, bounded and resettable under Spec 23.

- Creating a persona creates its first active prompt revision. Reject invalid
  names, malformed inputs or unknown/deleted stack references without partial
  state. No provider discovery or credential setup is needed.
- Metadata saves update metadata/default stack bindings, not prompt history.
- Saving a prompt appends an immutable revision and activates it atomically;
  earlier revisions remain readable and exactly one revision is active.
- Activating an older revision changes the active pointer and editor content;
  it does not rewrite that revision or append a duplicate revision.
- Duplication creates independent persona/revision identities with a new initial
  history containing the copied active prompt. Subsequent changes do not affect
  the source. This local behavior must match the characterized live duplicate
  flow rather than importing the source's revision identities.
- Deleting a template removes its local catalog history, not existing practice
  participant snapshots or immutable recorded participants. Explain that
  distinction before confirmation. Missing IDs render safe not-found states.
- Disable repeated in-flight submissions and guard workspace/draft identity.
  A delayed save cannot erase text typed after submission or update a different
  selected revision/persona. Preserve drafts and show actionable errors when
  local validation or an operation fails.

### 3. Make revisions inspectable without accidental activation

Show active revision, revision number/date, a readable history and explicit
actions for **View revision**, **Save as new version** and **Make active**.
Viewing is not activation. Confirm or safely preserve unsaved editor changes
when viewing/activating another revision or leaving the screen.

This is a small shared enhancement: separate inspect from activate for both
live and demo compositions, backed by existing revision reads. Preserve the
live activation command's semantics. A side-by-side/inline diff viewer is
**not required** by this sequence; do not introduce a new diff dependency or
promise it in copy. Readable current/selected revision content is sufficient.

Announce active-version changes accessibly and retain sensible focus. Dates
for seeded revisions are authored seed dates; new local revisions are labeled
temporary edits, not historical model runs.

### 4. Demonstrate template versus participant snapshot

- Provide a read-only comparison/explanation for a prepared participant and its
  catalog example. Label recorded prompt/assignments separately from current
  practice template/defaults. Compose system prompts through the same pure
  prompt-assembly policy where applicable; do not omit base instructions.
  If that policy is backend-only, provide approved base instructions as validated
  seed data and pin browser assembly with parity fixtures against the backend
  composer. Do not call a live endpoint or silently maintain a divergent prompt.
- Show a draft participant-snapshot preview using the current active prompt and
  selected stack IDs. Spec 25's practice meeting creation captures the same
  values once; later template edits must not update that saved snapshot.
- Snapshot semantics include name/role/color, composed prompt and stack IDs,
  with no real provider secret. Stack contents remain current under Spec 25;
  stack membership and template prompt are not dynamically rebound.
- Do not invent a historical source-version badge for existing recorded/live
  participants. For new local practice snapshots only, store an explicitly
  local `source_revision_id`/number if displayed. That metadata does not require
  or imply a live participant schema migration.
- Creating or editing a persona does not add it as a speaker in fixed recordings.
  Offer a clearly named link back to the original recording, never a fake turn
  from the new persona or a claim that its edits were executed.

### 5. Keep assignments connected to knowledge exploration

Stack options come from the same workspace registry used by knowledge screens,
not another hardcoded list. Link assignments to their stack detail/visibility
view as Spec 25 lands. During this spec, show validated seeded stacks without
pretending unimplemented document commands work.

Explain that defaults apply to new participant snapshots, not every existing
participant. Revise the practice template's stack defaults without changing
recorded/private scope or other practice snapshots.

## Tests to write first

- Run the same catalog presentation tests with controlled live and local
  adapters: loading, validation, errors, create, metadata save, independent
  duplicate, deletion and not-found handling.
- Save/activate sequences preserve immutable content and exactly one active
  revision, including double actions and repeated activation. Inspecting a
  revision causes zero activation commands and no state mutation.
- Failed/stale saves preserve later drafts; switching persona or resetting
  invalidates pending completions. Unsaved-change actions are keyboard usable.
- Capture a draft snapshot, edit/activate the template, and prove the snapshot
  stays unchanged while the next preview reflects the new defaults.
- Original board/participant messages remain unchanged after catalog edits.
  Return from history to the original guided beat without losing progress.
- Route/import/network checks prove local actions make no live requests or
  provider probes. Refresh/reset removes edits; separate visitors stay isolated.
- Existing live persona-editor tests and independent-participant backend tests
  remain green. No feature-barrel or access-boundary exception is added.

## Small implementation slices and exit gate

1. Characterize live editor/duplicate behavior and extract a safe catalog port,
   navigation contract and shared screen presentation.
2. Add seed histories and local atomic revision/catalog operations with parity
   tests; integrate the existing board links and demo roster routes.
3. Separate view from activation in shared history UI; test drafts and focus.
4. Add snapshot preview/explanation and the optional returning guide detour.

Exit when a visitor can discover history, inspect without activation, save a
revision, restore an older one and explain why an existing participant did not
change. The original guided path and live catalog still work. Record executed
checks later; no hosted acceptance or new model run is implied.

### Executed evidence

Executed 2026-10-31 on branch `main` with the local backend virtual environment
and the frontend test/build toolchain. No hosted deployment, new model run, or
browser acceptance was performed.

- `frontend`: `npm test` passed 76 files / 447 tests, including the local
  catalog state and transport suites, the shared editor revision tests, the demo
  roster integration suite, the canonical journey experience, and the existing
  live persona-editor tests.
- `frontend`: `npm run test:architecture` passed 4 files / 27 tests with no new
  feature-barrel, deep-import, or presentation-boundary exception. The demo
  route imports the catalog through `presentation` and `local`; the app-level
  bridge reads the prepared board for the snapshot comparison.
- `frontend`: `npx tsc --noEmit` passed.
- `frontend`: `npm run lint` reported 0 errors and 23 warnings; all remaining
  warnings are outside the Spec 24 implementation.
- `frontend`: `npm run build` compiled successfully and emitted `/demo/roster`,
  `/demo/roster/new`, `/demo/roster/[id]`, and
  `/demo/roster/[id]/history` alongside the unchanged operator routes.
- `backend`: `python -m pytest tests/unit/test_replay_package_validation.py`
  passed 47 tests, including seed v2 requirements, v1 compatibility, prepared
  participant links, prompt-assembly parity, and the package's active prompts.
- `backend`: publication, runtime, surface, clean-checkout, participant
  construction, persona isolation, and persona snapshot suites passed
  (`test_replay_publication.py` 9, `test_replay_package_runtime.py` 9,
  `test_replay_clean_checkout.py` 2, the combined surface/snapshot/isolation
  run 22, and the combined participant/persona regression run 22).
- `backend`: `python -m scripts.replay_package validate
  replay_packages/hdfc-ine001a07rw5` returned `ok: true`, version `4`, content
  SHA-256 `d7d6cdddeaf0aee2f2e48f51ec9ff6f45c12dc5813f792d8d4b7c46c8fc42dc7`.
- The package build was run twice; the second run produced the same content
  hash and left the working tree clean.

Not executed: Playwright browser acceptance, hosted replay acceptance, a real
screen-reader or mobile-device pass, and any new provider/model call. The
snapshot capture, reset, and no-live-request assertions were exercised in the
DOM-level integration suite, not against a hosted deployment.

Next: [Knowledge stacks and restricted sample documents](spec-25-demo-knowledge-and-sample-documents.md).
