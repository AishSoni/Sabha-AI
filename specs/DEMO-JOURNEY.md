# Research-backed tutorial through the real application

Status: corrective product direction confirmed by the user on 2026-10-16. Remove the standalone demo UI; start on the actual home page and guide the real application with overlays and a persistent DEMO watermark. D-01 still requires evidenced approval of the exact ISIN, source snapshot, genuine research run and final recorded content. Existing scenario constants and prior reports are not independent factual verification or approval.

Implementation owner: **Phase 10, the final development phase**, after Phase 09 closes the core defects/refactor. Phase 03 supplies scaffolding only. This document is the target journey contract, not a requirement to implement any J-step in an earlier phase.

## 1. Experience goals

A visitor should understand Sabha by using its **actual home, settings, knowledge, roster, meeting-creation and meeting-room screens**, directing a meeting-style analysis of **exactly one real Indian corporate bond**. The walkthrough demonstrates complementary specialist agents, sourced evidence, disagreement about interpretation, editable queued messages, a shared verification agenda and an executive analysis brief. Supported exploration, reset and replay remain about the same bond and source snapshot. There is no scenario selector, second bond or unrelated business case, and no separate demo application.

Product positioning: **"Bring different analytical perspectives into one meeting. Sabha helps you examine evidence, challenge assumptions and organize what to verify before making your own informed executive decision."** The bond is a concrete demonstration of the meeting workflow; the product does not make the executive decision for the user.

Opening disclosure: **"This guided demo replays reviewed, recorded analysis from a research run on a real Indian corporate bond using a dated source snapshot. It is not financial advice or a recommendation to buy, sell or hold. Verify the instrument's details, source documents and current information independently before making your own decision. No live AI or market-data calls are made during this demo."**

Keep a persistent **DEMO** watermark in the application-level shell on every demo route, including settings, forms, reload/resume, ended views and exploration. It must be readable but must not cover controls, explanations or streamed output. Keep compact **"Recorded analysis · Not financial advice · Sources as of [snapshot date]"** context available throughout the run and repeat the full context in the concluding brief. Populate the date from the approved DB package, never a placeholder. Never ask for API keys or imply recorded analysis is fresh inference. Do not imply that unsupported free text has been understood. Disclosures supplement accurate sourced content; they do not excuse invented facts or unsupported conclusions.

The first walkthrough targets approximately 3-5 minutes as an editorial goal, not an artificial timeout or permission to omit required screens. Keep overlays concise and deeper explanation optional; record actual duration and revise the estimate if the complete route coverage takes longer. Visitors control progression. Motion/delays must be skippable and respect reduced-motion preferences; tests disable presentation delays.

### Real UI and low-friction tutorial contract

- The actual `/` home page has a visible **Try the demo** button. A valid demo start establishes the isolated session and starts guidance on that page; no standalone start screen or transcript is rendered. Remove the old `/demo` UI and its parallel client/store/components completely. If link compatibility is needed, `/demo` may only redirect to `/`, not render or maintain a second start flow.
- Retain ordinary pages, layouts, forms, controls, API clients, stores and transcript/tool/citation/queue/summary components. The visitor clicks actual controls and sees actual application state. The backend verifies supported actions and invokes the existing utilities; the overlay is not a hidden workflow executor.
- Each teaching step provides a short action instruction (**what**), one brief reason (**why**) and a compact expandable **technical explanation**. Use stable frontend-owned anchor keys for highlights and route-aware positioning. DB content may reference those keys but cannot inject executable HTML, arbitrary selectors or routes.
- Prefer non-blocking contextual overlays to modal sequences. Teach one action at a time; do not intercept unrelated controls, steal focus during editing, cover streaming text or require walls of text before proceeding. Handle absent/loading/off-screen anchors with recovery guidance rather than pointing at the wrong element.
- Provide progress, back/review, pause/resume, exit and appropriate skip controls. Pausing guidance does not remove the watermark or cancel execution. Exiting detaches presentation, clears demo caches/credentials when switching scope and fences any abandoned work through the documented session policy; it never mixes demo and ordinary user records. Back/review never repeats a mutation; skipping explanations cannot unlock unmet application prerequisites. If guide dismissal is offered, the same normal app remains usable within its demo capabilities and the watermark remains visible until leaving demo scope.
- Guide acknowledgement and successful application work are distinct progress conditions. Only authoritative committed state can complete a create/save/dispatch/tool/ending step. DB seed content defines explanations and allowed transitions; frontend code implements generic rendering/navigation, not bond-specific output scripts.

