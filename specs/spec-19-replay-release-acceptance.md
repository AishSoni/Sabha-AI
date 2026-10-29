# Spec 19 (Phase 3): Replay Release Acceptance

## Purpose and prerequisites

Decide whether the same hosted app can safely expose its one guided replay. Specs 12–18 have executed evidence and their bounded gates pass. This is independent cross-layer acceptance, not another implementation engine or permission to mark conditional hosted checks complete.

Read the [roadmap](roadmap-phase-3-hosted-guided-replay.md), [runtime contract](reference-runtime-modes-and-credentials.md), and [package/playback contract](reference-replay-package-and-playback.md). Preserve Spec 11's historical completion record; unresolved real hosted infrastructure verification still needs actual evidence.

## Required evidence matrix

| Area | Required independent evidence |
| --- | --- |
| Database isolation | Fresh and upgrade real PostgreSQL tests plus effective deployed Supabase role/membership/RLS/view/RPC/default/Storage checks. Reader can read approved packages and cannot read live or write anywhere. No service-role fallback. |
| Actual API boundary | Real HTTP to replay routes, forged live IDs/mode/headers, unsupported methods and deep links. Reject before live adapter dispatch; no package selector chooses live credentials/schema. Live routes intentionally retain their shared public API policy. |
| Backend/frontend reuse | Production build/import checks and real feature routes prove no test/ignored-data imports, duplicate domain workflow, lookalike app or successful no-op persistence. Shared policies validate package outcomes. |
| No replay effects | Observe replay-attributable database/storage/RPC/outbound paths, not mocks alone. No queue/journal/evidence/usage/progress/session/analytics writes; no provider, embedding, Qdrant, OCR or live tool effects. Legitimate live recovery in the cohosted app is distinguished, not suppressed to pass. |
| Stream behavior | Actual socket and deployed reverse-proxy/browser SSE show incremental delivery, correct content type/cache/buffering behavior, bounded resources, disconnect cleanup, Unicode/split frames, ordering/deduplication, resume and terminal correctness. Include closing reasons/final brief. |
| Read frontier | No finished status or full generated text leaks into active snapshots; final canonical data is visible before shared terminal reconciliation. No bubble flicker/loss/duplication or inconsistent tools/citations/scoreboards/votes. |
| Browser journey | One actual entry-to-archive journey on the production package, real UI/backend, supported inputs and source disclosure; keyboard, mobile, focus and reduced motion. No next-step timers or unexpected credential prompts. |
| Independent visitors | Two fresh browser contexts at different beats; back/restart/refetch in A cannot move or overwrite B. No backend run/session records. Package/version/run scope prevents cache collisions. |
| Mixed live/replay | An active live turn and unlocked synthetic vault coexist with replay. Switching detaches observation only; replay never reads/changes the vault, leaks keys or cancels live jobs. Live cache/cooldown state survives replay restart. |
| Failures and races | Missing/corrupt/incompatible assets, denied reader, disconnect/EOF, stale JSON/SSE after restart, rapid double actions, route remount, refocus/poll, back and refresh. Fail closed with honest package/retry/restart UI and zero live fallback. |
| Package lifecycle | Clean checkout validates/provisions the approved package offline. A separate small test package swaps without scenario-specific code; pinned active runs are unaffected. Failed publication is never selected; old-version retention/retirement is tested. |
| Live regressions | Creation with/without files, upload resume, roster refresh, scoped knowledge/evidence/redaction, durable turn reconnect, interim summary, closing/retry/abort, accounting, archive/unarchive and credential isolation remain correct. |

Do not call a generator-iterator test a deployed stream test, a mocked panel a reachable closing flow, or a successful schema grant script an effective-role audit. Operational tests must be separately authorized for the actual environment and must not touch user data destructively.

## Working evidence map

Status legend: **local** = executable local evidence exists; **gap** = no adequate
evidence yet, closure named below; **deployed** = requires the real hosted
project and remains unexecuted until an operator runs it.

