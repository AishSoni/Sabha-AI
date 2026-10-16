# Research-backed tutorial through the real application

Status: corrective product direction confirmed by the user on 2026-10-16. Remove the standalone demo UI; start on the actual home page and guide the real application with overlays and a persistent DEMO watermark. Latest scope clarification: no authentication/access-control project, and bond research is demo-grade, not exhaustive or independently certified. Real documents, a genuine research run and useful analytical choices remain; formal claim audits/reviewer sign-offs do not.

Implementation owner: **Phase 10, the final development phase**, after Phase 09 closes the core defects/refactor. Phase 03 supplies scaffolding only. This document is the target journey contract, not a requirement to implement any J-step in an earlier phase.

## 1. Experience goals

A visitor should understand Sabha by using its **actual home, settings, knowledge, roster, meeting-creation and meeting-room screens**, directing a meeting-style analysis of **exactly one real Indian corporate bond**. The walkthrough demonstrates complementary specialist agents, sourced evidence, disagreement about interpretation, editable queued messages, a shared verification agenda and an executive analysis brief. Supported exploration, reset and replay remain about the same bond and source snapshot. There is no scenario selector, second bond or unrelated business case, and no separate demo application.

Product positioning: **"Bring different analytical perspectives into one meeting. Sabha helps you examine evidence, challenge assumptions and organize what to verify before making your own informed executive decision."** The bond is a concrete demonstration of the meeting workflow; the product does not make the executive decision for the user.

Opening disclosure: **"This is a demo run using recorded analysis and real documents about one Indian corporate bond. The research is illustrative, may be incomplete or approximate, and is not financial advice. Check current information independently before making any investment decision. No live AI or market-data calls are made during the demo."**

Keep a persistent **DEMO** watermark in the application-level shell on every demo route, including settings, forms, reload/resume, ended views and exploration. It must be readable but must not cover controls, explanations or streamed output. Keep compact **"Recorded demo analysis · Not financial advice"** context available throughout the run and repeat the disclosure in the concluding brief. Show the approximate source snapshot date when available. Never ask for API keys or imply recorded analysis is fresh inference. Do not imply unsupported free text has been understood. Label illustrative assumptions; no promise of financial accuracy or complete research is made.

The first walkthrough targets approximately 3-5 minutes as an editorial goal, not an artificial timeout or permission to omit required screens. Keep overlays concise and deeper explanation optional; record actual duration and revise the estimate if the complete route coverage takes longer. Visitors control progression. Motion/delays must be skippable and respect reduced-motion preferences; tests disable presentation delays.

### Real UI and low-friction tutorial contract

- The actual `/` home page has a visible **Try the demo** button. A valid demo start establishes the isolated session and starts guidance on that page; no standalone start screen or transcript is rendered. Remove the old `/demo` UI and its parallel client/store/components completely. If link compatibility is needed, `/demo` may only redirect to `/`, not render or maintain a second start flow.
- Retain ordinary pages, layouts, forms, controls, API clients, stores and transcript/tool/citation/queue/summary components. The visitor clicks actual controls and sees actual application state. The backend verifies supported actions and invokes the existing utilities; the overlay is not a hidden workflow executor.
- Each teaching step provides a short action instruction (**what**), one brief reason (**why**) and a compact expandable **technical explanation**. Use stable frontend-owned anchor keys for highlights and route-aware positioning. DB content may reference those keys but cannot inject executable HTML, arbitrary selectors or routes.
- Prefer non-blocking contextual overlays to modal sequences. Teach one action at a time; do not intercept unrelated controls, steal focus during editing, cover streaming text or require walls of text before proceeding. Handle absent/loading/off-screen anchors with recovery guidance rather than pointing at the wrong element.
- Provide progress, back/review, pause/resume, exit and appropriate skip controls. Pausing guidance does not remove the watermark or cancel execution. Exiting detaches presentation, clears demo caches/run references and handles abandoned work through the session policy without mixing run state. Back/review never repeats a mutation; skipping explanations cannot replace unmet application prerequisites. If guide dismissal is offered, the normal app remains usable within demo capabilities and the watermark remains until leaving demo scope.
- Guide acknowledgement and successful application work are distinct progress conditions. Only authoritative committed state can complete a create/save/dispatch/tool/ending step. DB seed content defines explanations and allowed transitions; frontend code implements generic rendering/navigation, not bond-specific output scripts.

### Required route and screen coverage

UI stages complement J00-J09 below; route visits alone do not prove the underlying work completed. Maintain a concrete anchor/action/expected-outcome checklist for every row in implementation evidence.

