# Spec 25 (Phase 7): Demo Knowledge Stacks and Restricted Sample Documents

## Purpose and prerequisites

Extend the existing demo to teach document management and the relationship
between documents, knowledge stacks, participant assignments and recorded
citations. Provide an in-app file picker limited to approved samples, temporary
stack/document operations and an honest simulated ingestion lifecycle.

Requires Specs [23](spec-23-expand-existing-demo-workspace.md) and
[24](spec-24-demo-personas-and-prompt-versions.md). Preserve
[Spec 09](spec-09-durable-knowledge-and-redaction.md)'s eligibility/deletion
semantics, [Spec 13](spec-13-meeting-creation-regressions.md)'s creation/retry
behavior and [Spec 21](spec-21-in-app-evidence-previews.md)'s safe preview system.
The original guided document receipt and Files/evidence inspection remain
usable. Do not replace them with a second document application.

## Grounding

- `frontend/src/features/knowledge/components/DocumentPanel.tsx` renders document
  status, upload, retry, delete and a composition-supplied preview action, but
  currently calls live hooks. `UploadProgress.tsx` observes live operations.
- `api/client.ts` uploads a native `File` through live multipart transport;
  document scopes require exactly one meeting/persona/stack owner.
- `api/decoders.ts` defines upload receipts, revisions and operation progress.
  `api/keys.ts` keys are not demo-workspace scoped.
- `components/StackList.tsx` has a static Documents badge, no actual count or
  assignee matrix. `StackEditor.tsx` correctly explains that stack contents
  remain current for assigned participants.
- `frontend/src/app/(operator)/meetings/new/page.tsx` owns a substantial live
  form; `features/meetings/hooks/use-meeting-creation.ts` preserves one created
  meeting and retries failed upload operations without cloning the meeting.
- `backend/migrations/025_durable_knowledge.sql` implements eligibility from
  ready/non-revoked revisions, shared meeting documents and saved stack IDs.
  Persona-scoped uploads are not a substitute for those retrieval inputs.
- `backend/app/modules/knowledge/application/deletion.py` revokes before physical
  cleanup. `presentation/stacks_http.py` revokes stack documents before removing
  the stack. The public demo must not invoke either live path.
- `features/meetings/runtime/recorded-documents-panel.tsx` lists immutable assets;
  `replay-evidence.ts` already validates allowlisted evidence bytes and previews.
- The current HDFC package's seven assets are Markdown. Some retained third-party
  excerpts have rights caveats. Original PDFs/spreadsheets are not supplied by
  the current package, and XLSX/DOCX are not supported replay preview media.

Recheck these contracts and exact reference behavior before extraction.

## Requirements

### 1. Publish a small, explicitly uploadable sample library

Extend Spec 23's strict seed with at least four approved samples covering a
shared research input, participant-specific notes/worksheet, mandate material
and a demonstrable failure/retry case. Reuse approved demo-authored assets where
appropriate; add vetted content when the existing assets do not cover the lesson.
All samples may initially use supported text/Markdown/CSV formats. Do not label
Markdown as a PDF or promise a spreadsheet preview that does not exist.

Each sample record declares:

| Field group | Required contract |
| --- | --- |
| Identity | Stable sample ID and reference to a retained package asset |
| Display | Filename, media type, exact byte count, description and accessible label |
| Integrity/provenance | SHA-256, authored/sourced status, dates and rights approval |
| Allowed use | Explicit uploadable role and allowed destination kinds |
| Preview | Supported preview descriptor or explicit unsupported-preview explanation |
| Simulation | Constrained scenario ID, bounded transitions and prepared chunk count/error |

- The upload allowlist is separate from the evidence/preview asset list. A source
  register, generated evidence excerpt or public replay output is not uploadable
  merely because its URL is public. Validate each uploadable role explicitly.
- Publish actual approved bytes with the immutable package and include seed/sample
  metadata in hashing, offline validation and content review. No uncaptured URLs,
  ignored local research, arbitrary paths or silent source refetch.
- Limit the library to 16 samples, 2 MiB per sample and 8 MiB total source bytes,
  subject also to any stricter existing package/viewer limits. These are runtime
  and authoring policy, not limits the package may override.
- Rights caveats do not constitute approval. Exclude assets lacking redistribution
  approval from the picker until approved; never relabel them as authored.
