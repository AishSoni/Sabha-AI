# Master specification

## 1. Goals and scope

Sabha lets a director select AI participants, discuss an agenda, consult shared and private evidence, record disagreement/consensus, and conclude with a summary. The project needs correctness fixes, enforceable architectural boundaries, deterministic development/testing, and an affordable recruiter demonstration.

The refactor MUST preserve these capabilities while separating business rules from HTTP, provider SDKs, SQL transport, and vector storage. It MUST be incremental: existing routes can temporarily delegate to new use cases, but there must not be two independently evolving implementations of the same workflow.

In scope:

- The in-scope reviewed defects in TESTING.md; B-05 is withdrawn, not an implementation prerequisite.
- Meeting and turn lifecycle, participant snapshots, message queues, tool execution, configuration, retrieval, and cleanup.
- A home-entry recruiter tutorial across the actual application screens, with contextual overlays and a persistent DEMO watermark, analyzing exactly one real Indian corporate bond before supported same-instrument exploration.
- An immutable, database-backed journey package authored from a genuine research run and real source documents; isolated visitor records execute through shared application utilities.
- Deterministic external-service substitutes, realistic persistence, and a no-paid-network demo mode.
- pytest/Vitest suites, migration verification, local runtime checks, and documented manual browser acceptance.
- Public-demo application readiness without selecting or provisioning its hosting platform.

Out of scope:

- Public live-AI/BYOK product, payment systems, team collaboration, or account onboarding for recruiters.
- Authentication and identity/access-control work: no login/signup, accounts, OAuth, actor framework, credential/token design, RLS hardening or ownership-policy rollout. These are not prerequisites or acceptance gates for this work.
- Investment-grade bond due diligence, exhaustive claim verification, independent certification, formal researcher/reviewer sign-off or a financial audit trail.
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
| Demo UI | Remove the standalone UI completely; actual home-page demo button, normal routes/components/controls, concise videogame-style overlays and a persistent DEMO watermark throughout the session |
| Demo responsibility split | Frontend starts the journey and presents normal workflows with guidance; backend validates/cooperates through existing utilities; DB-backed versioned seed supplies journey content, evidence and recorded provider invocations |
| Research and decisions | Seed derives from a genuine research run using real bond documents and meaningful analytical choices, with a lightweight plausibility/readability check; no bulletproof claims or formal review process. Visitor sessions replay recorded demo analysis honestly, without live inference |
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
| R-04 | Demo starts on the actual home page, teaches all required actual screens through concise overlays, remains honestly recorded/deterministic/resettable, and supports same-bond exploration; no standalone demo UI | 10 |
| R-05 | Anonymous runs keep separate progress/resources for normal operation and resume/reset; shared scenario assets survive reset. This is state bookkeeping, not an access-control or identity guarantee | 04, 08 |
| R-06 | A running turn survives navigation/stream disconnect; terminal state is recoverable by querying the server | 02, 04, 07 |
| R-07 | Pending user messages are ordered, editable/removable until dispatch, and never mutate an active turn's context | 04, 07 |
| R-08 | Persona settings are snapshotted with provenance; refresh is explicit and atomic | 05 |
| R-09 | Settings shown as effective are the settings used for actual inference and system-summary work | 05 |
| R-10 | Retrieval uses the meeting's shared and assigned participant context; deleted/unassigned content is excluded before physical vector cleanup | 06 |
| R-11 | Prompt activation, turn finalization, cost recording, and meeting completion have defined atomic boundaries | 02, 04, 05 |
| R-12 | Existing data and IDs survive compatible migrations; historical uncertainty is recorded rather than invented | All data-changing phases |
| R-13 | Ordinary automated tests run without paid credentials; integration tests use isolated infrastructure | 01 onward |
| R-14 | UI state and streamed events are scoped by session generation, meeting, turn, and sequence | 02, 07 |
| R-15 | Background work is bounded, observable, idempotent where possible, and has explicit recovery semantics | 04, 06, 08 |
| R-16 | Demo composition blocks live/network-sensitive capabilities and arbitrary server-side URL access; this is mode/destination policy, not user authentication or permissions | 05, 08 |
| R-17 | Release claims are supported by acceptance evidence; specs and tests are maintained together | All phases |
| R-18 | Exactly one real Indian corporate bond/ISIN anchors a clearly labeled demo; use real documents, complementary analytical roles and reasonable source context. Approximate/illustrative assumptions and incomplete evidence are acceptable when labeled; no exhaustive factual verification is required | 00 requirements/design, 10 content/implementation |
| R-19 | A persistent DEMO watermark survives all demo route changes, refresh/resume, ending and exploration without obscuring controls or streamed content | 10 |
| R-20 | A versioned DB-backed seed contains real document content/basic source references, a short research-run record, configurations, recorded invocations, tutorial content and supported branches. Formal claim registries/reviewer approvals are optional; runtime records do not preload completed visitor effects | 00 contracts, 10 research/data/implementation |
| R-21 | Demo changes injected data/provider capabilities, not application business rules; normal APIs/utilities execute real retrieval, queue, tool, lifecycle and persistence operations, with only thin demo coordination | 02-09 foundations, 10 integration |
| R-22 | Every AI-generated demo surface, including ending votes where presented and the executive brief, updates from actual incremental SSE through shared execution/subscription infrastructure, with committed terminal state and recovery; no JSON-then-typewriter simulation | 04/07 foundations, 10 integration |

