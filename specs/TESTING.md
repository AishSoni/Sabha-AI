# Testing strategy and traceability

## 1. Baseline and framework decisions

At the original 2026-10-14 discovery baseline, no first-party test suite was identified. Tests and evidence now exist; the 2026-10-16 corrective revision requires checking their observable guarantees rather than assuming green counts prove the intended architecture. Earlier discovery notes describe that historical baseline, not the current dependency inventory.

Approved runners: **pytest** backend, **Vitest** frontend. Proposed supporting libraries: AnyIO's pytest plugin with asyncio backend, HTTPX for API tests, pytest-cov, React Testing Library/user-event/jest-dom, and jsdom. Select compatible versions in Phase 01 and record them. No Playwright, including transitively selecting it for Vitest browser mode.

## 2. Test layers

| Layer | Location proposal | What it proves | External dependencies |
| --- | --- | --- | --- |
| Domain | `backend/tests/unit/` | Transition rules, voting, limits, snapshots, queue eligibility | None |
| Application | `backend/tests/application/` | Use-case coordination, tool continuation, effect deduplication, failures | Scripted doubles, in-memory repository doubles |
| API | `backend/tests/api/` | DTOs, trusted actor binding, status/error mapping, policy composition | Injected app and isolated/fake repositories |
| Provider/stream contract | `backend/tests/contract/` | Real adapter payload parsing/serialization, tool IDs, usage, stream framing | Sanitized recorded payloads and mocked transport |
| Integration | `backend/tests/integration/` | Real SQL constraints/transactions/leases/RLS, migrations, Qdrant behavior | Isolated database/Qdrant; fake embeddings |
| Frontend | colocated `*.test.ts(x)` plus `frontend/src/test/` | Stores, parser, components, interactions, sessionStorage, navigation | jsdom, controlled fetch/streams/time |
| Manual acceptance | phase evidence | Browser layout, real streaming transport, reconnect, accessibility | Local/demo runtime, no paid services |

Do not claim a fake repository proves concurrency or SQL rollback. Do not claim a recorded provider payload proves current live vendor availability. API auth integration must exercise the actual credential/ownership path, not only a service/admin database role that bypasses policies.

## 3. Determinism and isolation

- Inject clock, ID source, provider, retrieval, transport, and runner control where behavior depends on them.
- Fail ordinary tests on unexpected outbound network access. Integration tests allow only explicitly configured isolated endpoints.
- Never load production `.env` as a test prerequisite; use test-only settings and require a recognizable test database target before destructive setup.
- Use scripted LLM invocations, not exact-text assertions against live models. Shared scenario fixtures test the demo; separate fault fixtures test malformed calls, timeouts, missing usage, disconnects, and conflicting operations.
- Freeze only test time/IDs. Runtime session tokens remain secure and unique.
- Restore mocks, clocks, storage, subscriptions and global stores between cases. Parallel tests use distinct database scopes/collections.
- Test retries and reconnects with controlled signals/clock advancement rather than arbitrary sleeps.

## 4. API and streaming harness

Async API tests use HTTPX ASGITransport with an explicit lifespan context when startup/shutdown matters. AsyncClient alone does not invoke application lifespan. Select one async test convention (AnyIO asyncio backend) instead of mixing plugins without need.

In-process ASGI tests may buffer streaming differently from a real server. Test event generation/parser units deterministically and add a pytest-managed local-server HTTP smoke test for incremental delivery, subscriber disconnect, replay, and server continuation. Keep it local, bounded, and fixture-only. This does not require browser automation.

Frontend stream tests feed byte chunks splitting UTF-8 characters, SSE boundaries, CRLF, and multiline data. Include duplicate/out-of-order IDs, same-name tool calls with distinct IDs, terminal replay, malformed data, EOF without terminal, and reset/navigation races.

For the corrected demo, use the real ordinary meeting and ending-attempt subscriptions/reducers. Prove multiple `text_delta` and `summary_delta` updates are received before their terminal events over a local HTTP server, not merely that complete SSE text can be parsed after buffering. Test vote progress/output where presented, ending failure after provisional text, per-execution cursor recovery and generation fencing. JSON-plus-typewriter and a special demo-only event path are failures, even if the final text looks correct.

## 5. Reviewed defect matrix