| UI stage | Real route/surface | Required teaching and interaction |
| --- | --- | --- |
| UI00 | `/` | Start via Try the demo; explain the product, isolated session, recorded research snapshot and watermark |
| UI01 | `/settings` | Explain provider/system configuration and effective settings; inspect safely with live/key/network operations disabled; no key entry or false save |
| UI02 | `/knowledge-stacks`, `/knowledge-stacks/new`, `/knowledge-stacks/[id]` | Use real list/create/detail controls to create a bounded run-specific stack, attach stored demo documents and inspect sources, dates, shared/private context assignments; no arbitrary upload or new embedding call |
| UI03 | `/roster`, `/roster/new`, `/roster/[id]` | Use real list/create/detail controls for approved specialist configurations; inspect Overview and System Prompt, assign the seeded stack and explain immutable participant snapshots |
| UI04 | `/meetings`, `/meetings/new` | Use the real list and creation form to create the one walkthrough meeting with approved participants, instrument and agenda; do not manufacture a second hidden meeting |
| UI05 | `/meetings/[id]` Chat and right panel | Orient participants/turn ownership/context/cost; submit and stream J02-J06; inspect tools/citations and exercise the real queue during a turn |
| UI06 | Same meeting: Disagreements, Consensus, Roster, Shared Docs | Visit every tab; explain committed communication effects, participant snapshots and evidence visibility; perform J07 through actual controls |
| UI07 | Same meeting: ending controls and Summary | Run J08; show validated votes and incrementally streamed brief, committed ended state and user-owned next steps |
| UI08 | `/meetings` and completed `/meetings/[id]`, bounded fork | Review the completed result through the real list/detail views; teach read-only completion, resume/reset and explicit same-bond exploration |

Explain disabled/coming-soon controls honestly, including any unavailable context compression or settings tabs. Do not simulate their success. The path must visit every actual supported page class above and every meeting-room tab, without treating framework error pages as product features or inventing an archive route that does not exist.

## 2. Scenario: examine one Indian corporate bond

- Scenario ID: `indian-corporate-bond-review`, initial content version: `1`.
- Meeting: **Indian corporate bond review — [selected issuer and ISIN]**. Use a real series reasonably identified from the available documents; no independent certification is required.
- Agenda: "Examine the selected bond's issuer credit, contractual structure, downside risks and treasury considerations; distinguish sourced facts from subjective judgments and identify what the director must verify independently."
- Director's initial discussion prompt: "Would its coupon and published credit rating alone be enough to judge this bond?" This is a question to challenge, not a claim about the selected instrument's actual coupon or rating.
- Intended conclusion: a source-linked executive analysis brief recording supported observations, competing interpretations, evidence gaps and user-owned verification actions. No buy/sell/hold verdict, allocation instruction, promised return or suitability determination.
- Instrument selection: one explicitly identified real Indian corporate bond series/ISIN. A basic match against available source material is sufficient; do not turn selection into exhaustive due diligence.

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

The runtime uses a frozen demo evidence pack. Research/source capture happen during authoring, not visitor sessions. The seed derives from a **genuine research run using real documents and the shared application workflow**, with meaningful choices rather than decorative citations. A modest useful source set is enough: missing documents, incomplete coverage, approximate analysis and clearly labeled illustrative calculations do not block the demo. Do not fabricate documents or claim unperformed research happened.

#### Lightweight research-run authoring

1. Gather a small usable set of real bond/issuer documents or excerpts. Keep titles, URLs and dates where available; originals are useful but a complete primary-source collection is not required. The source categories below are suggestions, not a mandatory completeness checklist.
2. Run a meaningful specialist research meeting through the shared workflow using the user's available authoring setup. Live services stay outside visitor runtime/tests; paid use or production access still needs permission.
3. Save the outputs/tool invocations needed for replay and a short note identifying the run, source set and analytical choices. No exhaustive forensic capture, per-claim registry, private chain-of-thought or reviewer identity is required.
4. Keep useful decisions and contrasting interpretations. Curate/edit the run and add clearly identified illustrative branches if helpful for teaching; do not pass an invented run or financial certification off as real. Ordinary tools and ending rules still execute at runtime.
5. Make a lightweight plausibility/readability pass for obvious identity mismatches, misleading current-versus-historical framing and unlabeled assumptions. No independent reviewer, formal sign-off or bulletproof numerical claims are required. Existing suitable documents/run material may be reused.
6. Publish the versioned DB/document package. Research and UI/core implementation may proceed in parallel; no formal content-approval gate blocks scenario code. Final acceptance checks demo suitability, disclosure and working replay, not investment-grade completeness.

