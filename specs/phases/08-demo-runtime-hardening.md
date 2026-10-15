# Phase 08 — Demo runtime foundations and hardening

Status: draft. Depends on: Phases 00-07; D-02/D-07/D-10 finalized. Requirements: runtime foundations for R-03/R-05/R-15/R-16/R-17. Defects: final route-policy audit of B-05/B-06 before Phase 09 closure. This is not a demo-journey or public-release milestone.

## Objective and outcome

Complete reusable session/runtime infrastructure on top of the scaffold and corrected core application. Verify isolation, zero-live-service policy, bounded work and cleanup using synthetic API-level fixtures. The authored bond journey and recruiter UI are implemented only after core consolidation, in Phase 10.

This phase defines and verifies application/runtime requirements. It does not select a hosting vendor, provision cloud resources or claim that an untested future platform satisfies background-process/streaming requirements.

## Bug-first execution order

Reproduce any remaining B-05/B-06 route-policy bypass with a test asserting denial before correcting it; record red then green evidence. Refactor shared policy/session boundaries with those tests green, then implement missing generic lifecycle infrastructure. Do not use a successful synthetic session as evidence that the full journey works.

## Current gaps and affected surfaces

The reviewed server registers routers without authentication and uses permissive policies; provider settings accept arbitrary URLs. Earlier phases introduce ownership and destination controls. This phase audits all surfaces including compatibility routes, direct document reads, event replay, settings, worker callbacks, health/debug metadata and reset/bootstrap endpoints.

Public composition must not merely hide controls in the UI. It must not construct live providers or expose live network-sensitive operations even when an attacker calls routes directly with plausible credentials/settings payloads.

## Required runtime behavior

- Demo mode is server-enforced at startup and request dispatch. No API keys are required; live provider/embedding/search adapters are unavailable. Missing fixtures fail closed.
- Implement generic session issuance/status/reset/expiry plus route allowlisting. Private test bootstrap creates only isolated synthetic/empty state through a seed interface. Real scenario bootstrap/actions stay unavailable until Phase 10 supplies approved content and handlers. Disable arbitrary uploads, persona/global settings mutation, model/key testing and unrestricted meeting creation.
- Use non-cacheable responses for session-specific data/credentials; do not cache authorization-bearing streams through shared caches. Configure allowed origins deliberately; CORS is not authentication.
- Sessions enforce idle/absolute expiry and server-owned generation fencing. Expiry denies reads/actions and stops/fences remaining jobs; periodic cleanup removes mutable records/events/source references within a documented retention window.
- Rate/capacity limits cover unauthenticated session creation as well as per-session writes/actions. Reset does not reset lifetime abuse counters. Request/body/event/queue/storage/concurrency limits have typed errors and bounded cleanup.
- Logs contain request/session/meeting/turn/job correlation identifiers and safe error codes, not tokens, secrets, raw private content or unrestricted tool payloads.
- Operational status distinguishes unhealthy dependency, backlog, failed cleanup and expired lease. No paid provider probes run in readiness checks.

## Ordered tasks

- **P08-T01 — Capability inventory:** enumerate every registered old/new route and external adapter; classify allowed demo operations and enforce server policy consistently.
- **P08-T02 — Zero-paid composition:** remove live credentials from demo runtime requirements; block live adapter creation, fallback, key/model requests, external search and live market-data fetches. Define optional network-level egress controls for the later hosting setup. User-initiated navigation to original sources is allowed without passing session credentials or updating the frozen evidence pack.
- **P08-T03 — Session lifecycle:** implement persistent issuance/status/reset/expiry with an injected seed boundary, then verify token entropy/hash/redaction, origin policy, generation fencing and private response caching. Synthetic test seeds are never exposed as a public scenario.
- **P08-T04 — Resource bounds:** implement approved per-session/global/session-creation caps, request-size limits and queue/turn/event retention budgets; use shared coordination if running multiple processes.
- **P08-T05 — Lifecycle cleanup:** implement idempotent expiry/reset cleanup, stale-work cancellation/fencing, retention monitoring and safe shared-fixture preservation.
- **P08-T06 — Operational evidence:** add structured logs, local health/readiness checks, failure diagnostics, worker startup/shutdown/recovery notes and budget/backlog visibility.
- **P08-T07 — Attack/error regression:** execute cross-owner/direct-route/mode-override/quota/expiry/fallback tests and bounded load experiments in an isolated demo runtime.
- **P08-T08 — Runtime foundation packet:** record synthetic runtime/network evidence, integration points for Phase 10, required platform capabilities and deferred hosted checks. No recruiter walkthrough, authored content review or public-readiness claim is required or permitted at this gate.

