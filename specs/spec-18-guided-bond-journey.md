# Spec 18 (Phase 3): One Guided Bond Journey

## Purpose and prerequisites

Turn the accepted [technical slice](spec-17-replay-package-and-streaming.md) into one polished, short, user-paced product journey. Same hosted app, same actual screens, one published historical corporate-bond package. No branches, alternate endings, scenario menu or generic tutorial platform in this release.

Content preparation may start earlier; runtime integration waits for Spec 17. Read the [runtime](reference-runtime-modes-and-credentials.md) and [package](reference-replay-package-and-playback.md) contracts.

## Content approval gate

Create a tracked, reproducible content package and beat sheet. Each beat records user action, objective, supported input, permitted claims with exact source locator, shared/private inputs, read checkpoint, tools/events, resulting checkpoint, disclosure and completion condition. Review the exact displayed text/citations before publication.

Use the retained historical HDFC Ltd bond research as a candidate, not as already approved fixture truth. The working notes refer to ISIN `INE001A07RW5`, a 7.87% coupon, July 2019 issue/July 2022 maturity and a July 2020 rating rationale; independently review every fact actually displayed against packaged evidence. Do not import ignored local files, uncaptured web references or old synthetic checksums as verified source assets. Respect the research folder's instruction not to commit it; publish only a separately reviewed package whose source retention/redistribution is permitted. Do not silently refetch sources to fill gaps.

Keep the meeting's as-of date distinct from source capture and playback dates. No future merger/redemption hindsight in a historical discussion. Coupon is not yield; a rating is not a guarantee; scheduled maturity is not proof of payment. Current prices, executable yield, liquidity, redemption outcome or missing audited details remain unknown unless actually supported. No comprehensive new dossier or paid specialist run is required for honestly labeled authored dialogue.

The outcome is a research checklist separating facts, judgments and unknowns—not a buy/sell recommendation or investment approval. Closing ballots decide whether discussion is complete. Explicitly supersede obsolete prework demands for genuine model runs if approving authored content; never imply those runs happened.

## The single journey

| Beat | User action in real UI | Product lesson and recorded result |
| --- | --- | --- |
| 1. Meet the board | Inspect the prepared Credit Analyst, Downside Reviewer and Portfolio Analyst; inspect knowledge assignments | Persona snapshots and shared/private scope; use meaningful stack names, not raw UUIDs |
| 2. Start the meeting | Complete the supported real creation form and choose the supplied historical document | Recorded intake receipt and processing/readiness progression; no real filesystem upload or write |
| 3. Establish facts | Request Credit Analyst | Stream approved facts, prepared retrieval/tool results and inspectable citations through real SSE |
| 4. Challenge the case | Request Downside Reviewer | Demo-authored risk worksheet informs a reasoned objection and formal disagreement |
| 5. Address uncertainty | Send the supported Director follow-up, then request Portfolio Analyst | Fictional mandate and missing price/liquidity information constrain the conclusion |
| 6. Align | Request the supported concluding discussion | Stream a bounded committee checklist and formal consensus without inventing missing evidence |
| 7. Close | Use the actual close workflow entry | Recorded drain/votes and streamed reasons/final brief; ended checkpoint reconciles coherently |
| 8. Archive | Return to the real meeting list and archive | Recorded archived overlay; underlying ended state remains ended |

Private inputs are clearly demo-authored when fictional. Do not hide essential shared facts just to manufacture disagreement. The supplied document can be a reviewed PDF supported by Spec 16's parser; offline-prepared extraction/retrieval is disclosed. Replay does not claim to parse or index new bytes in real time.

## Entry, supported inputs and guide

