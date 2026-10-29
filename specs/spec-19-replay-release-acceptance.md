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
| Database isolation | `tests/integration/test_replay_reader_permissions.py`, `test_replay_publication.py::test_reader_matrix_covers_every_replay_object`, `test_migration_runner.py` (fresh, rerun, adoption, target), `scripts/replay_roles.py check`, `scripts/inventory_permissions.py` | local | Deployed effective-role audit remains **deployed** |
| Actual API boundary | `tests/integration/test_replay_http_boundary.py` (real uvicorn socket, forged headers, methods, deep links, unconfigured 503) | local | Deployed proxy/API host remains **deployed** |
| Backend/frontend reuse | Backend import/architecture tests, `frontend/tests/architecture/*`, production `next build` plus `frontend/e2e/guided-journey.spec.ts` under `next start` | local | — |
| No replay effects | `tests/integration/test_replay_effects.py` (request-scoped SQL, storage, socket and provider trace over a complete session) | local | Deployed Storage/RPC/outbound observation remains **deployed** |
| Stream behavior | `test_replay_sse_socket.py` (incremental frames, cache/buffering headers, resume, limits, disconnect, Unicode), `test_replay_package_runtime.py` (pacing, closing envelope), browser journey and resilience specs | local | Deployed reverse-proxy/browser SSE remains **deployed** |
| Read frontier | `test_replay_package_runtime.py::test_checkpoint_reads_are_coherent_and_never_early`, frontend observation/projection tests, browser journey | local | — |
| Browser journey | `frontend/e2e/guided-journey.spec.ts` under a production build (`npm run test:e2e:prod`), keyboard/mobile/reduced-motion/deep-link coverage | local | Hosted browser journey remains **deployed** |
| Independent visitors | `frontend/e2e/replay-isolation.spec.ts` (two browser contexts at different beats); backend ephemeral-run test | local | — |
| Mixed live/replay | `tests/integration/test_replay_mixed_mode.py` (live turn sentinel, replay reads/stream/closing/restart in one app) | local | Browser mixed-mode journey and hosted coexistence remain **deployed** |
| Failures and races | `frontend/e2e/replay-resilience.spec.ts` (double actions, refocus/poll, stream abort/resume, restart, deep-link refresh); backend corrupt/unavailable tests | local | Deployed disconnect/restart behavior remains **deployed** |
| Package lifecycle | `test_replay_publication.py` (failed publish, pinning, retention, prune), `test_replay_clean_checkout.py` (clone, validate, publish both packages) | local | Deployed bucket/publication lifecycle remains **deployed** |
| Live regressions | Spec 12–18 suites in the full local evidence pass | local | Hosted live regression remains **deployed** |

### Deployed evidence still unexecuted

These rows require the real hosted project and are recorded as **unexecuted**,
not passed: effective Supabase role/membership/RLS/view/RPC/default/Storage
inspection; reverse-proxy SSE behavior; hosted browser journey and
mixed-mode coexistence; deployed package publication, bucket visibility,
retention and rollback. Local evidence does not substitute for them.


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

## Conditional local acceptance record (2026-10-29)

**Environment.** Windows acceptance host; Python 3.12.10 (backend virtualenv),
Node 26.8.2, npm 12.2.0, Next.js 16.1.4, disposable PostgreSQL provisioned per
test. No Docker, managed Supabase, Qdrant or hosted proxy was available. No paid
inference was used, and no hosted data was touched.

**Package.** `hdfc-ine001a07rw5` version `1`, content hash
`ced67209984ff87088119f58f5b2bcc643fd9240623dfbe02e03ab761c1fb07f`, approved
through the [content ledger](spec-18-guided-bond-journey-content.md). The
approved content and source register are unchanged. A clean clone validates
both this package and the small placeholder package without ignored inputs.

**Executed local evidence.**

| Check | Command | Result |
| --- | --- | --- |
| Backend suites | `pytest -q` | **721 passed**, 0 failed, 0 skipped (25 warnings), 840.38 s |
| Fresh/upgrade/adoption migrations | `tests/integration/test_migration_runner.py` | **16 passed** (fresh install, rerun, rollback, target, adoption, legacy adoption) |
| Frontend unit | `npm run test:unit` | **213 passed** (37 files) |
| Frontend architecture | `npm run test:architecture` | **15 passed** (2 files) |
| OpenAPI inventory | `python -m scripts.export_openapi --check` | matches fixture, **54 paths** |
| Production browser journey | `npm run test:e2e:prod -- guided-journey.spec.ts` | **2 passed** (19.1 s) against `next start` |
| Full browser suite | `npm run test:e2e` | **8 passed** (38.4 s), dev server |
| Visitor isolation | `e2e/replay-isolation.spec.ts` | **2 passed** in the full suite |
| Races/disconnects | `e2e/replay-resilience.spec.ts` | **4 passed** in the full suite |
| Clean checkout | `python -m scripts.rehearse_clean_checkout --skip-frontend` | 14 required files, 0 forbidden entries, 54 paths, worker imports |
| Package validation | `python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5` | `ok`, version `1`, approved hash |
| Clean-clone package lifecycle | `test_replay_clean_checkout.py` | validate + publish both packages passed |
| Real HTTP boundary | `test_replay_http_boundary.py` | 5 passed over a real socket |
| Zero effects | `test_replay_effects.py` | passed; request-scoped SELECT-only trace |
| Mixed composition | `test_replay_mixed_mode.py` | passed at API/port level |

**Accepted locally.** Relational database isolation and reader/writer denial;
real-HTTP replay boundary and forged-input rejection; production-build reuse and
feature routes; replay-attributable SQL, socket, provider-key and storage-write
absence against the disposable database and storage double; socket-level and
browser stream behavior; read-frontier coherence; the production browser
journey with keyboard, mobile, reduced motion and source disclosure; independent
visitor contexts; API-level mixed live/replay composition; browser races,
disconnects, restart and deep-link refresh; clean-checkout validation and
publication; and the live regression suites in the full backend run.

**Failed or skipped.** None in the local environment.

**Unexecuted (deployed).** These remain unproven and are **not** accepted:

| Deployed check | Status |
| --- | --- |
| Effective Supabase role, membership, RLS, view, RPC, default and Storage grants | unexecuted |
| Real Storage bucket visibility, immutability and denied writes | unexecuted |
| Reverse-proxy/browser SSE through the deployed proxy | unexecuted |
| Hosted browser journey on the approved package | unexecuted |
| Hosted two-visitor isolation and absence of backend run records | unexecuted |
| Hosted mixed live/replay with the real vault and live turn | unexecuted |
| Deployed package publication, retention and rollback | unexecuted |

Browser-level mixed mode is also unexecuted: the local mixed-composition test
uses recording ports at the API layer, not an active live turn and unlocked
vault in a browser.

**Decision.** **Conditional local acceptance. Public replay release remains
blocked.** Local evidence is sufficient to continue internal use and review,
but not to present the replay as a complete hosted release. Re-run the
[hosted runbook](../docs/OPERATIONS.md#hosted-replay-acceptance-runbook-spec-19)
on the real project, record every row as passed, and re-verify the reader
credential after any grant change before changing this decision.

**Rollback.** Disable the replay entry/route publication or repin an intact
compatible package. Do not roll back live records or reopen ended meetings.
Retain immutable old package versions for pinned active runs under the
retirement policy.
