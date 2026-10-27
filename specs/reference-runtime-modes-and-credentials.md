# Shared Reference: Runtime Modes, Replay, and Browser Credentials

This contract applies to every implementation spec. It supersedes earlier descriptions of a writable public demo and universally server-owned provider keys. Phase 3 clarifies that live and replay coexist in the same hosted app, not separate deployments. It is a reference, not another numbered implementation step. All examples are proposed contracts; their fixtures and adapters must be implemented and tested first.

## Two distinct paths

| Path | Required behavior |
| --- | --- |
| Hosted live application | Ask the visitor for credentials required by the selected live services. Persist those credentials only as encrypted browser `localStorage` data. A user-entered passphrase unlocks them; neither the passphrase nor a derived decryption key is persisted. Missing credentials must not silently use the operator's paid keys. |
| Demo, hosted or local | Completely no-sign-in, fixed beforehand, strict replay only. Every run is confined to a dedicated, isolated, no-write demo workspace. An on-screen, game-like guided tutorial uses the same application UI and core at the user's pace. It never requests credentials or makes live inference, web-search, embedding, or tool-effect calls. |
| Trusted local live application | Preserve explicitly configured environment credentials and local Ollama. Local fallback is an explicit deployment policy, not a way for hosted requests or replay to use operator-funded credentials. |

Keep Supabase/Postgres, Qdrant, and selected source-store infrastructure credentials server-only. They are not visitor BYOK fields. Do not add accounts, a login gate, or anonymous Auth bootstrap to implement replay or the browser vault. A local vault unlock prompt is not an application sign-in.

The same hosted app offers a first-visit live-setup versus guided-replay choice and later switching. Live remains a shared writable no-sign-in workspace, not private per-visitor data. Choosing demo is UX, not authorization: a visitor may intentionally call the public live API, but a replay request/adapter may never read live data or invoke it. Same-origin coexistence is not an XSS security boundary.

## Dedicated no-write demo boundary

- Bind replay to its dedicated data and read-only dependency graph on the server/composition boundary, under a replay API namespace in the same app. Keep live and replay credentials/clients separate; never mutate deployment-global mode or a global client's role for a request. A client-supplied workspace ID, route parameter, header, or `mode` value cannot select live data or relax read-only guards. Approved immutable package/version/checkpoint selectors select only recorded views. This is isolation between demo and live execution, not per-user ownership filtering of the live shared workspace.
- Package all scenario content beforehand: initial records, permitted steps, messages, participant replies, tool activity/results, source excerpts, votes, summaries, and displayed usage. Use a versioned, validated replay manifest and reproducibly provisioned assets, not ignored author-local files or production imports from test fixtures.
- Replay runtime reads may serve the fixed package and dedicated read-only data. Deny replay-attributable application writes to both demo and live stores: meeting/persona/settings mutations, message insertion, uploads/indexing, deletion, queue/jobs, operation journals, evidence, usage, and tutorial progress/session/analytics records. Do not create a per-visitor workspace or seed it on first visit. Authoring/provisioning happens before runtime.
- Enforce guards before adapter dispatch, including direct API/deep-link attempts. UI-disabled buttons alone are insufficient. Read-only database/storage permissions and replay-adapter outbound restrictions provide defense in depth. Audit effective `PUBLIC` inheritance, roles, views, RPCs and default privileges; smaller explicit reader grants alone do not remove inherited live access. Demo operation must not require live provider, embedding, vector-search, or writable database credentials.
- Tutorial advancement changes only an ephemeral cursor and presentation projection. Back, restart, navigation, or repeated clicks never create backend commands or durable effects. Browser-persisted tutorial progress is not required. Do not access or alter the live credential vault while replaying.
- No fallback to live execution when a step, asset, or recorded event is missing. Fail with an honest replay-package error and a retry/restart choice; no generated substitute. Recorded activity is identified as replay, not claimed to be fresh research, a real charge, or a newly committed live operation.

Live startup recovery, workers and provider calls may legitimately run in the cohosted deployment. They are not replay effects and must not be disabled to pass a global no-writes assertion. Replay handling must neither construct nor invoke them. A replay-only local composition must start without those live dependencies. Same-process isolation cannot claim process-wide outbound denial while live execution is enabled; test attribution and the separate restricted graph.

## Same UI and core, user-paced tutorial

Reuse the base application's actual feature screens/components, domain policy interfaces, normalized event/read contracts, and pure reconciliation/rendering code. Compose a recorded read/event source and rejecting write ports instead of live adapters. Do not build a separate lookalike meeting application, fork lifecycle policy into a tutorial engine, or treat successful no-op persistence as a real commit.

The guide owns step order, objectives, overlays/highlights anchored to real controls, and explicit next/back/restart actions. It does not own a second meeting/message implementation. Unsupported editing actions stay unavailable with an explanation. Replay outcomes are explicit and must not satisfy live-operation persistence/completion assertions.

