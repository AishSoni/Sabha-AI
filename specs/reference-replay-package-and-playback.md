# Shared Reference: Replay Package and Playback

## Status and ownership

This is the proposed Phase 3 contract, not an implemented API or another numbered step. [Spec 14](spec-14-live-and-replay-composition.md) owns runtime composition, [Spec 15](spec-15-closing-ui-integration.md) the closing presentation seam, [Spec 17](spec-17-replay-package-and-streaming.md) the package/transport/controller implementation, [Spec 18](spec-18-guided-bond-journey.md) approved content and guide, and [Spec 19](spec-19-replay-release-acceptance.md) release evidence. The [runtime contract](reference-runtime-modes-and-credentials.md) governs isolation and credentials.

## Invariants

1. Replay and live use the same hosted app and real feature UI. Replay reads immutable preprovisioned Supabase demo data; no replay-attributable application writes, live inference, embedding, vector search, OCR, tool effects or live vault access occur. Independent live work may coexist.
2. Server composition pins an approved package registry and restricted reader. A package/version/checkpoint selector cannot choose a database schema, credential, live workspace or live adapter.
3. A package is **data only**. No executable callbacks, SQL, provider/adapter URLs, policy overrides, arbitrary component imports, or string-evaluated transitions. Source citation URLs are validated passive evidence links, not fetch/tool instructions.
4. The guide selects permitted intents/order and real UI anchors. Shared policies and typed read/event/projection contracts remain the source of product behavior. No second meeting workflow or fake successful persistence.
5. All supposedly generated text, including vote explanations and final summary, streams from the backend. Fixed labels/source excerpts/form presets need not stream. No fabricated private chain-of-thought or usage.
6. One published journey initially. Another subject should normally require approved package data, not a code branch. New product capability can require a reviewed contract change; package flexibility is not an unbounded tutorial engine.

## Package contents

Choose a small storage representation in Spec 17: validated JSON bundles/tape records are acceptable. Do not mirror the entire live relational schema or require pgvector. Preserve existing DTO field types/valid UUID identities where the real contracts require them.

| Part | Required content |
| --- | --- |
| Manifest | Package ID, immutable version, package-schema/read/event-contract versions, content hash, title, historical as-of date, capture/provenance metadata, initial checkpoint, approved step/tape/asset references and publication status |
| Checkpoints | Coherent bundles for all exposed feature reads: meeting list/detail/participants/messages, operation list/detail, document/ingestion status, disagreements/consensus/context stats, closing/votes/summary, safe settings/catalog/stack labels as needed |
| Turn tapes | Stable meeting/operation/event IDs, strictly increasing per-operation sequence, normalized event types/payloads, invocation/call identity for tools, citations, intended pacing and explicit terminal event |
| Closing tapes | Closing ID and ballot/summary item identity, event ID/sequence/type, streamed text, terminal outcome and completed checkpoint reference; distinct from participant-turn wire identity |
| Retrieval records | Finite retrieval key, participant/scope, ordered hits, passage text, document/revision/chunk identity, content hashes, recorded scores if used and exact source locators |
| Assets and provenance | Retained source bytes or permitted excerpts, SHA-256/size/media type, readable locators, extraction/transcription method, source date/capture date, rights/approval and authored-versus-sourced labeling |
| Journey beats | Supported intent and stable anchor enums, objective/copy, permitted prepared inputs, starting/active/completed checkpoint references, tape references and observable completion condition |

Stored checkpoint DTOs are recorded views, not newly created live records. A simulated upload receipt or completed operation must be explicitly typed/provenanced as replay outside the live command-success path. Every exposed read at a checkpoint agrees on identity/status/visibility; do not independently pick convenient rows from unrelated fixtures.

Participant configuration snapshots reference the exact prepared persona/stack identities. Private retrieval is eligible only for that participant's saved stack assignment plus shared meeting documents. The public demo package contains no real private secrets; showing private knowledge scope teaches retrieval policy, not confidentiality between anonymous visitors who can inspect the published package.

## Validation and publication

Offline validation must establish:

- Supported schema/read/event versions, bounded sizes/counts, safe passive source URLs, correct hashes and all referenced assets present. Hashes prove content identity, not source truth or independent authorship.
- Valid DTOs and stable linked identities; deterministic timestamps/message order; no hidden dependence on wall-clock time, live settings, random IDs or current provider metadata.
- Tape scope, increasing sequence, legal event shapes, paired tool invocation/call identities and exactly one valid terminal result. No text/effects after terminal.
- Concatenated generated text, final message ID, citations/tool artifacts and visible effects agree with the completed checkpoint. Active checkpoints cannot expose final answers/status prematurely.
- Shared domain policies accept lifecycle/closing/majority/archive outcomes. Ballots ask whether to end discussion; archive overlay never implies reopening on unarchive.
- Retrieval scope/revision/chunk/hash references and source excerpts match approved evidence. A citation never claims an uncaptured document was retained or reviewed.
- Every beat/intent/anchor reference is supported by code. No unsupported input claims, secret keys, production identifiers containing private data, synthetic costs presented as measured spend, or fabricated private reasoning.

Publish through an offline tool using a separate provisioner credential. Stage data/assets, validate the complete immutable version, then atomically expose its published manifest. Runtime reader cannot stage, seed, repair, publish, migrate or clean up. Missing/incompatible/corrupt packages produce a safe package-unavailable error and retry/restart UI; no live fallback or best-effort generated replacement.

Pin package ID/version/hash for an entire run. A server registry may change the default for **new** runs without changing already-pinned runs. Retain old published versions for a documented bounded support window; retirement of an old pinned version fails explicitly rather than silently swapping content. Test interruption during provisioning and version replacement. Provisioning instructions work from a clean checkout, without ignored author-local research or test imports.

