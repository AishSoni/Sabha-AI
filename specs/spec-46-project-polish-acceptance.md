# Spec 46: Project Polish Acceptance and Rollout

Status: local integrated acceptance complete; hosted deployment and field
acceptance remain conditional. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: local gates in Specs 34–45 and decisions D01–D07 resolved.
This is integrated verification and package rollout, not a second implementation.

## Acceptance ledger

Retain these original gate IDs. Every gate is currently **unverified**. Attach
executed checks, outcomes, conditional skips, artifacts, and outstanding limits.

| Gate | Required integrated result | Implementation owners |
| --- | --- | --- |
| P01 | Consistent domain vocabulary across UI/backend without template/snapshot collapse | 34 |
| P02 | Demo-only visible mode copy across routes, errors, accessible names, package fields, previews, tests, and current docs | 34; feature owners finish their copy |
| P03 | Stylish concise intro, skip/revisit/deep-link/recovery behavior per D01 | 41 |
| P04 | Main-journey sample readiness/shared visibility; obsolete separate flow removed | 43 |
| P05 | Arbitrary speaker choice and unified phase/count/admission/closing policy per D03 | 42 |
| P06 | Meaningful all-screen guidance and outcome finale per D04; Demo-only scores hidden | 41, 42, 43 |
| P07 | Friendly authored names, stable visual provenance, consistent shared cards | 39 |
| P08 | Safe full-item version inspection, explicit activation, dirty guards, scoped errors | 39 |
| P09 | Discoverable on-demand Live navigation, no demo link, preserved runtime/drafts | 40 |
| P10 | Useful settings, no Coming soon, usable vault, truthful privacy and Demo limits | 37, 38 |
| P11 | Safe prerequisite visibility, fresh test results, effective provider and closing credential capability | 37, 38 |
| P12 | Truthful uploads/creation/chat/queue/closing/context and read/mutation recovery | 35, 36, 40, 41 |
| P13 | Approved homepage preserved with better copy and tested headline/graph/renderer lifecycle | 44 |
| P14 | Architecture, exact evidence/clipping, security, IME, accessibility, geometry, performance, and package rollout | All; 45 owns preview clipping |

## Route and state sweep

Cover both appearances and applicable live/demo variants:

- Homepage, login, access-status/loading/unavailable states.
- Demo session/metadata loading, intro/revisit, overview, and setup/creation.
- Meeting lists, empty/error/mutation states, room discussion, dock, record,
  details, files, closing/ballots, summary/history, archive and unarchive.
- Persona list/new/editor; prompt history, diff, inspection, activation, drafts,
  and demo participant/snapshot exploration where retained.
- Knowledge stack list/new/detail; document/sample picker, ingestion states,
  retry, deletion/revocation, and source preview.
- Live/demo settings, vault, provider tests, System AI, safe diagnostics,
  appearance and navigation; unavailable controls say Only available in live.
- Cross-route dialogs, confirmation, notices, guidance hide/resume, deep links,
  retired-package/fallback/compatibility compositions, reset and restart.

No screen may silently turn a failed read into success, absence, or a valid empty
state. Preserve useful prior content/drafts and scoped recovery. Test permission
loss and background/late responses, not only initial successful rendering.

## Regression evidence

Use the owned tests in Specs 34–45 and audit T01–T31 as the checklist. Include real
controller/observer integration, not only mocks of the boundary being tested.
Exercise stream loss and >100 operations; commit/lost response/retry for messages,
creation and uploads; partial batches; status refetch versus ingestion restart;
vault/provider races and closing capability/observation; editor drafts/auxiliary
failure; sample/progression/reset; identity continuity; honest context and clipped
evidence; headline visibility, inspector focus, and failed WebGL initialization.

Preserve architecture/import-boundary tests, public-demo network isolation,
private authorization/byte revocation, encrypted credential policy, exact-revision
evidence, immutable package validation, and existing compatible journeys. Replace
obsolete flow tests with their useful guarantees under the new owner; never just
delete failure/isolation coverage or loosen assertions to pass new labels.

## Visual and accessibility evidence

Verify mobile and small laptop, 1440×900 and 1920×917, keyboard/screen reader,
touch targets, visible focus, reduced motion, both themes, text scaling and zoom.
Re-measure the Spec 31 two-thirds resting discussion-height requirement after
dock/nav changes. Check single viewport ownership and composited text contrast,
solid reading/fallback surfaces, unsupported effects, and late/empty/error layouts.
Record browser/device and performance evidence; outstanding hosted/field checks
from Specs 31/32 are not erased or satisfied by a local unit-test run.

