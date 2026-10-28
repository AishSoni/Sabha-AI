# Spec 18 Content Ledger — HDFC Ltd 7.87% 2022 Debenture

Status: **approved for production package `hdfc-ine001a07rw5` version 1** on 28 October 2026. The exact dialogue, claims, citations, short source excerpts, and package publication were approved. Package content hash: `ced67209984ff87088119f58f5b2bcc643fd9240623dfbe02e03ab761c1fb07f`.

## 1. Provenance and scope

- Meeting as-of date: **31 July 2020**. This is the information cutoff, not the playback date.
- Source capture date: **16 October 2026**. The sources were read in-session; full source bytes were not retained. Short transcriptions are retained in package evidence.
- Playback/preparation date: **28 October 2026**.
- The journey is **authored recorded content**. No live model run, paid specialist run, live retrieval, or current-market lookup occurred. The old J00–J09 demo scripts and their synthetic checksums are not used.
- This ledger supersedes any prework demand for a genuine model run. Approving this ledger approves authored content, not a claim that a model produced the dialogue.
- `untracked-bond-research/` is a working index only. Nothing from it is committed. The two PDFs in that folder are not package assets.
- No source was silently refetched to fill a gap. Where the record is incomplete, the journey says so.
- No future merger, redemption, or maturity-payment hindsight is used. The 2022 scheduled maturity is a term; its outcome is unknown at the meeting date.

## 2. Source register

### S1 — CRISIL rating rationale

- Title: *CRISIL Rating Rationale — Housing Development Finance Corporation Limited, 31 July 2020*.
- URL: `https://www.crisil.com/mnt/winshare/Ratings/RatingList/RatingDocs/Housing_Development_Finance_Corporation_Limited_July_31_2020_RR.html`
- Locator used: **“Annexure – Details of Instrument(s)”, row for ISIN `INE001A07RW5`; rating action dated 31 July 2020.**
- Capture: fetched in-session on 16 October 2026. The full HTML was not retained as a byte asset. The package retains a short transcription of the annexure fields and rating action.
- Rights note: public rating rationale; short factual transcription with attribution and locator; no full-document redistribution. Exact retention/redistribution approval is required before publication.
- Used for: C1, C2, C12.

### S4 — HDFC Ltd Annual Report 2019-20, Management Discussion & Analysis

- Title: *HDFC Ltd — Annual Report 2019-20, Management Discussion & Analysis*.
- URL: `https://homeloans.hdfc.bank.in/digital-annual-report-2019-2020/mda`
- Locator used: **“MD&A – FY20 standalone performance and borrowings.”**
- Capture: fetched in-session on 16 October 2026. The full page and audited statements were not retained. The package retains a short transcription of the FY20 figures and the NCD listing statement.
- Rights note: public annual-report page; short factual transcription with attribution and locator; no full-document redistribution. Exact retention/redistribution approval is required before publication.
- Used for: C3, C6.

### Explicitly excluded

- The untracked `TS-V-007.pdf` and `SE-V007-intimation-150719.pdf`; they are not committed or used as package assets.
- Moneycontrol, cbonds, and merger/record-date material from the working notes. The aggregator’s “Matured” status is future hindsight and must not be displayed.
- Old demo JSON, old synthetic checksums, and the J00–J09 scripted fixtures.
- Any live price, yield, rating, liquidity, or payment outcome not supported by the retained evidence.

## 3. Claims registry

The package’s machine-readable claims registry must use these exact IDs and statements. Every factual citation in a recorded message must resolve to a claim with an evidence asset and locator. Derived claims point to their source claim. Judgments and unknowns are labeled as such.

