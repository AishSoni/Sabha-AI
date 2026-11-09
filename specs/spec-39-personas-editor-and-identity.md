# Spec 39: Personas, Editor, and Visual Identity

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–38. Owns T05, T16, T17 and D05; owns P07/P08, contributes P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and D05

Consistent shared catalog cards, safe editing/version inspection, and visual
continuity into a meeting. The Director approved first-name-only **Mira**
(Credit Analyst), **Arjun** (Downside Reviewer), and **Leena** (Portfolio
Analyst) for the authored demo personas under D05; their subtitles still explain
their roles. This supersedes the earlier note that Mira/Arjun/Leena were only
examples. Never automatically rename live user-created content.

## Requirements

1. Carry approved demo names coherently across overview, catalog, selection,
   speaker controls, messages, conflict/consensus attribution, and summaries.
   Preserve immutable participant/persona IDs and historical content consistency.
2. T16: derive stable visual provenance across catalog → selection → constructed
   participant → messages/record. A fresh participant domain ID must not randomly
   change the originating persona's mark. Preserve separate domain identities,
   non-persona participant fallback, and rename/theme stability. Demo's existing
   mark-ID compensation is not evidence that live construction is correct.
3. T17: use top-aligned marks/actions and consistent responsive name/role/description
   areas. Long role paragraphs must not vertically center controls or wildly
   change card proportions. Bound wrapping with full accessible detail; do not
   hide the only role text or add excessive blank padding. This is a shared
   live/demo layout repair, not a measured avatar-size defect.
4. Prefer useful purpose summaries to a repeated generic base-prompt fragment;
   keep the actual prompt available in its editor. Names and expertise are distinct.
5. Make prompt save activation explicit before and after saving; for the current
   behavior use clear “Save and activate new version” semantics, not a misleading
   save-only label. Explain future-construction effects using Spec 34's helper.
6. Clicking a version/diff item selects it without a separate tiny selection
   button. Provide keyboard selection, visible focus, and independent nested
   actions. Selection/inspection never activates a version; activation remains
   explicit with existing confirmation. Do not infer activation from the user's
   request for a larger selection target.
7. T05: track all relevant edited name/role/color/stack/prompt fields and protect
   local back, SPA navigation, and unload. Preserve existing discard/activation
   confirmations, late-save edit preservation, and access-loss privacy rules.
8. Auxiliary prompt-history/stack failures must not become Persona Not Found.
   Distinguish genuine 404, unavailable persona, and scoped dependency failures;
   retry safely without discarding drafts or unnecessarily blocking usable content.
9. Give icon/back/refresh controls accessible names; use real keyboard targets
   rather than unlabeled clickable containers.

## Local acceptance

- Record D05 and verify names across all authored appearances without live rename.
- Same persona keeps its mark through selection and multiple new meetings; IDs
  remain distinct. Non-catalog participants, renames, and both themes work.
- Short/long names and role descriptions share coherent card layout at mobile,
  desktop, and text zoom with full content reachable.
- Whole-item keyboard/pointer inspection never activates; explicit activation and
  save copy match actual behavior. Edits during a pending save are retained.
- Dirty metadata, stack assignment, and prompt changes survive/cancel every
  navigation path correctly. History/stack failure is not a false 404.

## Implementation record (2026-11-09)

Status remains a working draft: local implementation and verification are
complete; hosted acceptance remains outstanding.

### D05 disposition - approved demo names

The Director approved first-name-only **Mira** (Credit Analyst), **Arjun**
(Downside Reviewer), and **Leena** (Portfolio Analyst). Their subtitles remain
the roles, so names and expertise stay distinct. This explicitly supersedes the
earlier note that those names were only examples.

The approved names live in the new immutable authored package
`hdfc-ine001a07rw5-v11` (schema 3, manifest version 11). Its content SHA-256 is
`67dcc081615d74230064e7893d043e0a3387a02ff69fb37939d54e2304ece666`
and its workspace-seed SHA-256 is
`885ba7ce107cdea2806295fa9552f0406d8784d7de1a73a02cf98d8e6f575f7e`.
Build with `python -m scripts.build_schema3_package_v11`; validate with
`python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5-v11`.
Packages v7-v10 remain unchanged.

A build-time display-name transform replaces only the exact friendly-name
phrases before assets, checkpoints, tapes, workspace seed, manifest, and hashes
are written. Role-only strings such as `Credit Analyst` are untouched. The
result carries Mira, Arjun, and Leena through the overview, catalog, selection,
speaker controls, messages, conflict/consensus attribution, prompts, stack
labels, and summaries. Live user-created personas and participants are never
renamed, and no migration rewrites them.