Advance only on the user's permitted action; no automatic transition to another step or surprise paid call. Presentation animation is optional and cannot control correctness. All authored generated text uses actual paced backend SSE, including closing reasons and summaries; source excerpts and fixed labels need not stream. Test keyboard access, focus when targets mount/unmount, route transitions, reduced motion, and rapid/repeated actions. The tutorial is interactive guidance through the real UI, not merely a video player or a separate `/demo` mock screen. A replay route scope may compose the same actual features.

Use the [package and playback contract](reference-replay-package-and-playback.md) for version pinning, prepared Supabase retrieval results, coherent read checkpoints and terminal reconciliation. Keep the cursor ephemeral; refresh restarts, route navigation preserves the mounted run, and back/restart cancel stale replay requests without clearing live state or credentials. Packages are replaceable data, not executable scenario plugins; initially publish one journey.

## Browser credential vault

- Persist only a versioned authenticated-encryption envelope in `localStorage`. Encrypt the credential payload with Web Crypto AES-256-GCM using a password-derived, non-extractable key. Use PBKDF2 with SHA-256, a cryptographically random salt of at least 16 bytes, and a fresh unique 96-bit IV for every encryption under a key. Authenticate relevant envelope identity/version metadata and reject tampering.
- Record and validate algorithm/version, salt, IV, and KDF work factor as non-secret metadata. Before implementation, select, document, and benchmark the supported work factor against current security guidance; MDN example iteration counts are not a production policy. Bound parsed lengths/work factors before expensive work. Do not invent cryptography or use base64/obfuscation as encryption.
- Never persist the passphrase, derived key, plaintext credentials, or an alternative browser-held secret that silently unlocks the ciphertext. This includes `sessionStorage`, IndexedDB, cookies, persisted Zustand/Query state, service-worker caches, logs, analytics, and server records. Never send the passphrase or derived key to the backend.
- Keep unlocked credential/key material only in a deliberately non-persisted client capability, outside Query data/keys, component debug output, and general-purpose settings stores. Clear the passphrase field/reference after derivation; lock clears references to plaintext and keys. JavaScript garbage collection does not promise secure zeroization. Reload starts locked; provide explicit lock, forget, and passphrase-change flows. Password-manager storage is not an application persistence mechanism to add here.
- Wrong passphrase, damaged ciphertext, unsupported envelope version, unavailable secure-context crypto, and blocked/quota-exceeded storage fail safely. Never overwrite a valid vault after failed unlock. Forgotten passphrases require re-entering credentials; do not add server-side passphrase recovery or a hidden unlock key.
- Migrate old persisted settings deliberately: detect legacy plaintext key fields, offer re-entry or explicit encryption with a supplied passphrase, remove obsolete plaintext copies once replacement/forget succeeds, and never silently discard unrelated settings. A legacy persisted key must not become a plaintext fallback. Cross-tab updates/forget must not silently keep using stale credentials; define and test invalidation/locking.
- This protects stored ciphertext, not an already compromised origin. XSS or malicious same-origin code can access unlocked secrets or capture a passphrase; non-extractable keys do not eliminate that risk. Retain safe rendering, dependency/CSP controls, and honest security wording. TLS is required for hosted credential transfer.

Proposed envelope fragment for `frontend/src/shared/credentials/envelope.ts`; base64 strings encode binary ciphertext/metadata, not plaintext credentials. Runtime parsing must enforce the lengths, algorithms, work-factor policy, and authenticated metadata described above:

```typescript
export type CredentialEnvelope = {
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string; // Includes the authentication tag; no key/passphrase field.
};
```

## Live credential handoff and durable operations

- Hosted key tests, discovery requiring credentials, inference/tool follow-ups, votes, summaries, web search, and embeddings use the visitor-supplied credential for that service. Preflight the required set and explain missing/locked/invalid credentials; do not charge or silently select an operator-funded alternative. Non-secret shared defaults and System AI policy stay distinct from private browser credentials.
- The browser unlocks locally and supplies only the selected credential to a narrowly defined HTTPS request or transient handoff. Keep it out of URLs, query keys, public settings, responses, errors, logs/traces, request-body capture, durable queues, SQL, files, and replay artifacts. Backend adapters may use it transiently for the intended call; do not mutate a global provider client/default or share it with another visitor's operation.
- Before queue implementation, choose and test a bounded transient handoff across the actual worker topology. Bind credential availability to the initiating operation/service and private handoff authority; knowing a public operation ID must not let another visitor spend its credentials. Any opaque handoff capability is private and non-persisted, not an account/login requirement or a listable settings field. Expire/release transient secrets; do not introduce server-side credential persistence to simplify recovery.
- A durable operation survives loss of transient credentials, not the secret itself. Expose `awaiting_credentials` or an equivalent operation recovery stage when a pending turn, closing stage, or ingestion job cannot proceed. Re-unlock/re-provide for the same operation without a new command, duplicate upload, or repeated completed paid checkpoint. Do not hold a database lease/lock indefinitely while waiting; maintain FIFO/admission/closing semantics explicitly.
- Navigation detaches observation; it is not cancellation or key persistence. Already-running work can finish only while its bounded handoff remains valid. Browser/worker restart, lock/forget, expiry, and passphrase change have documented revocation semantics. Credentials already dispatched cannot be recalled; prevent later calls after revocation is observed. Uncertain paid calls still require explicit reconciliation, never automatic replay.
- Persist only non-secret effective settings, attempt identity, usage, and recovery status. Do not record a raw-key hash as a public fingerprint or an unlock surrogate. Server database/source/vector credentials remain infrastructure secrets even though live external-service credentials originate in the browser.