## Package and release gate

1. Re-scan and disposition every row of the [copy inventory](reference-project-polish-audit.md).
   Keep negative checks and update fixtures that positively demand old aliases.
2. Repair the authoring generator first, then produce a new validated package with
   approved names/copy/chapters, source metadata, coherent projections and hashes.
   Do not assume v9 is the deployment selector or mutate retained published bytes.
3. Record active selector, supported/retired versions, compatibility/fallback copy,
   deployment verification, rollback, and outstanding conditional acceptance.
4. Confirm all seven decisions and every gate with actual evidence. Documentation
   existence, implementation numbering, or a historical completion record is not
   proof that this polish release is accepted.

## Implementation record

Status after this record: local integrated acceptance is complete; hosted
deployment and field acceptance remain conditional. The release candidate is
demo package `hdfc-ine001a07rw5-v12` with content SHA-256
`37438db307f3fc99d69b30d8efbc38d86592988b9ed208bec4420968269d81ba`
and workspace-seed SHA-256
`ff9154e0a34cd1459e28154914d238d59aa0259eb66247f4a3564c7257d43e9d`.

This is an acceptance record, not another feature implementation. The work
below re-ran the owned suites, repaired the authoring copy, built a new
immutable package, re-scanned the copy inventory, and recorded the remaining
hosted and field limits. Historical implementation records in Specs 34–45 were
not rewritten.

### Package copy repair and immutable v12

The v11 generator and package still carried two retired journey labels
(`Review the formal disagreement` and `Review the formal consensus`) and the
obsolete practice-intake seed data. The generator now has two explicit copy
profiles:

- `legacy` remains the default so the historical builder scripts keep their
  authored inputs, including the old practice-intake preset.
- `polish` removes the retired practice preset, uses
  “Workspace changes live in this browser tab only…”, and labels the two
  journey steps `Review the disagreement` and `Review the consensus`.

`build_schema3_package_v12.py` opts into `polish` with the approved Mira,
Arjun, and Leena display names and the Spec 42 consensus-thinking content.
The package was built twice with the same content hash, validated offline, and
loaded through the normal replay loader. No v5, v7, v8, v9, v10, or v11 package
bytes were edited. The v5 fixture remains the legacy compatibility fixture, and
the placeholder package remains a deliberately synthetic test fixture.

The current package is selected by `e2e_provision.py` and by the two browser
helpers that address recorded assets. `docs/OPERATIONS.md` records v12 as the
current selector, v11 as the rollback pin, v7–v12 as retained local versions,
v5 as the compatibility fixture, and the no-live-fallback behavior for missing
or unregistered packages. Production publication, hosted activation, and a
hosted rollback exercise were not performed in this local environment.

### Copy inventory disposition

The audit inventory was disposed section by section:

| Inventory | Disposition |
| --- | --- |
| A.1 frontend entry/overview/setup/lists/settings | Changed to the approved Demo vocabulary; removed the operator Recorded demo link, the try-editing branch, and the entire Practice setups section; aligned access, loading, setup, lifecycle, reset, guidance, and seed-error copy. |
| A.2 guidance/personas/knowledge/samples/obsolete routes | Changed the retained guidance, persona, knowledge, sample, and local-document surfaces; removed the six obsolete practice setup/meeting screens, routes, state modules, and hooks. Useful sample behavior moved to the shared main-journey owner. |
| A.3 room/playback/closing/summary/runtime fallback | Changed the retained room, playback, closing, summary, document, and runtime fallback labels; kept the compatible replay composition and isolation behavior. |
| A.4 evidence errors/source labels | Reworded the declared-origin, type, revision-byte, and recorded-asset error stems while retaining every integrity, retry, and recovery check. |
| A.5 backend display defaults/errors | Kept the machine-readable `replay_*` codes, changed user-facing defaults to Demo, and retained safe unavailable/corrupt/stream error handling without exposing raw internals. |
| A.6 package authoring/replicated content | Repaired the generator and produced v12; omitted the obsolete practice preset; aligned manifest, chapters, beats, checkpoints, tapes, retrieval, seed, accessibility, source, and provenance fields. Historical packages are deliberately retained unchanged for compatibility. |
| A.7 tests preserving rejected copy | Kept the negative Demo-copy checks and updated positive fixtures to the current labels; no isolation, evidence, memory-lifetime, or failure assertion was removed. |
| A.8 current documentation | Updated root, frontend, backend, and operations documentation to current routes, 60 API paths, migrations through 040, v12 hashes, current E2E names, current intro persistence, and the Spec 42 progression. Historical specs were left intact. |

