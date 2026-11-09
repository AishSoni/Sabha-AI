# Spec 38: Settings and Capability Diagnostics

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–37. Owns T06, T13–T15 and D07; contributes P10/P11/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and D07

Make live settings useful and missing prerequisites visible. Remove Coming soon
placeholders rather than inventing Notifications/Privacy functionality. Demo
controls unavailable there say **Only available in live.**

Resolve D07 before building the affected layout: final sections and fields that
are editable versus safe read-only diagnostics. Proposed groups, not approval:
Providers/models (endpoint, key presence, default, test); System AI (stored policy,
discovery, fallback provenance); Credentials (Spec 37); Appearance (existing
System/Light/Dark); configuration/knowledge/execution diagnostics. Do not reintroduce
removed motion controls, expose server secrets, or promise browser editing of
server-owned environment configuration.

## Requirements

1. Distinguish missing, disabled, configured-but-unverified, available, and failed
   capabilities. A configured key/URL or enabled flag is not a successful probe.
   Show safe cause, effect, remediation, and retry; do not fail optional features
   globally or require live prerequisites in Demo.
2. T06: bind async test/discovery results to the relevant input generation. Discard
   obsolete key/endpoint/provider/model results. A late response cannot overwrite
   a newly selected model, show green for changed credentials, or enable untested
   replacement settings. Raw secrets must not become cache/fingerprint identities.
3. T13: System AI discovery errors are not “No models available.” Preserve safe
   backend/transport failures distinctly from a successful empty inventory.
4. T14: configured Ollama does not mean reachable. Permit its legitimate keyless
   test through request validation while preserving trusted-origin/SSRF controls.
   Do not fix this by weakening endpoint allowlists or requiring a fake key.
5. T15: distinguish no stored System AI policy from a database read failure with
   fallback. Show policy origin/degradation rather than silently presenting an
   environment default as the successfully loaded saved policy.
6. Diagnose missing hosted API origin instead of silently targeting a visitor's
   localhost. Preserve legitimate local defaults. Expose embedding/provider and
   knowledge requirements safely; existing execution-time missing-key checks do
   not replace useful preflight/recovery presentation.
7. Execution diagnostics must not equate a disabled in-process turn runner with
   absence of an external worker. Keep liveness `/health` distinct from protected
   capability readiness. Report only what can actually be established.
8. Unknown provider configurations need a safe unsupported state, not silent
   omission. Keep useful prior content and per-capability recovery. No private
   diagnostics or credentials are fetched by the public demo.

## Local acceptance

- Resolve D07 in an execution entry; unsupported controls have no Coming soon.
- Missing env/key/endpoint, disabled, unverified, unreachable, successful-empty,
  and available states have correct cause/remediation without secret leakage.
- Change key/URL/provider/model during pending tests/discovery: obsolete responses
  cannot change the current model, success state, or enablement.
- Keyless Ollama works for trusted endpoints; untrusted endpoints remain rejected.
- System AI no-row, database failure/fallback, discovery failure, and save failure
  are distinct; existing visible save errors are not regressed.
- Verify local versus hosted origins, worker uncertainty, optional features, and
  strict Demo isolation. Credentials themselves satisfy Spec 37's gate.

## Implementation record (2026-11-09)

Status remains a working draft: local implementation and verification are complete;
hosted acceptance remains outstanding.

### D07 disposition — final sections

Settings has five sections and no disabled placeholder:

- **Providers** (editable) — server-advertised and persisted providers, default
  provider/model, temperature, token limit, browser-key save/update/remove, model
  discovery, and explicit connection tests. Unknown persisted or server-advertised
  providers render an unsupported card instead of disappearing or offering unsafe
  actions.
- **System AI** (editable) — saved generation policy, provider/model discovery,
  effective policy provenance, save errors, and a distinct environment-default
  or storage-failure notice.
- **Credentials** (editable) — the existing Spec 37 vault card and the truthful
  browser-key/server-key data-path statement.
- **Appearance** (editable) — System/Light/Dark only, using the existing
  memory-only appearance boundary. No motion controls or persisted theme writes
  were reintroduced.
- **Diagnostics** (read-only) — API origin, runtime mode/environment, provider
  credential presence, embedding and knowledge prerequisites, turn execution, and
  System AI policy origin. Server-owned environment configuration is never
  editable from the browser, and the screen returns no secret values or
  server-owned URLs.

Notifications and Privacy were removed rather than invented, and every
Coming soon string is gone. The public demo settings route stays a static,
hook-free page and says provider setup, connection tests, diagnostics, and the
browser key vault are **only available in live**.

### Dispositions

