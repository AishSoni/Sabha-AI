# Project Polish Audit Reference

Supporting evidence for [Spec 33](spec-33-application-experience.md) and Specs
34–46; not an additional implementation assignment. Preserved from the initial
consolidation and follow-up source audit dated 2026-11-08. No browser reproduction,
application test execution, performance measurement, or implementation is claimed.

Paths/line numbers are discovery anchors, not an automated patch plan. Reconfirm
them before editing. Spec 34 owns the copy register; feature owners remove or
update their affected flows, and Spec 46 checks integrated coverage. Record each
copy row as changed, removed with obsolete flow, or deliberately retained with a
reason. Technical defect ownership is explicit below; acceptance lives in the
owner spec rather than being duplicated here.

## A. Demo terminology fix register

A row covers every visible string in the specified source/field family, including
surfaced errors outside JSX. Raw matches are not unique user-facing defects. The
frontend source search returned 1,957 matches, many technical IDs/comments/fixtures.

### A.1 Frontend entry, overview, setup, lists, and settings

Paths in A.1–A.4 are relative to `frontend/src/`.

| Source and audit anchors | Strings and action |
| --- | --- |
| `features/homepage/presentation/copy.ts:8,13–14,26–27` | Try the recorded demo; prepared-demo/shared-material/prepared-turn explanation; Illustrative view of the prepared demo; prepared advisory meeting/recorded session footer; Explore the recorded demo. Specs 34/44; preserve approved design. |
| `features/homepage/presentation/evidence-graph.ts:44,67,78,89,100` | Role description about demo-authored scenarios; Prepared historical terms; Credit Analyst practice stack; Demo-authored downside worksheet; Portfolio Analyst practice stack. Rewrite visitor-facing copy while retaining fictional/scenario facts. |
| `features/homepage/presentation/evidence-graph.ts:180,188,196,204,211,218,225` | Prepared Credit Analyst/Downside/Portfolio response connection descriptions and citation IDs. Remove qualification without inventing different relationships. |
| `features/access/ui/operator-shell.tsx:59` | Recorded demo link: remove from live navigation, not rename. Live/on-demand navigation belongs to Spec 40. |
| `features/access/ui/access-status-screen.tsx:38,44` | Guided replay remains available without an account; Open guided replay. Use Demo. |
| `features/access/ui/login-screen.tsx:177,238,287` | Public visitors can open guided replay; Open guided replay; Return to guided replay. Use Demo across access states. |
| `app/demo/page.tsx:59,72,74,78,82,99,158,169` | Loading the prepared board; Prepared demo badge; Recorded responses/not live qualifier; Prepared board fallback; prepared-participant/recorded-meeting fallback; Prepared participants; Compare with practice template; Prepared meeting preset. Use scenario title, Participants, Meeting setup; remove separate-branch link. Package-fed copy also needs A.6. |
| `app/demo/new/page.tsx:82,94,105–110,145,179,182,190,239,242` | Unsupported recording creation error; recorded creation load error; Prepared demo; Recorded creation record/explanation; Recorded intake ready; Recording creation; Create recorded meeting; Recorded setup; Prepared historical document; document supplied with recording. Retain stages with actual action/state language. |
| `app/demo/new/page.tsx:120–130` | Try editing this setup and Practice only/unavailable-for-recording explanations. Remove separate configuration branch. |
| `app/demo/chapter-bootstrap.tsx:100,130,134,136,147,163` | Recorded chapter restore error; retired recorded package/prepared actions; chapter outside pinned recording; Recorded chapter unavailable; Open the recorded board; Restoring recorded chapter. Consistent Demo recovery, preserving retirement/identity semantics. |
| `app/demo/meetings/[id]/recorded-meeting-route.tsx:63–64` | Replay has not reached room; returning to prepared board. Consistent destination and safe routing. |
| `app/demo/meetings/page.tsx:51,59,71,73,78,228,238–239,297–298` | No archive step in recording; recorded archive load error; Prepared demo; Recorded meeting list; Open recorded meeting/archive ended record; Loading recorded meetings; no active/ended or archived recorded meeting; Archive recorded meeting tooltip. Exact lifecycle/object language. |
| `app/demo/meetings/page.tsx:89–190` | Entire Practice setups section: heading, empty state, badge, sample count, open action, discard explanation. Remove obsolete flow; preserve confirmation for retained discardable memory edits. |
| `app/demo/settings/page.tsx:19,40,44,47,64` | Recorded demo settings; Practice edits lifetime; Restart recording; Recorded content historical disclosure; Start recorded meeting. Settings, distinct Demo reset/restart, historical details, Only available in live. |
| `features/demo-workspace/ui/demo-nav.tsx:134–135` | Reset confirmation combines lost Practice edits and recording returning to first step. Describe actual scope; do not collapse distinct restart/reset commands. |
| `features/demo-workspace/provider.tsx:89,150,163,171` | Reset discarded practice change; expansion/pinned recording mismatch/disabled Practice features; old recording lacks practice workspace; seed unavailable. Coherent scoped Demo recovery, not competing mode aliases. |
| `features/demo-workspace/seed.ts:53,355,416` | Practice prompt-size/setup limit; prepared-sample chunk validation errors. Reword surfaced failures; remove setup validation only with obsolete owner. |

### A.2 Guidance, personas, knowledge, samples, and obsolete routes