- Add a first-visit choice between **set up/use live** and **guided replay** in the same app. Make later switching discoverable. A non-secret preference is optional and separate from ephemeral progress; do not write a backend session or treat choice as authorization.
- Use Spec 14's scoped composition. Keep existing live routes and credentials intact; entering/restarting demo does not cancel live jobs or clear the vault.
- Reuse real form fields, document rows, roster, transcript, tool/citation blocks, scoreboards, closing panel and archive list. Supported presets are explicit. If an input is locked, explain why; never accept arbitrary text/files/customization and return an unrelated scripted answer.
- The guide owns only objectives, stable anchors, permitted step order, next/back/restart and route/tab/focus coordination. It does not own meeting state or perform DOM `.click()` tricks to simulate domain work.
- Completion needs the permitted user action plus the recorded condition. Stream pacing may run within a beat, but timers, refetches and incidental rendering never advance to the next beat. Unsupported cancel/delete/force/retry actions remain unavailable with an explanation, while backend denial remains authoritative.
- Back returns to a previous completed beat in a fresh replay epoch; restart returns to the beginning. Abort/ignore old work; no token-level timeline editor. Refresh restarts honestly; deep links without a cursor recover to the entry checkpoint rather than guessing later progress.

## Focused polish

Maintain a persistent **Guided replay** label and concise disclosure: prepared historical educational content, no live research/current pricing/investment advice, no fresh model charge. Replace replay-inaccurate “live”, “committed”, “saved on demand” and “continues on server” copy through presentation provenance. Do not fabricate thinking traces, usage or savings estimates.

Make source excerpts/locators readable using shared citation UI, stack labels meaningful, and closing controls discoverable. Keep essential targets visible on small screens. Avoid scroll-stealing while users read; honor reduced motion, keyboard operation, focus restoration and accessible status announcements. This is targeted shared polish, not a visual redesign or another nested set of fake widgets.

## Tests to write first and exit gate

Write one full real-route browser journey with the isolated backend/package, covering every beat and supported intent. Add keyboard/small-screen/reduced-motion coverage, disabled off-script actions, source disclosure, private-scope correctness, double clicks, route/tab remount, back/restart and no premature progression. Assert text/tool/citation/scoreboard/closing/archive reads agree at each checkpoint and no live commands/credential access occur.

Validate the approved package offline; every displayed factual citation must resolve to retained evidence and an honest locator. Obtain explicit content/source-rights approval. Existing live creation, summary, closing, knowledge and archive tests stay green.

Exit when one polished linear journey works with the production package, copy and claims are approved, and no extra scenario/platform work is required. This gate does not replace Spec 19's deployment/security acceptance.

## Implementation evidence (29 October 2026)

The approved package is `backend/replay_packages/hdfc-ine001a07rw5` version `1`, content hash `ced67209984ff87088119f58f5b2bcc643fd9240623dfbe02e03ab761c1fb07f`. It is generated only by `backend/scripts/build_guided_package.py` and is recorded in [the content ledger](spec-18-guided-bond-journey-content.md).

Evidence run:

- `python -m scripts.replay_package validate replay_packages/hdfc-ine001a07rw5` → `ok: true`.
- `pytest tests/unit tests/integration/test_replay_package_runtime.py tests/integration/test_replay_publication.py tests/integration/test_replay_sse_socket.py -q` → 122 passed.
- `npm run test:unit` → 213 passed.
- `npm run test:architecture` → 15 passed.
- `npm run build` → compiled successfully; routes `/demo`, `/demo/new`, `/demo/meetings`, `/demo/meetings/[id]` are present.
- `npm run test:e2e -- e2e/guided-journey.spec.ts` → 2 passed. The isolated backend publishes the guided package by default; `--package replay_packages/placeholder-analyst` remains available for the backend fixture.

The journey now has a route-level run provider, a client guide with eight recorded beats, real room/list/form surfaces, recorded intake, source locators, shared/private stack labels, replay closing, archive overlay, first-visit live/replay choice, and a browser acceptance slice covering source disclosure, private scope, keyboard use, reduced motion, a small viewport, back/restart, deep-link reset, and the absence of live meeting mutations.

Known follow-up at this gate:

- Spec 19 remains responsible for the deployed reader grants, Storage bucket visibility, proxy/SSE behavior, two-visitor isolation, and mixed live/replay state on the hosted environment. The local acceptance slice does not claim those checks.
- The closing panel switches to the canonical completed closing checkpoint before the recorded closing tape plays; the guide waits for the tape's summary terminal before it enables Continue. This keeps the canonical votes visible while the recorded reasons and final brief stream, but the deployed proxy's pacing still needs Spec 19 verification.

Next: [Replay release acceptance](spec-19-replay-release-acceptance.md).
