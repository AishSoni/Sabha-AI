# Spec 27 (Phase 7): Expanded-Demo Acceptance

## Purpose and prerequisites

Prove that Specs [23](spec-23-expand-existing-demo-workspace.md)–
[26](spec-26-expand-recorded-meeting-exploration.md) expand the current demo
as one coherent application experience, preserve its original guided HDFC
journey and maintain operator/public isolation.

This is independent acceptance, not permission to replace missing recordings,
sample assets or real feature integration with mocks. All preceding local gates
and content approvals must have executed evidence. Unexecuted hosted gates in
Specs [19](spec-19-replay-release-acceptance.md) and
[22](spec-22-operator-only-live-access.md) remain unexecuted until actually
verified; passing this spec locally does not retroactively close them.

## Required coverage matrix

Maintain an executable route/action inventory, including explicit limitations:

| Surface | Required demonstration |
| --- | --- |
| Existing `/demo` board | Original participants, prepared context/assignments, guide start and links into catalog/knowledge |
| Existing `/demo/new` | Original guided creation/intake plus clearly labeled editable temporary setup and sample staging |
| Existing `/demo/meetings` | Original active/ended/archived views plus labeled temporary setups; no live record lookup |
| Existing recorded room | Original transcript/tools/citations, disagreements, consensus, roster, Files, closing/votes/brief and archive path |
| Recorded exploration | Approved chapters, real alternative turns/follow-ups, speed/skip/replay and bookmark restoration |
| Summary | Approved recorded system-summary inspection, not fake on-demand generation |
| Demo roster/new/detail | Local create/edit/duplicate/delete, revision inspection/save/activation and snapshot explanation |
| Demo stacks/new/detail | Local stack management, actual document counts, assignments and derived visibility |
| Sample picker/documents | Allowlist/preview/destination, queued/indexing/ready, failure/retry, removal and immediate eligibility change |
| Temporary setup inspection | Saved prompt/assignment snapshots and shared documents; no fabricated generation/closing |
| Demo settings | Safe explanation of operator provider setup; no keys/probes/Auth or newly implemented placeholder features |

Every implemented application screen must have an intentional demo counterpart,
safe recorded inspection or explicit unavailable explanation. This is not a
requirement to simulate private credential operations or unimplemented features.
Do not claim coverage merely because navigation labels exist.

## Browser journeys against the actual application

### A. Original journey preservation

From a fresh context, complete the current HDFC eight-beat board-to-archive
journey using its canonical actions, evidence and closing controls. It must not
require visiting new features, editing a prompt or uploading a practice sample.
Cover the current package compatibility path as well as the expanded package's
canonical path. Historical factual claims and as-of disclosure remain intact.

### B. Integrated feature exploration and return

Start the original guide and detour into roster. Inspect an older revision
without activating it, save an edited version, activate another, and observe
that the recorded participant snapshot remains unchanged. Visit an assigned
stack, preview a permitted sample, add it and inspect ready status/chunk count
and who could retrieve it. Exercise the designated failure/retry example, then
remove a document and observe immediate practice visibility changes.

Return to the same guide position, request a canonical turn, inspect its actual
recorded citation and continue to closing/archive. No step should imply that
the practice edits generated that response. Test both feature navigation and
explicit recording exploration/bookmark restoration.

### C. Editable setup without fabricated answers

Use the existing creation screen's temporary-setup path. Select current persona
defaults and approved samples, create once, retry a failed sample without a new
meeting, inspect captured participant prompts/assignments and shared documents.
Change the originating template and prove the saved snapshot stays fixed while
eligible stack contents remain current. Follow **Open original HDFC recording**
and verify its participants/text did not adopt custom edits.

### D. Freer prepared recording exploration

Open completed chapters without walking preceding beats, follow both alternatives
at each required choice point, reach coherent closing/archive, and inspect the
recorded summary. Change playback speed, skip a turn/closing, replay a prepared
turn and resume the bookmarked guide. Verify exact operations/messages/citations
and no duplicate or cross-branch scoreboards/ballots.