| Source and audit anchors | Strings and action |
| --- | --- |
| `features/demo-tutorial/contract.ts:95,110` | Create the recorded meeting. Match the actual retained control. |
| `features/demo-tutorial/objectives.ts:118,188,238` | Choose recorded reply; Create recorded meeting twice. Change through shared progression/guidance policy. |
| `features/demo-tutorial/guide.tsx:65–66` | Recorded meeting archived/Practice edits/Both tours optional; Nothing saved or activated/recording unchanged. Actual finale/tour outcome, not implication that editing occurred. |
| `features/demo-tutorial/explore-menu.tsx:37,45,100` | Explore recording accessible name/label; Restart recording. Demo; chapter titles also A.6. |
| `features/demo-tutorial/notices.tsx:221` | Recorded updates accessible label: Updates or Demo updates. |
| `features/persona-catalog/local/demo-catalog-gate.tsx:17,26,30,36` | Loading practice workspace; Practice personas unavailable; no practice workspace/prepared board/recorded journey; Back to prepared board. Also fix malformed ellipsis encoding. |
| `features/persona-catalog/local/demo-persona-roster.tsx:29–30,38` | Practice personas; temporary templates/prepared participants; deletion notice about practice prompt history/snapshots and recorded participants. Accurate Persona/Participant semantics. |
| `features/persona-catalog/local/demo-persona-detail.tsx:75,82,96` | Practice template/prepared board/recorded participant notice; Back to recorded meeting; authored practice history/model-run explanation. Retain version/date truth. |
| `features/persona-catalog/local/demo-persona-new.tsx:26` | New practice snapshots/prepared board/document management arriving in later chapter hint. Replace stale sequencing and describe actual assignments. |
| `features/persona-catalog/local/demo-snapshot-panel.tsx:83,89,110,184,193,202,205–206,229,246,249–251,260,264` | Captured practice participant success/failure; Practice participant snapshot; Capture practice snapshot; prepared participant versus practice template; recorded snapshot; unchanged prepared participant; practice template active version; no prepared link/recorded participant; captured practice snapshots/empty state. Consistent domain nouns; reassess redundant branch controls. |
| `features/persona-catalog/local/state.ts:128,138,143,296,301,366` | Practice catalog/persona/prompt/budget limits; base instructions unavailable for recording. Keep bounded memory limits. |
| `features/persona-catalog/local/transport.ts:62` | Reset discarded practice change. Describe actual scope. |
| `features/knowledge/local/demo-knowledge-gate.tsx:17,26,30,36` | Loading practice knowledge workspace; Practice knowledge unavailable; no practice workspace/prepared Files/recorded journey; Back to prepared board. Knowledge/Demo with scoped recovery. |
| `features/knowledge/local/demo-stack-detail.tsx:79,83,89,112,128–129,139,160,170,218–219,230,265–266,290,292` | Practice stack unavailable; recorded evidence unchanged; Back to practice stacks twice; Practice documents; Prepared samples/simulation eligibility; deletion/empty notices; Saved practice participants; edit practice stack/recorded assignments; Practice stack destination; assignment empty state; prepared-simulation readiness/ineligible practice view. Keep assignment/readiness facts, remove competing branding. |
| `features/knowledge/local/demo-stack-list.tsx:23–25,41` | Browser-memory/recorded Files/citations notice; delete practice documents/participants. Concise truthful effects. |
| `features/knowledge/local/demo-stack-new.tsx:27,30,33,42` | Back to practice stacks; New practice stack; no operator stack/recorded participant assignment; current practice contents versus new snapshots. Knowledge stack/construction semantics. |
| `features/knowledge/presentation/stack-list.tsx:143` | No practice participant assigned. Use Participant. |
| `features/knowledge/presentation/sample-picker.tsx:95,97,116,190` | Add prepared sample; approved practice library; no prepared samples; prepared simulation Ready eligibility. Add sample/sample library and truthful readiness. |
| `features/knowledge/presentation/recorded-examples.tsx:45,50–53,72` | Recorded example using prepared input; recorded-HDFC/prepared-asset/practice-edits disclaimer; Recorded excerpt. Clear example/source labels without claiming fresh retrieval. |
| `app/demo/knowledge-stacks/[id]/stack-route.tsx:82,88–89` | Recorded evidence fallback; Preview recorded example label and accessible name. Update all three. |
| `features/knowledge/local/use-local-documents.ts:45,53,223,232,259,271` | Prepared sample unavailable; two prepared documents processing; Practice documents unavailable; verification/reset errors. Retain useful adapter/limits for main journey. |
| `features/knowledge/local/document-state.ts:132` | Prepared ingestion stopped before indexing fallback: actual failed outcome. |
| `features/knowledge/local/sample-source.ts:55,66,80,91,98,111,120,126,133,143,150` | Prepared sample prefix in missing/invalid source, unsafe URL, unpublished asset/metadata, size, fetch, mismatch, media type, verification/hash errors. Reword prefix, preserve every check. |
| `app/demo/new/practice-setup-screen.tsx:55,59,67,144,147,191,197–205,210,220` and `practice-setup-route.tsx` | Remove separate composition: unavailable seed, back to recorded intake, sample chooser, saved setup, title/create/busy/notice, original recording link, document destination. Move useful sample handling. |
| `app/demo/meetings/[id]/practice-meeting-screen.tsx:60,85,89,123,126,143,151,156–157,162,225,236,257,281,290` and `practice-meeting-route.tsx:80,86–87` | Remove separate meeting experience: unavailable/captured notices, title/badge/discard, unchanged recording, original link, document empty/delete, prepared Files comparison, destination/recorded previews. Preserve reusable preview behavior under new owner. |
| `features/knowledge/local/practice-meeting-state.ts:111,118,125,133,140,149,156,169,195,214,270,273` | Obsolete setup validation: agenda/context, instructions, setup/persona limits, missing persona, staging, processing, attachment failures. Remove only with migrated owner, not shared limits. |
| `features/knowledge/local/use-local-practice-meetings.ts:70,72,74,82,84,125,134,140,150,155,170,182,226,290,299` | Obsolete setup command errors: instructions/limits, unavailable/failed creation, sample library/attachment/duplicate/staging/verification/reset, already creating, final failure. Preserve useful recovery in main path. |