- Additional PDF examples require real approved PDFs and Spec 21's bounded viewer;
  scanned-file claims remain subject to Spec 16. XLSX/DOCX are not required for
  this initial library. Adding them later requires a supported non-previewable
  upload-asset contract and an honest unsupported-preview explanation or
  approved readable companion, not a fake native renderer or MIME substitution.
- Sample source bytes are public educational content. A participant-private
  assignment demonstrates application retrieval scope, not secrecy from visitors
  who can inspect the public package.

### 2. Use a restricted in-app picker, never an unrestricted OS upload

The existing Upload/Add document affordance opens an accessible sample dialog.
Show filenames, format, size, descriptions, preview, destination and who would
be able to retrieve a ready document in that practice setup. Permit selection
and an explicit **Add sample** confirmation; cancelling has no effect.

- Show: only supplied samples can be used, personal files are not accessed, and
  processing is simulated. The familiar upload flow teaches selection and
  ingestion without implying that bytes were uploaded to a live workspace.
- Do not open an OS file chooser, accept drag-and-drop personal files, paste
  arbitrary URLs or use `accept` as a specific-file security control. The local
  command takes an allowlisted sample reference, not an arbitrary `File`/URL.
- Revalidate sample/destination/workspace identity on confirmation; hiding an
  option is not validation. Unknown, removed or tampered references fail safely.
  Verify selected source availability/size/hash through the bounded public asset
  loader before accepting the addition. A missing or corrupt sample cannot
  receive a simulated Ready result. Loading sample bytes is not parsing/indexing
  them and must not invoke a live upload path.
- A sample already present and not removed in the same destination is marked
  Already added and cannot create another local document. The same sample may
  appear in a different permitted scope with independent document identities.
  Re-adding after removal creates a new identity; it never revives the old job.
- Enforce Spec 23's explicit record/operation limits before staging additions.
  Support keyboard selection, dialog focus return, narrow screens and readable
  asynchronous announcements.

### 3. Simulate canonical document and operation semantics

Extract reusable document/operation presentation from live hooks. Supply a
workspace-scoped local adapter; do not send multipart requests or call ingestion,
source storage, embeddings, Qdrant or paid tools. Adapt shared receipt/read
shapes with explicit local provenance, never a fake successful live command.

| Visible state | Practice behavior |
| --- | --- |
| Queued | One stable document/operation exists; not retrieval eligible |
| Indexing | Simulated processing; still not retrieval eligible |
| Ready | Prepared revision/chunk count becomes eligible for the selected scope |
| Failed | Safe reason and explicit Retry using the same document/operation |
| Removed/unavailable | Eligibility revoked immediately; old completions ignored |

- Match actual shared status vocabulary rather than inventing extraction/chunking
  sub-stages the live contract does not expose. The original recorded intake may
  retain its own disclosed recorded stages.
- Use a bounded deterministic state machine with injectable clock for tests.
  Scenario IDs select approved transitions, not executable code from package data.
  Presentation timers may change document status, never advance guide beats.
- Include a sample that fails once and succeeds on explicit retry. Retry retains
  document/operation identities and does not resend bytes/create duplicates.
  Preserve revision identity according to the characterized retry contract.
- One authoritative state feeds progress, document rows, counts and visibility;
  do not maintain unrelated arrays per screen. On ready, expose a consistent
  prepared revision and chunk count everywhere.
- Removal first revokes local eligibility, cancels that document's simulation
  and closes/invalidate its practice preview. No late completion/retry can
  restore it. Reset cancels all simulations and restores seeded state.
- Practice removal does not remove public package bytes or redact immutable
  historical recording evidence. Explain that the recording is unchanged;
  continue to enforce eligibility when opening practice document descriptors.
- Navigating within the demo preserves outstanding local work. It cannot carry
  across reset/refresh or create server-background work.

### 4. Make knowledge stacks and participant scope visible

Integrate shared stack list/editor/document components at the demo routes from
Spec 23. Support temporary create, rename/edit and confirmed delete, plus sample
addition, preview, retry and removal. Reuse the persona adapter's same stack
registry and route resolver. Seed named stacks and meaningful assignments.

