# Spec 43: Main-Journey Demo Documents and Flow Simplification

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–42. Owns T08/T18 and D02; owns P04, contributes P06/P14.
Source anchors and obsolete-file inventory: [audit reference](reference-project-polish-audit.md).

## Scope and D02

Integrate the useful sample-document experience into the main demo instead of a
separate Practice configuration flow. Resolve D02's insertion point, whether
sample addition is required, and reset/late-operation behavior before building
those transitions. Coordinate existing Spec 41 guidance and Spec 42 progression;
do not introduce a second tutorial owner.

## Requirements

1. Remove Compare with practice template as a competing branch, Try editing this
   setup, the entire Practice setups list/empty block, and the separate setup/
   meeting routes and command/state owners. Retain the original overview, setup,
   creation, and room stages and useful persona, prompt, and knowledge exploration.
2. Move useful behavior before deleting its old owner or coverage. The main path
   is approved sample choice → admitted demo ingestion → queued/indexing/failure/
   retry → Ready and shared visibility → relevant guidance. Acceptance and indexed
   readiness remain distinct; an authored simulation must not imply live parsing.
3. T08: compose one bounded shared-document inventory across retained setup, room,
   and knowledge screens. Currently the room reads immutable package assets while
   added samples live in separate browser state. Moving a picker button alone
   cannot fix this. Define adapter-owned IDs, ownership, readiness, provenance,
   disposal, and reset/late-result handling; do not mutate published checkpoints.
4. Added samples do not dynamically change deterministic answers or manufacture
   new citations. Explain this concisely without reintroducing five mode aliases.
   Retained source files and new sample state must remain distinguishable.
5. Preserve public sample-only URL/origin, published metadata, byte/size, media
   type, and hash validation. No arbitrary personal uploads, operator transport,
   vault access, hidden live retrieval, or persistent/server demo writes.
6. Respect current assigned-stack semantics: captured assignments stay stable,
   eligible contents may change searches where supported. Do not falsely imply
   a new sample changed an already fixed answer or rewrote captured participants.
7. T18: remove the obsolete giant empty card, not merely reword it. Where prose is
   retained, use semantic paragraphs/grouping; direct text/link fragments inside
   a flex-column Card must not become separately spaced anonymous flex items.
8. Use real keyboard-accessible upload/sample targets, useful disabled reasons,
   same-file/sample reselection behavior, and reachable retry/preview controls.

## Local acceptance

- Resolve D02 and verify its placement with the retained start stages and finale.
- Add a sample in the main journey; setup/room/knowledge agree on item identity,
  queued/indexing/failure/retry/Ready state and shared visibility.
- Reset, navigation, late completion, duplicate choice, and invalid source/type/
  size/hash preserve bounds, correct recovery, and no stale reappearance.
- Removed branch has no entry point, route, unused state owner, obsolete copy,
  or giant empty block. Useful version/knowledge/sample behavior remains reachable.
- Replace obsolete practice-meeting tests with main-journey tests preserving
  isolation, source integrity, memory lifetime, failure, and reset guarantees.
- Confirm no new citations, changed fixed replies, live/private requests, or
  persistent effects; keyboard and responsive semantic layouts remain usable.

## Implementation record

D02 resolves to the retained Document card on `/demo/new`: approved samples are
optional, never block meeting creation, and are scoped to the prepared meeting
ID (`{ kind: "meeting", id: session.meeting_id }`). The shared
`DemoMeetingDocuments` adapter renders that one identity in setup, the room Files
tab, and the shared knowledge stack. Private stacks do not claim meeting-wide
documents.

The adapter reuses the existing browser document machine: verification against
published package metadata/URL/size/type/hash, queued → indexing → ready/failed,
retry on the same document/operation, revocation, duplicate rejection, two
concurrent operations, and bounded totals. Full workspace reset clears added
samples through the epoch; recording restart preserves them; late timers and
verification results are dropped by the epoch guard. Published package assets
and seeded stack documents remain immutable, and added samples do not alter
recorded replies, citations, captured participants, or checkpoint state.

The separate practice setup/meeting routes, screens, command/state owners, list
section, entry points, and giant empty cards were removed. Guidance and knowledge
copy now use demo/browser-sample semantics while keeping Spec 41 anchors and
Spec 42 progression. The seed decoder ignores the legacy `practice_setups`
package field, so no backend package was republished.

## Executed checks

- `npx vitest run`: 140 files, 876 tests passed.
- `npm run test:architecture`: 7 files, 52 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors (13 pre-existing warnings).
- `npm run build`: passed.
- Playwright `e2e/shared-documents.spec.ts`: 2 tests passed (setup → Ready →
  room → shared stack; failed → retry → Ready → room).
- No backend package or server persistence was changed.
