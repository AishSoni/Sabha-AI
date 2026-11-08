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
