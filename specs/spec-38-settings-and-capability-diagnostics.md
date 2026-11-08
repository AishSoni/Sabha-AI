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