### E. Lifetime, independence and access

Two fresh visitors make distinct edits and choose different prepared branches.
Reset/refresh A while work is pending; B stays unchanged. Restart only the
recording and retain A's practice edits; full reset removes them. Exercise a
separate authorized operator browser with synthetic credentials and a controlled
live operation: demo actions never reset its state or bootstrap/read its vault.
Operator logout/session loss must not clear an independently mounted demo.

## Isolation and state evidence

- Automatically inventory all `/demo` routes, layouts/providers, feature roots,
  adapters and preview paths. Walk transitive imports and reject live transport,
  Auth bootstrap, vault/settings stores and unsafe root-barrel dependencies.
  Shared presentation extraction is allowed; bypassing import rules is not.
- Capture browser requests across all journeys. Allow only the necessary
  application static assets and approved replay GET/asset/SSE destinations;
  forbid live API reads and writes, Auth calls, provider discovery/probes,
  private Storage and arbitrary third-party fetches. Merely checking non-GET
  meeting requests is insufficient. Test in fresh contexts and with a previously
  authorized operator separately; public requests never attach its credentials.
- Inventory persisted browser state before and after edits, retry, reset and
  refresh. Only separately permitted preferences may change in a fresh public
  context; no workspace edits/cursors/drafts/samples in persistent stores. In
  mixed mode, do not erase or mistake existing Auth/vault envelopes for demo
  persistence. No per-visitor backend record or demo analytics writes.
- Extend `backend/tests/integration/test_replay_effects.py` and the real HTTP
  boundary suites to cover seed/expanded package reads and new pacing queries.
  Trace request-attributable SQL/storage/RPC/outbound effects with rejecting
  live/provider/worker sentinels. Local-memory commands are allowed; persistent
  application writes, live inference/indexing/tools and live reads are not.
- Retain effective reader-role denial on live data and all writes, published
  asset permissions, forged-ID/mode/method rejection and replay-only startup
  without operator/provider credentials. Adding a seed route cannot widen
  browser database/Storage grants or introduce a service-role fallback.

## Failure, accessibility and regression gates

Exercise missing/corrupt/unsupported seed or graph metadata, sample/hash/MIME
mismatch, denied reader, retired package, source preview failure, EOF without
terminal and replay backend outage. Fail honestly with safe recovery and no
live fallback or fabricated result. Legacy packages lacking an expansion keep
their original guide with additions explicitly unavailable.

Race tests include double add/create/save/choice, deletion during simulated
processing or preview, speed reconnect during terminal, chapter switch during
fetch/settlement, reset with abort-ignoring completions, back/forward, route
remount, refocus and polling. No stale record can restore removed eligibility,
repopulate an ended workspace or overwrite a newly selected chapter.

Run the journeys with keyboard-only input, a small mobile viewport and reduced
motion. Verify accessible picker/history/action labels, status announcements,
focus restoration and readable overflow. The guide cannot obscure controls or
steal scroll while a visitor inspects documents/history.

Keep live creation/no-clone retry, persona versioning, knowledge deletion and
evidence redaction, summary generation, durable turn reconnect, closing,
archive/unarchive, operator Auth/vault and API schema/decoder suites green.
Production build and architecture checks must exercise actual shared components,
not demo-only mock replacements. Update old guide-only/deep-link assertions
deliberately with legacy and new behavior coverage, never by deleting isolation
assertions.

## Content, package lifecycle and operational acceptance

- Validate and reproduce the expanded package from a clean checkout with no
  ignored research or test imports. Retain original version/hash fixtures and
  prove old schema support, interrupted-publication safety, pinning and
  bounded-version retirement. Use approved content and an independent ledger
  for the expanded immutable version, including every additional branch/sample.
- Verify all displayed facts/locators/rights, sample destinations and authored
  labels. Each advertised alternative has a validated continuation to closing;
  no unpublished or broken choice is hidden only to pass the main journey.
