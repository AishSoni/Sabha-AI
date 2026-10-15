# Deterministic recruiter onboarding journey

Status: the single-scenario topic and positioning are confirmed by the user. The exact real Indian corporate bond/ISIN, source snapshot, specialist prompt wording and final script remain to be selected and verified under D-01. This specification does not yet assert any issuer-specific facts or bond terms.

Implementation owner: **Phase 10, the final development phase**, after Phase 09 closes the core defects/refactor. Phase 03 supplies scaffolding only. This document is the target journey contract, not a requirement to implement any J-step in an earlier phase.

## 1. Experience goals

A visitor should understand Sabha by directing a meeting-style analysis of **exactly one real Indian corporate bond**. The walkthrough demonstrates complementary specialist agents, sourced evidence, disagreement about interpretation, editable queued messages, a shared verification agenda and an executive analysis brief. Supported exploration, reset and replay remain about the same bond and source snapshot. There is no scenario selector, second bond or unrelated business case.

Product positioning: **"Bring different analytical perspectives into one meeting. Sabha helps you examine evidence, challenge assumptions and organize what to verify before making your own informed executive decision."** The bond is a concrete demonstration of the meeting workflow; the product does not make the executive decision for the user.

Opening disclosure: **"This guided demo presents scripted, subjective analysis of a real Indian corporate bond using a dated source snapshot. It is not financial advice or a recommendation to buy, sell or hold. Verify the instrument's details, source documents and current information independently before making your own decision. No live AI or market-data calls are made."**

Keep a compact **"Scripted analysis · Not financial advice · Sources as of [snapshot date]"** indicator in the meeting and repeat the full context in the concluding brief. The bracketed date must be populated from the approved manifest at runtime, not shipped as placeholder text. Never ask for API keys. Do not imply that unsupported free text has been understood. Disclosures supplement accurate sourced content; they do not excuse invented facts or unsupported conclusions.

The first walkthrough targets approximately 3-5 minutes as an editorial goal, not an artificial timeout. Visitors control progression. Motion/delays must be skippable and respect reduced-motion preferences; tests disable presentation delays.

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

The runtime uses a frozen, reviewed evidence pack about the real instrument. Research and source capture happen during content authoring, not during recruiter sessions. Until D-01 is completed, no issuer, coupon, rating, maturity, price or yield is to be invented for a supposedly real bond.

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
| J00 `start_walkthrough` | Read disclosure, start demo | Create isolated session, meeting, participant snapshots, fixture references | Seed transaction committed; session reference stored |
| J01 `inspect_board` | Inspect the exact instrument identity, snapshot date, specialist remits and agenda | Explain director-controlled turns, facts versus judgment and shared/private context | Visitor acknowledges orientation; no model call |
| J02 `submit_bond_question` | Submit the authored coupon/rating question | Normal message submission records the director's message | Persisted message ID recorded in scenario state |
| J03 `ask_credit_analysis` | Ask Credit & Business Analyst to examine the issuer evidence | Search financial/rating sources; explain supported credit observations and limitations; reject coupon/rating-only reasoning through `log_disagreement` | Turn completed, citations and disagreement committed |
| J04 `ask_structure_downside` | Ask Bond Structure & Downside Analyst to examine terms and downside | Search shared instrument terms and private authored worksheet; distinguish documented protections from assumptions | Turn completed with permitted citations and open questions |
| J05 `queue_verification_question` | During J04, queue a suggested question, edit it, optionally remove/re-add it | Use real queue endpoints. Suggested final content: "What must I independently verify about price, liquidity and these assumptions before deciding?" | Queue drains after specialist turn; final edited content appears exactly once |
| J06 `ask_treasury_analysis` | Select Treasury & Market Analyst after the queue clears | Search shared terms/market evidence; distinguish coupon/yield, dated observations and unknown current liquidity; state verification needs | Completed answer cites shared sources, not the private worksheet |
| J07 `agree_verification_agenda` | Submit "Record the evidence, unresolved risks and checks I must verify; leave the decision with me."; select Credit & Business Analyst | `log_consensus` records agreement on the verification agenda with the director, not agreement to invest | Consensus record and final answer committed |
| J08 `end_walkthrough` | End analysis meeting | Scripted votes address whether the discussion is ready to summarize; ordinary ending use case generates the executive analysis brief | Ended state and source-linked brief atomically persisted |
| J09 `explore` | Review the brief and supported questions about this same bond | Enter post-walkthrough exploration without silently reopening ended meeting or switching instruments | Server returns allowed actions for the same scenario/ISIN |

All J00-J09 steps are implemented in Phase 10. Phases 04/07 supply the reusable queue API/UI beforehand; J05's guided teaching is built on that completed behavior. There is no Phase 03 walkthrough or idle-message substitute for the queue exercise, and the UI must never fake queue success.

J04/J05 form one stage with independent `turn_state` and `queue_exercise_state`, so queue actions remain valid while the downside specialist is running even though J04 has not completed. Show the queue instructions before starting that turn. If the turn finishes before the visitor edits, explain that the message was delivered and offer an explicit repeat of the supported downside-analysis exercise or a skip; do not pretend a delivered message is still queued. Presentation pacing must remain within the ordinary turn deadline and cannot weaken dispatch rules. J06 becomes available after the turn is terminal and the queue is clear, whether the exercise was completed or explicitly skipped.

### Scripted response content requirements