### Required route and screen coverage

UI stages complement J00-J09 below; route visits alone do not prove the underlying work completed. Maintain a concrete anchor/action/expected-outcome checklist for every row in implementation evidence.

| UI stage | Real route/surface | Required teaching and interaction |
| --- | --- | --- |
| UI00 | `/` | Start via Try the demo; explain the product, isolated session, recorded research snapshot and watermark |
| UI01 | `/settings` | Explain provider/system configuration and effective settings; inspect safely with live/key/network operations disabled; no key entry or false save |
| UI02 | `/knowledge-stacks`, `/knowledge-stacks/new`, `/knowledge-stacks/[id]` | Use real list/create/detail controls to create a bounded session stack, attach approved stored documents and inspect sources, dates, shared/private access; no arbitrary upload or new embedding call |
| UI03 | `/roster`, `/roster/new`, `/roster/[id]` | Use real list/create/detail controls for approved specialist configurations; inspect Overview and System Prompt, assign the seeded stack and explain immutable participant snapshots |
| UI04 | `/meetings`, `/meetings/new` | Use the real list and creation form to create the one walkthrough meeting with approved participants, instrument and agenda; do not manufacture a second hidden meeting |
| UI05 | `/meetings/[id]` Chat and right panel | Orient participants/turn ownership/context/cost; submit and stream J02-J06; inspect tools/citations and exercise the real queue during a turn |
| UI06 | Same meeting: Disagreements, Consensus, Roster, Shared Docs | Visit every tab; explain committed communication effects, participant snapshots and evidence visibility; perform J07 through actual controls |
| UI07 | Same meeting: ending controls and Summary | Run J08; show validated votes and incrementally streamed brief, committed ended state and user-owned next steps |
| UI08 | `/meetings` and completed `/meetings/[id]`, bounded fork | Review the completed result through the real list/detail views; teach read-only completion, resume/reset and explicit same-bond exploration |

Explain disabled/coming-soon controls honestly, including any unavailable context compression or settings tabs. Do not simulate their success. The path must visit every actual supported page class above and every meeting-room tab, without treating framework error pages as product features or inventing an archive route that does not exist.

## 2. Scenario: examine one Indian corporate bond

- Scenario ID: `indian-corporate-bond-review`, initial content version: `1`.
- Meeting: **Indian corporate bond review — [verified issuer and ISIN]**. Populate identity only after source verification.
- Agenda: "Examine the selected bond's issuer credit, contractual structure, downside risks and treasury considerations; distinguish sourced facts from subjective judgments and identify what the director must verify independently."
- Director's initial discussion prompt: "Would its coupon and published credit rating alone be enough to judge this bond?" This is a question to challenge, not a claim about the selected instrument's actual coupon or rating.
- Intended conclusion: a source-linked executive analysis brief recording supported observations, competing interpretations, evidence gaps and user-owned verification actions. No buy/sell/hold verdict, allocation instruction, promised return or suitability determination.
- Instrument selection: one explicitly identified real Indian corporate bond series with a verified ISIN. Issuer name alone is insufficient because different series can have different terms.

### Specialist agents, not personality imitations

"Persona" remains the reusable configuration entity, but the demo presents **analytical roles**. Distinctness comes from remit, evidence, questions and output obligations, not a skeptical/optimistic personality or imitation of a real professional. All three agents must acknowledge relevant supportive and adverse evidence; none is hardcoded to endorse or oppose the bond.

