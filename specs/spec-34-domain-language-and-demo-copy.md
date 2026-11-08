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