An exact scan of the 32 rejected phrases across the built v12 package found no
hits. The package also contains no `practice_setups` field. The current docs
contain none of those phrases, and the retained v5 fixture was not scanned as a
current-copy surface. `demo-copy.spec.ts` keeps the negative browser check.

### Acceptance ledger

| Gate | Result | Evidence |
| --- | --- | --- |
| P01 | Verified locally | Spec 34 contract and visible-copy changes remain in the current UI; persona/template and meeting-participant/snapshot identities are separate in the domain, seed, and browser surfaces. Specs 39 and 43 preserve that distinction. The v12 seed still carries authored personas while participant snapshots come from the recorded meeting. |
| P02 | Verified locally; hosted package deployment conditional | v12 copy audit and documentation scan found zero rejected aliases; `demo-copy.spec.ts` passes on the current package; accessible names, package labels, settings, errors, and current docs use Demo/Live. Historical v5–v11 packages remain intentionally unchanged. |
| P03 | Verified locally | Spec 41 addendum browser coverage: four scroll moments, Skip/Enter/progress, deep-link Skip, revisit, Escape/focus, reduced motion, WebGL fallback/context loss, 200% text, mobile, and metadata recovery. `demo-introduction.spec.ts`, `homepage-cta-readiness.spec.ts`, and `demo-failure.spec.ts` passed in production. |
| P04 | Verified locally | Spec 43 shared-document adapter is present in setup, room Files, and the shared knowledge stack; samples remain optional and scoped to the prepared meeting. `shared-documents.spec.ts` passed both add/retry paths. The obsolete practice routes and screens are absent. |
| P05 | Verified locally | Spec 42's single accepted-outcome policy drives the speaker dock, phase labels, counts, admission, follow-up, closing, and outcome. `progression.test.ts`, prepared-deck tests, and `guided-journey.spec.ts` exercise arbitrary opening order, repeat/playback non-counting, follow-up gating, closing enablement, and optional archive. |
| P06 | Verified locally | `demo-guidance.spec.ts` visits every retained demo workspace screen and asserts contextual copy; the closing finale is exercised by `guided-journey.spec.ts` and `demo-hud.spec.ts`; no demo renderer consumes the generated response `score` field. |
| P07 | Verified locally | The approved first names and role subtitles are present in v12 and the current seed; `participant-mark` / backend construction tests cover stable `markId ?? persona_id ?? id` identity; roster/card tests and `appearance.spec.ts` cover shared card alignment, marks, themes, and renames. |
| P08 | Verified locally | Persona editor tests cover full-item revision inspection, activation, all-field dirty guards, browser-back/SPA guards, and scoped 404/unavailable history/stack failures without losing drafts. |
| P09 | Verified locally | The fixed mid-height Live trigger, modal links, no Recorded demo link, keyboard/focus return, and route dismissal are covered by `mixed-operator.spec.ts`; demo edits and resets leave operator auth and vault bytes unchanged. |
| P10 | Verified locally; hosted conditions open | Settings has Providers/System AI/Credentials/Appearance/Diagnostics with no Coming soon; vault lifecycle and truthful browser/server key copy are covered; demo settings are static and live-only labels are truthful. Hosted provider behavior was not exercised. |
| P11 | Verified locally; live provider calls conditional | Provider results are input-bound, System AI discovery distinguishes empty/error, keyless local probing and hosted-key guidance are covered, diagnostics are safe and read-only, effective generation policy is shared by execution and display, and closing capability is advisory but rechecked server-side. No live paid provider call was made. |
| P12 | Verified locally | Owned tests cover canonical document progress, refresh vs retry ingestion, frozen creation intent, request-key message/creation/upload recovery, truthful queue/closing/context state, failed reads that retain prior content, and scoped recovery. Stream loss, a 105-operation history, ambiguous responses, IME composition, and late/background responses are exercised by controller/observer and integration tests. |
| P13 | Verified locally | The approved homepage copy and evidence composition are retained. `homepage.spec.ts` covers headline visibility, pinned inspector stability, WebGL2 unavailable, context loss, DPR resize, resource cleanup failure, reduced motion, and no-JS fallback. |
| P14 | Local components verified; full release conditional | Architecture/import-boundary tests (7 files/52 tests), exact-revision preview and 400,000-character clipping, public-demo isolation, private authorization/revocation, encrypted vault policy, IME, keyboard/focus, responsive geometry, and package validation pass. Hosted deployment, Firefox/WebKit, physical devices, a dedicated screen-reader session, field performance, and the Spec 31/32 outstanding checks remain open. |