| ID | Kind | Exact displayed statement | Evidence / locator |
|---|---|---|---|
| C1 | fact | “CRISIL’s annexure row for ISIN INE001A07RW5 lists a 7.87% coupon, allotment on 18 July 2019, scheduled maturity on 18 July 2022, and an issue size of Rs 5,000 crore.” | `evidence/crisil-annexure.md`; S1 annexure row |
| C2 | fact | “CRISIL assigned AAA/Stable on 31 July 2020.” | `evidence/crisil-annexure.md`; S1 rating action |
| C3 | fact | “The FY20 MD&A reports standalone total income of Rs 58,763 crore and profit after tax of Rs 17,770 crore, and Rs 46,437 crore of secured redeemable NCDs raised at issuer level.” | `evidence/hdfc-fy20-mda.md`; S4 MD&A |
| C4 | derived | “The stated tenor is 1,096 days, approximately three calendar years, derived from the 18 July 2019 allotment and 18 July 2022 scheduled maturity.” | Derived from C1 |
| C5 | derived | “Three scheduled annual coupons at 7.87% would sum to 23.61% of principal over the stated tenor; this is not a yield and assumes scheduled payments.” | Derived from C1; 3 × 7.87% |
| C6 | fact | “The FY20 MD&A states the NCDs are listed on the NSE/BSE wholesale debt market.” | `evidence/hdfc-fy20-mda.md`; S4 MD&A |
| C7 | judgment | “Listing is not the same as executable secondary liquidity; the record contains no price, yield, or liquidity data.” | C6 plus `shared/hdfc-v007-fact-sheet.md` |
| C8 | judgment | “AAA/Stable is a rating opinion dated 31 July 2020, not a guarantee and not a current rating.” | C2 |
| C9 | demo-authored | “The +200bp rate move and risk-off secondary-market scenario is demo-authored for this replay; it is not a forecast or issuer guidance.” | `private/downside-worksheet.md`; scenario section |
| C10 | unknown | “The meeting record contains no executable price, yield, or secondary-market liquidity data for the series.” | `shared/hdfc-v007-fact-sheet.md`; “What is not established” |
| C11 | unknown | “Scheduled maturity is 18 July 2022; the meeting does not assert that payment occurred.” | C1; scheduled maturity |
| C12 | unknown | “The rating annexure describes the instrument as a debenture; the retained excerpt does not establish series-level secured or unsecured status.” | `evidence/crisil-annexure.md`; instrument column |
| C13 | judgment | “The outcome is a research checklist, not a buy/sell recommendation or investment approval.” | `shared/hdfc-v007-fact-sheet.md`; outcome and limitations |

## 4. Board, personas, and knowledge scope

### Participants

| Participant | Persona summary | Private stack | Shared stack |
|---|---|---|---|
| The Credit Analyst | Tests the record: terms, rating, issuer context, and what is missing. | Credit evidence (private to The Credit Analyst) | Meeting documents (shared) |
| The Downside Reviewer | Stress-tests the case: ratings are opinions; rates and liquidity can change. | Downside worksheet (private to The Downside Reviewer) | Meeting documents (shared) |
| The Portfolio Analyst | Applies a fictional mandate and distinguishes what can be concluded from what cannot. | Portfolio mandate (private to The Portfolio Analyst) | Meeting documents (shared) |

### Stack labels

- `shared-meeting-documents` → **Meeting documents (shared)**
- `credit-private` → **Credit evidence (private to The Credit Analyst)**
- `downside-private` → **Downside worksheet (private to The Downside Reviewer)**
- `portfolio-private` → **Portfolio mandate (private to The Portfolio Analyst)**

The UI must display these labels, never raw stack UUIDs. Private assets are visible only to the owning participant’s retrieval scope and are not listed in the shared documents tab.

## 5. Meeting setup and supplied document

### Exact creation preset

- Agenda/name: **Review HDFC Ltd’s 7.87% 2022 debenture (ISIN INE001A07RW5) as of 31 July 2020**
- Context: **Prepared historical committee review. Establish the terms and rating, test the downside, apply a fictional mandate, and close with a research checklist. Not investment advice.**
- Participants: The Credit Analyst, The Downside Reviewer, The Portfolio Analyst.
- Supplied document: **HDFC Ltd 7.87% 2022 Debenture — Shared Fact Sheet (as of 31 July 2020)** (`hdfc-v007-shared-fact-sheet.md`).

### Locked-form copy

- “This guided replay uses a prepared meeting preset. Editing is disabled so the recorded responses stay aligned with the supplied document.”
- “No bytes are uploaded during replay. The document was prepared offline and is replayed from the package.”
- “Prepared document — offline extraction and retrieval.”

### Recorded intake timeline

| Stage | Recorded time (31 July 2020) | Display |
|---|---|---|
| Received | 09:00:00Z | “Received” |
| Validated | 09:00:05Z | “Validated” |
| Parsed | 09:00:12Z | “Parsed” |
| Indexed | 09:00:20Z | “Indexed” |
| Ready | 09:00:24Z | “Ready” |

Final note: **“Recorded intake. No filesystem write or live parser ran during playback.”**

## 6. Beat sheet and exact displayed copy

