# Spec 26 (Phase 7): Expand Recorded-Meeting Exploration

## Purpose and prerequisites

Make the current HDFC meeting less restrictive without discarding its approved
linear guide or inventing responses to unsupported edits. Add direct chapter
inspection, meaningful prepared turn/follow-up choices and replay controls
inside the existing room and demo shell.

Requires Specs [23](spec-23-expand-existing-demo-workspace.md)–
[25](spec-25-demo-knowledge-and-sample-documents.md), and preserves the read
frontier, SSE and evidence contracts from Specs
[17](spec-17-replay-package-and-streaming.md),
[18](spec-18-guided-bond-journey.md), and
[21](spec-21-in-app-evidence-previews.md). New content may be authored earlier;
runtime integration waits for the preceding local gates. This is one expanded
historical package, not a general conversation simulator or fresh inference.

**Bounded supersession:** replace the restriction that every visitor must follow
one active guided intent. Preserve the canonical guided sequence and its linear
validation. Explicit exploration metadata defines additional legal prepared
paths; arbitrary turn permutations and unrelated scripted answers stay forbidden.

## Grounding

- `frontend/src/features/meetings/guide/GuidedReplay.tsx` uses checkpoint-array
  ordering and active-intent context to gate actions and progress.
- `runtime/recorded-participant-action.tsx` selects the first matching participant
  intent. The Credit Analyst has both an early and concluding intent; removing
  the guide filter alone would choose the wrong turn.
- `runtime/recorded-director-action.tsx` exposes a prepared follow-up, not free
  text. Preserve this honesty while adding meaningful alternatives.
- `runtime/replay-run.tsx::switchCheckpoint` verifies operation/message presence
  and installs next-epoch canonical caches before selecting the checkpoint.
  `replay.tsx` invokes settlement before shared terminal reconciliation.
- `backend/app/replay/package/validate.py` requires linear guided beat chains
  and validates checkpoint/intent/tape relationships. Other ordinal-based checks,
  including closing validation, also need an explicit branch audit.
- `backend/app/replay/streaming.py` paces immutable SSE on the server and skips
  already accepted sequences. There is currently no speed parameter.
- `runtime/live-summary-panel.tsx` mixes summary presentation with settings/vault
  access. The room already has a `summaryPanel` slot; importing that live wrapper
  into demo would violate replay isolation.
- The current production package has four participant tapes, one closing tape
  and nine checkpoints. Additional choices need additional approved content.

## Requirements

### 1. Keep canonical guidance; separate it from legal action selection

Keep the original eight guided beats, canonical intent identities and
board/create/turn/follow-up/close/archive story. In guided playback, recommend
the next canonical action, but allow a visitor to choose exploration explicitly.
Do not require finishing guide steps before opening feature screens or chapters.

Use one legal-action selector based on the currently installed recording state,
not `find(participant)` or guide overlay visibility. It returns explicit intent
IDs, labels and explanations for unavailable actions. A guide may highlight a
legal action; it cannot make an illegal one legal or own domain state.

Derive canonical guide completion from explicit canonical action/terminal
evidence, not the ordinal of a later snapshot inspected through a chapter.
Branch actions do not silently complete unrelated canonical steps. Retain a
bookmark of the last coherent canonical position and completed canonical
actions, independent of the exploration cursor.

### 2. Add a finite, validated exploration contract

Use Spec 23's schema-2 package extension, with strict versioned data-only chapter
and transition records included in package hashing, publication and session
metadata. Update backend models/validator/loader/read DTOs, frontend
contracts/decoders and API artifacts together. Do not loosen strict parsing or
retrofit arbitrary keys into existing intents.

| Record | Required information |
| --- | --- |
| Chapter | Stable ID/title/objective, approved checkpoint, route/tab enum, disclosure and inspection-versus-playback mode |
| Prepared transition | Stable choice/intent ID, permitted source state, active/completed checkpoint, participant or Director identity, tape reference where applicable and prerequisite IDs |
| Branch continuation | Explicit next legal actions and a coherent path to closing/archive |
| Canonical mapping | Which existing guide actions remain canonical; no ordinal inference for new paths |

