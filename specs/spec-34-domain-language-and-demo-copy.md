# Spec 34: Domain Language and Demo Copy

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Owns P01/P02 and inventory A in the [audit reference](reference-project-polish-audit.md).

## Scope

Establish one ubiquitous language across UI, backend domain names, authoring,
fallbacks, accessibility text, tests, and current documentation. This is not a
wire-contract rewrite or removal of useful technical terminology.

| Term | Meaning and use |
| --- | --- |
| Demo | The public experience; its only visible mode name |
| Live | Authenticated workspace label; internal operator authorization remains |
| Persona | Reusable identity, role, prompt, generation policy, default stack assignments |
| Participant | Meeting-specific constructed actor; identity/configuration snapshot |
| Participants | Meeting collection; never label participant snapshots Personas |
| Roster | Meeting collection only; prefer Participants in visible UI, not global catalog |
| Role | Expertise/responsibility, distinct from a friendly personal name |
| Perspective | A viewpoint, not an interchangeable name for an actor |
| Meeting / meeting room | Domain entity / the interface displaying it |
| Meeting title / Context | Short identifying name / background supplied for discussion |
| Agenda | Discussion objectives if modeled separately; not an alias for title |
| Knowledge stack / Document / Source | Retrieval collection / item / evidential use of an exact revision |
| Prompt version | Saved version; inspecting it is not activation |
| Close/end / Archive | Finish discussion / organize the resulting record; not synonyms |

## Requirements

1. Use **Demo**, not Prepared demo, Guided replay, Recorded session, recording,
   or Practice as competing mode names. Use ordinary object labels where clearer:
   Participants, Documents, Summary, Settings, Add sample, Choose who speaks next.
2. The scenario title is **A HDFC Bond Review Demo**. Put coupon, maturity, ISIN,
   historical date, and source details in example details, not every heading.
3. Apply vocabulary across screens and layers. Qualify ambiguous catalog names
   such as ReadTemplate/CreateTemplate/TemplateCreate/CreationSnapshot with Persona
   where appropriate; preserve the persona-template/participant boundary.
4. Make catalog `subtitle` to participant `role` translation explicit. Correct
   creation-view title/context semantics: the current `agenda` input becomes
   meeting `name`, while `context` becomes backend `agenda`. Use a clear view model
   and compatible adapter, not a blind field/database rename.
5. Built-in default roster entries are participant payloads, not catalog templates.
   Do not invent persona IDs or restore a live-template fallback from stale docs.
6. Show the construction effect clearly: “Changes apply when this persona is added
   to a new meeting. Existing meeting participants are unchanged.” Identity,
   prompt, policy, and stack assignments are captured; eligible contents of an
   assigned live stack may change future searches. Activating v2 does not rewrite
   existing v1 participants.
7. Replace qualified CTAs with Try/Explore/Open the demo; creation with Create
   meeting and its actual busy state; setup with Meeting setup; summaries with
   Summary; questions with Your question/Follow-up; sample library with Sample
   library; errors with Loading demo/Demo unavailable and useful recovery.
   Accepted upload is not indexed Ready. Reset and restart retain distinct scopes.
8. Source labels and Reasoning must remain truthful about retained material;
   remove repetitive mode qualifications without inventing fresh generation.
   Repeat last turn may replace Replay last turn as an action, not a mode rename.
9. Remove obsolete separate setup copy through Spec 43 rather than rebranding
   the branch. Retained personas/stacks/documents use their domain nouns.

## Source and compatibility work

Use every row of audit inventory A, including errors outside JSX, accessible
names, fallback/standalone runtime compositions, backend display defaults,
generator overrides, manifests, seeds, all checkpoint projections, citations,
previews, fixtures, positive assertions, and current docs. Fix authoring sources
before generating a new package version. Coordinate later feature-specific copy
with its owner; Spec 46 checks the final integrated experience.

Do not mass-rename technical replay APIs, SQL/schema, query keys, file IDs,
provider IDs, provenance flags, package hashes, genuine statements that terms
were recorded, or third-party quotations. Historical spec titles/completion
records remain; mark superseded visible-copy requirements instead of rewriting
history. Do not add runtime blanket substitution or weaken assertion coverage.

## Local acceptance

- Glossary is consistent in catalog, creation, room, records, and backend boundaries.
- Each audit row has a changed/removed/retained disposition with reason.
- Phrase/boundary-aware negative tests catch old mode aliases in fallback, error,
  confirmation, accessibility, chapter, and source-preview states.
- Update tests that positively demand rejected copy; keep technical isolation and
  negative checks. Re-scan source for newly introduced instances.
- Published old bytes remain immutable; record replacement/compatibility policy.

## Implementation record (2026-11-09)

Status remains a working draft: the source, package, tests, and current docs have
been aligned, while Spec 46 still owns integrated acceptance. Spec 33 remains the
coordination roadmap.

### Canonical vocabulary and boundaries