### A.3 Room, playback, closing, summary, and runtime fallback strings

| Source and audit anchors | Strings and action |
| --- | --- |
| `features/meetings/components/MeetingRoom.tsx:1735,1836,1845` | Prepared reasoning twice; recording badge. Reasoning/Demo, truthful retained artifact; vocabulary fixes also Spec 34. |
| `features/meetings/components/ClosingPanel.tsx:315,397,581,599,662` | No supported closing in recording; recorded final summary; Recorded closing; Replay closing; play every prepared reply/follow-up. Closing/Summary, policy-derived eligibility; repeat is an action. |
| `features/meetings/runtime/recorded-director-action.tsx:39,126` | Your turn · Prepared question; Prepared follow-up. Actual question role. |
| `features/meetings/runtime/recorded-participant-action.tsx:82,126` | Labels are package-fed turn/action data. Update source and phase policy. |
| `features/meetings/runtime/playback-controls.tsx:38,66,71,105,137,142` | Prepared turn open error twice; Replaying turn twice; Replay last turn; Replay this prepared turn. Clear repeat actions/errors. |
| `features/meetings/runtime/recorded-documents-panel.tsx:74,79,81,88,90,105,112,135,149,160` | For this replay rights; Prepared for this replay; authored playback files; Demo-authored inputs/public replay; read-only retained-for-replay; no files; Recorded documents heading/status; unavailable checkpoint. Preserve rights/authored versus third-party distinctions. |
| `features/meetings/runtime/recorded-summary-panel.tsx:41,46,55,68` | Recorded summary; Recorded scope/date/version; Recorded system summary; missing approved summary. Summary, historical detail, useful recovery. |
| `features/meetings/runtime/replay-session.tsx:89,107,110,112,127,129` | Recording unavailable; Recorded replay not configured; Recorded demo unavailable; fallback recording error; Loading guided replay; fetching recorded package/checkpoint. Demo plus useful recovery. |
| `features/meetings/runtime/replay-run.tsx:147,356,378,396,444,455` | Missing prepared base; turn outside recording; prepared result unavailable; cannot replay prepared turn; no prepared closing; play all prepared replies/follow-up. Unified object errors/policy. |
| `features/meetings/runtime/replay-run.tsx:544,549,578,603,704,708,737,759,827,841,852,883,897,921,925,996,1003,1024` | Session/checkpoint/recorded snapshot errors; recorded intent unavailable; prepared action/result at recorded moment; closing checkpoint; cannot replay; recorded chapter; missing stats/closing; Recorded turn not found. All branches, stable internal IDs/codes. |
| `features/meetings/runtime/replay.tsx:461,603,750,752,833,847,918,991,993` | Recorded session fallback; Replay read-only; another recorded moment; preceding prepared action; missing stats/closing; Recorded meeting not found; Recorded label/notice. Compatibility composition must not retain old branding. |
| `features/meetings/runtime/replay.tsx:1030,1033,1036,1039,1042,1045,1157,1168,1188,1191,1214,1274,1278,1290,1303,1316,1324,1326,1335,1338,1340,1347` | Missing deck/follow-up/closing/archive; recording/meeting/session/checkpoint mismatch; recorded intent/turn/chapter; Loading recorded session; fetching replay composition; Recorded replay not configured; Recorded session unavailable; Restart replay. Preserve isolation/compatibility. |

### A.4 Evidence errors and source labels

| Source and audit anchors | Strings and action |
| --- | --- |
| `features/meetings/evidence/dialog.tsx:50,70,75` | Recorded asset declared-origin fetch, evidence type mismatch, revision-byte mismatch. Source file/retained revision; preserve exact identity. |
| `features/meetings/runtime/replay-evidence.ts:51,53,79–80` | Demo-authored input; Prepared for this replay; no recorded public URL; empty recorded asset. Accurate source labels. |
| `features/meetings/runtime/replay-evidence.ts:145,149,157,162,169,173,178,204,245,255,271,276,284,294,301` | Recorded asset blocked/unreachable/unavailable/large/unsupported/HTTP/read/PDF/unpublished/size/type/integrity errors. Reword stem, preserve verification and recovery. |

`ThinkingBlock.tsx`'s prepared-artifact comment is not display copy; visible
provenance comes from MeetingRoom. Developer-only provider misuse errors and
`ClosingPanel`'s live-only usage note are not additional Demo branding instances.

### A.5 Backend display defaults and surfaced errors