- Preserve the existing linear beat validator for canonical beats. Validate the
  exploration transition graph separately as a bounded directed acyclic graph.
  Replay/rewind is explicit navigation in a new epoch, not a graph cycle that
  repeatedly appends the same operation/message.
- Treat checkpoint ordinals as serialization metadata, not branch chronology
  or action eligibility. Use the explicit canonical mapping for guide order;
  audit every ordinal/index-based closing, visibility and completion check.
- Check each transition's source, active and completed snapshots and exact tape
  scope. Participant/operation/message identities, accumulated transcript,
  documents/retrieval scope, scoreboards and closing state must agree.
- No transition may discard an earlier branch message or splice another branch's
  transcript implicitly. Merge only when the target is a genuinely identical
  validated state; otherwise supply separate snapshots/continuations.
- Check every branch against existing lifecycle/closing/archive policies and
  every citation against retained evidence. Closing prerequisites must follow
  graph reachability, not global checkpoint-array order.
- Every offered path has an approved coherent closing/archive continuation.
  Missing continuation, dangling intent/tape, unsupported route/tab, impossible
  prerequisite or conflicting final message rejects publication.
- Limit expanded packages to 64 checkpoints, 128 prepared transitions, four
  outgoing choices per state, 32 chapters, 32 participant tapes and 16 closing
  tapes. Retain stricter existing file/event/byte and server-stream ceilings;
  traverse each graph in bounded node/edge work, not by enumerating all paths
  at request time. Package data cannot override these policies. Reject executable
  callbacks, arbitrary destinations and policy overrides.
- Schema-1 packages continue to use their original canonical action behavior;
  they do not acquire guessed alternatives from client-side heuristics.

### 3. Author enough content to provide actual choices

Ship at least two meaningful choice opportunities in the expanded recording:

1. A meeting state offering at least two supported next participant turns.
2. A state offering at least two distinct prepared Director follow-ups with
   coherent subsequent participant responses.

These can share a branch structure, but cannot be cosmetic labels for the same
unrelated reply. Preserve the existing canonical response/follow-up options as
one valid path. Do not present every speaker as always available if no coherent
prepared turn exists for that state.

Produce additional tapes, retrieval records, claims, checkpoints and closing
continuations as needed. Show available prepared topics and why another action
is not yet available. Custom practice personas/prompts/documents do not modify
these recordings; free-form generation is outside this sequence.

Update the offline package builder and add a new content approval ledger for
the expanded immutable version. Record authored-versus-model-run status,
historical as-of date, permitted source material and exact claims. Do not
rewrite Spec 18's approved version/hash or its historical ledger. No ignored
local research or unapproved source-rights assumptions; no paid model run is
required to author honestly disclosed recordings.

### 4. Provide chapters and safe guide resumption

Offer direct access to the original board/setup, facts, disagreement, follow-up,
consensus, completed closing and archived result. Include Files/source and
participant-snapshot inspection links. Inspecting completed material is allowed
without manufacturing earlier user actions or streaming every prior tape.

- Use explicit chapter selectors, for example the existing room URL with
  `?chapter=<approved-id>&tab=<approved-tab>`. Validate both against the pinned
  package. Initialize the selected coherent snapshot before mounting the room;
  do not let the current initial-checkpoint redirect defeat a valid chapter.
- Unknown chapters, mismatched meeting IDs and retired/missing packages show a
  safe error/recovery choice. A URL cannot select live reads or arbitrary assets.
  Legacy deep links without an approved chapter retain safe entry recovery.
- State that chapter navigation reconstructs a recorded snapshot. It is not
  a newly completed turn or proof that the visitor followed the original guide.
