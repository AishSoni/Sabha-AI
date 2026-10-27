# Spec 17 (Phase 3): Replay Package and Streaming

## Purpose and prerequisites

Prove one complete analyst-turn slice through the real UI/backend before authoring the full tutorial. Specs 12–16 are accepted. Implement the [package/playback contract](reference-replay-package-and-playback.md) using Spec 14's runtime seams and Spec 15's closing text seam. This spec owns package storage, offline validation/provisioning, recorded reads/retrieval, streaming and checkpoint consistency—not the complete bond screenplay or guide.

## Grounding

- `backend/app/modules/meetings/presentation/turns_http.py` reads durable event batches and yields their rows immediately. Reusing its wire contract does not provide paced playback of a fully populated tape.
- `frontend/src/features/meetings/api/turn-events.ts` already decodes real byte-split SSE with operation/sequence/tool identities; `turn-projection.ts` has a pure scoped reducer. Reuse them.
- `use-turn-observation.ts` skips streaming for terminal status and reconciles by invalidating canonical reads after completion. A package exposing finished operations too early never plays; a terminal event before the final read checkpoint causes missing/duplicated UI.
- Live meeting reads return the complete persisted transcript. Live `SearchKnowledge.execute` also records evidence. Neither can be reused as a replay reader by swapping in a no-op writer or fake provider.

## Deliverables

1. **Package model and offline tools.** Validate data-only manifests, hashes, schemas, DTOs, identities, source scopes, policies and referenced assets. Provision immutable separate Supabase replay tables/assets with an elevated offline credential. No first-visitor seed, test import or ignored-file dependency. Atomic publication exposes only complete verified versions; reader uses Spec 12 permissions.
2. **Recorded read adapter.** Serve checkpoint-consistent feature DTOs and safe configuration under the route-bound replay namespace. Package/version/checkpoint are allowlisted selectors, not SQL identifiers or workspace authority. Cover the reads the slice actually needs; add the remaining approved feature reads for Spec 18 without a generic live proxy.
3. **Prepared retrieval.** Resolve fixed retrieval keys to approved ranked hits/passages and recorded evidence in Supabase. Preserve meeting-shared versus participant-private stack eligibility, revision/chunk/content hashes and source locators. No query embedding, Qdrant call, evidence insertion, or alternate live search fallback.
4. **Recorded SSE source.** Load a bounded verified tape read-only, then stream with deterministic intended pacing/batching from the backend. Reuse turn serialization/framing and frontend decoding/projection; do not change live backlog batching or poll Supabase per token. Resume by stable sequence with no operation admission or journal writes.
5. **Closing text source.** Define a separate typed closing event envelope for ballot explanations/final brief and feed Spec 15's shared projection. Generated text never arrives whole in an earlier visible snapshot. Preserve identity and provenance rather than dressing it as a participant turn.
6. **Coherent runtime controller.** Bind reads, supported intents, active tapes and final checkpoints to the same ephemeral run. Install terminal checkpoint/read visibility before shared completion reconciliation, retain provisional content until canonical content exists, and prevent stale requests/events from an old epoch. No second domain workflow.
7. **One real vertical slice.** Supplied prepared meeting/document/roster → user requests Credit Analyst → recorded retrieval/tools/citations/text over SSE → one final canonical message and matching scoreboard/context → reconnect/restart. A fixture-only component demo is not the deliverable.

## Tests to write first

- Invalid manifest/hash, missing asset, wrong DTO/event version, dangling IDs, ineligible private passage, mismatched terminal/canonical text and incompatible policy outcome all fail package validation. A malformed package never falls back to live execution.
- Provision into a disposable database, read using the actual restricted reader, and re-run Spec 12's effective permission matrix against every real replay object/RPC/view/asset path. Runtime cannot provision or modify even its own package.
- Actual HTTP SSE response emits bounded incremental frames before completion. Verify split bytes, Unicode, ordering, tool invocation/call pairing, citations, terminal handling, cache/buffering headers, disconnect cleanup, sequence resume and per-client limits. Use controllable clocks for intended pacing, plus a real socket integration test; an iterator spy alone is insufficient.
- Decoder/reducer output matches final canonical message and tool/citation artifacts. Terminal status is not visible in the active checkpoint; terminal checkpoint is visible before invalidations. Poll/refocus/retry cannot advance a tutorial step or start a command.
- Closing ballot reasons and summary stream through their typed projection; wrong item/closing scope, duplicate/late frames, EOF and resume cannot fabricate completion.
- Restart/back abort JSON and SSE, reset only replay scope, and ignore late responses. Two independent visitors at different checkpoints share no mutable cursor. Refresh/deep-link recovery follows the documented ephemeral policy.
- Clean-checkout provisioning and a second small test package prove replacement without source branches; do not publish a second user journey. Existing active runs remain pinned to the old version.
- Rejecting live adapter/credential spies stay untouched; independent reader and HTTP tests corroborate the absence of replay writes/live calls.

## Small implementation slices

Start with one minimal valid package and one checkpoint read over the isolated adapter. Add one timed text tape through real HTTP and the existing parser. Then add tool/citation scope and the terminal read frontier. Prove resume/restart before expanding to closing-text transport or the rest of the supported read inventory.

Use existing domain policies in validation for lifecycle, majority votes, eligibility and archive semantics. Do not duplicate a workflow engine in the package loader. Keep storage design bounded: package metadata, checkpoint bundles, event tapes, retrieval/passages and asset provenance can be stored as validated records/JSON; no full live-schema clone, vector algorithm or event-sourcing framework is required.

## Exit gate

The real analyst slice passes actual browser/HTTP/role checks with no replay-attributable writes, provider/vault/embedding/vector calls, or early canonical reveal. Closing text transport is covered before full content integration. Offline publication, version pinning, missing-package failure and replacement are documented. API inventory, OpenAPI fixture, generated frontend types and decoder contracts change together when endpoints/events ship.

Next: [Guided bond journey](spec-18-guided-bond-journey.md).