## Hosting handoff requirements

Document required process/worker lifetime, durable database/storage support, SSE buffering/timeouts, proxy forwarding, idle expiry scheduler, restart behavior, environment variables and route exposure. If a platform suspends request processes or cannot keep workers alive, adapt the runner deployment without changing application contracts. No promise of uninterrupted execution on a platform that has not been tested.

Demo retrieval requires no Qdrant. Reuse approved relational metadata storage; avoid adding a broker just for the demo. Validate that platform logging/caching does not expose session tokens and that a process restart does not lose the authoritative queue.

## TDD and runtime cases

- **P08-TEST01:** Directly call every disabled live/network-sensitive endpoint and send live provider/key/URL overrides to allowed routes; forbidden transport invocation count remains zero.
- **P08-TEST02:** Attempt cross-session list/read/edit/delete/stream/replay/reset/queue operations, including guessed valid IDs; all fail without revealing another session's data.
- **P08-TEST03:** Advance fake time across idle/absolute expiry; heartbeats do not extend idle lifetime; workers are fenced and cleanup preserves immutable fixtures.
- **P08-TEST04:** Repeat reset and session creation to exhaust caps; rate limits apply consistently and cannot be bypassed by resetting scenario progress. Verify meaningful retry feedback.
- **P08-TEST05:** Crash cleanup between stages, retry, and race expiry with finalization; no old-generation writes or orphaned mutable data beyond documented pending cleanup.
- **P08-TEST06:** Scan captured logs/responses/storage for credentials and forbidden private payloads; session responses are non-cacheable and credentials never appear in URLs.
- **P08-TEST07:** Run simultaneous bounded sessions and a slow subscriber; enforce backpressure/retention limits without losing terminal-state recovery or monopolizing workers.
- **P08-TEST08:** Exercise synthetic session issuance/reset/expiry and core turn/queue/status APIs without AI keys/Qdrant/embedding settings; audit DNS/HTTP attempts and provider-factory calls. No authored scenario is required.
- **P08-TEST09:** In the local fixture runtime, validate real streaming, disconnect/reconnect, restart recovery and expiry scheduling. Document actual-host/proxy verification as P10-TEST12, not a prerequisite for this local foundation gate.
- **P08-TEST10:** Absent real scenario content, bootstrap/action requests cannot select an instrument, start a walkthrough, invent a successful seed or trigger live market-data refresh; synthetic seed hooks are private/test-only.

## Acceptance gate

- **P08-AC01:** Runtime surface is allowlisted and zero-paid behavior is proven beyond hidden UI controls using synthetic fixtures (TEST01, TEST08, TEST10).
- **P08-AC02:** Session isolation, expiry, cleanup and quota enforcement pass, including races and direct-ID access (TEST02-05).
- **P08-AC03:** Logs/caching/backpressure are safe and bounded; operations documentation is actionable (TEST06-07).
- **P08-AC04:** Runtime foundation packet and local lifecycle checks are complete (TEST09-10); full journey, source/content review and actual-host verification remain assigned to Phase 10. Public entry stays disabled.

## Rollout, rollback, exclusions and risks

Use private synthetic sessions only. Rollback disables session mutation and drains or terminalizes existing work while keeping scoped result reads available when safe. Preserve unrelated user data. Hosting procurement, the authored journey and public activation are excluded; Phase 10 integrates the completed feature and supplies G4 evidence. Fixes discovered there still require failing regressions before correction.