## 4. Target architecture

### Business modules

- **Meetings (core):** meeting lifecycle, participant incarnations, messages, turns, voting, disagreement, consensus, queue coordination.
- **Personas (supporting):** reusable analytical-agent definitions, prompt history, preferences, stack assignments, refresh proposals. A role defines remit, evidence scope, questions and output obligations; a stylistic voice alone does not establish a distinct analytical contribution.
- **Knowledge (supporting):** document/stack relationships, ingestion lifecycle, context-scoped retrieval, deletion and cleanup.
- **Demo state (supporting):** lightweight anonymous run references, progress and reset bookkeeping; no identity/access module is required.

Inference adapters, vector clients, SQL repositories, storage, and job execution are technical boundaries, not automatically independent business contexts.

### Dependency direction

HTTP/SSE adapter -> application use case -> domain rules and ports -> injected infrastructure implementation.

Domain rules MUST NOT import FastAPI, Supabase, Qdrant, HTTP clients, provider adapters, or mutable global settings. Application code owns business validation, transactions, orchestration, and dependency interfaces. Infrastructure implements those interfaces. Composition occurs once in application bootstrap/lifespan.

Suggested destination (names may change through Phase 00 review):

```text
backend/app/
  bootstrap.py
  modules/
    meetings/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
    personas/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
    knowledge/{domain.py,ports.py,schemas.py,routes.py,use_cases/}
  infrastructure/{database,llm,knowledge,jobs,demo}/
  workers/
backend/tests/{unit,application,api,contract,integration,fixtures}/
frontend/src/features/demo/
frontend/src/test/
```

This is a boundary map, not a mandate for one-class files. Keep existing adapters where useful until migration earns their relocation. No generic base repository/entity framework is required.

### Demo as a mode of the real application

The actual home page starts the session. Existing pages, forms, stores, API clients, meeting tabs, queue, citations and summary views remain the application; a route-persistent guide layer adds explanation/highlighting and the DEMO watermark. There is no standalone demo page, transcript, queue or alternative application shell. The legacy `/demo` UI is removed; an optional redirect to the actual home page is the only compatibility behavior allowed, not a second entry flow.

The published immutable journey package lives in relational storage plus managed document storage and is pinned per session. Production content is not sourced from hardcoded Python/TypeScript scenario prose or process-local dictionaries. Backend code contains schemas, adapters, validation and orchestration, not an independent demo business engine. A recorded provider adapter supplies ordinary normalized invocations to the shared runner; real tools consume seeded evidence and commit run-specific effects. Existing utilities with correctness gaps must be repaired, not bypassed.

Session startup creates only the starting state needed for the tutorial. The real creation forms subsequently create/attach the bounded configured stacks, personas and meeting through ordinary use cases. Do not precreate a completed meeting or hide duplicate creation behind a simulated form. Core DTOs and guards allow a session with no current meeting until creation succeeds. Guide acknowledgement does not replace a required application outcome.