### Decisions

| Decision | Resolution and acceptance evidence |
| --- | --- |
| D01 | Intro is the four-moment scroll journey in the Spec 41 addendum; `sabha.demo.intro.v1` is the only demo intro persistence; Skip/Enter/deep links/revisit/Escape/focus/reduced-motion/WebGL fallbacks are covered by `demo-introduction.spec.ts` and `homepage-cta-readiness.spec.ts`. The earlier static four-step composition is superseded, not a second live path. |
| D02 | Approved samples sit in the retained Document card on `/demo/new`, are optional and scoped to the prepared meeting, and share one adapter across setup, room Files, and the shared stack. Reset clears and restart preserves through epoch-guarded browser state. |
| D03 | One accepted-outcome progression replaces reply-count arithmetic. Only accepted results count; repeats, playback, timers, and failed attempts do not. Opening order is arbitrary, follow-up is fixed and gated, and closing admission is 5/5. |
| D04 | Accepted closing is the finale; the closing tab presents the saved outcome and research checklist, and archive is optional. |
| D05 | Mira (Credit Analyst), Arjun (Downside Reviewer), and Leena (Portfolio Analyst) are first-name-only authored identities; role subtitles remain. v12 carries the names forward without renaming live personas or participants. |
| D06 | A fixed left mid-height Live button opens a real modal with Meeting space, AI roster, Knowledge stacks, Settings, appearance, and sign out; it has no demo link, adds no layout height, returns focus, and preserves the dirty-navigation guard. |
| D07 | Settings is exactly Providers, System AI, Credentials, Appearance, and Diagnostics. Unsupported fields are represented truthfully; no Coming soon or invented Privacy/Notifications section exists. |

### Defect register