| Suggested source ID | Visibility | Useful material when available (not a completeness gate) |
| --- | --- | --- |
| `instrument-terms-v1` | Meeting shared | Primary issue/allotment/exchange/issuer documentation establishing exact issuer, ISIN/series, currency, denomination, coupon basis, dates, repayment structure and disclosed security/seniority/options; explicitly mark absent terms unknown |
| `issuer-financials-v1` | Meeting shared | Dated issuer filings/financial disclosures, accounting period, standalone versus consolidated scope, units, relevant cash-flow/debt observations and stated limitations |
| `rating-rationale-v1` | Meeting shared | Available rating rationale/date and whether it discusses issuer or instrument; missing exact-series coverage may be noted rather than blocking the run |
| `market-evidence-v1` | Meeting shared | Optional historical market context. No current quote, liquidity proof or authoritative price feed is required; illustrative figures must be labeled |
| `downside-worksheet-v1` | Bond Structure & Downside Analyst private assignment | A demo-authored analytical worksheet referencing the shared sources, explicit assumptions and open downside questions. Clearly label it as analysis, not an issuer document, confidential insider information or independently verified fact |

Source fixtures need stable IDs, usable text/content and basic title/URL/date context where available. Detailed locators, every date field, checksums, original PDFs and claim mappings are optional. Keep excerpts understandable and distinguish source material from demo-authored assumptions. Source-link navigation does not silently replace pinned runtime content.

The private worksheet is included only in its assigned specialist's retrieval context; the director can inspect it through normal views. This demonstrates participant context scoping, not user authentication or secrecy. Label its hypothetical assumptions; do not present them as issuer disclosures.

### Demo-grade facts and calculations

- Aim for plausible, useful analysis of the selected real bond, not bulletproof financial claims. Basic source links and readable units suffice; no statement-by-statement verified locator or reproducible calculation audit is required.
- Distinguish sourced observations, opinion and illustrative assumptions in plain language. A machine-readable claim classification system is optional.
- Approximate/illustrative figures and simplified calculations are acceptable when labeled; no current market data, tax/legal validation or complete yield model is required.
- Note important known gaps and obvious historical framing. A short demo/not-financial-advice disclosure and reminder to independently check real investment information are sufficient; exhaustive publication-time fact checking is not required.

## 3. Guided steps and observable outcomes

| Step / action ID | Visitor interaction | Application behavior and evidence | Progress condition |
| --- | --- | --- | --- |
| J00 `start_walkthrough` | Click Try the demo on actual home; read brief disclosure | Establish isolated session and approved starting resources/content references; guide UI01-UI04 through actual forms | Starting-state transaction committed; session reference stored; no precreated completed meeting |
| J01 `inspect_board` | After UI01-UI04, inspect the created meeting, exact instrument/snapshot, remits and agenda | Explain director-controlled turns, facts versus judgment and shared/private context | Actual stack/persona/meeting writes committed and board orientation acknowledged; no model call |
| J02 `submit_bond_question` | Submit the authored coupon/rating question | Normal message submission records the director's message | Persisted message ID recorded in scenario state |
| J03 `ask_credit_analysis` | Ask Credit & Business Analyst to examine the issuer evidence | Search available financial/rating sources; explain observations/limitations; challenge coupon/rating-only reasoning through `log_disagreement` using the recorded demo branch | Turn completed, citations and disagreement committed |
| J04 `ask_structure_downside` | Ask Bond Structure & Downside Analyst to examine terms and downside | Search shared instrument terms and private authored worksheet; distinguish documented protections from assumptions | Turn completed with permitted citations and open questions |
| J05 `queue_verification_question` | During J04, queue a suggested question, edit it, optionally remove/re-add it | Use real queue endpoints. Suggested final content: "What must I independently verify about price, liquidity and these assumptions before deciding?" | Queue drains after specialist turn; final edited content appears exactly once |
| J06 `ask_treasury_analysis` | Select Treasury & Market Analyst after the queue clears | Search shared terms/market evidence; distinguish coupon/yield, dated observations and unknown current liquidity; state verification needs | Completed answer cites shared sources, not the private worksheet |
| J07 `agree_verification_agenda` | Submit "Record the evidence, unresolved risks and checks I must verify; leave the decision with me."; select Credit & Business Analyst | `log_consensus` records agreement on the verification agenda with the director, not agreement to invest | Consensus record and final answer committed |
| J08 `end_walkthrough` | End analysis meeting | Recorded demo votes address readiness to summarize; ordinary ending use case streams the executive brief | Validated majority, ended state and source-linked brief atomically persisted; provisional output alone is not success |
| J09 `explore` | Review the brief and supported questions about this same bond | Enter post-walkthrough exploration without silently reopening ended meeting or switching instruments | Server returns allowed actions for the same scenario/ISIN |