## Route-bound read and event sources

The proposed replay namespace is `/api/replay`; exact routes/DTOs ship with Spec 17 and are added to the actual API inventory then. Expose only approved manifest/checkpoint feature reads, assets and SSE observation. Non-read methods are rejected; guide actions do not invoke POST commands. An immutable checkpoint selector is allowed, but never treated as a session write or live-workspace selector.

Use a dedicated server reader connection with Spec 12's tested effective permissions. A schema/prefix alone is not isolation: `PUBLIC` grants, views, role membership, default function execution and Storage paths must also be safe. Do not reuse a live service-role client with a promise not to write. No key is sent to the browser.

A visitor can inspect/select another approved recorded checkpoint; the tutorial is not an access-control or anti-cheating system. The security guarantee is that all such reads stay inside approved replay data. No secret playback capability, authentication bootstrap or server-side per-visitor cursor is required.

## SSE behavior

Load each bounded verified tape once per stream/request or from an immutable version-keyed cache. Do not poll Supabase for every token, append event journals, or execute a durable runner. Use actual SSE HTTP framing, serializer/decoder contracts and no-cache/no-buffering behavior appropriate to deployment. Stream cancellation releases timers/resources; no replay inference continues in the background.

Turn tapes preserve the existing snake-case wire envelope, normalized frontend identities, sequence semantics, tool pairing, citation content and terminal event. Reuse the existing fetch-stream decoder and pure turn reducer. Closing tapes use their own typed envelope/projection and the shared closing panel; never masquerade as participant turns. Register actual new events in the API inventory and generated/schema/decoder tests together.

Pacing is server-side, finite and deterministic in content, ordering, identities and intended schedule—not exact network arrival times. Specify bounded per-record delays or small text batches; use an async clock/wait, not event-loop blocking. Existing live backlog batches may still flush immediately. Prove the deployed proxy does not coalesce the entire replay into one final response.

Resume uses the last accepted sequence (`after` semantics matching the feature contract). Return only the remaining suffix, without a new operation or repeated effects. Resume must not wait through the whole elapsed prefix again or repeat a partial tool identity. Browser observation can deduplicate repeated frames. EOF without a terminal is interrupted observation, not fabricated execution failure or successful completion. Allow retry/resume of the same tape; it cannot advance the tutorial by itself.

Bound tape size, open streams per client/deployment, concurrent timers, connection lifetime and read/request rate. Hosting/egress still cost money even without paid AI calls. Package data cannot override resource policy.

## Ephemeral playback and read frontier

The client runtime owns only volatile package identity, beat/checkpoint, active observation offsets, provisional projection and run epoch. No database/session/progress/analytics writes and no persisted Query/Zustand tutorial state. A non-secret entry preference, if used, is not progress. Refresh starts over; route navigation within the mounted replay runtime preserves the run.

For one generated operation:

1. A permitted user intent selects the manifest's active checkpoint and tape locally. No live command is submitted and no HTTP response pretends to have persisted it.
2. All feature reads use that same active checkpoint. The operation is observable/nonterminal; canonical reads do not contain its finished text/effects. Incidental polling/refocus/retries read the same immutable view and do not advance anything.
3. SSE drives the normal provisional projection. The tutorial may mark the beat's work in progress but does not jump to the next beat on a timer.
4. Before handing terminal completion to shared reconciliation, the replay runtime switches read visibility to the declared completed checkpoint and installs/validates its canonical read bundle. The final message, operation, tools/citations, disagreements/consensus/context and any closing output agree. Retain provisional content until its canonical replacement is available; render one copy.
5. Only then apply terminal settlement/invalidation through the shared path, with explicit recorded provenance rather than a live persistence assertion. Step completion becomes available; the next beat still requires the permitted user action.

This ordering is mandatory: current turn observation skips SSE for terminal status and assumes canonical writes already exist when it settles. A callback invoked after invalidation is too late to repair an incoherent frontier. Choose a narrow pre-settlement hook/runtime adapter, not a forked decoder or broad custom meeting controller.

Every read request captures its immutable checkpoint and run epoch. On a transition cancel obsolete requests and reject responses whose epoch/checkpoint no longer matches; abort alone cannot guarantee a late response is ignored. Scope caches/projections by runtime/package/version/run or use separately instantiated stores/QueryClients with bounded checkpoint handling. Do not create a cache key for every token or share global projection state merely because the fixed IDs match.

Back returns to a prior completed beat using a fresh replay epoch and appropriate snapshot; restart returns to the initial checkpoint. Both abort subscriptions, invalidate pending handlers and reset only replay state. Switching between live and replay preserves live vault/cache/cooldown state; leaving live merely detaches its observation and never cancels durable work implicitly. No arbitrary mid-token rewind or persistent resume is required.

## Explicit outcomes and copy

Supported create/upload/send/turn/close/archive intents select recorded views; they never enter live success handlers as fake commits. Preserve real form validation and make locked/prepared input explicit. Unsupported commands are unavailable in UI and rejected at the replay boundary. Do not silently accept user files or free-form questions then display an unrelated script.

Display a persistent replay label. Recorded completion means the prepared result is now visible, not that a new record was written. Use authored/recorded provenance on text/evidence/usage. If no measured usage exists, omit it or show not measured; zero provider calls is not a measured zero-token run. Never update the paid usage ledger or claim current research, prices, ratings, spend or savings.

## Acceptance ownership

Spec 17 proves package validation/provisioning, role permissions on actual objects, real HTTP streaming, frontier ordering, replacement and one analyst browser slice. Spec 18 proves approved content and the one full user-paced journey. Spec 19 independently verifies deployed roles/assets/proxy/browser behavior, two visitors, mixed live/replay state and failures. A mock transport or a locally passing type check does not discharge these gates.