Show actual total/ready document counts, relevant template defaults, saved
participant assignments and a derived **Who can retrieve this?** view. Provide
both document-to-participant and participant-to-document explanations.

For practice participants, derive eligibility as:

1. The document/revision is ready and not revoked/removed.
2. Its meeting owner is that practice meeting, **or** its stack is one of that
   participant's saved stack IDs.

Do not include another participant's unassigned stack, another meeting's shared
documents or every persona-owned document. Differentiate default assignments
for future snapshots from saved assignments in existing ones. Updating a stack's
eligible contents changes visibility for its already-assigned practice
participants; editing a template's defaults does not rebind old participants.

Deleting a stack revokes all its practice documents first, cancels simulations,
and removes it from current selectable/default assignments. Keep saved
participant snapshot bindings as historical references with an unavailable
label and zero eligible documents, rather than rewriting their configuration.
Characterize the live default-assignment cleanup before sharing that behavior;
do not change live deletion or copied snapshot semantics to simplify the demo.

### 5. Integrate sample selection with existing meeting creation

Keep `/demo/new` and its canonical **Start recorded meeting** action working
with the approved HDFC preset and recorded intake. Add an inline **Try editing
this setup** path on that same screen using shared creation presentation, not
a second demo entry point or copied form.

- Visitors may edit temporary agenda/context, select practice templates and
  stage approved samples. Creating a **temporary practice setup** captures the
  active prompt/metadata/stack bindings once, creates one local meeting and
  attaches sample operations to its shared-document scope.
- Make staging distinct from ingestion. No document operation is submitted until
  the local meeting identity exists. Double submit creates one setup; failed
  document processing never clones it. Retrying reuses the retained identities.
- Use sample references, not synthetic arbitrary `File` objects, in the demo
  controller. Preserve the live form's normal filesystem and retry behavior
  through its separate live adapter.
- List practice setups separately labeled within the existing demo meeting list.
  Route local IDs only to the local adapter and package meeting IDs only to
  replay. Unknown or cross-workspace IDs never trigger live lookup.
- Use shared meeting presentation/runtime read contracts to inspect a local
  setup's participants, captured prompts and shared documents. Turn generation,
  fabricated closing/votes and live-summary actions remain unavailable for
  custom setups. No duplicate transcript/controller implementation is needed.
- Explain that custom setup edits do not generate new responses. A clearly
  named **Open original HDFC recording** action selects the unchanged recording;
  it does not copy edited settings into or rename its transcript. Spec 26 offers
  additional prepared turn choices within that recording.
- Recorded archive behavior remains intact. Removing a temporary setup is a
  labeled local discard with document revocation, not a fake live archive/close.

### 6. Connect the practice lesson to recorded evidence honestly

Keep the existing recorded Files view and citation previews. Add links between
an approved sample's source/stack explanation and corresponding recorded
retrieval examples where an explicit validated mapping exists. Mark mappings
as **Recorded example using the prepared input**, never as retrieval freshly
performed against local edits.

Reuse the shared bounded evidence loader/viewer through composition. Knowledge
presentation receives preview actions; it must not import meeting runtime or
evidence internals in reverse. Do not bypass MIME/size/hash/readiness checks or
send private/auth headers to public sample URLs. A ready simulation is not proof
of actual parsing, indexing or retrieval.

## Tests to write first

- Sample allowlist, allowed destination, duplicate policy, integrity and rights
  validation; reject evidence-only assets, arbitrary URLs/File objects, forged
  IDs and sample/package-version mismatches.
- Real dialog flow: open, keyboard preview/select, cancel, confirm, status,
  ready/chunks, failure/retry, removal and re-add. No native file input is needed
  in demo; preserve live native upload behavior in its own regression tests.
- One document/operation on double add and one meeting on repeated create/retry.
  Upload acknowledgement is not readiness; pending/failed/removed docs are absent
  from every derived visibility view.
- Assignment matrix across two participants, two stacks and two meetings;
  unassigned stack exclusion, snapshot/default distinction, ready addition,
  document removal and stack deletion. Template deletion does not erase saved
  participants; stale processing cannot restore eligibility.
- Preview readiness/integrity, unsupported formats, blob cleanup and local
  removal while viewing. Historical citation preview stays unchanged and labeled.