Each beat below is the contract for the package and guide. The user action must be a real control. The guide may point, focus, and set the active tab, but it must not synthesize clicks.

### Beat 1 — Meet the board

- Objective: “Inspect the three participants and their shared and private knowledge assignments.”
- Route/surface: `/demo` board preview using the real participant cards.
- Supported input: expand each participant card; no text or file input.
- Shared/private inputs: shared meeting documents; the three private stacks above.
- Read checkpoint: `checkpoint-initial`.
- Tools/events: none; client-side inspection tracking only.
- Resulting checkpoint: `checkpoint-initial`.
- Disclosure: “Prepared board for the recorded meeting.”
- Completion: all three participants inspected; explicit **Continue**.

### Beat 2 — Start the meeting

- Objective: “Complete the prepared creation form and confirm the supplied historical document.”
- Route/surface: `/demo/new`, real form fields with a locked preset.
- Supported input: confirm the preset; select the supplied document; submit.
- Shared/private inputs: the shared fact sheet; the three participants.
- Read checkpoint: `checkpoint-created`.
- Tools/events: `create_meeting` intent; recorded intake receipt.
- Resulting checkpoint: `checkpoint-created`.
- Disclosure: “No upload or write occurs; the intake receipt is recorded.”
- Completion: created checkpoint active; intake timeline shows Ready.

### Beat 3 — Establish the facts

- Objective: “Ask the Credit Analyst to separate supported facts from open items.”
- Route/surface: `/demo/meetings/:id`, chat tab.
- Supported input: the real “Ask the Credit Analyst” action.
- Shared/private inputs: shared fact sheet; private credit evidence.
- Read checkpoint: `checkpoint-created` → `checkpoint-credit`.
- Tools/events: prepared retrieval; recorded tool result; citations C1, C2, C3, C10, C12.
- Resulting checkpoint: `checkpoint-credit`.
- Disclosure: “Prepared retrieval; no live search or model call.”
- Completion: turn terminal; facts, tool result, and citations visible; **Continue**.

### Beat 4 — Challenge the case

- Objective: “Ask the Downside Reviewer to test the rating and liquidity assumptions.”
- Route/surface: chat tab → disagreements tab.
- Supported input: the real “Ask the Downside Reviewer” action; open the disagreements scoreboard.
- Shared/private inputs: shared fact sheet; private downside worksheet.
- Read checkpoint: `checkpoint-credit` → `checkpoint-downside`.
- Tools/events: prepared retrieval; `log_disagreement`; citations C6, C7, C8, C9, C10.
- Resulting checkpoint: `checkpoint-downside`.
- Disclosure: “The downside worksheet is demo-authored, not issuer research.”
- Completion: turn terminal; formal disagreement visible; disagreements tab viewed; **Continue**.

### Beat 5 — Address uncertainty

- Objective: “Send the supported follow-up and ask the Portfolio Analyst what the mandate can conclude.”
- Route/surface: chat tab.
- Supported input: send the locked follow-up; use the real “Ask the Portfolio Analyst” action.
- Shared/private inputs: shared fact sheet; fictional private portfolio mandate.
- Read checkpoint: `checkpoint-downside` → `checkpoint-followup` → `checkpoint-portfolio`.
- Tools/events: `director_follow_up`; prepared retrieval; citations C10, C11, C13.
- Resulting checkpoint: `checkpoint-portfolio`.
- Disclosure: “The mandate is fictional and demo-authored. No current price, yield, or liquidity is available.”
- Completion: both recorded turns terminal; the conclusion and unknowns visible; **Continue**.

### Beat 6 — Align on the checklist

- Objective: “Ask for the concluding discussion and review the formal consensus.”
- Route/surface: chat tab → consensus tab.
- Supported input: the real “Ask the committee to align” action; open the consensus scoreboard.
- Shared/private inputs: shared fact sheet; the three participants’ recorded positions.
- Read checkpoint: `checkpoint-portfolio` → `checkpoint-consensus`.
- Tools/events: prepared retrieval; `log_consensus`; citations C1, C2, C3, C8, C9, C10, C12, C13.
- Resulting checkpoint: `checkpoint-consensus`.
- Disclosure: “The checklist is bounded by the evidence; it is not an investment approval.”
- Completion: turn terminal; consensus visible; consensus tab viewed; **Continue**.

### Beat 7 — Close the meeting

