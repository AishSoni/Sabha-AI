# Master specification

## 1. Goals and scope

Sabha lets a director select AI participants, discuss an agenda, consult shared and private evidence, record disagreement/consensus, and conclude with a summary. The project needs correctness fixes, enforceable architectural boundaries, deterministic development/testing, and an affordable recruiter demonstration.

The refactor MUST preserve these capabilities while separating business rules from HTTP, provider SDKs, SQL transport, and vector storage. It MUST be incremental: existing routes can temporarily delegate to new use cases, but there must not be two independently evolving implementations of the same workflow.

In scope:

- All eleven reviewed defects in TESTING.md.
- Meeting and turn lifecycle, participant snapshots, message queues, tool execution, configuration, retrieval, and cleanup.
- A full planned recruiter onboarding journey analyzing exactly one real Indian corporate bond, followed by supported exploration of that same instrument.
- Deterministic external-service substitutes, realistic persistence, and a no-paid-network demo mode.
- pytest/Vitest suites, migration verification, local runtime checks, and documented manual browser acceptance.
- Public-demo application readiness without selecting or provisioning its hosting platform.

Out of scope:

- Public live-AI/BYOK product, payment systems, team collaboration, or account onboarding for recruiters.
- Microservices, event sourcing, a generic enterprise framework, or full CQRS.
- Playwright, including indirect use as a Vitest browser provider.
- A visual redesign unrelated to onboarding, accessibility, or reliability improvements.
- Guaranteed model quality from deterministic tests; optional live evaluations are a separate concern.

## 2. Confirmed user decisions

| Decision | Confirmed behavior |
| --- | --- |
| Architecture direction | Pragmatic DDD modular monolith with lightweight ports/adapters |
| Tests | pytest backend, Vitest frontend; no Playwright |
| Demo | Full recruiter onboarding journey; exactly one real Indian corporate bond scenario; guided first, supported exploration of the same bond afterward |
| Positioning | Meeting-style subjective, sourced analysis for the user's informed executive decision-making; not financial advice; independent verification required |
| Analytical roles | Agents have genuinely different analytical remits and contributions, rather than imitating personality types; bond-specific specialists replace the generic roster in this demo |
| Public deployment | Demo only, without live inference credentials or visitor-supplied keys |
| Client persistence | sessionStorage, not localStorage, for demo session/progress |
| Persona changes | Existing participant snapshots remain stable; review and explicitly apply updates |
| Concurrent interaction | Queue user messages during a running turn; allow editing/removal until dispatch; do not queue speaker requests |
| Navigation | Continue the server-side turn after the visitor leaves the meeting |
| Data | Preserve existing data; do not reset the existing database |
| Hosting | User handles hosting separately; prefer minimal demo infrastructure |
| Delivery | Waterfall/spec-driven gates plus red-green-refactor implementation within phases |
| Implementation order | Each affected phase reproduces known bugs with correct failing tests, fixes them, then refactors; Phase 03 is scaffolding only; the entire demo journey is the new final development phase after core regression closure |

## 3. Requirements

| ID | Requirement | Primary phase |
| --- | --- | --- |
| R-01 | One application-level engine handles streaming and collected turns, including bounded tool continuation | 02 |
| R-02 | Business invariants live in domain/application code, with SQL enforcement for concurrent consistency | 04 |
| R-03 | The complete demo uses no live LLM, embedding, external search, market-data, or model-discovery call | 03 scaffold, 08 runtime, 10 full journey |
| R-04 | Demo onboarding is clear, honestly scripted, deterministic, resettable, and followed by supported exploration | 10 |
| R-05 | Each visitor can access only their session's mutable data; immutable scenario assets may be shared | 04, 08 |
| R-06 | A running turn survives navigation/stream disconnect; terminal state is recoverable by querying the server | 02, 04, 07 |
| R-07 | Pending user messages are ordered, editable/removable until dispatch, and never mutate an active turn's context | 04, 07 |
| R-08 | Persona settings are snapshotted with provenance; refresh is explicit and atomic | 05 |
| R-09 | Settings shown as effective are the settings used for actual inference and system-summary work | 05 |
| R-10 | Retrieval is scoped to current authorization; deletion/revocation takes effect before physical vector cleanup | 06 |
| R-11 | Prompt activation, turn finalization, cost recording, and meeting completion have defined atomic boundaries | 02, 04, 05 |
| R-12 | Existing data and IDs survive compatible migrations; historical uncertainty is recorded rather than invented | All data-changing phases |
| R-13 | Ordinary automated tests run without paid credentials; integration tests use isolated infrastructure | 01 onward |
| R-14 | UI state and streamed events are scoped by session generation, meeting, turn, and sequence | 02, 07 |
| R-15 | Background work is bounded, observable, idempotent where possible, and has explicit recovery semantics | 04, 06, 08 |
| R-16 | Unsafe public routes and arbitrary server-side URL access are blocked by server policy | 05, 08 |
| R-17 | Release claims are supported by acceptance evidence; specs and tests are maintained together | All phases |
| R-18 | Exactly one verified real Indian corporate bond/ISIN anchors the demo; complementary specialist agents distinguish dated source facts from judgments, expose verification needs and leave decisions to the user with explicit not-financial-advice positioning | 00 requirements/design, 10 content/implementation |