- **T06 — input-bound provider results.** `ProviderCard` carries a non-secret
  input generation token alongside the vault epoch. Key edits, endpoint edits,
  provider/config changes, stored-key changes, and vault changes invalidate the
  current discovery/test result immediately. A late test cannot show success,
  enable a provider, or refresh models after its inputs changed; a late model
  inventory cannot overwrite a model selected after the request started. The
  first discovered model is auto-selected only when the model was empty when the
  request began and is still empty when the response is applied. Raw credentials
  are never used as cache keys or request identities. The header badge now
  distinguishes merely `Enabled` from a current `Reachable` or `Test failed`
  probe.
- **T13 — distinct System AI discovery outcomes.** `SystemAiCard` no longer maps
  every failed discovery to an empty inventory. It has local, provider/token-bound
  states for loading, successful results (including a legitimate empty list),
  sanitized provider errors, and settings-API transport errors. Provider changes
  discard late results, failures offer a scoped retry, and only a successful empty
  response says the provider returned no models. The policy status banner is
  separate from model discovery.
- **T14 — keyless local probe without weakening trust.** `TestKeyRequest.api_key`
  is optional. Hosted providers without a key return a safe
  `Enter an API key before testing this provider.` result without a network call;
  Ollama proceeds keyless through the existing trusted-origin and DNS/SSRF gate.
  The allowlist was not weakened and no fake credential is required.
- **T15 — System AI provenance.** Policy loading now preserves `stored`,
  `environment`, and `fallback` provenance, including a safe degradation message.
  The providers response adds `system_ai_status`; System AI and Diagnostics show
  environment defaults as missing saved policy and database-read failure as a
  degraded fallback. Summary, closing, and worker consumers keep the existing
  config/cache contract. The environment fallback is no longer presented as a
  successfully loaded saved policy.
- **Requirement 6 — hosted API origin.** A pure `describeApiOrigin` rule
  distinguishes a configured origin from the local development default and a
  local page from a hosted page. The live transport rejects a loopback API base
  from a hosted page before attaching a token; local development keeps the
  localhost default. Diagnostics shows the configured/local-default state and
  remediation. `docs/OPERATIONS.md` now states the hosted requirement.
- **Requirement 7 — execution truth.** Diagnostics reports the in-process turn
  runner as enabled/disabled, explicitly says external-worker presence cannot be
  established, and labels `/health` as liveness only rather than capability
  readiness.
- **Requirement 8 — unsupported configurations.** Providers are the union of
  server metadata and persisted local configurations. Unknown IDs get a safe
  unsupported state; a persisted unknown config can be removed without attempting
  a test, enablement, or provider call. Supported metadata providers without a
  local configuration do not create false cards.
- **Diagnostics contract.** `GET /api/settings/diagnostics` is a protected
  operator read. It inspects deployment configuration and the current System AI
  policy only; it does not contact providers, Qdrant, or the database for
  reachability. Capability states are `missing`, `disabled`, `unverified`,
  `available`, `failed`, or `unsupported`, with safe detail, effect, and
  remediation. Credentials are represented only by presence booleans.
- **Provider transport hygiene.** Gemini discovery and probes use
  `x-goog-api-key` instead of a query parameter. Discovery/test failures return
  fixed status/action messages rather than raw exceptions, URLs, provider bodies,
  or embedded credentials; untrusted Ollama endpoint errors likewise do not echo
  the submitted URL or userinfo.
- **Demo isolation.** The demo settings page imports no settings client, hook, or
  store and performs no operator call. Unavailable capabilities are described as
  live-only rather than rendered as failing controls.

### Verification performed

- Frontend: full `npx vitest run` — 127 files, 768 tests passed; `npx tsc --noEmit`
  passed; `npm run lint` passed with 13 pre-existing warnings and no errors;
  `npm run build` passed with `/settings` and `/demo/settings` in the route table.
- Backend: full `pytest` — 1022 passed, 1 skipped.
- OpenAPI: the fixture contains 60 paths (the settings diagnostics route is the
  only addition from the prior snapshot). `export_openapi.py --check` matches;
  the frontend generated bindings test regenerates byte-identical output.
- Evidence covers policy provenance and read failure, capability diagnostics and
  credential redaction, keyless Ollama versus hosted missing keys, Gemini header
  and failure redaction, hosted/local API-origin rules, stale test/discovery
  results, model-selection races, System AI discovery failure versus successful
  empty results, unsupported providers, section navigation, appearance
  keyboard selection, and the retained settings metadata failure/retry path.
- Known limits: diagnostics are configuration reads, not probes; “unverified”
  remains unverified until an explicit provider test. External-worker liveness
  cannot be asserted by this process. The System AI policy cache may serve its
  last good provenance for up to the existing TTL. Hosted acceptance of the
  operator-only surface remains outstanding.