| Area | Local evidence today | Status | Closure |
| --- | --- | --- | --- |
| Database isolation | `tests/integration/test_replay_reader_permissions.py`, `test_replay_publication.py::test_reader_matrix_covers_every_replay_object`, `scripts/replay_roles.py check`, `scripts/inventory_permissions.py`; fresh and upgrade migrations in `tests/integration/test_migration_runner.py` / `test_database_permissions.py` | local | Run against fresh and upgraded disposable PostgreSQL; deployed effective-role audit remains **deployed** |
| Actual API boundary | `tests/integration/test_replay_surface.py` (ASGI `TestClient`), `test_replay_sse_socket.py` (real socket, streams only) | gap | Full boundary over real HTTP, not `TestClient` |
| Backend/frontend reuse | Backend import/architecture tests, `frontend/tests/architecture/*`, `npm run build` | gap | Production-mode browser journey; dev-server journey alone is insufficient |
| No replay effects | `test_replay_surface.py` sentinel live graph, reader permission tests | gap | End-to-end request-scoped effect trace over a complete replay session |
| Stream behavior | `test_replay_sse_socket.py` (incremental frames, resume, limits, Unicode), `test_replay_package_runtime.py` (pacing, closing envelope) | local | Deployed reverse-proxy/browser SSE remains **deployed** |
| Read frontier | `test_replay_package_runtime.py::test_checkpoint_reads_are_coherent_and_never_early`, frontend observation/projection tests | local | Keep browser assertions in the journey |
| Browser journey | `frontend/e2e/guided-journey.spec.ts` against `next dev` | gap | Run the journey against a production build |
| Independent visitors | `test_replay_package_runtime.py::test_two_visitors_get_independent_ephemeral_runs` | gap | Two real browser contexts at different beats |
| Mixed live/replay | none | gap | Live turn and replay stream/restart in one composition; browser-level if feasible |
| Failures and races | Backend unavailable/corrupt package tests; deep-link reset in the journey | gap | Browser double actions, remount, refocus/poll, disconnect, stale SSE, refresh |
| Package lifecycle | `test_replay_publication.py` (failed publish, pinning, retention, prune), `test_tracked_package_needs_no_ignored_inputs` | gap | Clean-checkout validation/provisioning and placeholder-package swap |
| Live regressions | Spec 12–18 suites | local | Re-run in the full evidence pass |

## Execution plan

1. Start from a clean checkout and disposable dependencies. Run migrations/upgrade, package validation/provisioning and the role matrix. Record versions, commands and exact package hash.
2. Run maintained unit/application/architecture/contract/integration suites, frontend tests and type/build checks. Export/check OpenAPI and regenerate/check frontend types as appropriate; inventory must match actual shipped routes/events.
3. Run real browser journeys against the actual backend. Add a bounded browser harness if still absent; existing Vitest coverage is not browser acceptance. Use synthetic live credentials and controlled adapters for regression calls; paid inference is never a prerequisite.
4. Exercise the deployed path with approved operations, including reader identity, Storage and reverse-proxy streaming. Request-scoped effect tracing must not log keys or private payloads. Do not add persistent demo-progress analytics merely to prove no writes.
5. Reconcile operations/setup docs and record accepted, failed, skipped and unexecuted checks separately. Disable the replay entry/route publication when a mandatory gate fails; never fall back to live mode.

## Release record and rollback

Write the completion record only after execution. Include environment and dependency versions, package identity/hash, fresh/upgrade/deployed permission results, suite/test counts, browser/deployed SSE evidence, content/source approval, remaining limitations, and the explicit release decision. Earlier passing counts are historical, not current evidence.

Operational rollback disables replay entry/publication or repins an intact compatible package; it does not roll back live records or reopen ended meetings. Retain immutable old versions for active runs under the documented retirement policy. Any changed reader credential/grant must be reverified before re-enabling replay.

## Exit gate

All mandatory evidence above is executed and passing in its claimed environment. The one journey is honest, usable, replaceable by data, and isolated within the shared hosted product. If real hosted verification remains unexecuted, record a conditional local acceptance and keep public replay release blocked—do not present it as a complete hosted release.