## 4. Target architecture

### Business modules

- **Meetings (core):** meeting lifecycle, participant incarnations, messages, turns, voting, disagreement, consensus, queue coordination.
- **Personas (supporting):** reusable analytical-agent definitions, prompt history, preferences, stack assignments, refresh proposals. A role defines remit, evidence scope, questions and output obligations; a stylistic voice alone does not establish a distinct analytical contribution.
- **Knowledge (supporting):** document/stack ownership, ingestion lifecycle, authorized retrieval, deletion and cleanup.
- **Access (generic):** trusted actor identity and ownership policy. Public demo uses a session actor; future authenticated live access uses a user actor.

Inference adapters, vector clients, SQL repositories, storage, and job execution are technical boundaries, not automatically independent business contexts.

### Dependency direction

HTTP/SSE adapter -> application use case -> domain rules and ports -> injected infrastructure implementation.

Domain rules MUST NOT import FastAPI, Supabase, Qdrant, HTTP clients, provider adapters, or mutable global settings. Application code owns authorization checks, transactions, orchestration, and dependency interfaces. Infrastructure implements those interfaces. Composition occurs once in application bootstrap/lifespan.

Suggested destination (names may change through Phase 00 review):

```text
backend/app/
  bootstrap.py
  modules/
    meetings/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
    personas/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
    knowledge/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
    access/{actors.py,policies.py}
  infrastructure/{database,llm,knowledge,jobs,demo}/
  workers/
backend/tests/{unit,application,api,contract,integration,fixtures}/
frontend/src/features/demo/
frontend/src/test/
```

This is a boundary map, not a mandate for one-class files. Keep existing adapters where useful until migration earns their relocation. No generic base repository/entity framework is required.

### Consistency boundaries

- Meeting owns eligibility to start work and participant membership; it does not hydrate every historical message/document as an aggregate.
- Turn owns its context/configuration snapshot, iterations, effects, usage and finalization.
- Persona owns version activation; database locking/constraints reinforce the invariant.
- Document owns lifecycle/version; an outbox bridges SQL state to eventual vector/storage changes.
- No SQL transaction is held open across LLM, embedding, search, or storage network calls.
- A database-backed worker/lease mechanism is sufficient. A broker or independent service is not a prerequisite.
- Async route signatures do not make blocking clients asynchronous: use compatible async access or explicit bounded offloading as a documented adapter decision.

## 5. Proposed decisions requiring approval

These are executable design proposals, not settled user preferences. Approve or replace each by its stated deadline, before dependent implementation. Phase 00 establishes the core contract baseline; D-01's concrete content is approved at Phase 10 content entry. Numeric defaults remain configurable and tested.

| ID | Proposed default | Approval deadline |
| --- | --- | --- |
| D-01 | Topic/positioning confirmed: exactly one real Indian corporate bond. Phase 00 approves the content contract; exact issuer/ISIN, dated evidence pack, specialist prompts, claim mappings and final script are approved before Phase 10 scenario implementation | Phase 00 contract; Phase 10 content entry |
| D-02 | Demo session: 2-hour idle expiry, 24-hour absolute expiry; activity means accepted user action, not heartbeat; cleanup at least hourly | Phase 00 |
| D-03 | Queue: maximum 10 pending messages, 4,000 characters each; FIFO; drain after completed/failed/cancelled turn when meeting remains active; no automatic next speaker | Phase 00 |
| D-04 | End meeting only when no active turn or queued messages; strict majority of the frozen roster; invalid/failed votes count as non-yes; summary failure restores active with failed attempt recorded | Phase 00 |
| D-05 | Archive only idle active/ended meetings; retain pre-archive state for restoration. Legacy archive state stays explicitly unknown until mapped | Phase 00 |
| D-06 | Engine: at most 8 provider invocations and 16 tool calls per turn; 120-second deadline; bounded tool result/context size; explicit retry rather than automatic paid-call replay | Phase 00 |
| D-07 | Session token in sessionStorage, sent via authorization header using fetch-based streams; high-entropy opaque server-validated token, hashed server-side, never logged or placed in URLs | Phase 00 |
| D-08 | SQL-backed turn/job coordination; reuse a compatible relational backend for demo metadata; fixture retrieval needs neither Qdrant nor embeddings. No broker required | Phase 00 |
| D-09 | Server-managed live credentials only in this scope; editable non-secret preferences; remove misleading browser-key persistence and defer BYOK | Before Phase 05 |
| D-10 | Initial demo bounds: one current scenario generation/session, 100 accepted scenario actions/session, 30 write requests/minute/session, separate configurable session-creation/global caps | Before Phase 08 |
| D-11 | New execution API uses additive `/api/v2` endpoints; old routes are temporary wrappers, never a second engine | Phase 00 |
| D-12 | Preserve legacy ownerless/private data as quarantined/unassigned until owner mapping is explicitly supplied; never infer it belongs to a demo visitor | Phase 00 |
| D-13 | Explicit cancellation is available; it is best-effort and never rolls back completed tool effects or already-incurred usage | Phase 00 |