- Navigation/reset/refresh and separate visitor isolation during all ingestion
  states. No persisted state or live network/storage/vector/provider effects.
- Original creation/intake/Files/citation journey, live upload retry/no-clone
  regression, live stack/document deletion, shared evidence and boundary tests.

## Small implementation slices and exit gate

1. Publish validated sample metadata/bytes and build the accessible picker with
   rejecting local command tests before connecting upload actions.
2. Extract document/progress presentation and implement the local operation
   state machine, canonical registry, retry/removal and stale-work guards.
3. Integrate stack CRUD, real counts, assignments and derived visibility.
4. Extract creation form/controller seams; add local setups, snapshot reads and
   staged sample handling while preserving canonical recorded creation.
5. Connect approved recorded examples/previews and run cross-feature journeys.

Exit when a visitor can select only approved files, understand destination and
visibility, observe ready and failed/retried ingestion, remove a document and
see eligibility change, and distinguish practice setup edits from recorded
answers. The original guided document/meeting path and live knowledge flows
still pass. Content approval and executed test evidence are required before
calling the expanded sample library accepted; publication is separately gated.

### Executed evidence

Executed 2026-10-31 on branch `main` with the local backend virtual environment
and the frontend test/build toolchain. No hosted deployment, new model run, or
browser acceptance was performed.

- `backend`: the published package is version `5` with seed version `3` and
  content SHA-256
  `005a274a178ed7489bb108d7703d833316ac9e1933093866ec87040340f65d8f`. Its
  upload allowlist contains four demo-authored Markdown samples: the shared
  fact sheet (4 chunks, meeting and stack destinations), credit notes (2 chunks,
  stack only), portfolio mandate (3 chunks, stack only), and the downside
  worksheet (3 chunks, meeting and stack, fails once before succeeding on
  retry). The CRISIL and HDFC excerpts and the evidence-only source register
  remain outside the upload allowlist. Rebuilding produced the same content
  hash.
- `backend`: `python -m pytest tests/unit/test_replay_package_validation.py`
  passed 52 tests, including seed v3 sample/asset integrity, rights and
  destination validation, evidence-only asset rejection, seeded document scope,
  fail-once requirements, and v1/v2 compatibility.
- `backend`: publication and runtime suites passed 9 and 9 tests; the combined
  validation, publication and runtime run passed 70 tests. The clean-checkout
  suite passed 2 tests after its package-version expectation was updated to
  version `5`.
- `frontend`: `npm test` passed 90 files / 517 tests. Coverage includes the
  sample allowlist and integrity gate, local document state machine,
  fail-once/retry identity, stack deletion and snapshot behaviour, picker and
  shared presentation, demo knowledge-stack journeys, practice meeting creation
  and discard, the recorded-example mapping and its bounded shared-preview
  opening, the original recorded journey, live meeting creation/upload/no-clone,
  and the live knowledge regressions.
- `frontend`: `npm run test:architecture` passed 4 files / 27 tests. Practice
  routes import the shared knowledge presentation and local adapters only; no
  live knowledge API, hook, component, or feature barrel is reachable from the
  demo graph.
- `frontend`: `npx tsc --noEmit` passed.
- `frontend`: `npm run lint` reported 0 errors and 22 warnings; all remaining
  warnings are outside the Spec 25 implementation.
- `frontend`: `npm run build` compiled successfully and emitted
  `/demo/knowledge-stacks`, `/demo/knowledge-stacks/new`,
  `/demo/knowledge-stacks/[id]`, and the existing demo routes alongside the
  unchanged operator routes.
- Recorded-example links use an explicit mapping: a sample is linked only to
  recorded claims whose validated `evidence_asset_id` is exactly that sample's
  retained package asset. The UI labels the card **Recorded example using the
  prepared input** and states that it is a recorded citation, not fresh
  retrieval against practice edits or proof of parsing/indexing. The shared
  bounded evidence preview is composed at the demo route boundary.

Not executed: Playwright browser acceptance, hosted replay acceptance, a real
screen-reader or mobile-device pass, and any new provider/model call. The
picker, simulated ingestion, retry/removal, stack and practice journeys, and
the no-live-request assertions were exercised in jsdom tests, not against a
hosted deployment.

Next: [Expanded recorded-meeting exploration](spec-26-expand-recorded-meeting-exploration.md).