## Test contracts and implementation ownership

| Contract | Required evidence |
| --- | --- |
| `runtime_modes` | Two fresh visitors replay the same dedicated package with no sign-in, credential prompt, or live workspace read. Direct mutation/deep-link attempts are rejected before writes/outbound effects. Separately test live BYOK and trusted local configuration; do not treat all APIs as writable demo APIs. |
| `browser_vault` | Actual browser crypto round-trip, locked reload, wrong passphrase, corruption, fresh IVs/salt, non-extractable key, lock/forget/change, cross-tab invalidation, legacy plaintext migration, and storage/crypto failures. Enumerate persisted browser stores and captured network/log payloads to prove forbidden material is absent; unit crypto mocks alone do not prove encryption. |
| `credential_handoff` | Distinguishable synthetic keys from two visitors never cross operations. No owner-key fallback, global-client mutation, public handoff reuse, logging, or secret persistence. Expire/restart/re-provide during turn/tool/vote/summary/ingestion; completed paid steps are reused rather than repeated. |
| `strict_replay` | Actual application routes/components and shared core/read/event/reconciliation contracts, not a standalone imitation. Fixed step outcomes; explicit user pacing/back/restart; no live provider/search/embedding/tool calls and zero replay-attributable application writes to any workspace/store, including progress/usage/queue/evidence. Reject missing assets, forged mode/workspace IDs, off-script actions, and duplicate/late events. Prove coherent terminal reads, actual SSE and isolation from concurrent live work. |

Proposed browser integration test; `replayJourney` must mount real feature routes/core with a valid package and rejecting write/outbound spies, not render a separate fake application:

```typescript
it("advances only by user action without live effects", async () => {
  const h = await replayJourney.openFresh();
  expect(h.stepId()).toBe("intro");
  await h.flushPresentationWork();
  expect(h.stepId()).toBe("intro");
  await h.next();
  expect(h.stepId()).toBe("inspect-meeting");
  expect(h.liveCalls()).toEqual([]);
  expect(h.applicationWrites()).toEqual([]);
  expect(h.credentialPrompts()).toEqual([]);
});
```

Those step IDs are fixture values, not mandated scenario content. Add independent real HTTP/read-only-role and build/import tests: mocks alone cannot establish isolation, shared-core reuse, or absence of hidden writes.

- **Spec 01:** apply the runtime guard to exposed demo paths and fix settings with the minimal encrypted BYOK contract in current files. Keep the existing findings/evidence counts; new product decisions are requirements, not newly reproduced review bugs. Public demo exposure waits for complete replay acceptance.
- **Spec 03–04:** define runtime/read/write/event ports, forbidden dependencies, package validation, mode binding, and permission/composition contracts without scaffolding the complete tutorial.
- **Spec 05:** extract the tested vault, local unlock UI, runtime-scoped transport/cache identity, and non-persisted credential capability into the frontend foundation.
- **Spec 07–09:** implement credential-aware execution/recovery for queue, closing, and ingestion respectively; never weaken durability or secret handling to hide their interaction.
- **Spec 10–11, historical:** production cutover and upgrade acceptance have their own completion records. Guided replay was explicitly deferred; unexecuted hosted checks remain unproven. Do not treat these records as delivered replay.
- **Spec 12–14:** harden effective database reads, fix vanilla creation regressions, and compose separate live/replay graphs and frontend runtime scopes in the same app.
- **Spec 15–16:** integrate real closing UI/shared generated-text presentation and resolve bounded shared PDF extraction quality.
- **Spec 17–19:** implement package/provisioning/prepared retrieval/paced streaming and one technical slice; deliver one approved guided bond journey; independently verify hosted replay and live-regression acceptance. See the [Phase 3 roadmap](roadmap-phase-3-hosted-guided-replay.md).

Documentation: [MDN key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey), [PBKDF2 parameters](https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params), [AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams), and [non-extractable keys](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable). API examples inform implementation, not production work-factor selection or a guarantee against XSS.