Unresolved: exact bond/ISIN and verified source snapshot, final specialist prompts/script, hosting topology, process uptime guarantees, network-level egress controls, and final operational rate caps. The application specs define requirements; hosting readiness must later demonstrate them. Session expiry values and scenario prose are especially visible review items. No real-bond figures are approved merely by accepting the scenario topic.

## 6. Sequence and bug-first delivery

The sequence is 00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 09 -> **10 (final development phase)**.

Within each affected phase: write the test for the intended correct behavior -> observe the specific known-bug failure -> fix -> verify green -> refactor with those regressions retained. Testability seams may be minimal prerequisites; broad restructuring cannot replace evidence that the original defect was reproduced. New foundation behavior also follows TDD.

- Phases 00-01 approve contracts and establish offline harnesses plus correct failing regression cases.
- Phase 02 corrects tool continuation and retrieval dependency defects, then consolidates shared execution and its minimal reservation/finalization/stream-independent runner. Phase 04 adds durable coordination.
- Phase 03 creates fixture composition, typed interfaces and a synthetic developer smoke harness only. It supplies no real-bond content, specialist seeds, J-steps, guided UI or authored ending.
- Phase 04 owns the full status-constraint repair, ending extraction/failure handling, meeting-domain refactor, authorization and queues. No lifecycle fix is pulled into Phase 03 for a partial demo.
- Phases 05-07 fix configuration/persona/retrieval/deletion/frontend defects and complete the respective refactors and reusable controls. Phase 07 does not implement guided onboarding or exploration.
- Phase 08 implements/tests generic session/runtime foundations and route-policy hardening using synthetic fixtures. Real scenario bootstrap/actions remain unavailable; public exposure is not enabled.
- Phase 09 closes every B-01 through B-11 with recorded red/green evidence, finishes consolidation and validates a reproducible corrected core. Its gate blocks feature implementation while any reviewed bug/refactor obligation is unresolved.
- Phase 10 implements the entire approved single-bond journey, including queue teaching, specialist content, evidence/disclosures, guided UI, exploration, resume/reset and brief. It then verifies the integrated runtime and supplies release/handoff evidence. Actual-host checks remain mandatory before G4 public exposure.

Planning contracts and adding reusable infrastructure do not count as implementing the journey. Core smoke fixtures remain test-only and cannot masquerade as an early recruiter scenario. Any newly discovered core bug during Phase 10 returns to failing regression -> fix -> green before feature work resumes.

## 7. Existing-data migration policy

1. Inventory deployed schema versions, table counts, statuses, active prompt duplicates, ownerless rows, document owners, collection names, and configuration shapes using read-only checks.
2. Work against an authorized sanitized clone or synthetic equivalent. Do not read production credentials or mutate live infrastructure merely to implement a spec.
3. Establish a migration ledger and a reproducible fresh-install path covering the base SQL plus migrations 002/003 and subsequent changes. Existing scripts are not assumed safely rerunnable.
4. Use expand -> backfill -> verify -> switch readers/writers -> contract. Add nullable/new fields before enforcing backfilled constraints.
5. Preserve IDs, message ordering/content, prompt history, documents, and known costs. Unknown historical token usage, prompt provenance, archive origin, and ownership remain explicitly unknown.
6. Define transactional SQL operations via the approved repository/transaction adapter or bounded database RPC. Multiple Supabase HTTP writes are not a transaction.
7. Record pre/post counts, referential-integrity checks, backfill exceptions, and an upgrade test from every supported baseline.
8. Rollback means a compatible application rollback or documented forward repair when new data cannot fit an old schema. Never promise destructive downgrade safety; never restore an old backup over new user writes without an explicit recovery procedure.

## 8. Completion criteria

All R-* requirements have passing traceable evidence; all B-* defects are closed or explicitly re-scoped by the user. The public demo makes no paid requests, remains isolated, and completes its guided/exploration/reset paths. Existing data upgrades without silent loss. One supported execution engine exists. Relevant unit, API, contract, integration, frontend, build/lint, and manual acceptance checks pass with limitations recorded. Hosting remains a separate deployment decision.