Paths are relative to `backend/`.

| Source | Inventory and action |
| --- | --- |
| `app/replay/contracts.py:67`; `app/replay/package/model.py:1007` | Recorded session display default: Demo, including older-package fallbacks. |
| `app/replay/http.py:147,256,347,364,405,433` | Recorded meeting/turn/closing/asset not found: consistent object messages, stable codes. |
| `app/replay/reads.py:76,83,91,99,106,114,120,128,139,145,155,174,179,196,204,206` | Recorded read unavailable/corrupt; meeting identity/list/disagreement/consensus/stats/documents/closing/operations/safe-config errors; turn not found. Separate safe explanation from diagnosis. |
| `app/replay/runtime.py:91,101`; `app/replay/source.py:309,315,560,622`; `app/replay/streaming.py:56` | Package not configured/store unavailable; turn/closing not recorded; concurrent stream limit. Normalize presentation, keep retry/diagnostics. |
| `app/replay/http.py:103,118,130,135,138,153,169,229,409,443` | Keep `replay_*` machine codes; map to consistent visible messages. |
| `app/replay/package/validate.py`, `app/replay/package/model.py` | Publisher/schema technical validation is not automatically branding. Keep mechanism terms; do not accidentally expose raw internal errors as copy. |

### A.6 Package authoring and replicated content

Audited directories are `backend/replay_packages/hdfc-ine001a07rw5/`,
`backend/replay_packages/hdfc-ine001a07rw5-v8/`,
`backend/replay_packages/hdfc-ine001a07rw5-v9/`, and
`backend/replay_packages/placeholder-analyst/`. The selected deployment is unknown.
Publish a new validated version, not edited old bytes. Explicitly retire old
versions or audit their compatibility presentation; do not leave forgotten aliases.

#### Generator — repair before generating copies

`backend/scripts/build_guided_package.py`:

| Audit anchors | Copy family |
| --- | --- |
| `74,244,372–415,623` | Historical disclosure; scenario-for-replay; branch notes/locators; Prepared for this replay source. |
| `765,779,793,840,842,857–890,909` | Revision reasons; stacks; sample descriptions/accessibility; Prepared simulation failure. |
| `921–926,934–937,1208,1396,1429,1433` | Workspace disclosures; obsolete intake; historical context; board title; receipt note; Guided replay notice. |
| `2626,2829–2992` | Repeated exploration-path explanation; chapter titles/objectives/disclosures. |
| `3238,3240,3281,3283,3295,3310,3325` | Source/rights display metadata, with accurate authorship. |
| `3774,3795,3801,3805,3824,3932,3939,3962,3989` | Journey instructions, prepared/recorded explanation, intake notes. |
| `4036,4055,4057,4070–4073` | Guided title/default provenance/Guided replay label and final Prepared Demo override. Fix final override as well as defaults. |

Filename, schemas, runtime IDs, provenance flags, chunk metadata and hashes are
technical contracts, not alternate public mode names.

#### HDFC manifests

| Package/file | Display-field inventory |
| --- | --- |
| v9 `manifest.json:7,90,92–93` | Prepared title/provenance/Prepared Demo label/recorded disclosure. Title/Demo change; provenance stays truthful. |
| v9 `manifest.json:352,373,379,383,404,437,476,548,555,586` | Board/create/intake/preset; prepared retrieval; authored worksheet/fictional mandate; closing/ballot; no reopening. Preserve substantive facts. |
| v9 `manifest.json:721,736,753,770,787,804,821,838,853,870,887,904,919,936,953,970,985,1002,1019` | Every Prepared exploration path transition explanation can surface. |
| v9 `manifest.json:1025,1031,1040,1045,1057,1070,1076,1091,1097,1111,1117,1129,1135,1149,1154,1168–1169,1174,1195,1211,1231,1251,1270` | Board/setup/practice-editing; Recorded sources/facts/turn/disagreement/follow-up/consensus/closing/summary/branch titles, objectives, disclosures; archive statement. All chapters. |
| v9 `manifest.json:1363,1403–1404,1410–1411,1418,1425,1432` | Authored-for-replay claims, branch/follow-up titles/locators; coordinate tapes/retrieval. |
| v8 `manifest.json:7,92–93,352,1025,1031` | Same prominent title/mode/disclosure/board families; audit corresponding transitions/chapters/claims for retained compatibility. |
| Base `manifest.json:7,81,83–84,307,328,334,338,359,503,510,541` | Guided title/label/provenance/disclosure, board/setup/intake/journey/closing. |
| Base `manifest.json:676,691,708,725,742,759,776,793,808,825,842,859,874,891,908,925,940,957,974` | Repeated prepared exploration-path explanations. |
| Base `manifest.json:980,986,995,1000,1012,1025,1031,1046,1052,1066,1072,1084,1090,1104,1109,1123–1124,1129,1150,1166,1186,1206,1225` | All chapter/objective/disclosure variants. |
| Base `manifest.json:1318,1358–1359,1365–1366,1373,1380,1387` | Claim/source/branch/follow-up titles and locators. |

#### Workspace seeds, assets, tapes, and retrieval

Reconcile these repeated field families across every version still supported.