| Defect | Owner and current evidence |
| --- | --- |
| T01 disconnected upload observation | Spec 36; `useDocumentOperation`, receipt-bound progress, status-refetch-only failure, and stale-list suppression are covered by knowledge/document tests. |
| T02 status retry vs ingestion restart | Spec 36; retry endpoint only schedules failed work, 409s for other states, and UI separates Refresh status from Retry ingestion. |
| T03 committed editable config | Spec 36; creation freezes the first intent and withholds navigation while files are in flight; creation-resume tests cover the read-only state. |
| T04 lost-response duplicate admission | Spec 36; request-key migrations 039/040 and creation/upload identity tests cover replay, conflict, and deliberate new-file behavior. |
| T05 prompt-only dirty guard / false 404 | Spec 39; all edited fields baseline, beforeunload/SPA/popstate guards, save baseline, and scoped 404 vs unavailable history/stack reads are covered. |
| T06 stale provider async results | Spec 38; ProviderCard generation token/vault epoch discards late results and never enables a stale success. |
| T07 all replies/count disagreement | Spec 42; `progression.ts`, prepared-deck tests, and guided journey use accepted required outcomes, not played reply count. |
| T08 local samples absent from room inventory | Spec 43; shared-documents E2E verifies same identity in setup, room Files, and shared stack. |
| T09 metadata failure endless loading | Spec 41; demo failure tests and homepage readiness retry cover missing/metadata-only failures without live fallback. |
| T10 list error/empty/silent mutation | Spec 40; list tests distinguish initial failure, stale background failure, true empty, and failed archive/unarchive/delete; mixed E2E confirms failed read is not empty. |
| T11 vault unwired/errors/blank key | Spec 37; vault lifecycle, transient drafts, epoch guards, rekey, and late unlock/save tests pass. |
| T12 false privacy statement | Spec 37; browser-key encryption, unlock/forwarding over HTTPS, server-key separation, and login-does-not-unlock copy are covered. |
| T13 hidden System AI discovery failure | Spec 38; SystemAiCard distinguishes loading, empty success, sanitized provider error, and transport error with scoped retry. |
| T14 local availability/keyless test | Spec 38; keyless local probe and hosted-without-key behavior are covered without network or key leakage. |
| T15 hidden policy read failure | Spec 38; effective policy provenance, degraded notices, and diagnostic capability states are covered. |
| T16 mark changes at construction | Spec 39; stable mark resolution and backend construction tests cover fresh participant IDs, recorded overrides, non-persona fallback, and theme/reorder invariance. |
| T17 catalog card sizing/generic snippets | Spec 39; shared card alignment, bounded text, accessible detail, demo purpose vs live role, and prompt-version badge are covered. |
| T18 anonymous flex text | Spec 43; the obsolete giant empty card was removed rather than reworded, and the shared retained surfaces retain their failure/empty guidance. |
| T19 headline hidden-document guard | Spec 44; `homepage.spec.ts` holds a hidden document for 22 seconds without rotation and resumes after visibility. |
| T20 pinned inspector replaced on hover/focus | Spec 44; selection owns a stable inspector region; hover/focus only emphasize; Escape/close restore focus; compact list uses the same inspector. |
| T21 partial WebGL init / stale DPR | Spec 44; single resource ledger, failure/loss cleanup, late-engine destruction, and DPR-cap resize tests pass. |
| T22 oldest-100 queue omission | Spec 35; 105 terminal operations plus active work are retained in integration tests. |
| T23 observation dropped before settlement | Spec 35; real controller/observer integration reconciles a lost stream and settles once per scope. |
| T24 unkeyed chat / blind cache append | Spec 35; request-key replay, canonical-ID upsert, ambiguity retry, and conflict tests pass. |
| T25 execution provider mismatch | Spec 37; one effective generation policy drives execution, credential lookup, cooldown, and roster display; explicit participant policy outranks global inheritance. |
| T26 browser key missing from closing | Spec 37; capability preflight, transient `X-Provider-Key-*` headers, server recheck/409, retry resumption, redaction, and Gemini header routing are covered. |
| T27 closing read failure treated as absence | Spec 40; unknown/checking closing state gates admission and offers observation retry; a failed read never proves there is no close. |
| T28 closed meeting offered Generate summary | Spec 40; closed summary control is disabled with an explanation, saved summaries remain readable, and lifecycle changes update the control. |
| T29 false 128k context budget | Spec 40; details show a saved-text token estimate explicitly not model context/capacity; legacy `max_tokens` remains data-only. |
| T30 Markdown truncation flag dropped | Spec 45; exact 400,000/400,001 boundary, accessible completeness notice, and synthetic browser preview pass. |
| T31 Enter during IME | Spec 35; composition ordering, `isComposing`, keyCode 229, Safari ordering, draft retention, and subsequent Enter are covered. |

### Route and state sweep

| Surface | Evidence and limit |
| --- | --- |
| Homepage, login, access status | Homepage and CTA readiness have production browser coverage. `/login`, authorization lifecycle, loading, and unavailable states have component/transport tests (`login-screen.test.tsx`, `operator-access-provider.test.tsx`, `auth-lifecycle.test.ts`, `browser-session.test.ts`); no separate browser login/access-status journey was added. |
| Demo session, metadata, intro, overview, creation | Browser coverage includes pending entry, metadata failure/retry, intro/revisit/deep link, overview, setup, and creation. `demo-failure.spec.ts` fails closed on missing metadata, seed, tape, corrupt session, interrupted stream, and backend outage. |
| Meeting lists and room | Demo browser journeys cover list, room discussion/dock/record/details/files/closing/summary/history/archive/unarchive. Live navigation, failed-list recovery, and operator/demo isolation are in mixed E2E. A true live database room was not available locally; live room behavior remains covered by component and integration tests. |
| Persona list/new/editor/history | `demo-guidance.spec.ts`, `demo-roster.test.tsx`, and the persona editor tests cover list, new, editor, prompt history/diff, inspection, activation, drafts, and recorded snapshot exploration. |
| Knowledge stacks and evidence | Demo guidance, shared-documents, evidence-preview, local-document, and ingestion/retry/revocation tests cover list/new/detail, sample picker, queued/indexing/ready/failed, retry, deletion/revocation, and source preview. |
| Settings, vault, providers, diagnostics, appearance | Settings and vault suites cover all five sections, vault states, provider tests, System AI, diagnostics, appearance, themes, reduced motion, and “Only available in live.” Demo settings are browser-tested; hosted provider calls are conditional. |
| Cross-route dialogs, notices, reset/restart, compatibility | Intro, notices, failure, replay isolation/resilience, appearance, mixed-operator, legacy journey, and package publication tests cover confirmation/hide-resume/deep links/retired-package/fallback/reset/restart. No screen silently converts a failed read to empty; prior content/drafts are retained under scoped recovery. |