| ID | Baseline location / defect | Fix phase | Required regression |
| --- | --- | --- | --- |
| B-01 | `services/orchestrator.py`: tools execute without model continuation in either path | 02 | Two or more invocations; tool result with original ID reaches provider; no synthetic tool-only final answer |
| B-02 | `services/orchestrator.py`: persona retrieval references undefined `get_supabase` | 02 boundary extraction; 06 live integration | Participant with persona retrieves shared and allowed private evidence without global lookup failure |
| B-03 | `services/vector_store.py`: installed Qdrant client lacks called `search` API | 06 | Real selected client/server query contract returns expected isolated indexed fixture |
| B-04 | `supabase_schema.sql` status constraint excludes voting/ended | 04 entirely | Fresh install and upgrade accept approved states; summary/status commit together |
| B-05 | `main.py`, meeting routes, permissive RLS: unauthenticated cross-owner access and paid turns | 04 enforcement; 08 runtime audit | Two actors cannot list/read/mutate/stream each other's resources; no unprotected compatibility routes |
| B-06 | `api/settings.py`: arbitrary caller-controlled Ollama URLs | 05 live restriction; 08 demo deny | Untrusted destinations never reach HTTP transport; redirects cannot bypass approved destination policy |
| B-07 | `services/meeting_manager.py`: persona provider configuration omitted at creation | 05 | Distinct persona settings copied/resolved into participants and passed to provider |
| B-08 | frontend settings store and backend provider selection disconnected | 05, 07 | Saved effective settings drive participant/system inference; demo overrides cannot escape fixture mode |
| B-09 | `frontend/src/stores/meetingStore.ts`: old stream/load overwrites newly selected meeting | 07 | Delayed A load/final event after selecting B cannot change B's visible data or send target |
| B-10 | meeting/stack deletion leaves retrievable vectors | 06 | Immediate denial after deletion plus eventual idempotent cleanup, including parent deletion/restart |
| B-11 | `services/persona_manager.py`: invalid activation deactivates all versions | 05 | Invalid target preserves active version; concurrent activation leaves one active version |

These paths are relative to `backend/app/` unless otherwise stated. B-04 base SQL is relative to `backend/`. Finding severity and implementation completion must not be inferred from phase assignment.

For every row, write an assertion for the correct behavior, run it against the pre-fix code/schema and record the intended red failure before fixing. Then record the passing regression and retain it through refactoring. Phase 01 starts this ledger; each fixing phase completes any remaining reproducer before its correction. All eleven rows must be closed by Phase 09, before Phase 10 feature implementation. Phase 10 reruns impacted regressions and uses the same bug-first process for newly discovered defects; it cannot hide a core bug with fixture responses.

## 6. Cross-cutting requirement coverage

| Requirements | Mandatory evidence |
| --- | --- |
| R-01, R-11 | Application loop cases plus real finalization rollback/retry tests |
| R-02, R-06, R-07, R-15 | Domain transition matrix, independent-worker reservation/edit-dispatch races, crash recovery, disconnect smoke test |
| R-03, R-04 | Phase 03 scaffold and Phase 08 runtime no-network checks; Phase 10 real-home entry, UI00-UI08 route/overlay coverage, shared-workflow replay, independent fixture-result assertions and guided/explore/reset tests |
| R-05, R-16 | Actual actor boundary matrix across routes, session expiry/reset tests, disabled network-sensitive routes |
| R-08, R-09 | Snapshot/refresh conflict cases and adapter-call configuration capture |
| R-10 | Private/shared scope tests, revocation/tombstone checks, real Qdrant cleanup tests |
| R-12 | Fresh-install and legacy-upgrade fixtures; preserved IDs/counts/history; ambiguity reports |
| R-13, R-17 | Reproducible scripts, dependency records, phase evidence, no hidden skips |
| R-14 | Fragmented/replayed streams, load/navigation races, generation isolation, terminal reconciliation |
| R-18 | Phase 00 design-contract review; Phase 10 verified single-ISIN manifest, claim/source/calculation mappings, distinct specialist contributions, dated facts versus judgments and user verification/disclosure presentation (P00-TEST06, P10-TEST05, P10-TEST06, P10-TEST09, P10-TEST10) |
| R-19 | Persistent watermark/context on every UI00-UI08 route, reload/resume, paused/dismissed guidance, ended and fork views; placement/accessibility verified manually (P10-TEST15, P10-TEST16) |
| R-20 | Approved DB seed/research-run provenance, original stored documents/checksums, review and analytical choices; import/version/pinning/restart tests and no precompleted visitor effects (P10-TEST06, P10-TEST17) |
| R-21 | Normal API reads prove real form-created resources and tool/queue/ending effects; shared provider history contains actual tool results; no fake IDs or parallel workflow (P10-TEST01, P10-TEST02, P10-TEST07, P10-TEST14, P10-TEST18) |
| R-22 | Incremental shared turn and ending SSE over local HTTP, all AI surfaces, dedup/reconnect/EOF/reset/summary-failure tests; actual-host checks separate (P10-TEST08, P10-TEST12, P10-TEST19) |

Each phase adds named Pxx-TEST cases and maps its acceptance criteria to those groups. Expand these into concrete test names in implementation evidence; matrix rows do not substitute for test execution.