| File/family under HDFC package | Display-field inventory |
| --- | --- |
| v9 `workspace_seed.json:6–7,24,36,47,57,63,84,90,103,109,115,121,127–128,145–146,166–167,187–188,209,217` | Practice/recording disclosures, authored/practice revision reasons/scenarios, shared/recorded stacks, obsolete preset, sample/accessibility text, simulation retry failure. Preserve IDs/metadata/authorship. |
| `assets/index.json` v9 `10,12,53,55,67,69,82,84,97,99` | Prepared for replay / Demo-authored sources and rights; preserve authored/third-party/fictional distinctions. |
| `assets/private/credit-evidence.md:3`; `assets/shared/hdfc-v007-shared-fact-sheet.md:3` | Prepared evidence/historical educational replay descriptions visible in preview. |
| `assets/private/downside-worksheet.md:1,3,7`; `assets/private/portfolio-mandate.md:1,3` | Authored/fictional titles and prepared explanations; non-issuer/fictional facts remain. |
| `tapes/tape-consensus.json:162,165`; `tapes/tape-prepared-consensus.json:162,165` | Prepared source/authored-for-replay snippet. |
| `tapes/tape-downside.json:154,157`; `tapes/tape-prepared-downside.json:154,157` | Same source/snippet pattern, not genuine recorded financial terms. |
| `tapes/tape-credit-liquidity.json:96–97,101`; `tapes/tape-downside-covenant.json:82–83,87` | Prepared source/title/follow-up locator. |
| `tapes/tape-downside-first.json:110–111,113,115` | Prepared source/title/path snippet/branch locator. |
| `tapes/tape-portfolio-after-first.json:96–97,99,101`; `tapes/tape-portfolio-first.json:96–97,99,101` | Prepared source/title/path/mandate-first locator. |
| `tapes/tape-red-team.json:110–111,115` | Prepared source/title/red-team locator. |
| `retrieval/retrieval-downside-first.json:67,70`; `retrieval/retrieval-downside.json:89,92` | Prepared source/authored snippet; corresponding base paths also found. |

Do not change genuine `Recorded value` in `assets/evidence/crisil-annexure.md:8`.
The six closing tapes `tape-closing.json`, `tape-closing-covenant.json`,
`tape-closing-first.json`, `tape-closing-liquidity.json`,
`tape-closing-portfolio-first.json`, `tape-closing-red-team.json` contain ordinary
statements that facts/unknowns/terms are recorded; these are not mode aliases.
Prepared-credit/portfolio tape matches that are only technical IDs stay unchanged.

#### All checkpoint projections

The audited tree has **94 HDFC checkpoint files**: 28 base, 33 v8, 33 v9.
The v9 visible-field search had 344 matches, many duplicates, not unique defects.
In each supported projection reconcile:

- `safe_config.board.title`, commonly line 9: Prepared board for recorded meeting,
  role-facing `persona_summary`, and long scenario title.
- `board.preset.context`, v9 commonly 65: Prepared historical committee review;
  also meeting/list context including common `agenda` near line 116.
- Receipt note near 104: Recorded intake; disclosure near 106: prepared historical/
  educational; settings notice near 110: Guided replay, not live research.
- Nested citation `source`, `title`, `snippet`, `locator`: prepared/authored-for-
  replay/branch/follow-up descriptions repeated from manifests and tapes.

Every filename below has prefix `checkpoints/checkpoint-` and suffix `.json`.
Names/IDs do not need to change.

| Present in base, v8, and v9 | Additional in v8 and v9 |
| --- | --- |
| initial | prepared-base |
| created | prepared-credit |
| credit | prepared-downside |
| credit-liquidity | prepared-portfolio |
| downside | prepared-consensus |
| downside-first | — |
| downside-covenant | — |
| portfolio | — |
| portfolio-first | — |
| portfolio-first-2 | — |
| followup | — |
| followup-first | — |
| followup-liquidity | — |
| followup-covenant | — |
| consensus | — |
| red-team | — |
| closed | — |
| closed-first | — |
| closed-liquidity | — |
| closed-covenant | — |
| closed-portfolio-first | — |
| closed-red-team | — |
| archived | — |
| archived-first | — |
| archived-liquidity | — |
| archived-covenant | — |
| archived-portfolio-first | — |
| archived-red-team | — |

#### Placeholder/fallback package

| `placeholder-analyst/` source | Display-field inventory |
| --- | --- |
| `manifest.json:7,33,73` | Recorded placeholder title/label; Review recorded answer. Preserve synthetic-fixture status. |
| `tapes/tape-credit-analyst.json:48,57`; `assets/synthetic-issuer-brief.md:10`; `retrieval/retrieval-credit-analyst.json:15,27` | Recording claim/Placeholder recording/source/passage/snippet, retaining fiction facts. |
| `assets/index.json:10` | Synthetic fixture authored for replay slice explanation. |
| `checkpoints/checkpoint-initial.json:9,38,111`; `checkpoint-active.json:9,56,164`; `checkpoint-completed.json:9,54,96,227`; `checkpoint-closed.json:9,54,113,262` | Repeated names/content/notices: fix compatibility or explicitly retire production fallback. |

### A.7 Tests that currently preserve rejected copy

Update visible-string fixtures/assertions, not every technical test name. Preserve
isolation, exact evidence, memory lifetime, and failure guarantees. In rows starting
`features/`, paths are under `frontend/src/`; sibling names share the named directory.