- Update runtime/package/architecture references and operations docs when the
  implementation ships. Update actual API inventory, OpenAPI/generated types
  and schema fixtures only for implemented contracts, not anticipated endpoints.
  Correct public copy about reset/refresh and temporary edits; do not claim
  persistent resume or that edited prompts drive recorded replies.
- With separate operational authorization, exercise the deployed reader grants,
  public sample bytes/immutability, direct-origin denial, proxy SSE at both
  speeds, disconnect cleanup and the real browser journeys. Reuse Spec 19's
  permission and mixed-mode gates; verify Spec 22's operator boundary too.
  Do not change hosted settings, grants or content publication merely by writing
  or locally implementing these specifications.

## Execution, release record and rollback

Use red-green-refactor slices within preceding specs. At this gate, record exact
commands, environments/dependency versions, package/schema/seed versions and
content hash, approved content ledger, suite/browser counts and each coverage
row's evidence. Separate passed, failed, skipped and unexecuted results. Never
copy historical counts as current results or add a completion record in advance.

Exit when the original guide and every required expansion work together with
honest provenance, bounded state and no public live effects. Conditional local
acceptance is allowed; outstanding hosted/security/content gates block a claim
of expanded public-release acceptance. Earlier unexecuted gates stay visible.

Rollout selects an approved expanded package only after compatibility/content
gates. Rollback disables expansion affordances and repins an intact compatible
guided package without deleting live records or relaxing authorization. Respect
pinned active versions: retain them for their support window or fail explicitly
if retired, rather than silently replacing an active run with different data.

## Conditional local acceptance record (2026-11-01)

**Environment.** Windows; Python 3.12.10; Node 26.8.2; npm 12.2.0; Next.js
16.1.4; disposable local PostgreSQL provisioned by `pgserver`; Chromium through
Playwright. The replay backend used `MemoryStorage` and `REPLAY_ONLY`; mixed mode
used a controlled local server with `mount_live=True`, a synthetic operator
verifier and a live-operation sentinel. No hosted Supabase project, hosted
Storage, provider, paid service or real operator credential was contacted.

**Package.** The approved expanded package is `hdfc-ine001a07rw5`, version `6`,
schema `2`, workspace seed `3`, content SHA-256
`48014296bc2f98c0270c72ecee7c5d527cb35536b6c9c3846ffc9590cb37113d`. Its content
ledger is [Spec 26](spec-26-expanded-meeting-content.md): 28 checkpoints, 27
transitions (8 canonical), 14 chapters, 3 choice states, 6 closing tapes and 4
approved samples, including the fail-once retry sample. The checked-in
compatibility fixture is `hdfc-ine001a07rw5` version `5`, schema `2`, content
SHA-256
`005a274a178ed7489bb108d7703d833316ac9e1933093866ec87040340f65d8f`, with its
original 8-beat guide and no chapters or transitions. The schema-1
`placeholder-analyst` package remains the minimal legacy boundary fixture.

**Executed local evidence.**