All J00-J09 steps are implemented in Phase 10. Phases 04/07 supply the reusable queue API/UI beforehand; J05's guided teaching is built on that completed behavior. There is no Phase 03 walkthrough or idle-message substitute for the queue exercise, and the UI must never fake queue success.

J04/J05 form one stage with independent `turn_state` and `queue_exercise_state`, so queue actions remain valid while the downside specialist is running even though J04 has not completed. Show the queue instructions before starting that turn. If the turn finishes before the visitor edits, explain that the message was delivered and offer an explicit repeat of the supported downside-analysis exercise or a skip; do not pretend a delivered message is still queued. Presentation pacing must remain within the ordinary turn deadline and cannot weaken dispatch rules. J06 becomes available after the turn is terminal and the queue is clear, whether the exercise was completed or explicitly skipped.

### Recorded response content requirements

The prose is a DB-backed versioned artifact derived from the genuine research run, with editorial simplification/curated branches allowed. The aim is a clear demonstration, not certified financial conclusions. Minimum semantic content:

- Credit contribution: discuss plausible repayment drivers/weaknesses and challenge coupon/rating sufficiency with an intelligible disagreement. Wording/scores may be curated from the run for teaching; no independent claim verification is required.
- Structure contribution: explain available terms and distinguish documented protections from simplified downside assumptions. The private worksheet is demo-authored analysis, not evidence of an actual undisclosed event.
- Treasury contribution: assess the available evidence's usefulness for an executive review and identify what is missing for any current price/liquidity assessment. Do not fill missing quotes with illustrative numbers presented as market facts.
- Consensus: demonstrate alignment on next checks through the actual consensus tool. Curated recorded participants/strength are acceptable demo content, not a financial recommendation or repayment probability.
- Votes: replay recorded/curated readiness-to-summarize votes through ordinary validation; no unanimity requirement. Successful paths must satisfy actual majority policy, and failed attempts cannot be represented as completed meetings.
- Executive brief covers the selected instrument/basic snapshot context, sourced observations and interpretations, unresolved questions, user-owned next checks, available source links and demo/subjective-analysis/not-financial-advice disclosure. A readable concise brief suffices; exhaustive sections/locators are not required. Do not label meeting completion as investment approval.

Each final participant message should follow the repository's concise-meeting convention, normally under 200 words. Summary length is a separate authored content decision.

## 4. Scenario engine contract

This is a thin coordination/content contract, **not permission to build a second engine**. Production journey content is read from a published DB package. Code implements typed loading, business validation, existing-use-case delegation and recorded-provider/retrieval adapters, not an identity framework, hardcoded answer/guide collections or process-local authoritative progress.

The package contains scenario/content/schema versions, publication status, selected instrument/basic source context, usable real document content/excerpts, a short research-run note, specialist/starting templates, recorded invocations/branches, expected result assertions and guide metadata. Formal approval/reviewer records, claim registries, exhaustive dates/locators and original-document hashes are optional. Missing runtime content or broken references fail clearly; incomplete financial documentation does not fail publication.

Keep immutable authoring/research artifacts separate from mutable session-owned records. Do not import completed research messages/effects as if the visitor had already performed them. Actual forms create the bounded stack/persona/meeting records and snapshots; actual turns/tools/queue/ending operations then create their runtime effects. At startup there may be no meeting yet. Retrying creation after a lost response must reconcile the existing created resource rather than create a hidden duplicate.

Normal application endpoints remain primary. Demo context is resolved server-side, not trusted from a browser mode flag. Permit only supported template-based operations/fields needed by UI02-UI04 and the supported journey. Do not permit arbitrary uploads, unrestricted persona/prompt/provider changes, other instruments or unbounded meeting creation. Meaningful configuration changes that invalidate recorded invocations must be rejected or mapped to an explicitly supported recorded branch, never silently ignored. These are scenario consistency rules, not user permissions. The backend does not dictate DOM behavior; guide metadata references a frontend-owned anchor/route registry.

