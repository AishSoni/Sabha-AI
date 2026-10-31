# Spec 26 Content Ledger — Expanded Recorded Meeting Exploration

Status: **approved for the local expanded package `hdfc-ine001a07rw5` version 6**
on 31 October 2026. This ledger covers only the Spec 26 additions. The original
Spec 18 content approval and its version-1 ledger remain historical and unchanged.

## 1. Provenance and scope

- Meeting as-of date: **31 July 2020**. This is the information cutoff, not the
  playback date.
- Source capture date: **16 October 2026**. Full source bytes were not retained;
  short transcriptions remain in the package evidence assets.
- Playback/preparation date: **30 October 2026**, recorded in the package
  provenance. This ledger was executed on 31 October 2026.
- All dialogue, choices, branch continuations, closing summaries, and summary
  text are **demo-authored recorded content**. `model_run: none`; no paid model
  run, live retrieval, current-market lookup, or provider call was made.
- Permitted source material is the existing approved material: CRISIL rating
  rationale (S1), HDFC FY20 MD&A (S4), the shared HDFC fact sheet, credit
  evidence, downside worksheet, and portfolio mandate. No new external source
  was introduced.
- The untracked `untracked-bond-research/` folder, the two PDFs there, old demo
  fixtures, and aggregator/merger hindsight remain excluded. Nothing from them
  is used.
- The expansion does not assert a price, executable yield, secondary-market
  liquidity, series-level secured status, covenant package, or payment outcome.
  Those remain unknown at the meeting date.
- Package version: **6**. Schema: **2**. Content SHA-256:
  `48014296bc2f98c0270c72ecee7c5d527cb35536b6c9c3846ffc9590cb37113d`.
- Canonical guide: the original eight beats and their canonical transitions are
  unchanged. Expanded actions are separate, non-canonical transitions and do
  not complete canonical beats.

## 2. Claims registry

C1–C13 are unchanged from the approved Spec 18 ledger. They remain the only
factual and derived claims used by the canonical and branch transcripts. The new
claims are all `demo_authored` and describe prepared paths or prepared questions;
they do not add market facts.

| ID | Kind | Exact displayed statement | Evidence / locator |
|---|---|---|---|
| C14 | demo_authored | “A prepared path may open with a downside review before the credit fact pack; the evidence set does not change.” | `private/downside-worksheet.md`; prepared branch note, downside first |
| C15 | demo_authored | “A prepared path may open with the portfolio mandate so the missing market inputs are visible before the credit discussion.” | `private/portfolio-mandate.md`; prepared branch note, mandate first |
| C16 | demo_authored | “The liquidity follow-up asks whether the listed debenture can be sold before maturity without assuming a price or a buyer.” | `shared/hdfc-v007-fact-sheet.md`; prepared follow-up, liquidity |
| C17 | demo_authored | “The covenant follow-up asks which contractual protections would survive a rating downgrade; the record does not supply the covenant package.” | `shared/hdfc-v007-fact-sheet.md`; prepared follow-up, covenants |
| C18 | demo_authored | “The red-team turn tests whether the research checklist claims more than the retained evidence supports.” | `shared/hdfc-v007-fact-sheet.md`; prepared branch note, red team |

Every citation in the new participant messages resolves to C1–C18. The closing
summaries reuse the same facts, judgments, and unknowns as the canonical closing.

## 3. Prepared choices and branches

Three choice states are offered. The canonical option remains available at each
state; the alternatives are prepared transitions, not free-form generation.

| Source state | Prepared choices | Continuation |
|---|---|---|
| `checkpoint-created` | Credit Analyst (canonical); Test the downside first; Start from the mandate | Branches run to their own closing and archive |
| `checkpoint-downside` | Canonical follow-up; Ask about liquidity; Ask about covenants | Each follow-up has a prepared participant response, then closing and archive |
| `checkpoint-portfolio` | Concluding discussion (canonical); Red-team the checklist | Red-team branch has its own closing and archive |

### 3.1 Downside-first branch

- Participant turn, The Downside Reviewer:
  “Testing the downside first is reasonable. AAA/Stable is a dated opinion, not a
  guarantee. The record shows listing, not executable liquidity, and it contains
  no price or yield, so any mark-to-market outcome remains unknown.”
- Director follow-up: “Keep the sequence honest: the downside has been stated,
  but the credit terms and rating still need to be established. Please confirm
  the instrument record before the mandate is applied.”
- Participant turn, The Portfolio Analyst:
  “The mandate still cannot be completed. The record supplies terms and a
  scheduled maturity, not a current price, yield, or secondary-market liquidity.
  Treat the scheduled date as a maturity, not as proof of payment.”
- Closing summary:
  “The committee closed after the downside-first path. Outcome: a research
  checklist, not an investment approval. The terms and dated rating are recorded;
  the missing price, yield, liquidity, security, and payment evidence remain
  unknowns.”

### 3.2 Mandate-first branch

- Participant turn, The Portfolio Analyst:
  “Starting with the mandate exposes the gap immediately. It requires an
  executable price, yield, and liquidity assessment, and the record supplies none
  of them. The only defensible output is a research checklist, not a position
  size or a mark.”