The final exact prose is a versioned content artifact reviewed against the selected real instrument under D-01. Minimum semantic content:

- Credit contribution: identify supported repayment drivers and weaknesses without inventing a favorable or adverse issuer narrative. Formal disagreement topic `Coupon and rating sufficiency`, target director, proposed severity 3. Make clear the challenged proposition is that these indicators alone settle the analysis, not that the director made an actual investment decision.
- Structure contribution: explain only verified terms; distinguish legal/documented protections, analytical downside assumptions and unresolved questions. The private worksheet is explicitly demo-authored analysis, not evidence of an actual undisclosed event.
- Treasury contribution: assess the available evidence's usefulness for an executive review and identify what is missing for any current price/liquidity assessment. Do not fill missing quotes with illustrative numbers presented as market facts.
- Consensus: the director and Credit & Business Analyst agree to the verification agenda, proposed strength 4. This is process agreement, not a financial recommendation or probability of repayment. Do not assert another specialist agreed merely because it supplied evidence.
- Votes: three scripted yes votes in the authored success branch mean the meeting has enough material to summarize, never that all agents approve the bond. Negative/failure variants stay in test fixtures for this same scenario.
- Executive brief sections: exact instrument/snapshot identity; sourced observations; supportive and adverse interpretations with attribution; unresolved disagreements; missing/current information to verify; user-owned next steps; source links/locators; subjective-analysis and not-financial-advice disclosure. Do not label meeting completion as investment approval.

Each final participant message should follow the repository's concise-meeting convention, normally under 200 words. Summary length is a separate authored content decision.

## 4. Scenario engine contract

Scenario metadata includes schema version, scenario/content version, the single verified instrument identity/ISIN, source snapshot date, evidence provenance, claim classifications/source mappings, specialist prompt revisions, starting state, allowed actions per state, actor/participant eligibility, scripted provider invocations, expected tool-result assertions, success transitions, and failure/retry transitions. D-01 approval must supply concrete values and reviewed source material before this manifest is executable. Tests must reject missing identity/provenance and a second instrument or scenario.

Script lookup is keyed by scenario version, server-authoritative stage/action, participant, and invocation index. It is not based on fuzzy matching user text or random selection. A request's action ID is validated against the current server state; it cannot grant permission to skip an unmet prerequisite.

The scripted provider returns ordinary normalized model responses/tool requests. The real application executes tools, validates outputs, persists effects, and decides lifecycle transitions. Scenario progress advances only after the corresponding application outcome commits. A failed turn leaves a retryable stage with its original effects recorded; it does not skip ahead.

Include expected tool-result content hashes or semantic assertions so a broken retrieval adapter does not appear correct because a final canned answer was returned regardless of results. Fixture results are deterministic but still pass through visibility/ownership checks.

Script IDs and logical event order are stable; runtime session IDs, timestamps, and secure credentials are not constant. Tests normalize those values or inject test clocks/IDs. Production credentials must remain unpredictable.

## 5. Streaming and tool sequence examples

Credit analysis turn, using the shared stream contract:

1. `turn_started`.
2. `tool_call` for `search_knowledge_base`, query "selected bond issuer repayment evidence and rating scope".
3. `tool_result` containing authorized fixture chunks; matching `citation` events.
4. Provider continuation requests `log_disagreement` with the authored target/topic/reason/severity.
5. `tool_call`, then `tool_result` referencing the persisted disagreement.
6. Provider continuation emits final `text_delta` segments.
7. Transaction commits final message/usage/terminal state, then `turn_completed` is delivered.

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
- Refresh fetches authoritative stage, meeting, active turn, queue, and replay cursor. Stale cached state is replaced.
- Reset is an idempotent server command: increment generation, fence/cancel old work, create fresh state, and return the new reference. Clear old client caches/cursors only when the outcome is known. Retrying an uncertain reset returns the same new generation.
- Old events must be ignored after reset. Old workers cannot commit effects into the new generation.
- Expired session returns a clear restart action. Server cleanup does not depend on unload/browser-close callbacks.
- An execution error shows retry/reset options, preserves committed effects, and keeps the visitor at the appropriate step. Never mark a failed tool call as successful for presentation.
- SessionStorage access failure must show an understandable limited-session/restart message rather than crash. Do not silently persist the token to localStorage as a fallback.

## 8. Accessibility and acceptance evidence

Use ordinary focusable controls and text instructions, not a tooltip-only tour. On step changes, move focus predictably without stealing it while editing. Announce queue dispatch, turn completion, and errors through restrained live regions; do not announce each streamed character. Support keyboard operation, reduced motion, zoom, and narrow layouts.

Required evidence: deterministic backend scenario replay; Vitest onboarding/store/queue/reset cases; manual desktop/narrow-layout walkthrough; a network audit showing no external AI, embedding, search, market-data or provider-discovery request. User-initiated navigation to an original source is distinct from an application data fetch and must never carry a session credential. The manual check is documented, not replaced by an unapproved browser framework.

Content acceptance additionally requires a recorded source review matching the exact ISIN, claim-to-source/calculation checks, distinct specialist contributions, visible snapshot/disclosures, and a final brief that preserves uncertainty and user decision ownership. Automated consistency tests do not independently establish that a real-world source is accurate. Phase 00 approves the review/content contract; actual evidence authoring/review is part of Phase 10 content entry, before scenario implementation. Publication readiness includes checking whether historical framing or source annotations need updating, without silently changing existing pinned sessions.