Scenario metadata includes versions, the selected bond/ISIN, basic source/snapshot context, prompt templates, starting state, supported actions/participants, recorded invocations, tool-result assertions and success/failure/retry transitions. Tests reject missing runtime essentials and a second instrument/scenario; they do not require financial certification or an identity/permission model.

Recorded invocation lookup is keyed by scenario version, server-authoritative stage/action, participant, and invocation index. It is not based on fuzzy matching user text or random selection. Normal application commands carry/resolve validated journey context; an action ID cannot grant permission to skip an unmet prerequisite. A demo action endpoint may acknowledge orientation, coordinate repeat/fork/reset or delegate once to the shared command, never bypass it or make the frontend submit the same mutation twice.

The scripted provider returns ordinary normalized model responses/tool requests. The real application executes tools, validates outputs, persists effects, and decides lifecycle transitions. Scenario progress advances only after the corresponding application outcome commits. A failed turn leaves a retryable stage with its original effects recorded; it does not skip ahead.

Include simple expected source IDs/content or semantic assertions fixed in the seed to catch broken retrieval wiring. No independent reviewer or financial correctness proof is required. Never calculate an expected hash from the actual payload being tested. Normalize volatile IDs/times; respect participant context assignments, and pass actual tool results with original call IDs to provider continuation.

Script IDs and logical event order are stable; runtime run IDs/timestamps vary. Tests normalize those values or inject test clocks/IDs. No credential-design requirement is introduced.

## 5. Streaming and tool sequence examples

Every AI-generated surface uses actual incremental server-sent events through the shared runner/subscription infrastructure, including specialist replies, supported follow-ups, displayed vote output and the executive brief. A JSON response containing completed prose plus client-side typewriter animation is prohibited. The recorded adapter yields normalized incremental responses; the server publishes them as execution proceeds. Loading already completed history on resume is not a new AI generation. Demo actual provider spend is zero; authoring-run usage is separate and must not be charged to visitors.

Credit analysis turn, using the shared stream contract:

1. `turn_started`.
2. `tool_call` for `search_knowledge_base`, query "selected bond issuer repayment evidence and rating scope".
3. `tool_result` containing assigned fixture chunks; matching `citation` events.
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

- Persist only anonymous run reference, generation, and convenience progress in sessionStorage. Server state wins on reload; client-edited stage values do not replace committed prerequisites.
- Refresh fetches authoritative UI/application progress, pinned guide version, created resource references, nullable current meeting, active turn/ending attempt, queue and replay cursors. Stale cached state is replaced; an earlier setup stage is not an error merely because no meeting exists yet.
- Reset is an idempotent server command: increment generation, fence/cancel old work, create fresh state, and return the new reference. Clear old client caches/cursors only when the outcome is known. Retrying an uncertain reset returns the same new generation.
- Old events must be ignored after reset. Old workers cannot commit effects into the new generation.
- Expired session returns a clear restart action. Server cleanup does not depend on unload/browser-close callbacks.
- An execution error shows retry/reset options, preserves committed effects, and keeps the visitor at the appropriate step. Never mark a failed tool call as successful for presentation.
- SessionStorage access failure shows an understandable limited-session/restart message rather than crashing. Do not silently persist the run reference to localStorage as a fallback.

## 8. Accessibility and acceptance evidence

Use ordinary focusable controls and accessible overlay instructions, not hover-only tooltips. On step changes, move focus predictably without stealing it while editing. Announce queue dispatch, turn completion, and errors through restrained live regions; do not announce each streamed character. Support keyboard operation, reduced motion, zoom, and narrow layouts. Verify overlay placement/length and watermark visibility on every UI00-UI08 surface. Pausing/dismissing guidance leaves the normal application functional within its declared demo capabilities.

Required evidence: deterministic backend scenario replay; Vitest onboarding/store/queue/reset cases; manual desktop/narrow-layout walkthrough; a network audit showing no external AI, embedding, search, market-data or provider-discovery request. User-initiated source navigation is distinct from an application data fetch. Document the manual check; no extra browser framework is required.

Content acceptance needs a genuine research run with real documents or usable excerpts, a short run/source note, meaningful analysis with distinct specialist contributions, clear demo/recorded/not-financial-advice labels and a readable brief. One lightweight plausibility/readability pass suffices; no formal approval record, independent reviewer, full original-document archive, claim-by-claim verification or exhaustive calculations are required. Known gaps and labeled approximations are acceptable. These relaxed content standards do not weaken real-screen, persistence, shared-tool or incremental-SSE acceptance. Existing Phase 10 evidence does not automatically prove those implementation outcomes.