| Agent | Primary question and evidence | Required contribution / boundary |
| --- | --- | --- |
| **Credit & Business Analyst** | What supports or weakens the issuer's ability to meet debt obligations? Use dated financial disclosures, business/cash-flow evidence and the applicable rating rationale | Explain repayment drivers, dependencies and uncertainty. Distinguish issuer-level evidence from instrument-specific evidence; do not turn a rating into a guarantee |
| **Bond Structure & Downside Analyst** | What do this ISIN's documented terms actually provide, and where can protection fail? Use issue terms, seniority/security/covenants, repayment/call provisions and documented risks | Identify contractual protections, limitations and unanswered downside questions. A "secured" label does not establish certain recovery; do not invent legal protections or assert legal enforceability without evidence |
| **Treasury & Market Analyst** | What must an executive check about liquidity, price/yield, rate exposure and a decision horizon? Use dated market evidence if available, cash-flow terms and clearly labeled analytical assumptions | Separate coupon from yield, listed status from demonstrated liquidity, and historical observations from current executable prices. Produce a verification agenda, not a personalized allocation |

Prompt contracts share the advisory-board base instruction, source-first tool behavior, concise responses and disagreement/consensus tools. Each extension defines its remit, evidence scope, output structure and handoffs to other agents. A specialist may flag a question outside its remit and ask the relevant agent to address it instead of repeating the same general answer. These are scenario-specific templates; existing user personas and historical participants are preserved.

Every contribution should identify: relevant source facts; the agent's interpretation; a limitation or contrary consideration where supported; and the next item to verify. A source reference supports a factual premise, not necessarily the subjective judgment drawn from it.

### Fixture evidence

The runtime uses a frozen, reviewed evidence pack about the real instrument. Research and source capture happen during content authoring, not during recruiter sessions. The seed must derive from a **genuine research run using real documents and the shared application workflow**, not prose invented first and decorated with citations afterward. Until D-01 is completed, no issuer, coupon, rating, maturity, price or yield is to be invented for a supposedly real bond.

#### Research-run authoring and approval

1. Collect original issuer/issue/exchange/rating/financial documents for the exact ISIN; retain source bytes, context and dated provenance. Missing market evidence remains a recorded gap.
2. Execute a substantive specialist research meeting through the real provider/tool/knowledge/meeting boundaries in a separately authorized authoring environment. Live research/inference is permitted only there with explicit setup/authorization, never as recruiter runtime or an ordinary test prerequisite. Do not access production credentials or spend money merely because this specification exists.
3. Record the run identity, configuration/prompt revisions, document hashes, visible messages, provider invocations, actual tool inputs/results, citations, communication effects, votes, brief and supported branch runs. Preserve audit artifacts, not private chain-of-thought.
4. Demonstrate genuine analytical choices: weigh supportive versus adverse evidence, distinguish contractual protection from assumptions, challenge coupon/rating sufficiency, decide what remains unresolved and whether the discussion is ready to summarize. A conclusion that evidence is insufficient is valid. Do not fabricate disagreement or unanimous agreement to satisfy a storyboard; select/research a suitable documented run and review the resulting learning path.
5. Review claim/source mappings, calculations, actual differences between specialists, missing information and decision reasoning. Record reviewer, review date, approval and any editorial changes from captured outputs; material changes require review and a new version. A live model's output alone does not verify a fact.
6. Publish the approved immutable package to DB/document storage. Candidate content already in the repository is not approved by reuse alone. If retained, the existing ISIN must be independently rechecked and framed historically if matured; a replacement within the sole scenario requires D-01 approval, not a second scenario selector.

| Source ID | Visibility | Evidence to capture and validate |
| --- | --- | --- |
| `instrument-terms-v1` | Meeting shared | Primary issue/allotment/exchange/issuer documentation establishing exact issuer, ISIN/series, currency, denomination, coupon basis, dates, repayment structure and disclosed security/seniority/options; explicitly mark absent terms unknown |
| `issuer-financials-v1` | Meeting shared | Dated issuer filings/financial disclosures, accounting period, standalone versus consolidated scope, units, relevant cash-flow/debt observations and stated limitations |
| `rating-rationale-v1` | Meeting shared | Agency-authored rationale, date, rating/outlook/watch status and scope; verify whether it applies to the exact instrument, a programme or only the issuer. Do not silently substitute one scope for another |
| `market-evidence-v1` | Meeting shared | Dated authoritative exchange/trade/quotation evidence where available, with price convention, observation time and trade-versus-indicative status. If unavailable, record the absence and require independent verification rather than fabricate a quote |
| `downside-worksheet-v1` | Bond Structure & Downside Analyst private assignment | A demo-authored analytical worksheet referencing the shared sources, explicit assumptions and open downside questions. Clearly label it as analysis, not an issuer document, confidential insider information or independently verified fact |