Authoring research may use live services with the user's available setup outside the deployed demo runtime; paid use or production access still needs permission. Keep real documents or useful excerpts, basic titles/URLs/dates, recorded outputs and a short note of the meaningful analytical choices. A lightweight plausibility/readability pass is sufficient: no independent reviewer, exhaustive claim mapping, exact calculation reproduction or complete primary-source pack is required. Content and supported branches may be edited/curated for teaching; disclose assumptions and recorded output rather than claim financial certification or fresh live reasoning. Do not invent a research run or private chain-of-thought.

### Consistency boundaries

- Meeting owns eligibility to start work and participant membership; it does not hydrate every historical message/document as an aggregate.
- Turn owns its context/configuration snapshot, iterations, effects, usage and finalization.
- Persona owns version activation; database locking/constraints reinforce the invariant.
- Document owns lifecycle/version; an outbox bridges SQL state to eventual vector/storage changes.
- No SQL transaction is held open across LLM, embedding, search, or storage network calls.
- A database-backed worker/lease mechanism is sufficient. A broker or independent service is not a prerequisite.
- Async route signatures do not make blocking clients asynchronous: use compatible async access or explicit bounded offloading as a documented adapter decision.

## 5. Proposed decisions requiring approval

These are executable design proposals, not settled user preferences. Approve or replace each by its stated deadline, before dependent implementation. D-01 is a lightweight demo-content choice, not a formal research approval gate; UI/core work can proceed while content is assembled. Numeric defaults remain configurable and tested.

| ID | Proposed default | Approval deadline |
| --- | --- | --- |
| D-01 | Select one real bond/ISIN, a usable set of real documents/excerpts, a research run and a readable recorded/guide package. Basic plausibility and demo/disclosure checks suffice; incomplete sources and labeled illustrative assumptions are acceptable. Reuse suitable existing material; no independent approval, claim-by-claim audit or research-first blocker | Before final content acceptance; not a blocker for UI/core implementation |
| D-02 | Demo session: 2-hour idle expiry, 24-hour absolute expiry; activity means accepted user action, not heartbeat; cleanup at least hourly | Phase 00 |
| D-03 | Queue: maximum 10 pending messages, 4,000 characters each; FIFO; drain after completed/failed/cancelled turn when meeting remains active; no automatic next speaker | Phase 00 |
| D-04 | End meeting only when no active turn or queued messages; strict majority of the frozen roster; invalid/failed votes count as non-yes; summary failure restores active with failed attempt recorded | Phase 00 |
| D-05 | Archive only idle active/ended meetings; retain pre-archive state for restoration. Legacy archive state stays explicitly unknown until mapped | Phase 00 |
| D-06 | Engine: at most 8 provider invocations and 16 tool calls per turn; 120-second deadline; bounded tool result/context size; explicit retry rather than automatic paid-call replay | Phase 00 |
| D-07 | Keep an anonymous run reference, generation and convenience progress in sessionStorage. Transport is an implementation detail; no credential scheme, token hashing or identity integration is required | Before resume/reset integration |
| D-08 | SQL-backed turn/job coordination; reuse a compatible relational backend for demo metadata; fixture retrieval needs neither Qdrant nor embeddings. No broker required | Phase 00 |
| D-09 | Server-managed live credentials only in this scope; editable non-secret preferences; remove misleading browser-key persistence and defer BYOK | Before Phase 05 |
| D-10 | Initial demo bounds: one current scenario generation/session, 100 accepted scenario actions/session, 30 write requests/minute/session, separate configurable session-creation/global caps | Before Phase 08 |
| D-11 | New execution API uses additive `/api/v2` endpoints; old routes are temporary wrappers, never a second engine | Phase 00 |
| D-12 | Withdrawn: no identity/ownership mapping or policy migration is required. Preserve legacy rows and relationships without inventing new assignments | No implementation gate |
| D-13 | Explicit cancellation is available; it is best-effort and never rolls back completed tool effects or already-incurred usage | Phase 00 |

Remaining D-01 choices are the selected bond, available source set and final recorded/guide copy. These need reasonable demo suitability, not investment-grade certainty. Hosting topology, process uptime guarantees, network-level egress controls and final operational rate caps remain separately reviewable. Do not misrepresent a research run as performed if it has not happened.

## 6. Sequence and bug-first delivery