| Check | Command | Result |
| --- | --- | --- |
| Backend full suite | `cd backend; $env:PYTHONPATH='.'; venv/Scripts/python.exe -m pytest -q` | 971 passed, 1 skipped, 21 warnings in 972.24s |
| Frontend unit suite | `cd frontend; npm test` | 94 files, 536 tests passed |
| Architecture suite | `npm run test:architecture` | 4 files, 28 tests passed |
| Types, lint and build | `npx tsc --noEmit`; `npm run lint`; `npm run build` | tsc passed; 0 lint errors (22 warnings); optimized build passed |
| Development browser suite | `npm run test:e2e` | 22 passed, 2 skipped (1.8m) |
| Production browser suite | `npm run test:e2e:prod` | optimized build passed; 22 passed, 2 skipped (1.4m) |
| Version-5 browser compatibility | `npm run test:e2e:legacy -- legacy-journey.spec.ts` | 1 passed (19.8s) |
| Mixed operator/demo browser boundary | `npm run test:e2e:mixed -- mixed-operator.spec.ts` | 1 passed (13.8s) |
| Replay effects, HTTP boundary, SSE and legacy fixture | `python -m pytest tests/integration/test_replay_effects.py tests/integration/test_replay_http_boundary.py tests/integration/test_replay_sse_socket.py tests/unit/test_replay_legacy_fixture.py -q` | 17 passed, 21 warnings in 55.46s |
| Expanded package validation | `python -m scripts.replay_package validate backend/replay_packages/hdfc-ine001a07rw5` | ok; version 6; hash `48014296bc2f98c0270c72ecee7c5d527cb35536b6c9c3846ffc9590cb37113d` |
| Version-5 fixture validation | `python -m scripts.replay_package validate backend/tests/fixtures/replay/hdfc-ine001a07rw5-v5` | ok; version 5; hash `005a274a178ed7489bb108d7703d833316ac9e1933093866ec87040340f65d8f` |
| Clean-checkout rehearsal | `$env:PYTHONPATH='.'; venv\Scripts\python.exe -m scripts.rehearse_clean_checkout --skip-frontend` | tracked HEAD; 14 required files; 0 forbidden entries; 57 public paths; `worker_main` true |

**Coverage matrix evidence.**

| Required surface | Executed evidence |
| --- | --- |
| Board, original participants, prepared assignments, guide start and catalog links | `guided-journey.spec.ts` (expanded package), `legacy-journey.spec.ts` (version 5), `demo-journey.test.tsx` |
| `/demo/new` guided intake plus editable temporary setup and sample staging | `temporary-setup.spec.ts`, `demo-practice-meetings.test.tsx`, `demo-journey.test.tsx` |
| `/demo/meetings` active/ended/archived views and labeled temporary setups | `guided-journey.spec.ts`, `replay-isolation.spec.ts`, `demo-practice-meetings.test.tsx` |
| Recorded room transcript, tools, citations, disagreements, consensus, roster, Files, closing, votes, brief and archive | `guided-journey.spec.ts`, `evidence-preview.spec.ts`, `exploration-playback.spec.ts` |
| Recorded exploration chapters, alternatives, follow-ups, speed, skip, replay and bookmark restoration | `exploration-playback.spec.ts`, `demo-chapters.test.tsx`, `recorded-summary-panel.test.tsx` |
| Recorded summary inspection without on-demand generation | `exploration-playback.spec.ts` summary chapter, `recorded-summary-panel.test.tsx` |
| Demo roster create/edit/duplicate/delete, revisions, activation and snapshot explanation | `integrated-practice.spec.ts`, `demo-accessibility.spec.ts`, `mixed-operator.spec.ts`, `demo-roster.test.tsx` |
| Demo stacks create/edit/delete, counts, assignments and derived visibility | `integrated-practice.spec.ts`, `demo-knowledge-stacks.test.tsx` |
| Sample allowlist, preview, destinations, queued/indexing/ready, failure/retry, removal and eligibility | `integrated-practice.spec.ts`, `replay-resilience.spec.ts`, `demo-accessibility.spec.ts`, `demo-knowledge-stacks.test.tsx` |
| Temporary setup prompt/assignment snapshots and shared documents without fabricated answers | `temporary-setup.spec.ts`, `demo-practice-meetings.test.tsx` |
| Demo settings operator-only explanation with no keys, probes or Auth bootstrap | `demo-accessibility.spec.ts` settings case, `demo-journey.test.tsx` |