Source fixtures contain stable source/chunk IDs, title, publisher, original URL, publication/effective date, retrieval date, covered financial period where applicable, page/section locator, snapshot date, visibility and content hash. Preserve the original context around quoted excerpts. Distinguish factual source material from authored worksheets and derived calculations. Label saved excerpts as a historical snapshot; visiting a source link must not silently replace the session's evidence.

The private worksheet is searchable only by its assigned specialist. The director may inspect it through authorized views; that does not grant the other agents retrieval access. Its hypothetical assumptions cannot be cited as facts about the issuer. Shared publicly sourced documents remain shared for the demo; private assignment illustrates context scoping rather than pretending public information is secret.

### Fact and calculation contract

- Every numerical/instrument-specific statement must map to a verified source locator or a reproducible calculation with identified inputs, units, date, assumptions and rounding. Keep Indian numbering/units (rupees, lakh/crore, percentages/basis points) explicit and consistent.
- Label claims as `sourced_fact`, `derived_calculation`, `subjective_judgment` or `unverified_question`. Do not describe factual bond terms as mere opinion or give an opinion the authority of a cited fact.
- Do not equate coupon with current yield/yield to maturity. Show a calculated yield only when price convention, accrued interest/settlement, cash-flow schedule and applicable options/conventions are sufficiently established; otherwise explain the missing inputs. No calculation is required solely to make the demo look complete.
- Disclose conflicting, missing or outdated sources. An issuer rating is not automatically this instrument's rating; a dated rating is not asserted to be current.
- If the selected bond has matured, been redeemed or undergone a material event by publication, label the exercise historical and update the framing. Do not portray it as currently available without verified evidence.
- Publish the exact source snapshot/review date and a user-facing verification list: instrument identity/terms, current disclosures/rating, price/liquidity, applicable costs/tax treatment and the user's own policies/constraints. Avoid specific tax claims without an applicable sourced basis.

## 3. Guided steps and observable outcomes

| Step / action ID | Visitor interaction | Application behavior and evidence | Progress condition |
| --- | --- | --- | --- |
| J00 `start_walkthrough` | Click Try the demo on actual home; read brief disclosure | Establish isolated session and approved starting resources/content references; guide UI01-UI04 through actual forms | Starting-state transaction committed; session reference stored; no precreated completed meeting |
| J01 `inspect_board` | After UI01-UI04, inspect the created meeting, exact instrument/snapshot, remits and agenda | Explain director-controlled turns, facts versus judgment and shared/private context | Actual stack/persona/meeting writes committed and board orientation acknowledged; no model call |
| J02 `submit_bond_question` | Submit the authored coupon/rating question | Normal message submission records the director's message | Persisted message ID recorded in scenario state |
| J03 `ask_credit_analysis` | Ask Credit & Business Analyst to examine the issuer evidence | Search financial/rating sources; explain supported observations/limitations; challenge coupon/rating-only reasoning through the research-supported `log_disagreement` | Turn completed, citations and reviewed disagreement committed |
| J04 `ask_structure_downside` | Ask Bond Structure & Downside Analyst to examine terms and downside | Search shared instrument terms and private authored worksheet; distinguish documented protections from assumptions | Turn completed with permitted citations and open questions |
| J05 `queue_verification_question` | During J04, queue a suggested question, edit it, optionally remove/re-add it | Use real queue endpoints. Suggested final content: "What must I independently verify about price, liquidity and these assumptions before deciding?" | Queue drains after specialist turn; final edited content appears exactly once |
| J06 `ask_treasury_analysis` | Select Treasury & Market Analyst after the queue clears | Search shared terms/market evidence; distinguish coupon/yield, dated observations and unknown current liquidity; state verification needs | Completed answer cites shared sources, not the private worksheet |
| J07 `agree_verification_agenda` | Submit "Record the evidence, unresolved risks and checks I must verify; leave the decision with me."; select Credit & Business Analyst | `log_consensus` records agreement on the verification agenda with the director, not agreement to invest | Consensus record and final answer committed |
| J08 `end_walkthrough` | End analysis meeting | Reviewed recorded votes address readiness to summarize; ordinary ending use case streams the executive brief | Validated majority, ended state and source-linked brief atomically persisted; provisional output alone is not success |
| J09 `explore` | Review the brief and supported questions about this same bond | Enter post-walkthrough exploration without silently reopening ended meeting or switching instruments | Server returns allowed actions for the same scenario/ISIN |

