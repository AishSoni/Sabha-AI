# Spec 33: Sabha Application Experience

## Status, dependencies, and scope

**Status: proposed detailed specification, not implementation/acceptance evidence.**
This is the third and final redesign spec. It applies
[Spec 31's system and motion contracts](spec-31-design-system-and-motion.md) to
every application screen. [Spec 32](spec-32-constellation-homepage.md) owns the
homepage only. Every screen below requires light and dark treatment, complete
states, and deliberate animation; motion is not confined to the homepage.

Layouts, geometry, and consolidated navigation labels introduced here are design
proposals for review. Existing domain behavior and supported commands remain
authoritative. No new backend capability, inference mode, public permission,
source relationship, prompt semantics, or persistence policy is introduced.

## 1. Invariants and current integration seams

Preserve [runtime isolation](reference-runtime-modes-and-credentials.md),
[recording semantics](reference-replay-package-and-playback.md),
[exact-revision evidence](spec-21-in-app-evidence-previews.md), and the accepted
[Spec 28–30 journey](spec-30-demo-tutorial-acceptance.md). In particular:

- Only the authorized operator reaches live data and commands. Operator sign-in
  does not unlock the provider vault or enable server-funded inference.
- Public replay needs no Auth/vault/bootstrap and never falls back to live.
- Practice edits are browser-memory only, separate from immutable recordings.
- The user chooses the next speaker; no selection/animation automatically starts
  another participant. Replay exposes only legal prepared actions.
- Canonical operation completion, sequence/epoch identity, checkpoint settlement,
  and deduplication remain runtime-owned. Presentation timers own none of them.
- Retain schema compatibility, chapter/bookmark access, distinct recording restart
  and full demo reset, required follow-up, closing/vote, and archive behavior.
- Consensus means recorded alignment; open disagreement/severity/strength labels
  come from actual data. Neither becomes an independent correctness/confidence score.

Primary implementation seams:

| Area | Existing ownership |
| --- | --- |
| Access/chrome | `frontend/src/features/access/ui/`, `features/demo-workspace/ui/demo-nav.tsx` |
| Meeting list/setup | `frontend/src/features/meetings/presentation/` and route/runtime adapters |
| Room | `frontend/src/features/meetings/components/MeetingRoom.tsx` |
| Runtime-specific controls | `frontend/src/features/meetings/runtime/` |
| Evidence | `frontend/src/features/meetings/evidence/` |
| Persona screens | `frontend/src/features/persona-catalog/presentation/`, `ui/`, `local/` |
| Knowledge screens | `frontend/src/features/knowledge/presentation/`, `components/`, `local/` |
| Settings/vault | `frontend/src/features/settings/` |
| Guidance | `frontend/src/features/demo-tutorial/` |

Paths after the first row are relative to `frontend/src/`. Restyle/recompose at
these seams, preserving feature query/command ownership and shared presentation.
Do not fork a visually similar demo application or merge the private/live graph
into public code to simplify shell composition.

## 2. Route and screen coverage

Preserve existing route paths and deep-link behavior. Proposed user-facing labels
are **Meetings / Personas / Knowledge / Settings** across modes, replacing the
current inconsistent operator/demo wording without changing URLs. Demo retains
its additional **Board** and **New meeting** entries where appropriate. Label
consolidation is part of this proposed spec, not a previously approved rename.

| Screen | Operator route | Demo/practice route | Nature |
| --- | --- | --- | --- |
| Public entry | `/` via Spec 32 | Same | Public presentation |
| Sign-in/access status | `/login`, existing access-provider states | No sign-in required | Private access boundary |
| Board | Not a new operator route | `/demo` | Prepared introduction and roster |
| Meeting list | `/meetings` | `/demo/meetings` | Live list / recorded and local projections |
| New meeting | `/meetings/new` | `/demo/new` | Live creation / prepared intake or practice setup |
| Meeting/setup detail | `/meetings/[id]` | `/demo/meetings/[id]` | Runtime-bound detail, no live fallback |
| Persona list | `/roster` | `/demo/roster` | Shared UI, separate adapters |
| Persona create | `/roster/new` | `/demo/roster/new` | Live / browser-memory practice |
| Persona detail/editor | `/roster/[id]` | `/demo/roster/[id]` | Metadata, stacks, prompt revisions |
| Demo history entry | No new history route | `/demo/roster/[id]/history` | Preserve existing entry/redirect behavior |
| Knowledge list | `/knowledge-stacks` | `/demo/knowledge-stacks` | Live / local practice plus public examples |
| Stack create | `/knowledge-stacks/new` | `/demo/knowledge-stacks/new` | Shared form, distinct commands |
| Stack detail | `/knowledge-stacks/[id]` | `/demo/knowledge-stacks/[id]` | Metadata, documents, access assignment |
| Settings | `/settings` | `/demo/settings` | Live settings/vault vs safe demo presentation |
| Evidence, closing, summary | Contextual room/stack surfaces | Same shared visual surfaces | Not invented new routes |

Loading, unavailable, access-denied, not-found, and recoverable route failures
are part of each entry, not separate unstyled pages. Unsupported capabilities
must be explained or omitted; never link a command to `#` to make a layout look
complete.

## 3. Application shell and navigation

### 3.1 Shared composition

Use one persistent shell per runtime and one contextual page header. Remove
repeated full-screen gradients/sticky global headers from feature screens. A
feature can have a local toolbar, not a competing second application masthead.

- Global chrome: Sabha identity, current runtime label, navigation, appearance,
  and mode-appropriate account/reset controls.
- Page header: title, short purpose/context when useful, back path, primary action.
- Main content: actual feature surface, bounded width and correct scroll ownership.
- Optional contextual inspector: substantive selected information, not an always-on
  statistics panel. Solid surface by default.

Proposed global chrome height 56px desktop, 56px minimum compact with safe growth.
Use text-labelled navigation on wide screens. Compact navigation is a labelled
menu/drawer, not a row of unexplained icons. Mark the current route with
`aria-current` and a persistent non-color selection cue.

Global navigation may collapse to leave room for a meeting; it is not a permanent
left rail imposed on every screen. Scope labels are consistent: **Recorded demo**,
**Practice**, and **Operator** describe actual context. Do not label all demo
editing as recorded or imply practice content produced prepared replies.

### 3.2 Scroll, routing, and focus

Normal feature pages use document scrolling; local tables/editors can have bounded
labelled scroll regions when necessary. The room allocates the remaining dynamic
viewport below the actual shell header. Do not nest `h-screen` beneath persistent
chrome and accidentally push the composer offscreen.

Route transitions use M02, keeping shell and state owners mounted. New route
content receives an appropriate heading/main focus after navigation, except when
an existing feature has a more specific tested focus target. Do not autofocus a
composer or animate away the current focus on every refetch. Back/forward retains
existing scroll and runtime behavior; leaving a live room detaches observation,
not implicit operation cancellation.

### 3.3 Shell animation

- Navigation hover/press M01; active-route marker M03, not a bouncing pill.
- Compact navigation opens as a solid dialog/drawer using M06, with normal focus
  trap and return. Close on intentional navigation, not pointer movement.
- Page header/content enter together with M02; no staggered entrances for every
  card. Re-entering a mounted room must not replay message animations.
- Theme changes M12, keeping open drawers, selected tabs, and runtime intact.
- No moving starfield behind content. A static small constellation motif in unused
  chrome space is optional and must disappear gracefully in forced colors.

## 4. Demo board and meeting list

### 4.1 Demo board `/demo`

The board is a concise prepared-meeting introduction, not another marketing page.
Show the recorded title/agenda, historical as-of context, a single accurate
disclosure, the actual roster, and one clear **Start the meeting** action to the
existing intake route. Retain tutorial anchor `board.roster` and actual start
anchor registration. Do not auto-start on entry.

Roster presentation: distinct identity, name, mandate, and intelligible access
summary. Replace repeated nested cards with rows or restrained grouped profiles.
Shared versus assigned material is text-labelled. Prepared participant snapshots
and editable practice templates remain distinct; comparison links must retain
their actual matching logic and never imply edits update the recording.

Motion: M02 for board arrival, M03 on a selected/expanded roster item, M04 for
knowledge disclosure. No floating persona field behind these profiles. Tutorial
appearance never becomes the gate to starting the real action.

### 4.2 Meetings list

Default to scannable rows rather than equal marketing cards. Each row shows:
meeting/agenda identity, actual lifecycle status, participant summary/count,
available timestamp, and a primary open action. Secondary actions use visible
focus/touch-accessible controls. Do not invent an outcome summary from a transcript
that has no saved summary. Recorded and practice entries identify their provenance.

Preserve supported archive/unarchive and list filters. Archiving is not deletion;
unarchiving an ended meeting does not reopen it. Do not add search/sort/server
pagination capabilities that the current adapter cannot support. Client filtering
over loaded data must disclose its scope if introduced.

States: layout-matched initial skeleton; empty current filter versus empty
workspace; recoverable fetch error with retry; mutation pending on the affected
row; unavailable item with a real return path. A refetch retains the current
list instead of replacing it with a blank spinner.

Motion: M02 initial content, M03 filter selection, M07 accepted archive/update,
M09 failure. M10 only for explicit sorting/filter changes, never incidental query
polling. Preserve row identity and keyboard focus; if a row disappears after
archive, move focus to the next meaningful row or list heading and announce it.

## 5. Meeting creation and practice setup

### 5.1 Layout and field hierarchy

Wide: focused form, optional 280–320px setup summary/participant column only when
there is enough width. Compact/medium: a single reading order. Form fields:

1. Agenda, required, with a direct example rather than a long placeholder.
2. Context, multiline, optional according to existing validation.
3. Participant selection with names/mandates, selected count, supported select-all,
   refresh/new-persona actions, and a clear no-personas path.
4. Shared documents: scope explanation in ordinary language, supported selection
   control, staged files, and real status/remove/retry actions.
5. Create/cancel actions with current validation and busy/admission state.

Use actual `MeetingCreationScreenProps` eligibility and injected runtime controls.
Do not equate uploaded with ready/indexed or allow a timed animation to enable
Create. Keep the native file input available; drag-and-drop cannot be the sole
method. File types/limits come from the current runtime, not a new hard-coded
design assumption. Avoid exposing jargon such as RAG as essential instructions.

### 5.2 Runtime-specific outcomes

Live: actual create/upload commands and durable results; errors preserve drafts
and staged state. Do not clear the form until the accepted navigation/outcome.
Recorded intake: prepared fields and supported choices stay explicit; preserve
the recorded intake receipt and room-opening step. Practice setup: state that
it is browser-memory and does not generate responses; successful creation goes
directly to the saved setup, preserving Spec 28's removal of the practice receipt.

Do not animate a practice save into a fake live meeting. Full reset warns about
discarding practice edits. Existing unsaved-state/discard policies remain.

### 5.3 Animation and feedback

M03 participant selection, M07 staged-file addition/removal and accepted creation,
M08 actual upload/progress, M09 inline errors. Show deterministic row sizes to
avoid a jumping submit button. A spinner communicates activity only, not invented
percent complete. Error messages reveal without shaking fields; move focus to
the first invalid field or error summary on failed submission. Success navigation
does not wait for a checkmark animation.

## 6. Meeting room: layout and destinations

### 6.1 Layout proposal

Wide (>=1200px): primary discussion and an optional 320–360px record/evidence
inspector. Global navigation is compact. Do not add a mandatory participant rail
on the left. Main reading column remains within Spec 31 line-length bounds.

Medium (768–1199px): discussion first; inspector opens on request when minimum
reading width can be retained, otherwise as a contextual solid overlay/view.
Compact: single primary view with clear navigation to record, roster, files,
summary, and closing. Essential content is not hidden with `hidden lg:block`.

Retain the existing logical destinations **Chat, Disagreements, Consensus,
Roster, Files/Shared Docs, Summary, Close** and their runtime capability gates.
Selectors can be regrouped contextually rather than squeezed into one long
administrative tab strip. On wide screens, disagreement/consensus inspection
can coexist with discussion; compact screens show the selected destination with
an obvious return path. Summary/Close remain deliberate workflows, not side
effects of opening a record item.

There must be one actual selected destination/inspector state, not duplicate
independent tabs or two competing previews. Preserve route/chapter destination
mapping and tutorial focus targets when regrouping controls. Each stable anchor,
including `room.tab.disagreements` and `room.tab.consensus`, attaches exactly once
to the actual actionable selector. Never create invisible duplicate triggers.

### 6.2 Room header

Show meeting title, accessible back path, readable agenda/context disclosure,
actual lifecycle status, runtime provenance, and contextual actions. Long title
may truncate at rest only with an accessible way to reveal it; agenda has an
expandable reading view, not a permanently clipped one-line description.

Replay restart and other runtime actions stay explicit and capability-driven.
Do not confuse **Close** (view the closing workflow) with immediate destructive
termination. Costs/context-token telemetry moves to an optional **Meeting details**
disclosure, retaining real labels/values but not dominating the right rail.

### 6.3 Reading and scroll rules

Use a single transcript instance keyed by actual message/operation identities.
Attributions show name, role, optional subtle identity art, and meaningful time
or recorded context. Responses are editorially spaced contributions, not a glass
bubble for every paragraph. Keep lists, tables, links, source blocks, and tool
artifacts readable; code/tables may scroll within their own labelled region.

If the reader is at the tail, follow incoming content without per-token animated
scrolling. If they scroll up, preserve position and offer a **New content**/return
to latest control. Never force them back to the tail on an event, inspector open,
theme switch, or citation selection. Reserve for metadata/citations where possible
but do not fabricate citations before they are received.

Opening/closing the inspector preserves transcript anchor, selected text where
possible, draft, active operation, and focused trigger. If a width change reflows
text, restore the nearest stable contribution anchor, not a guessed page offset.

## 7. Director controls, generation, and durable work

### 7.1 Action region

Place **Who speaks next?** and director/**You** input together below the primary
discussion, visually separate from the record but not floating in another glass
sheet. Speaker controls show name, role, eligibility, and selected/busy state.
For long rosters, use an accessible labelled selector/list, not microscopic chips.

Retain the actual runtime's action semantics: selecting a speaker must not also
send a director draft unless the existing command explicitly does so; changing
selection cannot auto-run inference. If the runtime trigger starts a turn
immediately, label it as an action rather than pretending it is a harmless
selection. Do not add an extra confirmation stage that changes approved replay
flow merely to display an animation.

Director input retains draft while observing or opening evidence. Keyboard
submission behavior must be explicit and consistent with existing expectations;
multiline entry remains possible. Show submission errors with retry only when
safe. The prepared follow-up remains **You**, with the approved exact text and
availability; no free-form input is silently answered by unrelated recorded text.

### 7.2 Status presentation

| Actual condition | Required presentation | Prohibited implication |
| --- | --- | --- |
| Eligible/idle | Clear next-speaker or send action | Automatic turn already underway |
| Pending/queued | Named queued operation and supported controls | Model already generating |
| Running/observing | Actual speaker/status, stream as received | Invented searches or private reasoning |
| Needs credentials | Specific unlock/re-provide path in live only | Login unlocked vault; replay needs credentials |
| Observation interrupted | Recover/resume same observation where supported | Stream EOF equals failed execution |
| Execution failed/uncertain | Real cause/state, safe existing recovery | Automatic repeat of possibly paid work |
| Settled | One canonical contribution and actual recorded effects | Animation completion committed a message |

Keep operation recovery and queue controls available even when the inspector is
closed. Cancelling observation, cancelling a durable operation, recording restart,
and showing a full prepared response have different meanings and wording.
Replay does not regain the removed queue Cancel; **Show full response**, **Replay
last turn**, and 1x/2x stay governed by existing capability/busy state. No extra
client-side typewriter replaces server-paced replay SSE.

### 7.3 Room animation choreography

| Trigger | Choreography | Continuity requirement |
| --- | --- | --- |
| Open room | M02 on room frame once | Do not cascade historical messages |
| Speaker choice/action | M03 local emphasis, M08 real activity | No orbit/spin implying autonomous agents |
| New contribution begins | At most M07 short header/container settle | Render tokens immediately as received |
| Stream continues | Stable text flow, quiet live status | No per-word fade, blur, or scale |
| Canonical settlement | Reuse the same keyed contribution | No duplicate transient/final bubble |
| Inspect record/source | M05/M06 depending actual modality | Preserve transcript position and focus |
| New conflict/alignment | M09 optional local notice/badge | Historical hydration does not replay notices |
| Recover observation | M08 -> actual state | No optimistic terminal checkmark |
| Close/summary progress | M08 plus real streamed output | Animation never advances ballots/stages |

## 8. Meeting record, participants, and evidence

### 8.1 Disagreement and consensus

The contextual record shows substantive topics, not just counts. Each
disagreement includes topic, reasoning, target, actual status, severity, and
available attribution/time. Each consensus item includes topic, participants,
strength, and available time. Retain real empty states and textual severity/
strength; do not relabel strength as probability.

Use status tint sparingly. A disagreement does not need a large saturated red
card, and consensus is not a glowing green success celebration. Selecting an
item expands its actual detail with M03/M04. Link back to a contribution or
source only when the stored relationship supports it; do not infer associations
from name matching, text similarity, or list proximity.

Optional record notices remain non-gating and dismissible. **View** opens the
actual corresponding destination. Dismissing cannot block the next turn, closing,
or tutorial. Focus moves only in response to an explicit View/open action.

### 8.2 Participant roster and meeting details

Show the meeting snapshot, not a silently refreshed persona template: name,
mandate, actual model if available, saved prompt/revision, and shared/assigned
knowledge explanation. Raw system prompts and technical stats are expandable
solid reading regions. A template link must explain if it shows current editable
configuration instead of the saved participant snapshot.

Participant detail opens with M04/M05. Model identifiers, long prompts, and stack
names wrap or scroll locally. No model/provider controls appear in public replay
unless they are harmless recorded metadata; selecting them cannot reach live
settings.

### 8.3 Shared evidence experience

Keep one shared preview host and renderer family for live and replay, using the
existing `MeetingsEvidenceApi`/descriptor contract. Default proposal: preserve the
accessible evidence dialog while redesigning its layout/material. An inline
inspector preview is optional only if it can reuse the same resolver/renderers
and pass the same focus/security tests; do not add a second independent viewer.

Preview anatomy:

1. Title, format, locator, and close control.
2. Cited excerpt when available, distinguished from the full retained source.
3. Readable content with labelled internal scrolling/format-appropriate controls.
4. Expandable provenance: source, capture date, rights, extraction, identity.
5. Explicit secondary external source action where valid, never an automatic
   external fetch masquerading as retained evidence.

Resolve exact live revision or approved replay claim/asset identity. Never fall
back to newest revision, similarly named file, arbitrary URL, or live data. Keep
derived/truncated text labels and format safety. Only preview eligible content;
not-ready/deleted/revoked sources get an honest state.

States include loading, unavailable, offline, timeout, HTTP failure, wrong type,
too large, integrity error, parser/unsupported format, and aborted/stale load.
Preserve contextual retry rules and safe abort on change/close/logout. Do not
replace these with one generic toast. A failed private preview is not repaired
by exposing storage URLs or making private bytes public.

Motion: M06 dialog entry with stable frame before bytes arrive, M08 loading,
short content opacity swap after actual load, no animated zoom of document text.
Close restores focus to the citation/file trigger or nearest meaningful fallback
if it was removed. The tutorial is suspended while the modal is open.

## 9. Closing, summary, archive, and lifecycle

Close remains a deliberate destination leading to existing eligibility and vote
confirmation. Ballots concern ending discussion; do not replace them with
invented votes on whether the agenda's business proposition is true.

Show actual close eligibility/reason; in current schema-3 replay, all four required
AI replies plus the **You** follow-up are prerequisites. Any legal turn order
works. Do not hard-code those counts into the shared live UI or claim legacy
packages support freedom they lack. Preserve compatibility adapters.

Closing view: current stage, ballots/results/reasons as available, actual streamed
summary, and supported recovery. Missing/failed stage gets a specific next step,
not a perpetual celebratory loading panel. Generation activity appears only while
the runtime reports it. Live credential recovery attaches to the existing closing
operation without replaying accepted paid steps.

Final summary is a stable reading report with saved sections, unresolved points,
and citations only when present in the actual output/data. No extra AI-generated
executive summary is created for visual completeness. If structured fields are
missing, render the saved text honestly rather than parsing imagined decisions.

After completion, keep **Go to meetings** and supported archive path. Archive
remains required for the main demo journey; optional tours follow its actual
completion. No animation or route arrival counts as archive success.

Motion: M03/M04 to inspect stages/ballots, M08 real progress, M07 settled stage,
M02 final report/navigation. No confetti, automatic carousel through votes,
slow staged text reveal, or forced scroll to the summary while someone is reading.

## 10. Persona catalog, editor, and prompt history

### 10.1 Catalog

Present mandates, not a grid of identical robot avatars. Each row/profile shows
name, role/subtitle, active prompt-version information when available, and
assigned-stack summary. Keep edit/open and supported menu actions discoverable
on touch and keyboard. Curated artwork can reuse the approved homepage identity
system; arbitrary/custom personas use stable initials/shape fallback.

Create remains an explicit action. Empty catalog provides a real create path;
loading/error retain the shell and concise recovery. No decorative role card is
clickable if it has no actual persona route.

### 10.2 Editor and revision semantics

Retain shared Overview/System Prompt structure, metadata save, assigned-stack
selection, immutable prompt revision save, revision inspection, and separate
activation command. The current editor already distinguishes viewed version,
pending activation, prompt dirtiness, and leave confirmation; preserve that work.

Wide: form and compact revision/assignment context when space permits. Compact:
single column with accessible disclosure/history. Prompt editor is a readable
textarea/code-like region with line wrapping appropriate to prose; never a tiny
terminal window. Explain save-new-revision versus activate without repeated
warning paragraphs. Viewing an earlier revision never activates or overwrites it.

Keep dirty-state/discard protection, loading race guards, validation, errors,
and current snapshot/practice notes. Practice saves/revisions are browser-memory
only and cannot change recorded participant prompts. The existing demo history
route must still land on the expected revision inspection behavior.

### 10.3 Animation

Catalog M02, selected/profile hover M01/M03, revision disclosure M04, inspector
M05/M06 as appropriate, accepted save/activation M07, errors M09. Keep text/drafts
stable across revision inspection. Activation confirmation is a real accessible
dialog, not a disappearing toast or animated color change. No continual floating
avatars in the catalog.

## 11. Knowledge stacks, documents, and scope

### 11.1 Library-first organization

Knowledge is a usable library, not a mandatory interactive graph. List stacks
with name, description, available counts/status, and actual assigned-persona
context when the adapter provides it. Do not add a speculative retrieval graph
or pretend the homepage illustration is a live application capability.

Stack detail groups metadata, eligible/processing documents, and actual access
assignment. Shared meeting documents and persona-assigned stacks are different
scopes. Explain assignment plainly; do not mix every participant's private/assigned
material into the shared room file list. Published demo inputs are examples,
not protected anonymous-visitor secrets.

Create/edit form retains name/description validation and feature-owned commands.
Do not add another compulsory multi-step wizard for these two fields. Preserve
existing assignment/eligibility behavior: current eligible stack contents and
meeting snapshots must be described according to the underlying contract.

### 11.2 Document rows and states

Each row shows name/type, size when available, actual ingestion state, and scoped
actions: preview when ready; retry only when supported; remove/delete with existing
confirmation and ownership rules. Scope, not color, determines availability.

Differentiate staged/pending/uploading/processing/ready/failed/deleted or revoked
states according to the current adapter; do not invent backend stages or show
100% when only upload finished. Progress percentages appear only when measured.
Failure preserves filename and a next step. File validation uses existing limits.

Practice uses the approved sample picker/local operations, not a silent real
upload. Read-only recorded files preserve immutable provenance. Unsupported
actions are absent or explained without importing live adapters into public code.
Ready files use the shared preview in section 8, not a new knowledge-only viewer.

### 11.3 Animation

Stack selection M03; form/page M02; added/staged row M07; actual progress M08;
error M09; preview M06. File rows retain size and identity as labels change.
Do not animate a percentage forward on a timer, replay shimmer after settlement,
or fade every document on a status poll. After deletion, focus goes to the next
row/list heading and the result is announced. Preserve incomplete upload state
across local panel transitions according to the existing feature lifetime.

## 12. Settings, provider vault, and access

### 12.1 Settings

Replace disabled Appearance/Notifications/Privacy scaffolding with actual working
sections only. Appearance becomes real through the shared System/Light/Dark
control and an accurate memory-only preference explanation. It must not become
a server settings write. Do not add fake notification/privacy toggles.

Live settings retains actual provider credential, vault, metadata/default, and
service-check controls owned by the feature. Present clear groups rather than
four colorful placeholder categories. Small screens stack navigation/sections;
no fixed 256px sidebar squeezing the content to unusable width.

Demo settings contains only safe public/recorded settings and appearance. It
must not ask for credentials, initialize the live vault, claim to save a server
preference, or offer a fake successful provider test. Keep any existing temporary
settings behavior explicit and isolated from the immutable recording.

### 12.2 Vault and sign-in

Distinguish **Operator sign-in** from **Unlock provider credentials**. Login is
not unlock; entering/restarting replay is not logout. Preserve lock, forget,
change-passphrase, wrong-password/corrupt-envelope, unavailable-storage/crypto,
and transient-handoff recovery behavior already owned by the feature contracts.

Sign-in screen is a focused solid form, not a glass card over moving stars.
Clear labels, supported password visibility, busy/denied/unavailable feedback,
and a real recorded-demo link. No account creation/recovery product is invented.
Access checking does not briefly reveal private chrome/content. Unauthorized
and session-loss states give a clear sign-in/demo path without leaking data.

On logout/access loss, immediately hide private content, cancel private reads,
clear private caches/projections/drafts, revoke previews, and lock credentials as
required by existing code. No slow fade-out retaining private bytes on screen.
Do not claim JavaScript memory clearing guarantees secure zeroization.

### 12.3 Animation

Settings section selection M03, disclosures M04, form feedback M09, actual test/
unlock/save M08 then M07, confirmation dialogs M06. Do not animate passwords,
secret content, or copying of credentials. Focus returns to the initiating
control. Wrong passphrase is a stable inline error, not a shaking card or wipe of
the encrypted envelope. Login route uses M02; security state changes use instant
visibility rules over motion polish.

## 13. Tutorial, notifications, and demo lifetimes

Restyle the existing contextual HUD, do not replace its ownership or reintroduce
the retired expanded guide. One anchored instruction, real action completion,
hide/resume, optional non-gating disagreement/consensus notices, and optional
prompt/knowledge tours remain as accepted in Specs 28–30.

- Preserve the anchor registry and stable IDs across moved selectors and forms.
  A clipped/missing target suspends the expanded prompt, not the objective.
- Do not steal focus, force scroll, simulate clicks, or auto-advance on an
  animation/route/refetch. Any legal prepared speaker choice satisfies guidance.
- HUD and notices suspend while streaming or a modal is open as required by the
  existing tutorial contract. They do not occupy dialog focus-trap layers.
- Restyle HUD as a small solid raised surface; no glass stack, full-page dimming
  mask, or pulsing spotlight. Focus ring and target emphasis remain distinct.
- Use M09 for instruction appearance, <=120ms opacity on reposition/suspension;
  do not visibly fly the card across the screen to chase an anchor. Position
  updates remain responsive to actual geometry without delayed spring drift.
- Hiding stays hidden across navigation for the mounted demo; no repeated prompt
  reappearance. Tours remain independently skippable and do not modify recordings.
- Full demo reset preserves its actual discard confirmation and clears the
  correct volatile state. Recording-only restart keeps practice edits. Neither
  becomes an animated reload of the whole app or a persistent preference write.

## 14. Cross-screen error, empty, and responsive rules

Every route needs a named loading/ready/empty/error/unavailable experience, styled
in both appearances. Do not replace existing specific errors with a generic
spinner because the polished state is easier to design. Retain useful content
on refetch errors; offer retry without resetting unrelated work.

Unknown IDs, missing replay packages, unsupported legacy state, unavailable
evidence, access denial, and lost network are different causes. Never recover by
opening another meeting/file, fetching live data, or assuming paid work failed.
Route-level fallback keeps navigation, accurate scope, and a real return path.

At compact widths, action rows wrap, fixed sidebars become navigation or stacked
content, inspectors become accessible views/dialogs, and primary controls stay
above keyboard/safe-area constraints where possible. Do not hide a form submit
button behind the on-screen keyboard in a fixed-height container. On desktop,
panes have minimum usable widths; close the inspector before shrinking prose
into a narrow strip. All Spec 31 enlargement/reflow criteria apply.

## 15. Implementation order inside this specification

1. Shared shell + meetings list in both themes, preserving routing and adapters.
2. One end-to-end vertical slice: list -> create/intake -> room -> record/evidence
   -> closing -> summary -> archive, with all relevant M01–M12 behavior.
3. Persona and knowledge workflows, retaining revision/scope/preview semantics.
4. Settings/access/vault presentation and tutorial repositioning/regressions.
5. Remaining responsive/failure states, visual and performance acceptance.

Each slice is reviewable and keeps the app functional. Do not mass-delete tests
that reference old selectors: replace presentation-specific assertions while
retaining their domain, security, replay, and accessibility guarantees.

## 16. Acceptance matrix and evidence

Cross-product checks: Light/Dark, normal/reduced motion, pointer/keyboard, live/
recorded/practice where supported, and compact/laptop/wide. Avoid exhaustive
combinatorial duplication where a shared primitive test plus representative
flow covers the same seam, but every route must receive both-theme review.

| Gate | Required evidence |
| --- | --- |
| APP01 Coverage | Route inventory in section 2 mapped to implemented screen/state, both themes, and animation recipe |
| APP02 Shell | One global chrome/page header; correct room height/scroll; active nav, focus, back/forward, appearance menu |
| APP03 Meeting list/setup | Empty/filter/error/mutation states; live validation/upload; recorded intake receipt retained; practice receipt absent |
| APP04 Room | Long titles/agendas/messages, prose/table/code/citations, stable tail/upscroll, usable composer at 1024x768 and 390x844 |
| APP05 Director agency | Speaker action semantics, early/late You follow-up, arbitrary legal recorded order, no automatic next participant |
| APP06 Operations | Pending/running/interrupted/uncertain/credential recovery; canonical settlement once; no animation-driven effects |
| APP07 Record/evidence | Substantive conflict/alignment, empty states, exact source identity, full error taxonomy, focus/scroll restoration, shared viewer |
| APP08 Closing | Eligibility/ballots/recovery/streamed summary; unchanged valid replay totals; return/archive success from actual state |
| APP09 Personas | Metadata save vs immutable revision vs activation; view earlier revision without changing it; unsaved leave; practice isolation |
| APP10 Knowledge | Scope/access labels, current eligibility, staged/processing/ready/failure, actual retry/delete/sample behavior, shared preview |
| APP11 Access/settings | No dead sections; real appearance; login separate from vault; private content hidden immediately on access loss |
| APP12 Tutorial | Every registered anchor reachable; missing/clipped/modal/streaming/hidden cases; optional notices/tours remain non-gating |
| APP13 Motion | Every section's choreography exercised; rapid cancel/reverse, refetch/history, animation disabled and reduced motion maintain outcomes |
| APP14 Isolation | Existing public no-Auth/no-provider/no-write/no-persistence assertions; mixed operator/replay and legacy packages still pass |
| APP15 Accessibility/performance | Spec 31 contrast/zoom/reflow/targets, real keyboard journeys, trace budgets, no per-token layout animation or hidden loops |

Use existing unit/integration, architecture, type/lint/build, production browser,
legacy, and mixed-runtime runners. Relevant current journeys include
`frontend/e2e/guided-journey.spec.ts`, `demo-accessibility.spec.ts`,
`exploration-playback.spec.ts`, `temporary-setup.spec.ts`,
`replay-isolation.spec.ts`, and `replay-resilience.spec.ts`. Update selectors for
the redesigned structure deliberately, never weaken them to just page-load tests.

Visual evidence includes populated room/record/evidence, not only empty states;
settings with no secret values; persona revision inspection; failed upload;
closing recovery; and compact keyboard navigation. Capture animation beginning,
midpoint, interruption, and settled state where a static screenshot would miss
continuity defects. Use synthetic/public data in artifacts, never operator keys
or private document bytes. Existing outstanding hosted security/content-rights
gates are not discharged by frontend screenshots or local redesign tests.

## 17. Review decisions

Review the proposed navigation labels, pane widths/breakpoints, record selector
placement, optional nonmodal evidence inspection, and exact motion tuning against
the Spec 31 foundation. Default to retaining the existing shared evidence dialog
until the optional alternative proves equivalent behavior. No decision here
authorizes invented summary fields, live graphs, new persistence, or a new runtime.