- Visible mode names are **Demo** and **Live**. Technical `/api/replay/*`, SQL,
  query keys, provider IDs, provenance flags, package IDs, hashes, and machine
  error codes remain unchanged.
- A persona is a reusable template. A participant is a meeting-specific snapshot.
  The meeting collection is **Participants**, never Personas. Catalog `subtitle`
  is rendered as the participant **Role**.
- Meeting creation uses **Meeting title** and **Context** in the view model. The
  compatible adapter maps title to wire `name` and context to wire `agenda`; no
  schema or database rename was performed.
- Persona editing states the construction effect: changes apply when the persona
  is added to a new meeting; existing participants keep their captured identity,
  prompt, policy, and stack assignments, while eligible stack contents may affect
  future searches.
- Demo surfaces use ordinary object labels: Participants, Documents, Summary,
  Settings, Add sample, Choose who speaks next, Repeat last turn, Closing summary.
- Truthful retained statements remain, including “Responses were recorded, not
  live AI generation”, “Recorded demo excerpt”, genuine closing/evidence facts,
  third-party quotations, and the CRISIL annexure’s “Recorded value”.
- The scenario title is **A HDFC Bond Review Demo**. Coupon, maturity, ISIN, date,
  and source detail remain in meeting/document detail rather than repeated
  headings.

### Inventory A dispositions

| Inventory | Disposition |
| --- | --- |
| A.1 homepage, access, demo board, creation, lists, settings | Changed competing mode names and prepared/recorded qualifiers to Demo and ordinary object labels. Removed the stale practice-template comparison label from the main board. Retained technical route names and the live-nav link for Spec 40. |
| A.2 guidance, personas, knowledge, samples | Changed practice/prepared/recorded copy to Persona, Participant, knowledge stack, document, sample, and Demo language. Added the construction-effect note and Role translation. Left practice-only setup and meeting flows in place for Spec 43 rather than rebranding them. |
| A.3 room, playback, closing, summary, runtime fallbacks | Changed mode badges, playback actions, closing, summary, and recovery copy to Demo/Summary/Repeat last turn. Retained provenance wording where the artifact was genuinely recorded and retained exact package/checkpoint errors. |
| A.4 evidence | Changed “recorded asset” to “source file” and “recorded evidence type/revision” to retained/source language. Preserved exact-revision checks, hashes, blocked-origin handling, and package membership semantics. |
| A.5 backend presentation | Changed `ReplaySession.label` and `Manifest.label` defaults to `Demo`; human meeting/turn/closing/asset errors now use Demo. Kept `replay_*` error codes, diagnostics, and technical package terms. |
| A.6 package authoring | Updated the generator’s disclosure, board title, preset context, intake note, settings notice, beats, chapters, source labels, accessibility text, and final manifest override. Built a new immutable version 10 package; no version 7, 8, or 9 bytes were edited. |
| A.7 tests | Updated positive assertions that demanded rejected copy; added phrase/boundary-aware negative scanning across body text, accessible labels, titles, alt text, and placeholders. Kept isolation, negative, and technical contract checks. |
| A.8 current documentation | Aligned root, frontend, backend, and operations documentation with Demo vocabulary and version 10. Historical specs and completion records were left intact. |

### Package replacement policy

- Authored package: `hdfc-ine001a07rw5-v10`, manifest version `10`, schema `3`,
  content SHA-256
  `fafe211e3500d571921c50bdb4e68c5dd264abb440745f6de3ec73886f680cd0`.
- Build only with `python -m scripts.build_schema3_package_v10`; validate with
  `python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5-v10`.
- Versions 7, 8, and 9 remain immutable for pinned runs and compatibility checks.
  Version 10 is the authored source for current copy and the default in the E2E
  provisioner.
- A deployment may pin an earlier version until it publishes and activates
  version 10. Published bytes are never replaced in place.

### Verification performed

- Frontend full suite: 114 files / 685 tests passed.
- Frontend targeted suites for persona/creation, fixtures, and replay copy passed.
- Playwright: 67 passed, 2 skipped after version 10 provisioning; the
  boundary-aware `demo-copy.spec.ts` passed as part of the final run.
- Backend targeted replay suites: 87 unit and 27 integration tests passed;
  `test_replay_package_validation.py` passed 58 tests after fixture copy updates.
- `python -m scripts.export_openapi --check` passed with 57 paths.
- Version 10 package validation passed with the content hash above.
- `npm run lint` reported 0 errors and 19 pre-existing warnings; `npm run build`
  completed successfully.

### Deferred owners and limits

- Spec 40 owns the live-navigation “Recorded demo” link.
- Spec 43 owns removal of obsolete practice setup/meeting branches and their
  remaining practice-only copy.
- Specs 38, 39, 44, and 45 retain their scoped settings, persona behavior,
  homepage, and evidence-preview work.
- Spec 46 must re-run the integrated gates; this record is not an acceptance
  claim. Source-level audits are not browser reproductions, and historical spec
  labels are not current product copy.