All J00-J09 steps are implemented in Phase 10. Phases 04/07 supply the reusable queue API/UI beforehand; J05's guided teaching is built on that completed behavior. There is no Phase 03 walkthrough or idle-message substitute for the queue exercise, and the UI must never fake queue success.

J04/J05 form one stage with independent `turn_state` and `queue_exercise_state`, so queue actions remain valid while the downside specialist is running even though J04 has not completed. Show the queue instructions before starting that turn. If the turn finishes before the visitor edits, explain that the message was delivered and offer an explicit repeat of the supported downside-analysis exercise or a skip; do not pretend a delivered message is still queued. Presentation pacing must remain within the ordinary turn deadline and cannot weaken dispatch rules. J06 becomes available after the turn is terminal and the queue is clear, whether the exercise was completed or explicitly skipped.

### Recorded response content requirements

The final exact prose is a DB-backed versioned artifact derived from the reviewed research run under D-01. The tutorial chooses a suitable reviewed path; it does not predetermine the run's analytical outcome. Minimum semantic content:

- Credit contribution: identify supported repayment drivers and weaknesses without inventing a favorable or adverse issuer narrative. A formal disagreement challenges coupon/rating sufficiency; its wording, target, reasoning and severity must be supported by the reviewed run, not a fixed theatrical score. The challenged proposition is that these indicators alone settle the analysis, not that the director made an investment decision.
- Structure contribution: explain only verified terms; distinguish legal/documented protections, analytical downside assumptions and unresolved questions. The private worksheet is explicitly demo-authored analysis, not evidence of an actual undisclosed event.
- Treasury contribution: assess the available evidence's usefulness for an executive review and identify what is missing for any current price/liquidity assessment. Do not fill missing quotes with illustrative numbers presented as market facts.
- Consensus: record only alignment actually supported by the reviewed run on the verification agenda; participants and strength come from that reviewed analysis. This is process agreement, not a financial recommendation or probability of repayment. Do not assert another specialist agreed merely because it supplied evidence.
- Votes: replay the reviewed readiness-to-summarize votes through ordinary validation; do not require all three to vote yes. A reviewed successful path must satisfy the actual majority policy. Rejection/failure variants must not be rewritten as successful completion and remain covered for this same scenario.
- Executive brief sections: exact instrument/snapshot identity; sourced observations; supportive and adverse interpretations with attribution; unresolved disagreements; missing/current information to verify; user-owned next steps; source links/locators; subjective-analysis and not-financial-advice disclosure. Do not label meeting completion as investment approval.

Each final participant message should follow the repository's concise-meeting convention, normally under 200 words. Summary length is a separate authored content decision.

## 4. Scenario engine contract

This is a thin coordination/content contract, **not permission to build a second engine**. Production journey content must be read from a seeded, approved DB package. Code implements typed loading, authorization, validation, existing-use-case delegation and recorded-provider/retrieval adapters, not hardcoded answer/guide collections or process-local authoritative progress.

The package contains scenario/content/schema versions; approval/publication status; instrument/snapshot identity; original-document storage references and checksums; chunks/provenance/visibility; claims/calculations; research run/review records; specialist/prompt templates; starting-state templates; ordered recorded invocations and supported branches; independent result assertions; and guide copy/anchor keys/actions/completion/failure transitions. Absence or inconsistency fails closed. A source or script identifier without stored retrievable content is insufficient.