- Closing summary:
  “The committee closed after starting from the mandate. Outcome: the mandate
  cannot be completed on the retained record. Terms and the dated rating are
  facts; current market evidence and payment outcome remain unknown.”

### 3.3 Liquidity-follow-up branch

- Director follow-up: “Can the listed debenture be sold before maturity without
  assuming a buyer or a price? Separate listing from executable liquidity, and
  state what evidence would be needed to answer the question.”
- Participant response, The Credit Analyst:
  “Listing on the wholesale debt market is not executable liquidity. Without a
  price, a yield, or a demonstrated buyer, a sale before maturity cannot be
  assumed. The record supports a liquidity question, not a liquidity conclusion.”
- Closing summary:
  “The committee closed after the liquidity follow-up. Outcome: listing is not
  executable liquidity. The record supports the instrument terms and dated
  rating, but not a sale price, buyer, yield, or payment outcome.”

### 3.4 Covenant-follow-up branch

- Director follow-up: “Which contractual protections would survive a downgrade,
  and does the retained record contain the covenant package? If it does not, say
  so rather than inferring protections from the rating.”
- Participant response, The Downside Reviewer:
  “The retained record does not include the covenant package, so downgrade
  protections cannot be established. A rating opinion is not a covenant, and the
  absence of evidence should be recorded as an unknown rather than filled in.”
- Closing summary:
  “The committee closed after the covenant follow-up. Outcome: the covenant
  package is not in the record, so downgrade protections cannot be established.
  The checklist keeps that gap explicit and avoids inferring protections from the
  rating.”

### 3.5 Red-team branch

- Participant turn, The Credit Analyst:
  “The checklist does not overstate the evidence. It records the terms and the
  dated rating, labels the scenarios illustrative, and keeps price, yield,
  liquidity, security, and payment outcome as unknowns. That is the correct
  boundary.”
- Closing summary:
  “The committee closed after the red-team challenge. Outcome: the checklist
  stays within the evidence. Facts, judgments, and unknowns remain separated, and
  no recommendation or market conclusion is asserted.”

## 4. Chapter index

Every chapter is data-only, inspection mode, and pinned to the published
package. Inspecting a chapter reconstructs a recorded snapshot; it is not a newly
completed turn and does not complete a canonical guide step.

| Chapter | Title | Checkpoint | Route / tab |
|---|---|---|---|
| `chapter-board` | Prepared board | `checkpoint-created` | board / roster |
| `chapter-setup` | Board setup | `checkpoint-created` | new / roster |
| `chapter-files` | Files and sources | `checkpoint-credit` | meeting / documents |
| `chapter-facts` | Recorded facts | `checkpoint-credit` | meeting / chat |
| `chapter-disagreement` | Recorded disagreement | `checkpoint-downside` | meeting / disagreements |
| `chapter-followup` | Recorded follow-up | `checkpoint-followup` | meeting / chat |
| `chapter-consensus` | Recorded consensus | `checkpoint-consensus` | meeting / consensus |
| `chapter-closing` | Completed closing | `checkpoint-closed` | meeting / closing |
| `chapter-summary` | Recorded summary | `checkpoint-archived` | meeting / summary |
| `chapter-archive` | Archived result | `checkpoint-archived` | list / chat |
| `chapter-downside-first` | Downside-first branch | `checkpoint-downside-first` | meeting / chat |
| `chapter-first-close` | First-branch closing | `checkpoint-closed-first` | meeting / closing |
| `chapter-liquidity-close` | Liquidity-branch closing | `checkpoint-closed-liquidity` | meeting / closing |
| `chapter-red-team` | Red-team branch | `checkpoint-red-team` | meeting / chat |

## 5. Recorded summary

The Summary chapter reuses the approved authored system message
`a0000000-0000-4000-8000-000000000407`, which is also the canonical closing
summary. It is retained verbatim:

> The committee voted to conclude. Outcome: a research checklist, not a buy/sell
> recommendation or investment approval. Facts: the 2020 terms and CRISIL
> AAA/Stable rating. Judgments: the rating is an opinion; the downside scenarios
> are illustrative. Unknowns: current price, executable yield, secondary
> liquidity, series-level security, and payment outcome. Next steps: verify the
> series terms and security; obtain current market evidence; monitor the
> scheduled 18 July 2022 maturity without asserting payment.

The recorded Summary surface labels this **Recorded summary**, states the
historical scope, and is inspection-only. It has no working Generate summary
control, synthetic charge, settings/vault dependency, or live provider call. The
live on-demand summary adapter is unchanged for live meetings.

## 6. Approval and limitations

- Approved: the authored branch dialogue, prepared follow-ups and responses,
  closing summaries, chapter metadata, and reuse of the recorded summary above.
- Not approved or asserted: current market facts, a fresh model run, a live
  retrieval result, a recommendation, or a hosted acceptance pass.
- The package remains immutable once published. Any wording change requires a
  new package version and a new content hash; version 5 and the Spec 18 ledger
  are not rewritten.
- Publication and hosted acceptance remain separately gated by Spec 27.