- Interrupting an active stream for a different chapter/branch requires an
  explicit action and aborts/invalidates the old observation. Snapshot fetches
  are scoped so a late old result cannot replace the selected chapter.
- **Resume guided journey** restores its bookmarked coherent canonical state in
  a fresh playback epoch without clearing practice edits or completed guide
  steps. If a turn was interrupted before a coherent completion, explain that
  it restarts that prepared turn; do not reset the entire guided journey.
- Route/tab/feature detours that do not change the timeline preserve the current
  recording position. Browser back/forward and repeated chapter clicks must
  have deterministic, tested behavior rather than mixed snapshots.

### 5. Add bounded playback controls through existing observation

Provide 1x/2x speed, **Skip to prepared result** and **Replay this prepared
turn**, including clear behavior for closing playback.

- Add an optional replay-only speed enum of `1` or `2` to turn and closing SSE
  reads. Default remains 1x; reject other values before opening a stream.
  Apply the existing per-event delay cap before dividing by speed, preserving
  the current immediate first emitted event and suffix-resume rules. Do not change event content,
  sequence, identities, concurrency/size/time ceilings or live SSE semantics.
- A speed change during observation aborts and reconnects the same operation
  after the last accepted sequence. Deduplicate frames and guard obsolete
  observer completions. Do not resubmit a choice or create another operation.
- Skip aborts the current observer and uses the validated canonical-bundle
  installation/settlement path before showing the completed result. It cannot
  merely mark a local status done or expose only a convenient final message.
- Replay restores the transition's approved start/active snapshot in a fresh
  epoch and observes the same prepared tape. Warn if this discards later
  exploration position; never append duplicate canonical messages/effects.
- Preserve terminal-frontier ordering: final canonical reads are installed and
  verified before shared turn reconciliation settles. Closing follows its
  existing explicit ballot/summary presentation contract and terminal gating;
  skipped closing must also install its complete validated result.
- EOF without terminal remains interrupted observation with retry/resume, not
  successful completion or an invented execution failure. Disconnect frees
  resources; a missing tape produces no live fallback.

### 6. Expose a truthful recorded Summary surface

Use the existing room summary slot with auth-free shared presentation, not
`LiveSummaryPanel` and its settings hooks. Include at least one approved
recorded system-summary example in a coherent completed inspection snapshot.
Validate it with the transcript and the claims it summarizes.

Show archived summary text as **Recorded summary** and its historical scope.
Inspecting existing text is not fresh generation; do not show a working
**Generate summary** control, synthetic charge or an unrelated closing brief
labeled as an interim summary. Canonical guide snapshots/tapes remain intact;
the additional summary example can have its own explicit chapter. Preserve
live on-demand summary behavior through its existing adapter.

## Tests to write first

- Legacy guide remains linear and unchanged; schema-1 playback still works.
  New valid graphs pass; cycles, invalid merges/prerequisites, scope mismatches,
  dangling references and missing closing continuations reject publication.
- Exercise every declared transition and both alternatives at each required
  choice point, verifying exact transcript/tool/citation/scoreboard/closing
  coherence. Repeated-participant choices resolve by intent, not first match.
- Canonical actions complete canonical steps; chapter/branch inspection does
  not. Guide resume restores its bookmark without clearing practice edits.
- Actual `/demo` provider integration, not only the standalone replay-room
  wrapper: two choices, invalid double action, chapter/deep-link initialization,
  rewind/resume, rapid navigation and abort-ignoring stale responses.
- Real socket/browser speed tests for both turn/closing streams: suffix resume,
  split Unicode/frames, deduplication, terminal once, unchanged limits and safe
  rejection of unsupported speed values. No full-prefix wait on reconnect.
- Skip/replay during text, tool activity, terminal settlement and closing;
  canonical message appears exactly once with no premature final read.
- Summary inspection uses real recorded system content and no live settings,
  summary generation, usage mutation or credentials. Live summaries regressions
  and original closing/archival tests remain green.