Keep immutable authoring/research artifacts separate from mutable session-owned records. Do not import completed research messages/effects as if the visitor had already performed them. Actual forms create the bounded stack/persona/meeting records and snapshots; actual turns/tools/queue/ending operations then create their runtime effects. At startup there may be no meeting yet. Retrying creation after a lost response must reconcile the existing created resource rather than create a hidden duplicate.

Normal application endpoints remain primary. Demo context is resolved server-side, not trusted from a browser mode flag. Permit only approved template-based operations/fields needed by UI02-UI04 and the supported journey. Do not permit arbitrary uploads, unrestricted persona/prompt/provider changes, other instruments or unbounded meeting creation. Meaningful configuration changes that invalidate recorded invocations must be rejected or mapped to an explicitly reviewed branch, never silently ignored. The backend does not dictate DOM behavior; guide metadata references a frontend-owned anchor/route registry.

Scenario metadata includes schema version, scenario/content version, the single verified instrument identity/ISIN, source snapshot date, evidence provenance, claim classifications/source mappings, specialist prompt revisions, starting state, allowed actions per state, actor/participant eligibility, scripted provider invocations, expected tool-result assertions, success transitions, and failure/retry transitions. D-01 approval must supply concrete values and reviewed source material before this manifest is executable. Tests must reject missing identity/provenance and a second instrument or scenario.

Recorded invocation lookup is keyed by scenario version, server-authoritative stage/action, participant, and invocation index. It is not based on fuzzy matching user text or random selection. Normal application commands carry/resolve validated journey context; an action ID cannot grant permission to skip an unmet prerequisite. A demo action endpoint may acknowledge orientation, coordinate repeat/fork/reset or delegate once to the shared command, never bypass it or make the frontend submit the same mutation twice.

The scripted provider returns ordinary normalized model responses/tool requests. The real application executes tools, validates outputs, persists effects, and decides lifecycle transitions. Scenario progress advances only after the corresponding application outcome commits. A failed turn leaves a retryable stage with its original effects recorded; it does not skip ahead.

Include expected tool-result content hashes or semantic assertions derived independently from the reviewed seed so a broken retrieval adapter cannot produce a convincing final answer regardless of results. Never calculate the expected hash from the actual payload being tested. Normalize runtime IDs/times before comparison as required. Fixture results are deterministic but still pass through visibility/ownership checks, and real tool results with their original call IDs reach provider continuation.

Script IDs and logical event order are stable; runtime session IDs, timestamps, and secure credentials are not constant. Tests normalize those values or inject test clocks/IDs. Production credentials must remain unpredictable.

## 5. Streaming and tool sequence examples

Every AI-generated surface uses actual incremental server-sent events through the shared runner/subscription infrastructure, including specialist replies, supported follow-ups, displayed vote output and the executive brief. A JSON response containing completed prose plus client-side typewriter animation is prohibited. The recorded adapter yields normalized incremental responses; the server publishes them as execution proceeds. Loading already completed history on resume is not a new AI generation. Demo actual provider spend is zero; authoring-run usage is separate and must not be charged to visitors.

Credit analysis turn, using the shared stream contract:

1. `turn_started`.
2. `tool_call` for `search_knowledge_base`, query "selected bond issuer repayment evidence and rating scope".
3. `tool_result` containing authorized fixture chunks; matching `citation` events.
4. Provider continuation requests `log_disagreement` with the authored target/topic/reason/severity.
5. `tool_call`, then `tool_result` referencing the persisted disagreement.
6. Provider continuation emits final `text_delta` segments.
7. Transaction commits final message/usage/terminal state, then `turn_completed` is delivered.

Ending uses the shared ending-attempt event contract in CONTRACTS.md: stream actual vote progress/results and `summary_delta` output; publish `ending_completed` only after summary/status commit. Summary failure restores the ordinary failed-attempt state and must not leave a provisional brief labeled final. Both turn and ending streams support deduplication, disconnect-independent execution, durable replay/status recovery and generation fencing. Test with a real local HTTP server: multiple text/summary updates must be received before the corresponding terminal event, not buffered until completion.