Real-bond factual verification is a recorded authoring/content-review task, not something a scripted replay proves. Ordinary tests use the reviewed frozen evidence pack offline and detect drift, unsupported references, wrong instrument/snapshot, mislabeled assumptions and calculation errors. They must not fetch live financial information or assert that a historical rating/price is still current.

The seed additionally requires a recorded genuine research run through the actual application boundaries, real document capture and human/content review of substantive analytical choices. Preserve visible run/tool/provider artifacts and editorial changes, not private chain-of-thought. Do not invent a successful research run, fixed unanimous votes or provenance merely to make a test pass. Separately authorized authoring may use live research/inference, but test collection, CI and recruiter sessions must not require it. An independent expected hash/assertion must be approved before runtime comparison; self-hashing the actual result is not a retrieval-integrity test.

### Corrective demo acceptance design

- Vitest mounts the normal home/navigation/page/store boundaries with the guide layer, not the retired standalone component. Cover every UI00-UI08 page class/tab, actual form outcomes, short what/why copy, expandable technical explanations, stable anchor availability, pause/back/skip/exit/resume and watermark persistence. Removing/dismissing the overlay leaves normal controls functional within server-enforced capabilities.
- Normal API reads must verify real created stacks/personas/participants/meeting, messages, queue dispatch, citations, disagreements, consensus, votes, summary and status. Include actual SQL integration for durability, transaction failures and cross-process coordination; fake repositories alone do not pass these gates.
- Corrupt/remove stored evidence or independently approved expected assertions and show that continuation fails without success/progress. Verify actual returned tool results and original call IDs reach the shared provider continuation. A counter/list of tool names is insufficient.
- Prove production content loads from the approved DB package, startup has no live calls and no precompleted research effects, every session is isolated, reset preserves shared originals, old versions are pinned/restarted explicitly and meaningful unsupported form edits fail honestly.
- Record desktop/narrow/keyboard/reduced-motion browser walkthrough observations for every route/tab and watermark/overlay placement, plus actual local transport timing evidence. jsdom, a route build list, grep-only network scans and final-response string assertions cannot replace that evidence.
- Earlier Phase 10 evidence is historical and its local pass is superseded. Do not reuse aggregate counts as approval of revised requirements; missing core gate/integration/manual evidence remains visible until reverified.

Before Phase 10, use synthetic, clearly test-only data for core/scaffold/runtime acceptance. Those fixtures are not a second public scenario and do not implement J00-J09. Phase 10 alone supplies the complete authored-journey acceptance and P10-TEST12 actual-host release evidence.

## 7. Proposed command interface

These commands are targets for Phase 01; they are not claimed to exist yet:

| Working directory | Command | Purpose |
| --- | --- | --- |
| `backend/` | `python -m pytest -m "not integration"` | Offline fast suite |
| `backend/` | `python -m pytest -m integration` | Explicit isolated-infrastructure suite |
| `backend/` | `python -m pytest --cov=app --cov-report=term-missing` | Coverage evidence with required infrastructure available |
| `frontend/` | `npm run test -- --run` | Vitest non-watch run |
| `frontend/` | `npm run test:coverage` | Frontend coverage evidence |
| `frontend/` | `npm run lint` | Existing lint check |
| `frontend/` | `npx tsc --noEmit` | Type check, using project-installed TypeScript |
| `frontend/` | `npm run build` | Production build |

CI must expose integration prerequisites instead of silently reporting success when unavailable. A dedicated integration job may be skipped locally by explicit selection, but must run before a phase claiming database/vector correctness exits. Establish backend syntax/static checks appropriate to the selected tooling without making unrelated wholesale formatting a prerequisite.

Coverage is diagnostic, not the sole gate. Require explicit branch coverage of the critical invariants and failure cases; set a numeric floor only after measuring a baseline and approving it. Do not inflate coverage with implementation-mirroring tests.

## 8. Documentation consulted

Current documentation was consulted during specification drafting; recheck version-specific setup at implementation:

- [pytest fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [pytest parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html)
- [pytest strict expected failures](https://docs.pytest.org/en/stable/how-to/skipping.html)
- [FastAPI async tests and lifespan caveat](https://fastapi.tiangolo.com/advanced/async-tests/)
- [FastAPI lifespan testing](https://fastapi.tiangolo.com/advanced/testing-events/)
- [Vitest environments](https://vitest.dev/guide/environment.html)
- [Vitest timers](https://vitest.dev/guide/mocking/timers.html)

Vitest/jsdom tests are not a claim of complete browser or async server-rendering coverage. Build checks and recorded manual browser acceptance cover the relevant remaining surface within the approved tooling scope.
