# Phase 08 — Demo runtime foundations and hardening

Status: draft. Depends on: Phases 00-07; D-02/D-10 finalized and a lightweight D-07 run-reference choice. Requirements: runtime foundations for R-03/R-05/R-15/R-16/R-17. Defects: B-06 demo no-live-service audit only; B-05 is withdrawn. No identity/access-control milestone.

## Objective and outcome

Complete reusable session/runtime infrastructure on top of the scaffold and corrected core application. Verify isolation, zero-live-service policy, bounded work and cleanup using synthetic API-level fixtures. The authored bond journey and recruiter UI are implemented only after core consolidation, in Phase 10.

This phase defines and verifies application/runtime requirements. It does not select a hosting vendor, provision cloud resources or claim that an untested future platform satisfies background-process/streaming requirements.

## Bug-first execution order

Reproduce any remaining B-06 destination/live-service bypass before correction; retain red/green evidence. Refactor demo composition/run bookkeeping with tests green, then add missing lifecycle infrastructure. B-05 is not an audit, test or prerequisite. A synthetic session does not prove the full journey.

## Current gaps and affected surfaces

Provider settings previously accepted arbitrary URLs. Audit live-service/destination behavior across registered routes, settings, workers, reset/bootstrap and compatibility surfaces. Do not audit or implement identity, credentials, ownership permissions or RLS.

Demo composition must not merely hide controls: direct requests/settings payloads must not construct live providers or enable live network-sensitive operations. This is a mode/capability rule, not identity enforcement.

## Required runtime behavior

- Demo mode is server-enforced at startup and request dispatch. No API keys are required; live provider/embedding/search adapters are unavailable. Missing fixtures fail closed.
- Implement persistent generic session issuance/status/reset/expiry plus route allowlisting and nullable pre-meeting state. Private test bootstrap creates only isolated synthetic/empty state through a seed interface. Real scenario bootstrap/actions stay unavailable until Phase 10 supplies approved DB content and handlers. Disable arbitrary uploads, unrestricted persona/prompt/global settings mutation, model/key testing and unrestricted meeting creation. Phase 10 may allow bounded session-owned template-based stack/persona/meeting operations and approved stored-document attachment through ordinary endpoints; the server must enforce field/template/prerequisite/count restrictions, not rely on the guide UI.
- Avoid stale caching of run-specific progress/streams. Existing origin/network configuration may be reused; no identity protocol, credential caching policy or security-hardening project is required.
- Sessions enforce idle/absolute expiry and server-owned generation fencing. Expiry denies reads/actions and stops/fences remaining jobs; periodic cleanup removes mutable records/events/source references within a documented retention window.
- Resource limits cover anonymous run creation and per-run work. Reset must not permit unbounded resource growth. Request/body/event/queue/storage/concurrency limits have typed errors and bounded cleanup; no identity-based abuse system is required.
- Logs use request/run/meeting/turn/job references and safe diagnostics, without provider secrets or unrestricted payloads. No token-security implementation is required.
- Operational status distinguishes unhealthy dependency, backlog, failed cleanup and expired lease. No paid provider probes run in readiness checks.

## Ordered tasks

- **P08-T01 — Capability inventory:** enumerate every registered old/new route and external adapter; classify allowed demo operations and enforce server policy consistently.
- **P08-T02 — Zero-paid composition:** block live adapter creation/fallback, key/model requests, external search and market-data fetches. Optional network egress belongs to later hosting setup. Source-link navigation does not update the frozen pack.
- **P08-T03 — Run lifecycle:** implement persistent anonymous references/status/reset/expiry with an injected seed boundary, generation fencing and fresh progress reads. No token entropy/hash, identity transport or access policy is required. Synthetic seeds remain test-only.
- **P08-T04 — Resource bounds:** implement approved per-session/global/session-creation caps, request-size limits and queue/turn/event retention budgets; use shared coordination if running multiple processes.
- **P08-T05 — Lifecycle cleanup:** implement idempotent expiry/reset cleanup, stale-work cancellation/fencing, retention monitoring and safe shared-fixture preservation.
- **P08-T06 — Operational evidence:** add structured logs, local health/readiness checks, failure diagnostics, worker startup/shutdown/recovery notes and budget/backlog visibility.
- **P08-T07 — Error/resource regression:** exercise direct-route mode override, quota/expiry/fallback, separate run state and bounded load. No cross-user permission audit is required.
- **P08-T08 — Runtime foundation packet:** record synthetic runtime/network evidence, integration points for Phase 10, required platform capabilities and deferred hosted checks. No recruiter walkthrough, authored content review or public-readiness claim is required or permitted at this gate.