| Source | Audit anchors and follow-through |
| --- | --- |
| `frontend/e2e/demo-copy.spec.ts` | Negative checks `19–24`; contradictory positive old-copy expectations `55,63,70,74,77,87,94,109,114,126,150,152,168,178`. Update positives; retain/expand ban policy. |
| `frontend/e2e/demo-accessibility.spec.ts` | `131,256,259` accessible/visible expectations. |
| `frontend/e2e/demo-failure.spec.ts` | `38,90,192` failures. |
| `frontend/e2e/demo-hud.spec.ts`; `demo-notices.spec.ts` | `48,51`; `21`. |
| `frontend/e2e/exploration-playback.spec.ts`; `guided-journey.spec.ts` | `16`; `47,49`. |
| `frontend/e2e/homepage.spec.ts` | `40,58,84,92,298,317,452,477,480`; add actual headline visibility/inspector focus cases. |
| `frontend/e2e/integrated-practice.spec.ts`; `legacy-journey.spec.ts` | `29`; `41,71,73`; preserve compatibility guarantees. |
| `frontend/e2e/replay-isolation.spec.ts`; `replay-resilience.spec.ts`; `room-reading-space.spec.ts` | `43,94,118,122`; `31`; `12`; keep network/geometry assertions. |
| `frontend/tests/unit/homepage-content.test.ts`; `frontend/tests/unit/runtime-scope.test.ts` | `32,166`; `29`: CTA, prepared/support expectation, Recorded fixture label. |
| `frontend/tests/fixtures/demo/journey.ts` | `170,175,179,198,202,206,225,279,333,338,361,382,386,439,442,453`. |
| `frontend/tests/fixtures/demo/workspace.ts` | `22–24,31,49,126–127,146–147,167,186–187,196`. |
| `frontend/tests/integration/demo-journey.test.tsx` | `251,256,258,328,330,386`. |
| `frontend/tests/integration/demo-chapters.test.tsx` | `42,47,79,107,113,121,123,135,171,186,188`. |
| `frontend/tests/integration/demo-knowledge-stacks.test.tsx` | `243,245,410,420,430,448,497,534,543,547,556,560`. |
| `frontend/tests/integration/demo-roster.test.tsx` | `221,282,289,294,328,351,427,431`. |
| `frontend/tests/integration/demo-workspace.test.tsx` | `171,185,278`. |
| `frontend/tests/integration/recorded-summary-panel.test.tsx`; `replay-runtime.test.tsx` | `38,63,65,70`; `182,250,401`. |
| `frontend/tests/integration/demo-practice-meetings.test.tsx`; relevant setup E2E | Replace obsolete flow coverage with main-journey shared documents/reset/isolation, not deletion of guarantees. |
| `features/knowledge/presentation/recorded-examples.test.tsx` | `21,24`. |
| `features/knowledge/presentation/sample-picker.test.tsx` | `16–17,36,78,163,172`. |
| `features/knowledge/presentation/document-panel.test.tsx` | `25,131,135`; queued-row retry behavior also changes. |
| `features/meetings/components/MeetingRoomThinkingBlock.test.tsx` | `11,15`. |
| `features/meetings/runtime/playback-controls.test.tsx` | `68,81,85`. |
| `features/meetings/runtime/recorded-documents-panel.test.tsx` | `21,23,36,76,91,95,109`. |
| `features/meetings/runtime/replay-evidence.test.ts` | `58,80,82`. |
| `features/demo-tutorial/objectives.test.ts` | `181,219`. |
| `frontend/src/features/meetings/runtime/prepared-deck.test.ts`, `replay-decoders.test.ts`, `replay-run.test.tsx`; `frontend/src/features/meetings/api/use-turn-observation.test.tsx`; `frontend/src/features/meetings/hooks/use-recorded-closing-text.test.tsx` | Respectively `119`; `9–10`; `64–65,102–103`; `308,356,358`; `39,48,50`. First three share runtime directory; keep technical types. |
| `backend/tests/fixtures/replay/build_packages.py:897`; `backend/tests/unit/test_replay_package_validation.py:122,127` | Role-history/board objective/disclosure fixtures; technical test descriptions are not UI bugs. |
| `frontend/tests/fixtures/openapi.json`; `frontend/src/shared/api/generated.ts` | Regenerate for actual changed display defaults/schema descriptions, not manual route/type replacement. |

Use whole-phrase/boundary-aware negative checks: genuine “terms were recorded”
is not a forbidden mode alias. Cover fallbacks, accessible names, chapters,
preview text, errors, confirmations—not just the first route's body.

### A.8 Current documentation and historical requirements

| Source | Audit anchors/action |
| --- | --- |
| Root `README.md` | `12,29,46,59,105,142,144,146,301,377,379,384–385,480`: product badge/surfaces/contents/features/entry/journey/status; correct persona snapshot contradiction. |
| `frontend/README.md` | `3,8,51,53–56,93,126,132–133,200`. |
| `backend/README.md:318` | Generator help/product copy, not technical package terminology. |
| `docs/OPERATIONS.md:14,26,607–648` | Product routes/journey/reset descriptions; preserve config/schema names. |
| `specs/README.md:3,7,36–43,74` | Current-target narrative versus historical titles. Split updates index; implementation completes current-copy audit. |
| `specs/reference-runtime-modes-and-credentials.md:30`; `reference-architecture-contracts.md:30`; `reference-review-evidence-and-fixtures.md:14`; `reference-api-use-case-inventory.md:256` | Demo in product descriptions, replay valid for mechanisms. |
| Spec 18 content `93,122,280,282,284`; Spec 18 main `36,45`; Spec 22 `282,285`; Spec 25 `184`; Spec 26 content `143`; Spec 28 `126,137,148,164`; Spec 29 main `196,291,305`; Spec 30 main `60`; Spec 32 `150,173,290,321,363–364` | Superseded visible aliases/journey requirements; preserve historical evidence and approved design. |