### Dispositions

- **T16 - stable visual provenance.** `participantMarkId` resolves
  `markId ?? persona_id ?? id`. Live participants constructed from a persona
  now keep that persona's mark even though each meeting receives a fresh
  participant UUID. Demo recorded participants keep their recorded-participant
  override, non-persona participants fall back to their own ID, and renames,
  color changes, and theme changes do not alter the mark shape. Participant and
  persona domain identities remain separate. Backend construction coverage
  asserts distinct fresh participant IDs with a preserved `persona_id`.
- **T17 - shared catalog cards.** The live and demo roster use the same
  top-aligned card: mark and action menu at the top, a `min-w-0` text column,
  bounded role and purpose areas with the full text available through the
  accessible detail, and no vertical centering of controls. Demo cards show the
  authored purpose description; live cards show role/expertise. The generic
  prompt excerpt was removed, and the `Prompt vN` badge remains. Back labels are
  contextual (`Back to home` / `Back to demo board`).
- **Requirement 4 - purpose summaries.** Purpose descriptions come from the
  authored demo workspace. Live cards use the role as the available expertise
  summary. The full prompt remains available only in the editor.
- **Requirement 5 - explicit activation copy.** Prompt save is labelled
  **Save and activate new version**, reports **Saving and activating**, announces
  **Saved and activated version N.**, and explains that future meetings use the
  new revision while existing participants keep their captured prompt.
- **Requirement 6 - full-item revision inspection.** Each revision row is a
  native full-card button that selects and inspects the version with pointer,
  Enter, or Space and a visible focus ring. The `Make active` action is a
  sibling, not a nested control. Selection never activates; activation remains
  explicit and retains the draft-replacement confirmation.
- **T05 - all-field dirty guard.** The editor baselines name, role, color,
  knowledge-stack assignment, and prompt after load. Dirty changes are protected
  on `beforeunload`, same-origin SPA anchor navigation, browser back through the
  history/popstate guard, and the local back link. The shared dialog discards or
  preserves all drafts without exposing their contents. Metadata and prompt saves
  advance only the submitted baseline, so edits made during a pending save stay
  dirty. A stack-list failure preserves the existing assignments and omits
  `stack_ids` from metadata saves until assignments are known.
- **Requirement 8 - scoped dependency failures.** The primary persona read now
  distinguishes a genuine 404 (`Persona Not Found`) from any other failure
  (`Persona Unavailable` with retry). Prompt-history and knowledge-stack reads
  load independently; failures are scoped warnings with retry, leave the rest of
  the editor usable, and never discard drafts. A history retry does not overwrite
  the prompt draft, and a stack retry does not overwrite selected assignments.
- **Requirement 9 - accessible controls.** Roster, new-persona, and meeting
  creation back controls have contextual accessible names. The roster refresh
  icon button is named and reports busy state. Persona selection rows are real
  labels around their checkboxes, so row text toggles the checkbox and the
  checkbox name includes the persona. Revision rows are native buttons.

### Verification performed

- Frontend full `npm test`: 127 files, 790 tests passed.
- `npx tsc --noEmit` passed; `npm run lint` passed with 0 errors and 13
  pre-existing warnings; `npm run build` passed with Next.js 16.1.4 and 20 static
  pages.
- Backend `tests/application/test_participant_construction.py`: 13 passed.
- Package validation returned `ok`, package `hdfc-ine001a07rw5`, version 11, and
  the content hash above.
- Playwright: 67 passed, 2 skipped. The two skips are the pre-existing
  version-5 compatibility and mixed operator/demo isolation cases. Two E2E
  failures caused by hard-coded package version 10 were corrected to 11 and the
  full run then passed.
- Evidence covers authored name propagation, stable marks across fresh
  participant IDs and non-persona fallback, long card content and contextual
  back labels, metadata/stack/prompt dirty guards on back/SPA/popstate/unload,
  late edits during saves, explicit prompt activation, whole-row inspection
  without activation, scoped history/stack failures with draft preservation, and
  accessible navigation/refresh controls.
- Known limits: live personas have no editable purpose-summary field, so live
  cards show role/expertise while demo cards additionally show their authored
  description. The browser-back guard depends on the history/popstate sentinel
  and is covered by the editor tests and E2E run.

### Commits

`7d34b6e` v11 authored package; `9eef96f` frontend name propagation; `3c39e21`
stable participant marks; `5e9e818` shared roster cards; `95abe53` dirty and
navigation guard; `99ad7de` explicit prompt activation; `017053a` selectable
revision rows; `bb9906a` scoped dependency failures; `b04ebba` accessible
navigation controls; `e844440` E2E package-version pin.
