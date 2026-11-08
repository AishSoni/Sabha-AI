# Spec 39: Personas, Editor, and Visual Identity

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–38. Owns T05, T16, T17 and D05; owns P07/P08, contributes P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and D05

Consistent shared catalog cards, safe editing/version inspection, and visual
continuity into a meeting. Choose friendly names for the authored demo personas
under D05; their subtitles already explain their roles. Mira/Arjun/Leena were
examples, not approved names. Never automatically rename live user-created content.

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