- Objective: “Use the real close entry and review the recorded ballots and final brief.”
- Route/surface: closing tab.
- Supported input: the real **Close meeting** entry; confirm the recorded closing.
- Shared/private inputs: the completed record; the three ballots.
- Read checkpoint: `checkpoint-consensus` → `checkpoint-closed`.
- Tools/events: `request_closing` intent; closing tape with ballots and summary.
- Resulting checkpoint: `checkpoint-closed`.
- Disclosure: “Recorded closing. No live vote or model call occurs.”
- Completion: closing terminal; votes, reasons, and final brief visible; meeting ended; **Continue**.

### Beat 8 — Archive the meeting

- Objective: “Archive the ended meeting from the real list and confirm the archived overlay.”
- Route/surface: `/demo/meetings`, real list.
- Supported input: the real archive action on the ended meeting; confirm.
- Shared/private inputs: the ended record and completed closing.
- Read checkpoint: `checkpoint-closed` → `checkpoint-archived`.
- Tools/events: `archive_meeting` intent; archived checkpoint.
- Resulting checkpoint: `checkpoint-archived`.
- Disclosure: “Archiving is an overlay. The meeting remains ended and cannot be reopened in this replay.”
- Completion: archived overlay visible; underlying ended state preserved; **Finish**.

## 7. Exact dialogue and recorded effects

The package’s turn tapes must stream these texts. Citations are the claim IDs above; tool artifacts must agree with the completed checkpoint.

### Director opening message

> We are reviewing HDFC Ltd’s 7.87% 2022 debenture (ISIN INE001A07RW5) as of 31 July 2020. Credit Analyst, establish the terms and rating, and separate what the record supports from what it does not.

### Credit Analyst final message

> CRISIL’s annexure row for ISIN INE001A07RW5 lists a 7.87% coupon, allotment on 18 July 2019, scheduled maturity on 18 July 2022, and an issue size of Rs 5,000 crore. CRISIL assigned AAA/Stable on 31 July 2020; that is the strongest credit evidence in the record, but it is an opinion, not a guarantee or a current rating. The FY20 MD&A reports standalone total income of Rs 58,763 crore, profit after tax of Rs 17,770 crore, and Rs 46,437 crore of secured redeemable NCDs raised at issuer level. The stated tenor is 1,096 days, about three years. Three scheduled annual coupons at 7.87% would sum to 23.61% of principal; that is not a yield. The annexure calls the instrument a debenture, but the retained excerpt does not establish series-level security. The record has no executable price, yield, or secondary-market liquidity, and it does not assert payment. This is a 31 July 2020 information set, not a current rating.

Citations: C1, C2, C3, C10, C12. Prepared retrieval: shared fact sheet and private credit evidence.

### Downside Reviewer final message

> I accept the terms. I disagree with treating AAA/Stable as sufficient comfort. The rating is a dated opinion, not a guarantee and not a current rating. My worksheet models a +200bp rate move and a risk-off secondary market; that is a scenario, not a forecast. The FY20 MD&A says the NCDs are listed on the NSE/BSE wholesale debt market, but listing is not executable liquidity. The record has no price, yield, or liquidity data, so I cannot infer a mark-to-market value or a successful refinancing. I am logging a formal disagreement on whether the rating alone supports a conclusion.

Citations: C6, C7, C8, C9, C10. Prepared retrieval: shared fact sheet and private downside worksheet.

Formal disagreement:

- Target: **The Credit Analyst**
- Topic: **Rating alone is insufficient**
- Reasoning: **AAA/Stable is a dated opinion, not a guarantee or current market evidence; the record has no executable price, yield, or liquidity data.**
- Severity: **3**

### Director follow-up

> Portfolio Analyst, assume a fictional three-year mandate that requires an executable price, yield, and liquidity assessment. What can you conclude from this record?

### Portfolio Analyst final message

> The mandate cannot be completed from this record. I have a fictional three-year horizon, but no executable price, yield, secondary-market liquidity, or series-level payment evidence. The coupon is not a yield. The scheduled maturity is not proof of payment. I can only recommend a research checklist: confirm the series terms and security, obtain a current price/yield and liquidity assessment, and verify the payment outcome when it occurs. I cannot size a position or recommend a purchase.

Citations: C10, C11, C13. Prepared retrieval: shared fact sheet and private portfolio mandate. The mandate is demo-authored and fictional.

### Concluding discussion final message