- Keyboard/mobile/reduced-motion controls and focus, network isolation,
  separate visitors and pinned-package replacement/retirement behavior.

## Small implementation slices and exit gate

1. Pin canonical action/frontier behavior; introduce strict graph/chapter models
   and negative validators without relaxing the linear canonical beat gate.
2. Author and review the minimum additional choices and complete continuations;
   validate locally before integrating them as user-facing actions.
3. Add legal-action selection and shared room controls, with explicit chapter
   navigation/bookmark resumption through the existing replay controller.
4. Add bounded server pacing and skip/replay settlement, then summary inspection.
5. Run every branch and the unchanged canonical journey against actual HTTP/SSE
   and the production frontend build; record content approval and package hash.

Exit when choices are genuinely meaningful and coherent, completed screens can
be inspected directly, and the original guided journey remains a first-class
working path. Unapproved or missing branch content is not passed by disabling
its tests or advertising empty controls. New publication and hosted checks
remain gated by Spec 27; rollback retains the compatible canonical package.

### Executed evidence

Executed 2026-10-31 on branch `main` with the local backend virtual environment
and the frontend test/build toolchain. No hosted deployment, new model run, or
browser acceptance was performed.

- `backend`: the expanded package is version `6`, schema `2`, with content
  SHA-256
  `48014296bc2f98c0270c72ecee7c5d527cb35536b6c9c3846ffc9590cb37113d`.
  It contains 28 checkpoints, 10 participant tapes, 6 closing tapes, 27 intents,
  27 transitions (8 canonical), 14 chapters, 18 claims, and the 8 unchanged
  canonical beats. The package validates with zero issues, and every prepared
  transition reaches closing and archive.
- `backend`: the combined validation, streaming-speed, package-runtime,
  clean-checkout, HTTP-boundary, and SSE-socket run passed 87 tests. It covers
  canonical and schema-1 compatibility, graph negative cases, every prepared
  transition through real HTTP reads, prefix transcript accumulation, closing
  summaries and archived status, chapter snapshots, 2x pacing, suffix resume,
  before-stream rejection of unsupported speeds, and the unchanged live/replay
  boundary.
- `frontend`: `npx vitest run` passed 94 files / 533 tests. Coverage includes the
  original guided journey, schema-1 fallback, legal-action selection at all three
  choice states, repeated-participant identity, prerequisite withholding,
  chapter bootstrap success/unknown/mismatch/retired/route errors, recorded
  summary inspection without live settings/generation hooks, skip/replay
  settlement at prepared turns, 1x/2x speed selection, and the existing
  meeting-room, closing, evidence, practice-workspace, and live-summary
  regressions.
- `frontend`: `npm run test:architecture` passed 4 files / 27 tests, including
  the recorded module graph and evidence boundaries.
- `frontend`: `npx tsc --noEmit` passed.
- `frontend`: `npm run lint` reported 0 errors and 22 warnings; all remaining
  warnings are outside the Spec 26 implementation.
- `frontend`: `npm run build` compiled successfully and emitted the existing
  demo and operator routes.
- The expanded content approval is recorded in the
  [Spec 26 content ledger](spec-26-expanded-meeting-content.md). All branch
  dialogue, follow-ups, closing summaries, and chapter metadata are demo-authored
  (`model_run: none`). The recorded Summary chapter reuses the approved system
  message `a0000000-0000-4000-8000-000000000407`; it is labeled **Recorded
  summary** and remains inspection-only.

Not executed: Playwright or other real-browser acceptance, hosted replay
acceptance, a real screen-reader or mobile-device pass, and any provider/model
call. Speed, skip, replay, chapter, and resume behavior were exercised through
jsdom, socket, and HTTP boundary tests, not a hosted deployment.

Next: [Expanded-demo acceptance](spec-27-expanded-demo-acceptance.md).