The sequence is 00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 09 -> **10 (final development phase)**.

Within each affected phase: write the test for the intended correct behavior -> observe the specific known-bug failure -> fix -> verify green -> refactor with those regressions retained. Testability seams may be minimal prerequisites; broad restructuring cannot replace evidence that the original defect was reproduced. New foundation behavior also follows TDD.

- Phases 00-01 approve contracts and establish offline harnesses plus correct failing regression cases.
- Phase 02 corrects tool continuation and retrieval dependency defects, then consolidates shared execution and its minimal reservation/finalization/stream-independent runner. Phase 04 adds durable coordination.
- Phase 03 creates fixture composition, typed interfaces and a synthetic developer smoke harness only. It supplies no real-bond content, specialist seeds, J-steps, guided UI or authored ending.
- Phase 04 owns the full status-constraint repair, ending extraction/failure handling, meeting-domain refactor and queues. No identity/access work is assigned to it. No lifecycle fix is pulled into Phase 03 for a partial demo.
- Phases 05-07 fix configuration/persona/retrieval/deletion/frontend defects and complete the respective refactors and reusable controls. Phase 07 does not implement guided onboarding or exploration.
- Phase 08 implements/tests generic session/runtime foundations and route-policy hardening using synthetic fixtures. Real scenario bootstrap/actions remain unavailable; public exposure is not enabled.
- Phase 09 closes the in-scope B-* defects (B-05 withdrawn), finishes consolidation and validates a reproducible corrected core. Removed identity/access work cannot block feature implementation.
- Phase 10 is reopened under the 2026-10-16 correction: prepare the demo-grade research seed in parallel with UI/core work; prove one shared DB-backed SSE slice in the normal meeting UI before expanding the guide, then complete home entry, all required routes, overlays/watermark, queue teaching, exploration, resume/reset and streamed brief. Remove the standalone UI/parallel runtime and supply new integration/manual evidence. Actual-host checks remain mandatory before G4 public exposure.

Planning contracts and adding reusable infrastructure do not count as implementing the journey. Core smoke fixtures remain test-only and cannot masquerade as an early recruiter scenario. Any newly discovered core bug during Phase 10 returns to failing regression -> fix -> green before feature work resumes.

## 7. Existing-data migration policy

1. Inventory deployed schema versions, table counts, statuses, active prompt duplicates, document relationships, collection names, and configuration shapes using read-only checks; no identity/ownership audit is required.
2. Work against an authorized sanitized clone or synthetic equivalent. Do not read production credentials or mutate live infrastructure merely to implement a spec.
3. Establish a migration ledger and a reproducible fresh-install path covering the base SQL plus migrations 002/003 and subsequent changes. Existing scripts are not assumed safely rerunnable.
4. Use expand -> backfill -> verify -> switch readers/writers -> contract. Add nullable/new fields before enforcing backfilled constraints.
5. Preserve IDs, message ordering/content, prompt history, documents, and known costs. Unknown historical token usage, prompt provenance, archive origin, and ownership remain explicitly unknown.
6. Define transactional SQL operations via the approved repository/transaction adapter or bounded database RPC. Multiple Supabase HTTP writes are not a transaction.
7. Record pre/post counts, referential-integrity checks, backfill exceptions, and an upgrade test from every supported baseline.
8. Rollback means a compatible application rollback or documented forward repair when new data cannot fit an old schema. Never promise destructive downgrade safety; never restore an old backup over new user writes without an explicit recovery procedure.

## 8. Completion criteria

All active R-* requirements have passing traceable evidence; in-scope B-* defects are closed, with B-05 explicitly withdrawn. Home entry, every required real screen, overlays, persistent watermark, demo-grade DB research seed and incremental SSE on every AI surface are demonstrated without a standalone UI or parallel execution path. The public demo makes no paid requests and completes its guided/exploration/reset paths without mixing run state. Existing data upgrades without silent loss. One supported execution engine exists. Relevant unit, API, contract, integration, frontend, build/lint, and manual acceptance checks pass with limitations recorded. Neither identity/access infrastructure nor exhaustive financial verification is an acceptance gate. Hosting remains a separate deployment decision. Earlier Phase 10 success claims cannot close the remaining corrected gates.