> The committee can align on a bounded checklist. Facts: the 2020 terms, rating, and issuer-level FY20 context. Judgments: the rating is an opinion; the downside scenarios are illustrative. Unknowns: current price, executable yield, secondary liquidity, series-level security, and payment outcome. The discussion can close on that basis; this is not an investment approval.

Citations: C1, C2, C3, C8, C9, C10, C12, C13. Prepared retrieval: shared fact sheet.

Formal consensus:

- Participants: **The Credit Analyst, The Downside Reviewer, The Portfolio Analyst**
- Topic: **Research checklist separates facts, judgments, and unknowns**
- Strength: **4**

### Closing ballots

| Participant | Vote | Reason |
|---|---|---|
| The Credit Analyst | yes | The facts and unknowns are recorded; the discussion is complete. |
| The Downside Reviewer | yes | The disagreement is logged; the checklist captures the missing market evidence. |
| The Portfolio Analyst | yes | The mandate cannot be completed; closing on a research checklist is appropriate. |

Closing result: **completed**. The ballots decide that the discussion is complete; they do not approve an investment.

### Closing summary / final brief

> The committee voted to conclude. Outcome: a research checklist, not a buy/sell recommendation or investment approval. Facts: the 2020 terms and CRISIL AAA/Stable rating. Judgments: the rating is an opinion; the downside scenarios are illustrative. Unknowns: current price, executable yield, secondary liquidity, series-level security, and payment outcome. Next steps: verify the series terms and security; obtain current market evidence; monitor the scheduled 18 July 2022 maturity without asserting payment.

Citations: C1, C2, C10, C11, C13.

### Archive copy

> Archived. The meeting remains ended; this replay does not reopen it.

## 8. UI labels and disclosure copy

- Persistent label: **Guided replay**
- Global disclosure: **Prepared historical educational content. No live research, current pricing, or investment advice. No fresh model charge.**
- Read-only notice: **Recorded session. Playback is read-only; no live action is available.**
- As-of/source line: **Information as of 31 July 2020 · sources captured 16 October 2026.**
- Unsupported-action notice: **Not available in guided replay.**
- Locked-form notice: **Prepared preset — editing is disabled for this replay.**
- Citation provenance labels:
  - Fact: **Source** + locator.
  - Derived: **Derived from the cited terms**.
  - Judgment: **Committee judgment**.
  - Demo-authored: **Prepared for this replay**.
  - Unknown: **Not established in the record**.

Do not display “live”, “committed”, “saved on demand”, or “continues on server” as descriptions of replay behavior. Do not fabricate thinking traces, token usage, cost, or savings. If usage is mentioned at all, use **not measured in replay**.

## 9. Package shape and verification

- Package ID: `hdfc-ine001a07rw5`
- Version: `1`
- One published, linear journey; no branches or scenario menu.
- Checkpoints: `checkpoint-initial`, `checkpoint-created`, `checkpoint-credit`, `checkpoint-downside`, `checkpoint-followup`, `checkpoint-portfolio`, `checkpoint-consensus`, `checkpoint-closed`, `checkpoint-archived`.
- Turn tapes: credit, downside, portfolio, consensus.
- Closing tape: one, from `checkpoint-consensus` to `checkpoint-closed`.
- Intents: `create-meeting`, `credit-analyst`, `downside-reviewer`, `director-follow-up`, `portfolio-analyst`, `concluding-discussion`, `close-meeting`, `archive-meeting`.
- Assets: shared fact sheet; three private demo-authored inputs; two evidence transcriptions; source register.
- Offline validation must prove:
  - every beat’s start/completed checkpoint and step completion are coherent;
  - every factual citation resolves to a claim, evidence asset, SHA-256, and locator;
  - no message exposes the final answer before its terminal;
  - no synthetic cost, usage, secret, or raw stack UUID is displayed;
  - no future merger, redemption, or payment-outcome text;
  - the archived checkpoint keeps the completed closing and ended lifecycle.
- The package is validated from a clean checkout without `untracked-bond-research/` or untracked test imports.

## 10. Approval checklist

- [x] Exact dialogue and UI copy approved.
- [x] Citation statements, locators, and source capture dates approved.
- [x] Short excerpt retention/redistribution approved for S1 and S4.
- [x] No future hindsight or investment recommendation.
- [x] Package publication as `hdfc-ine001a07rw5` version `1` approved.

Approved on 28 October 2026. The production package is committed with the hash above; later edits require a new version and a new approval.

Until all five boxes are checked, this file is a candidate and the production package must not be published.