## Hosting handoff requirements

Document required process/worker lifetime, durable database/storage support, SSE buffering/timeouts, proxy forwarding, idle expiry scheduler, restart behavior, environment variables and route exposure. If a platform suspends request processes or cannot keep workers alive, adapt the runner deployment without changing application contracts. No promise of uninterrupted execution on a platform that has not been tested.

Demo retrieval requires no Qdrant. Reuse relational metadata storage; avoid a broker. Validate progress freshness and queue persistence after process restart, without introducing credential infrastructure.

Production run/progress/queue/runner use real persistent adapters, not process-local test stores. Phase 10's published demo-grade content is DB-backed; real document text/excerpts suffice and original PDFs are optional. Required runtime content must exist; optional financial provenance does not gate publication. Document viewing uses stored content, not third-party fetches. Authoring live research cannot be enabled by a visitor request flag.

## TDD and runtime cases

- **P08-TEST01:** Directly call every disabled live/network-sensitive endpoint and send live provider/key/URL overrides to allowed routes; forbidden transport invocation count remains zero.
- **P08-TEST02:** Two normal runs keep separate resources/progress/queues; reset and cleanup target only the intended run and preserve shared content. This tests bookkeeping, not malicious access or identity guarantees.
- **P08-TEST03:** Advance fake time across idle/absolute expiry; heartbeats do not extend idle lifetime; workers are fenced and cleanup preserves immutable fixtures.
- **P08-TEST04:** Repeat reset and session creation to exhaust caps; rate limits apply consistently and cannot be bypassed by resetting scenario progress. Verify meaningful retry feedback.
- **P08-TEST05:** Crash cleanup between stages, retry, and race expiry with finalization; no old-generation writes or orphaned mutable data beyond documented pending cleanup.
- **P08-TEST06:** Progress reads are not stale after reset, and safe diagnostic output omits provider secrets. No credential-scheme/security scan is required.
- **P08-TEST07:** Run simultaneous bounded sessions and a slow subscriber; enforce backpressure/retention limits without losing terminal-state recovery or monopolizing workers.
- **P08-TEST08:** Exercise synthetic session issuance/reset/expiry and core turn/queue/status APIs without AI keys/Qdrant/embedding settings; audit DNS/HTTP attempts and provider-factory calls. No authored scenario is required.
- **P08-TEST09:** In the local fixture runtime, validate real incremental turn and ending/summary streaming, disconnect/reconnect, persistent session/queue/worker restart recovery and expiry scheduling. Document actual-host/proxy verification as P10-TEST12, not a prerequisite for this local foundation gate. Do not defer required local transport/durability checks to hosting.
- **P08-TEST10:** Absent real scenario content, bootstrap/action requests cannot select an instrument, start a walkthrough, invent a successful seed or trigger live market-data refresh; synthetic seed hooks are private/test-only.

## Acceptance gate

- **P08-AC01:** Runtime surface is allowlisted and zero-paid behavior is proven beyond hidden UI controls using synthetic fixtures (TEST01, TEST08, TEST10).
- **P08-AC02:** Separate run state, targeted reset, expiry, cleanup and resource bounds pass including races (TEST02-05); no identity/access gate applies.
- **P08-AC03:** Logs/caching/backpressure are safe and bounded; operations documentation is actionable (TEST06-07).
- **P08-AC04:** Runtime foundation packet and local lifecycle checks are complete (TEST09-10); full journey, source/content review and actual-host verification remain assigned to Phase 10. Public entry stays disabled.

## Rollout, rollback, exclusions and risks

Use private synthetic sessions only. Rollback disables session mutation and drains or terminalizes existing work while keeping scoped result reads available when safe. Preserve unrelated user data. Hosting procurement, the authored journey and public activation are excluded; Phase 10 integrates the completed feature and supplies G4 evidence. Fixes discovered there still require failing regressions before correction.