No additional matching product copy was found in frontend public JSON/Markdown/
HTML/text, app Markdown/MDX/HTML, or GitHub workflows. Dependencies, caches, builds,
secrets, and generated technical identifiers are excluded. Re-scan at implementation
time; later changes can introduce visible instances.

## Technical defect register

Each T ID has one implementation owner. Source anchors below preserve both audits;
required behavior/tests are in that spec. Abbreviated feature/sibling paths remain
under the explicitly named feature. These are not browser reproduction records.

| ID | Owner | Finding and source anchors |
| --- | --- | --- |
| T01 | [36](spec-36-document-and-creation-recovery.md) | Disconnected upload observation: `frontend/src/features/knowledge/components/DocumentPanel.tsx:36–55,115–136`; `presentation/document-panel.tsx:148–163`; `presentation/upload-progress.tsx:25–30`. |
| T02 | [36](spec-36-document-and-creation-recovery.md) | Status retry versus ingestion restart: knowledge `presentation/upload-progress.tsx:108–121`, `presentation/document-panel.tsx:214–226`, `components/DocumentPanel.tsx:101–111`; `backend/app/modules/knowledge/presentation/http.py:293–335`. |
| T03 | [36](spec-36-document-and-creation-recovery.md) | Committed editable config/mutable upload batch: `frontend/src/features/meetings/hooks/use-meeting-creation.ts:75–89,96–169`; `presentation/meeting-creation-screen.tsx:150–209,242–250,327–355`; `frontend/src/app/(operator)/meetings/new/page.tsx:110–123`. |
| T04 | [36](spec-36-document-and-creation-recovery.md) | Lost-response duplicate admission: creation hook `155–162`; `frontend/src/features/meetings/api/client.ts:26–30,52–62`; `backend/app/modules/meetings/application/meeting_service.py:95–158`; extend analysis to upload receipt loss. |
| T05 | [39](spec-39-personas-editor-and-identity.md) | Prompt-only dirty guard/false 404: `frontend/src/features/persona-catalog/presentation/persona-editor-screen.tsx:72–80,101–109,126–143,295–305,314–322`. |
| T06 | [38](spec-38-settings-and-capability-diagnostics.md) | Stale provider async results: `frontend/src/features/settings/components/ProviderCard.tsx:58–101,123–125,172–174,226`. |
| T07 | [42](spec-42-demo-progression-and-outcome.md) | All replies/count disagreement: `frontend/src/features/meetings/runtime/recorded-participant-action.tsx:46–83`; `replay-run.tsx:351–369,1044–1046`; `frontend/src/features/demo-tutorial/journey.ts:69–88`; `objectives.ts:114–122`. |
| T08 | [43](spec-43-demo-shared-documents.md) | Local samples absent from room inventory: `frontend/src/features/meetings/runtime/recorded-documents-panel.tsx:56–66,103–106`; `frontend/src/features/knowledge/local/use-local-documents.ts`; `demo-stack-detail.tsx:125–203`. |
| T09 | [41](spec-41-demo-introduction-and-guidance.md) | Metadata failure becomes endless board loading: `frontend/src/features/meetings/runtime/replay-session.tsx:57–82,135–139`; `frontend/src/app/demo/page.tsx:42,56–61`. |
| T10 | [40](spec-40-live-navigation-and-meeting-state.md) | List error/empty, ended-as-Active, silent mutation failure: `frontend/src/app/(operator)/meetings/page.tsx:32–33,42–63,97–129`. |
| T11 | [37](spec-37-credentials-and-generation-policy.md) | Vault unlock/errors unwired; deliberately blank key field consumed: `frontend/src/features/settings/state/settings-store.ts:109–152,218,236–251`; `components/ProviderCard.tsx:66–69,89–92,169–196`. |
| T12 | [37](spec-37-credentials-and-generation-policy.md) | False privacy statement: `frontend/src/features/settings/components/ApiKeysSection.tsx:124–129`; `frontend/src/features/settings/api/client.ts:56–84`. |
| T13 | [38](spec-38-settings-and-capability-diagnostics.md) | System AI discovery failure hidden as empty: `frontend/src/features/settings/components/SystemAiCard.tsx:65–77,112,176–179`; `backend/app/modules/settings/presentation/http.py:200–227`. |
| T14 | [38](spec-38-settings-and-capability-diagnostics.md) | Local availability presumed/keyless test rejected: backend settings `presentation/http.py:123–132`, `schemas.py:45–49`; frontend settings store `253–299`, client `79–82`. |
| T15 | [38](spec-38-settings-and-capability-diagnostics.md) | Hidden policy read failure/incomplete capability diagnosis: `backend/app/modules/settings/infrastructure/system_ai.py:53–78`; `backend/app/bootstrap.py:121–125,373–375`; `frontend/src/shared/api/transport.ts:20,28–29`. |
| T16 | [39](spec-39-personas-editor-and-identity.md) | Mark changes at live construction: `frontend/src/components/identity/participant-mark.tsx:31`; persona `presentation/roster-list.tsx:143–150`; `backend/app/modules/meetings/application/construct_participants.py:109–119`; room marks. |
| T17 | [39](spec-39-personas-editor-and-identity.md) | Catalog card sizing/centering/generic snippets: `frontend/src/features/persona-catalog/presentation/roster-list.tsx:134–160,195–203`. |
| T18 | [43](spec-43-demo-shared-documents.md) | Anonymous flex text: `frontend/src/components/ui/card.tsx:10`; `frontend/src/app/demo/meetings/page.tsx:112–123`. |
| T19 | [44](spec-44-homepage-polish-and-lifecycle.md) | Headline lacks hidden-document guard: `frontend/src/features/homepage/ui/home-headline.tsx:29–55`; field handler and `frontend/e2e/homepage.spec.ts:246–268`. |
| T20 | [44](spec-44-homepage-polish-and-lifecycle.md) | Hover/focus replaces pinned content/unmounts preview: `frontend/src/features/homepage/ui/home-evidence.tsx:89–106,249–253,287–365`; `frontend/src/styles/homepage.css:1188–1190`. |
| T21 | [44](spec-44-homepage-polish-and-lifecycle.md) | Partial WebGL init lacks returned destroy owner: `frontend/src/features/homepage/ui/home-field-webgl.ts:371–442,634–673`; `home-persona-field.tsx` creation/catch. Recheck resize DPR. |
| T22 | [35](spec-35-live-turn-and-message-reliability.md) | Oldest-100 queue omits later work: `frontend/src/features/meetings/runtime/live.tsx:52`; `frontend/src/features/meetings/api/turn-client.ts:62–72`; `backend/migrations/019_turn_queue_rpcs.sql:969–1004`. |
| T23 | [35](spec-35-live-turn-and-message-reliability.md) | Polling drops observation before settlement: `frontend/src/features/meetings/hooks/use-meeting-turn-controller.ts:94–110`; `frontend/src/features/meetings/api/use-turn-observation.ts:90–162`; `frontend/src/features/meetings/components/MeetingRoom.tsx:897–917`. |
| T24 | [35](spec-35-live-turn-and-message-reliability.md) | Unkeyed chat/blind cache append: `frontend/src/features/meetings/api/client.ts:89–99`; `frontend/src/features/meetings/components/MeetingRoom.tsx:1125–1177,1208–1210`; `backend/app/modules/meetings/presentation/schemas.py:83–86`; `backend/migrations/021_closing_lifecycle_rpcs.sql:809–844`. |
| T25 | [37](spec-37-credentials-and-generation-policy.md) | Execution override/cooldown provider mismatch: `frontend/src/features/meetings/runtime/live-participant-action.tsx:23–35`; `frontend/src/features/settings/state/settings-store.ts:175–191,236–248`; `backend/app/capabilities/configuration/service.py:161–236`. |
| T26 | [37](spec-37-credentials-and-generation-policy.md) | Browser-key support absent from closing: `frontend/src/features/meetings/api/closing-client.ts:34–69`; `backend/app/modules/meetings/presentation/http.py:109–124,156–164`; `backend/app/modules/meetings/infrastructure/supabase_closing.py:530–534,563–598`. |
| T27 | [40](spec-40-live-navigation-and-meeting-state.md) | Closing read failure treated as absence: `frontend/src/features/meetings/components/ClosingPanel.tsx:241–290`; room observation/admission controls. |
| T28 | [40](spec-40-live-navigation-and-meeting-state.md) | Closed meetings still offered Generate summary: `frontend/src/features/meetings/runtime/live-summary-panel.tsx:60–68`; `backend/app/modules/meetings/infrastructure/summary.py:95–109`. |
| T29 | [40](spec-40-live-navigation-and-meeting-state.md) | False model context budget from all prompts/history versus fixed 128,000: `backend/app/modules/meetings/presentation/meetings_http.py:128–178`; `backend/app/modules/meetings/infrastructure/turns.py:629–671`; `frontend/src/features/meetings/components/MeetingRoom.tsx:1631–1649`. |
| T30 | [45](spec-45-evidence-preview-completeness.md) | Markdown drops truncation flag: `frontend/src/features/meetings/runtime/live-evidence.ts:192–205`; `frontend/src/features/meetings/evidence/renderers.tsx:149–173,264–268`. |
| T31 | [35](spec-35-live-turn-and-message-reliability.md) | Enter submits during IME composition: `frontend/src/features/meetings/components/MeetingRoom.tsx:1183–1190`. |

## Provenance and split record

- Initial consolidation recorded settled choices, proposals, D01–D07, exhaustive
  copy inventory, and T01–T21. Follow-up source audit added T22–T31, emphasizing
  observable paid work, ambiguous delivery, policy/credential consistency, closing,
  telemetry, clipping, and input composition. Neither was implementation evidence.
- The 1,309-line source document is available in Git at commit `05b8140`, path
  `specs/spec-33-application-experience.md`. This reference preserves its audit
  fields/anchors and exclusions; Specs 34–46 now own implementation requirements.
- The split is documentation only. No runtime, published package, credential
  policy, application behavior, or tests are changed by this reorganization.