### Visual and accessibility evidence

- Browser coverage uses Chromium at 320×800, 320×720, 320×844, 390×844,
  640×360 at 200%, 768, 1024×768, 1366×768, 1440×900, and 1920×917.
- Both themes, System/Light/Dark reload behavior, chrome contrast, tutorial
  surfaces, room starfield, reduced motion, and theme-independent memory-only
  preference are covered by `appearance.spec.ts` and the homepage/intro suites.
- Keyboard focus, Escape return, dialog titles/descriptions, skip link, native
  controls, screen-reader-only step text, and 200% text are covered by
  `demo-accessibility.spec.ts`, `demo-introduction.spec.ts`, and
  `homepage.spec.ts`.
- Touch-target checks cover the 44px Live trigger (48px coarse) and narrow
  mobile layouts. Visible focus is exercised in the Live dialog, intro, evidence
  inspector, and revision/preview dialogs.
- Spec 31's two-thirds resting discussion-height requirement was re-measured
  after the dock/nav changes at 1440×900, 1920×917, and 1024×768 (ratio at least
  two-thirds). At 200% text the discussion measured 39px with a 224px capped
  dock, no horizontal overflow, and the dock outside the tab order.
- Single viewport ownership is preserved: removing the persistent header
  returns the full dynamic viewport to the route and the fixed Live trigger adds
  no layout height. Solid reading/fallback surfaces cover WebGL failure, context
  loss, reduced motion, and unsupported effects.
- No dedicated screen-reader session, Firefox/WebKit run, physical-device
  review, forced-colors review, 400% zoom trace, or composited-contrast table
  was produced. The local evidence is Chromium automation plus semantic/focus
  inspection. Spec 31/32 hosted, field, and visual-review limits remain open.

### Executed checks

- Backend `pytest -q -n 4`: **1026 passed, 1 skipped, 80 warnings** in 429.58s.
  The skip is the existing environment-dependent skip; no new skip was added.
- Frontend `npm test`: **143 files / 903 tests passed** in 39.88s.
- `npm run test:architecture`: **7 files / 52 tests passed**.
- `npx tsc --noEmit`: passed.
- `npm run lint`: **0 errors, 13 pre-existing warnings**.
- `npm run build`: Next.js 16.1.4 production build passed; 20 static pages
  generated and all 26 route entries built.
- `python -m scripts.export_openapi --check`: **60 paths**, no drift.
- `python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5-v12`:
  valid, package id `hdfc-ine001a07rw5`, version `12`.
- `test_replay_project_polish_package.py`: 3 passed (hash pin, rejected-copy /
  no-practice scan, legacy-profile preservation).
- Production Playwright: **90 passed, 4 skipped** in 2.1m after the final v12
  provisioning. The four skips are the opt-in legacy journey (1) and mixed
  operator (3).
- Legacy Playwright (`test:e2e:legacy`): **1 passed** in 22.4s against the v5
  fixture.
- Mixed operator Playwright (`test:e2e:mixed`): **3 passed** in 33.0s.
- Exact rejected-phrase scans of v12 and current docs: no hits.

### Conditional skips and outstanding limits

- No hosted publication, activation, compatibility probe, or hosted rollback
  was performed. Local publication tests cover immutable republish, activation,
  retirement, pruning, and pinned-version readability; the unconfigured replay
  boundary returns 503 with no live fallback.
- No live Supabase operator session, paid provider call, hosted keyless probe,
  or live closing credential exercise was run. Those paths remain covered by
  request-level tests and explicit capability/refusal tests only.
- No Firefox/WebKit, real mobile device, virtual keyboard, forced-colors, 400%
  zoom, dedicated screen-reader, or measured low-end GPU/performance run was
  produced. The local run is Chromium production mode. No committed
  visual-regression baseline exists; the intro and homepage visual checks are
  local browser assertions and screenshots/traces, not a pixel-diff gate.
- Specs 31/32 hosted, field, visual-review, and performance checks are not
  erased or satisfied by this local record.

### Commits

- `5864573` test(e2e): align room marks and closing outcome assertions
- `cb800dc` fix(package): retire stale journey and practice copy
- `3c85af0` feat(package): build validated demo package v12
- `8062c8e` docs: align package, route, and acceptance facts
- `7b075b3` test(e2e): expect the validated v12 package
- `b461289` test(e2e): align legacy and reset journeys
- The Spec 46 acceptance record and specs-index commit is this commit.