**Browser journeys A-E.** A: `guided-journey.spec.ts` completed the expanded
canonical eight-beat board-to-archive path, and `legacy-journey.spec.ts`
completed the same original journey against version 5 without chapters. B:
`integrated-practice.spec.ts` inspected an older revision without activating it,
saved and activated revisions while the recorded participant stayed unchanged,
added a permitted sample, observed Ready with its chunk count, retried the
designated failure, removed a document, returned to the guide and inspected the
recorded citation and archive path. C: `temporary-setup.spec.ts` created one
temporary setup, retried the fail-once sample without a second meeting, proved
the captured prompt/assignment snapshot stayed fixed after the template changed,
kept stack contents current, and opened the unchanged original recording. D:
`exploration-playback.spec.ts` opened completed chapters directly, exercised both
alternatives at each required choice, changed playback to 2x, skipped and
replayed turns and closings, restored the guide bookmark and inspected the
recorded summary without
duplicate or cross-branch ballots. E: `replay-isolation.spec.ts` proved two
fresh visitors have independent edits, reset scopes and recording restarts, and
`mixed-operator.spec.ts` proved a synthetic operator session/vault stayed
untouched while demo edits and resets continued after operator logout and context
closure.

**Isolation and state.** `replay-boundaries.test.ts` now inventories every demo
module, route and dynamic import; it rejects live clients, live runtime, Auth,
vault, stores and live feature roots while composing the real meeting room,
contract and replay components. Shared meeting hooks now require an injected
runtime, removing the dynamic live fallback. Browser suites use `guardNetwork`,
which permits only app GET/HEAD requests, replay GET/seed/meeting/asset
destinations and `example.invalid` replay assets, and rejects `authorization` or
`cookie` headers on replay and asset requests. `expectNoPublicPersistence`
requires empty local/session storage, cookies, IndexedDB, Cache Storage and
service workers. Backend effects and HTTP-boundary suites recorded only
`SELECT`/`WITH` traffic, unchanged tuple counts, no live calls, no provider
sentinel, no outbound connections and no storage mutation for the expanded seed
and both pacing values. Reader denial, forged selectors/modes/methods and
replay-only startup remain covered by the full backend suite.

**Failure, accessibility and regression.** `demo-failure.spec.ts` covers a
failed workspace seed and an aborted turn stream with safe recovery;
`demo-accessibility.spec.ts` covers keyboard-only revision, picker and preview
use at 390x844 with reduced motion, focus restoration and no horizontal
overflow; `replay-resilience.spec.ts` covers double actions, double sample adds,
refocus/polling, aborted stream resume and restart/refresh. `evidence-preview`
also caught and verified the fix for the room footer intercepting a Files-panel
control. Existing race tests cover late completions after reset, deletion during
simulated processing, stale eligibility and reset-with-pending-work. Live
creation, persona versioning, knowledge deletion/redaction, summary generation,
turn reconnect, closing, archive and operator suites remain green in the full
backend and frontend runs.

**Passed, failed and skipped.** All executed Spec 27 checks passed. The normal
browser suite skipped only the two package-specific journeys because they require
their dedicated backend runners; both passed separately. The full backend suite
reported one skip that is not a Spec 27 acceptance case. No Spec 27 acceptance
check failed or was silently skipped.

**Unexecuted (deployed).**

| Hosted check | Status |
| --- | --- |
| Deployed Supabase reader/publisher grants, RLS and Storage permissions | Unexecuted |
| Public sample bytes, immutability and direct-origin denial | Unexecuted |
| Deployed proxy SSE at both speeds and disconnect cleanup | Unexecuted |
| Hosted browser journeys A-E, two-visitor isolation and mixed operator/vault boundary | Unexecuted |
| Deployed publication, pinned-version retention/retirement and rollback rehearsal | Unexecuted |
| Real screen-reader and physical mobile-device pass | Unexecuted |
| Provider/model calls | Unexecuted |

**Decision.** Conditional local acceptance is granted for the expanded demo:
the original guide and every required expansion work together with honest
provenance, bounded browser state and no public live effects. This does not close
the hosted replay, permissions, security, content-publication or operational
gates above, and it does not retroactively close earlier unexecuted gates.
Expanded public release remains blocked until those deployed checks are executed
with separate authorization.

**Rollback.** Disable the expansion affordances and repin an intact compatible
guided package (version 5 or 6) without deleting live records or relaxing
authorization. Keep pinned active versions for their support window or fail
explicitly if retired; do not silently replace an active run with different
data.
