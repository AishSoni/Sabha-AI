# Spec 37: Credentials and Effective Generation Policy

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–36. Owns T11, T12, T25, T26; contributes P10/P11/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope

Make existing encrypted credentials usable and generation requirements honest.
Settings organization/diagnostics follow in Spec 38. Do not weaken vault, endpoint,
server authorization, or durable-work safety to make a button appear functional.

## Requirements

### Usable vault flow — T11/T12

Expose unlock/lock, actionable errors, stored-key presence, and key update controls.
Login remains separate from unlock. The settings store deliberately clears its
ordinary `config.apiKey` after sealing; the card cannot use that blank field as
both an editable draft and the availability/test credential.

Separate transient input drafts from encrypted stored presence. Use authorized
ephemeral accessors for model discovery, key testing, and execution. Locked-vault
failure must be visible and must not silently drop keystrokes or pretend a save
succeeded. Do not persist plaintext, passphrase, or derived key, expose saved
secrets routinely in rendering, or put them in logs/diagnostic/cache identities.
Preserve access-loss locking and private cache/byte cleanup.

Correct the privacy statement: browser credentials are encrypted locally and may
be forwarded to the backend for provider operations, not transmitted only directly
to the provider. Distinguish transient plaintext, encrypted storage, authentication
session policy, and server-only infrastructure credentials accurately.

### One effective generation configuration — T25

Normal speaker selection currently sends global provider/model/generation fields
while cooldown lookup uses the participant's provider. Establish one effective
configuration for execution, displayed policy, credential lookup, and cooldown.
Transient credential selection is not itself an explicit generation override.
Preserve backend request-over-participant-over-default precedence for genuine
overrides, but do not silently replace a participant policy with unrelated global
defaults. Make the source and effect of an intentional override understandable.

### Closing credential capability — T26

Closing currently resolves server-side credentials, unlike browser-key-supported
turns. Before admitting a close, expose the credential capability required for
votes and final summary. Choose and document either an explicit server-only
limitation with remediation, or a supported ephemeral handoff/re-provision design.
Do not claim browser-only cloud setup can finish if it cannot.

Never solve durable retry by persisting plaintext request keys, silently using
another provider/credential, or replaying paid completed steps. Preserve safe
continuation after disconnect/retry and redact all credential failures. This
technical contract needs evidence before claiming support, not a new implicit
permission to persist secrets.

## Local acceptance

- Locked/unlocked vault, incorrect passphrase, key edit/save/test/discovery, lock,
  reload, access loss, and late response all have explicit truthful states.
- Encrypted envelopes may persist; plaintext/passphrase/derived key do not.
  Verify no secret in UI diagnostics, logs, query identities, demo, or packages.
- Participant provider B with unrelated global A: execution, key lookup, displayed
  override, and cooldown agree. Cover inheritance, explicit override, and no-key.
- Browser-only versus server-configured closing preflight, failure, retry, and
  partial paid work follow the documented capability without duplicate execution.
- Privacy text matches the actual tested data path.

## Implementation record (2026-11-09)

Status remains a working draft: local implementation and verification are complete;
hosted acceptance and the Spec 38 settings organization/diagnostics surface remain
outstanding.

### Dispositions

- **T11 — usable vault flow.** The settings store no longer stores an `apiKey` in
  `ProviderConfig` (persist version 3 migrates old rows). Provider cards keep a
  transient key draft separate from sealed presence, expose save/update/remove,
  test, and model discovery controls, and resolve the credential only at action
  time. A locked vault produces an actionable message instead of silently dropping
  edits. `VaultCard` adds create/unlock/lock/change-passphrase states and renders
  store errors. Vault operations carry a generation epoch; late unlock/save
  responses cannot resurrect credentials after lock or access loss. A vault rekey
  re-encrypts every in-memory credential under a fresh salt/key without exporting
  the derived key. `clearPrivateScope` continues to call `lockVault()`.
- **T12 — truthful credential statement.** The settings copy now states that
  browser keys are encrypted locally, decrypted only while unlocked, and may be
  forwarded over HTTPS to the Sabha backend for provider operations (discovery,
  tests, turns, votes, summaries). It distinguishes server-only infrastructure
  credentials and says login does not unlock the vault.
- **T25 — one effective generation configuration.** `resolveEffectiveGeneration`
  preserves participant explicit provider/model from `generation_policy` (with the
  legacy `provider_config` fallback) and never lets unrelated browser-global
  provider/model/key replace it. Inheritance uses the browser-global choice;
  explicit participant fields win. The same resolved provider drives execution,
  credential lookup, `RateLimitedButton` cooldown, and the roster's displayed
  provider/model/source. Transient credential selection is not itself a generation
  override. A model-only explicit policy does not attach a provider key because no
  provider is known client-side.
- **T26 — closing credential capability.** The chosen design is a transient
  browser-key handoff, not a server-only limitation. `GET
  /meetings/{id}/closing/capability` reports per-vote and summary requirements,
  including whether a browser key is needed, without provider calls. The live
  panel combines that with local vault presence/unlock state, disables admission
  with an explanation until ready, and resolves only needed providers' keys at
  command time. Vote and summary keys travel only in transient per-provider
  headers (`X-Provider-Key-OpenRouter`, `X-Provider-Key-Gemini`); they are never
  in bodies, URLs, closing rows, votes, summaries, or logs. The service rechecks
  capability before `repository.request/retry` and returns a string 409 detail if
  a required credential is missing, preventing admission/paid work. Retry
  re-supplies keys and skips completed votes/summary work; failed-at-summarizing
  retries need only the summary credential. Provider/config errors are redacted
  against every supplied key and common `key=`/Bearer patterns.
- **Provider transport hardening.** Gemini now sends `x-goog-api-key` instead of
  placing the key in the request URL, so provider errors and logs cannot capture
  it from the query string.

### Verification performed

- Frontend: `npm test` — 121 files, 738 tests passed; `npx tsc --noEmit` passed;
  `npm run test:architecture`/full suite boundary tests passed; `npm run build`
  passed (Next.js production build).
- Backend: `pytest tests/unit/test_effective_generation_settings.py
  tests/unit/test_gemini_provider_credentials.py
  tests/regression/test_closing_service.py tests/integration/test_closing_api.py`
  — 39 passed. `python -m scripts.export_openapi` regenerated the snapshot;
  `python -m scripts.export_openapi --check` passed; frontend
  `generated.test.ts` confirmed byte-identical bindings.
- Evidence covers locked/unlocked vault, wrong passphrase, save/update/remove,
  rekey, late-lock rejection, participant B with global A, inheritance and
  no-key behavior, capability preflight for vote/force/retry, two-provider key
  routing, browser-only closing, missing-key admission refusal, no key in closing
  rows/responses, retry without replaying completed work, and Gemini URL hygiene.
- Known limit: capability preflight is advisory until the authoritative server
  recheck; a vault lock between click and request is surfaced as a 409 and the
  capability query refreshes. No plaintext key, passphrase, or derived key is
  persisted by these flows.