Repeated delivery must not repeat a disagreement or concatenate a final answer twice. Demo usage is classified as simulated when shown; actual provider spend is zero.

## 6. Supported exploration

After J08, the completed walkthrough stays read-only. Supported actions include:

- Inspect personas, tool artifacts, citations, scoreboard, and summary.
- Replay the walkthrough in a fresh generation using reset.
- Start an explicit exploration fork with the same bond/ISIN, scenario version, source snapshot and an active meeting; do not reopen the ended walkthrough implicitly. A fork is another discussion of this instrument, not a second scenario.
- In the fork, choose authored questions such as `explain_credit_evidence`, `review_downside_assumptions`, and `verify_price_and_liquidity` with predefined eligible specialists. The same source/interpretation/disclosure rules apply to every branch.
- End the fork through an authored supported conclusion.

Proposed bound: retain the completed walkthrough plus at most one exploration fork per session generation. Replacing a fork requires explicit confirmation and cleanup; no unbounded meeting creation through repeated exploration clicks.

Unsupported text may be retained as a user message when the ordinary message contract permits it, but must not silently choose a canned answer as if it understood the text. Show: "This demo supports a fixed set of questions. Choose an action below to continue." Do not advance scenario progress or invoke a live fallback. During the guided path, make supported actions primary and keep arbitrary input clearly labeled.

## 7. Session, resume, reset and errors

- Persist only session credential/reference, generation, and convenience progress in sessionStorage. Server state wins on reload; client-edited stage values cannot unlock actions.
- Refresh fetches authoritative UI/application progress, pinned guide version, created resource references, nullable current meeting, active turn/ending attempt, queue and replay cursors. Stale cached state is replaced; an earlier setup stage is not an error merely because no meeting exists yet.
- Reset is an idempotent server command: increment generation, fence/cancel old work, create fresh state, and return the new reference. Clear old client caches/cursors only when the outcome is known. Retrying an uncertain reset returns the same new generation.
- Old events must be ignored after reset. Old workers cannot commit effects into the new generation.
- Expired session returns a clear restart action. Server cleanup does not depend on unload/browser-close callbacks.
- An execution error shows retry/reset options, preserves committed effects, and keeps the visitor at the appropriate step. Never mark a failed tool call as successful for presentation.
- SessionStorage access failure must show an understandable limited-session/restart message rather than crash. Do not silently persist the token to localStorage as a fallback.

## 8. Accessibility and acceptance evidence

Use ordinary focusable controls and accessible overlay instructions, not hover-only tooltips. On step changes, move focus predictably without stealing it while editing. Announce queue dispatch, turn completion, and errors through restrained live regions; do not announce each streamed character. Support keyboard operation, reduced motion, zoom, and narrow layouts. Verify overlay placement/length and watermark visibility on every UI00-UI08 surface. Pausing/dismissing guidance leaves the normal application functional within its declared demo capabilities.

Required evidence: deterministic backend scenario replay; Vitest onboarding/store/queue/reset cases; manual desktop/narrow-layout walkthrough; a network audit showing no external AI, embedding, search, market-data or provider-discovery request. User-initiated navigation to an original source is distinct from an application data fetch and must never carry a session credential. The manual check is documented, not replaced by an unapproved browser framework.

Content acceptance additionally requires the genuine research-run and approval record, preserved original documents matching the exact ISIN, claim-to-source/calculation checks, substantive evidence-based choices, distinct specialist contributions, visible snapshot/disclosures, and a final brief preserving uncertainty and user decision ownership. Automated consistency tests do not independently establish source accuracy or genuine research. Phase 00 approves the review/content/data/route contract; actual authoring/review is part of Phase 10 content entry, before scenario implementation. Publication readiness includes checking historical framing/source annotations without silently changing pinned sessions. Existing Phase 10 completion evidence is superseded until these corrected obligations are demonstrated.
