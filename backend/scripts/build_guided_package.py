"""Build the approved guided bond journey package.

The package is authored content, not a live model run. The build is deterministic:
run this script, validate the package offline, and publish the pinned version.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.modules.meetings.application.prompts import BASE_SYSTEM_PROMPT
from app.replay.constants import (
    DELAY_BALLOT_PROVISIONAL_MS,
    DELAY_BALLOT_TERMINAL_MS,
    DELAY_CITATION_MS,
    DELAY_DONE_MS,
    DELAY_SUMMARY_PROVISIONAL_MS,
    DELAY_SUMMARY_TERMINAL_MS,
    DELAY_TEXT_MS,
    DELAY_THINKING_MS,
    DELAY_TOOL_CALL_MS,
    DELAY_TOOL_RESULT_MS,
    TEXT_CHUNK_CHARS,
)
from app.replay.package.loader import compute_content_sha256

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5"

MEETING = "a0000000-0000-4000-8000-000000000001"
CREDIT = "a0000000-0000-4000-8000-000000000101"
DOWNSIDE = "a0000000-0000-4000-8000-000000000102"
PORTFOLIO = "a0000000-0000-4000-8000-000000000103"
DOCUMENT = "a0000000-0000-4000-8000-000000000201"
REVISION = "a0000000-0000-4000-8000-000000000202"
INGEST = "a0000000-0000-4000-8000-000000000203"
CREDIT_OP = "a0000000-0000-4000-8000-000000000301"
DOWNSIDE_OP = "a0000000-0000-4000-8000-000000000302"
PORTFOLIO_OP = "a0000000-0000-4000-8000-000000000303"
CONSENSUS_OP = "a0000000-0000-4000-8000-000000000304"
DECK_CREDIT_OP = "a0000000-0000-4000-8000-000000000321"
DECK_DOWNSIDE_OP = "a0000000-0000-4000-8000-000000000322"
DECK_PORTFOLIO_OP = "a0000000-0000-4000-8000-000000000323"
DECK_CONSENSUS_OP = "a0000000-0000-4000-8000-000000000324"
OPENING_MSG = "a0000000-0000-4000-8000-000000000401"
CREDIT_MSG = "a0000000-0000-4000-8000-000000000402"
DOWNSIDE_MSG = "a0000000-0000-4000-8000-000000000403"
FOLLOWUP_MSG = "a0000000-0000-4000-8000-000000000404"
PORTFOLIO_MSG = "a0000000-0000-4000-8000-000000000405"
CONSENSUS_MSG = "a0000000-0000-4000-8000-000000000406"
SUMMARY_MSG = "a0000000-0000-4000-8000-000000000407"
DISAGREEMENT = "a0000000-0000-4000-8000-000000000501"
CONSENSUS = "a0000000-0000-4000-8000-000000000601"
CLOSING = "a0000000-0000-4000-8000-000000000701"

# Expanded exploration content (spec 26). Each branch is a separate recorded path:
# no transcript is spliced across branches and every branch closes and archives.
BRANCH_OPS = {
    "downside-first": "a0000000-0000-4000-8000-000000000310",
    "portfolio-first": "a0000000-0000-4000-8000-000000000311",
    "portfolio-after-first": "a0000000-0000-4000-8000-000000000312",
    "credit-liquidity": "a0000000-0000-4000-8000-000000000313",
    "downside-covenant": "a0000000-0000-4000-8000-000000000314",
    "red-team": "a0000000-0000-4000-8000-000000000315",
}

AS_OF = "2020-07-31"
CREATED_AT = "2020-07-31T09:00:24Z"
SOURCE_DATE = "2026-10-16"
DISCLOSURE = (
    "Prepared historical educational content. No live research, current pricing, "
    "or investment advice. No fresh model charge."
)

FACT_SHEET = """# HDFC Ltd 7.87% 2022 Debenture - Shared Fact Sheet

Prepared historical information as of 31 July 2020. This is an educational replay,
not investment advice.

## Terms

- Issuer: Housing Development Finance Corporation Limited (HDFC Ltd).
- ISIN: INE001A07RW5.
- Coupon: 7.87% per annum.
- Allotment: 18 July 2019.
- Scheduled maturity: 18 July 2022.
- Issue size: Rs 5,000 crore.
- Stated tenor: 1,096 days, approximately three calendar years, derived from the
  allotment and scheduled maturity.
- Three scheduled annual coupons at 7.87% would sum to 23.61% of principal over
  the stated tenor. That is not a yield and assumes scheduled payments.

## Rating

- CRISIL assigned AAA/Stable on 31 July 2020. The rating is a dated opinion, not
  a guarantee and not a current rating.

## What is not established

- No executable price, yield, or secondary-market liquidity is established in
  this record.
- Scheduled maturity is 18 July 2022; the meeting does not assert that payment
  occurred.
- The rating annexure describes the instrument as a debenture; the retained
  excerpt does not establish series-level secured or unsecured status.

## Outcome and limitations

- The outcome is a research checklist, not a buy/sell recommendation or
  investment approval. Current price, executable yield, liquidity, and payment
  outcome remain unknown.
"""

CRISIL = """# CRISIL rating rationale - retained excerpt

Source: CRISIL Rating Rationale, Housing Development Finance Corporation Limited,
31 July 2020. Locator: "Annexure - Details of Instrument(s)", row for ISIN
INE001A07RW5. Captured 16 October 2026. Short transcription only; the full source
document is not redistributed.

| Field | Recorded value |
|---|---|
| ISIN | INE001A07RW5 |
| Coupon | 7.87% |
| Allotment | 18 July 2019 |
| Scheduled maturity | 18 July 2022 |
| Issue size | Rs 5,000 crore |
| Instrument | Debenture |
| Rating | CRISIL AAA/Stable |
| Rating action date | 31 July 2020 |

Retained row: INE001A07RW5 | 7.87% | 18 July 2019 | 18 July 2022 | Rs 5,000 crore

The annexure row for ISIN INE001A07RW5 is the retained evidence for the terms.
CRISIL AAA/Stable | 31 July 2020 is the retained evidence for the rating action.
Instrument: Debenture. The excerpt does not establish series-level secured or
unsecured status.
"""

HDFC_MDA = """# HDFC Ltd FY20 MD&A - retained excerpt

Source: HDFC Ltd Annual Report 2019-20, Management Discussion & Analysis.
Locator: "MD&A - FY20 standalone performance and borrowings". Captured
16 October 2026. Short transcription only; the full source and audited statements
are not redistributed.

The FY20 MD&A reports standalone total income of Rs 58,763 crore and profit after
tax of Rs 17,770 crore, and Rs 46,437 crore of secured redeemable NCDs raised at
issuer level. The FY20 MD&A states the NCDs are listed on the NSE/BSE wholesale
debt market.
"""

CREDIT_EVIDENCE = """# Credit evidence - private to The Credit Analyst

Prepared evidence for this replay. It collects the recorded terms, rating action,
issuer context, and open items. It is not a current credit opinion.

- The annexure row supports the coupon, allocation, scheduled maturity, issue size,
  and instrument description.
- The rating action is dated 31 July 2020.
- The issuer-level FY20 figures are context, not series-level payment evidence.
- Price, yield, secondary liquidity, series-level security, and payment outcome
  remain open.
"""

DOWNSIDE_WORKSHEET = """# Downside worksheet - demo-authored

Prepared for this replay; not issuer research, a forecast, or investment advice.

## Scenario

The +200bp rate move and risk-off secondary market scenario is demo-authored. It
is an illustrative stress, not a forecast or issuer guidance.

## Liquidity test

Listing is not executable liquidity. The record has no executable price, yield,
or liquidity data, so no mark-to-market or refinancing conclusion is possible.

## Rating test

AAA/Stable is a dated opinion, not a guarantee and not a current rating. The
rating alone is insufficient for a market conclusion.
"""

PORTFOLIO_MANDATE = """# Portfolio mandate - demo-authored and fictional

This mandate is fictional and prepared for this replay. It is not a client
instruction or an investment recommendation.

## Mandate

Assume a three-year horizon. A decision requires an executable price, yield, and
secondary-market liquidity assessment, plus series-level payment evidence.

## Record limits

The record contains no executable price, yield, secondary-market liquidity, or
series-level payment evidence. The coupon is not a yield. Scheduled maturity is
not proof of payment.

## Permitted conclusion

The only permitted conclusion is a research checklist. Do not size a position or
recommend a purchase.
"""

SOURCE_REGISTER = """# Source register

Meeting as-of date: 31 July 2020. Source capture date: 16 October 2026.
Playback preparation: 28 October 2026.

## S1

CRISIL Rating Rationale, Housing Development Finance Corporation Limited,
31 July 2020. Locator: "Annexure - Details of Instrument(s)", row for ISIN
INE001A07RW5. Short factual transcription retained. Full bytes were not retained.

## S4

HDFC Ltd Annual Report 2019-20, Management Discussion & Analysis. Locator:
"MD&A - FY20 standalone performance and borrowings". Short factual transcription
retained. Full bytes were not retained.

## Exclusions

The working research index and its PDFs are not package assets. No live price,
yield, current rating, liquidity, merger, or redemption outcome is used. No source
was refetched to fill a gap.
"""

CLAIM_TEXT = {
    "C1": "CRISIL's annexure row for ISIN INE001A07RW5 lists a 7.87% coupon, allotment on 18 July 2019, scheduled maturity on 18 July 2022, and an issue size of Rs 5,000 crore.",
    "C2": "CRISIL assigned AAA/Stable on 31 July 2020.",
    "C3": "The FY20 MD&A reports standalone total income of Rs 58,763 crore and profit after tax of Rs 17,770 crore, and Rs 46,437 crore of secured redeemable NCDs raised at issuer level.",
    "C4": "The stated tenor is 1,096 days, approximately three calendar years, derived from the 18 July 2019 allotment and 18 July 2022 scheduled maturity.",
    "C5": "Three scheduled annual coupons at 7.87% would sum to 23.61% of principal over the stated tenor; this is not a yield and assumes scheduled payments.",
    "C6": "The FY20 MD&A states the NCDs are listed on the NSE/BSE wholesale debt market.",
    "C7": "Listing is not the same as executable secondary liquidity; the record contains no price, yield, or liquidity data.",
    "C8": "AAA/Stable is a rating opinion dated 31 July 2020, not a guarantee and not a current rating.",
    "C9": "The +200bp rate move and risk-off secondary-market scenario is demo-authored for this replay; it is not a forecast or issuer guidance.",
    "C10": "The meeting record contains no executable price, yield, or secondary-market liquidity data for the series.",
    "C11": "Scheduled maturity is 18 July 2022; the meeting does not assert that payment occurred.",
    "C12": "The rating annexure describes the instrument as a debenture; the retained excerpt does not establish series-level secured or unsecured status.",
    "C13": "The outcome is a research checklist, not a buy/sell recommendation or investment approval.",
}

CLAIMS = [
    {
        "claim_id": "C1",
        "kind": "fact",
        "text": CLAIM_TEXT["C1"],
        "evidence_asset_id": "crisil-annexure",
        "locator": "S1 annexure row for ISIN INE001A07RW5",
        "excerpt": "INE001A07RW5 | 7.87% | 18 July 2019 | 18 July 2022 | Rs 5,000 crore",
        "source_url": "https://www.crisil.com/mnt/winshare/Ratings/RatingList/RatingDocs/Housing_Development_Finance_Corporation_Limited_July_31_2020_RR.html",
        "source_title": "CRISIL Rating Rationale, 31 July 2020",
        "capture_date": SOURCE_DATE,
    },
    {
        "claim_id": "C2",
        "kind": "fact",
        "text": CLAIM_TEXT["C2"],
        "evidence_asset_id": "crisil-annexure",
        "locator": "S1 rating action",
        "excerpt": "CRISIL AAA/Stable | 31 July 2020",
        "source_url": "https://www.crisil.com/mnt/winshare/Ratings/RatingList/RatingDocs/Housing_Development_Finance_Corporation_Limited_July_31_2020_RR.html",
        "source_title": "CRISIL Rating Rationale, 31 July 2020",
        "capture_date": SOURCE_DATE,
    },
    {
        "claim_id": "C3",
        "kind": "fact",
        "text": CLAIM_TEXT["C3"],
        "evidence_asset_id": "hdfc-fy20-mda",
        "locator": "S4 MD&A, FY20 standalone performance and borrowings",
        "excerpt": "standalone total income of Rs 58,763 crore",
        "source_url": "https://homeloans.hdfc.bank.in/digital-annual-report-2019-2020/mda",
        "source_title": "HDFC Ltd Annual Report 2019-20, MD&A",
        "capture_date": SOURCE_DATE,
    },
    {
        "claim_id": "C4",
        "kind": "derived",
        "text": CLAIM_TEXT["C4"],
        "evidence_asset_id": "shared-fact-sheet",
        "locator": "Shared fact sheet, Terms",
        "excerpt": "1,096 days",
    },
    {
        "claim_id": "C5",
        "kind": "derived",
        "text": CLAIM_TEXT["C5"],
        "evidence_asset_id": "shared-fact-sheet",
        "locator": "Shared fact sheet, Terms",
        "excerpt": "23.61%",
    },
    {
        "claim_id": "C6",
        "kind": "fact",
        "text": CLAIM_TEXT["C6"],
        "evidence_asset_id": "hdfc-fy20-mda",
        "locator": "S4 MD&A, borrowings",
        "excerpt": "listed on the NSE/BSE",
        "source_url": "https://homeloans.hdfc.bank.in/digital-annual-report-2019-2020/mda",
        "source_title": "HDFC Ltd Annual Report 2019-20, MD&A",
        "capture_date": SOURCE_DATE,
    },
    {
        "claim_id": "C7",
        "kind": "judgment",
        "text": CLAIM_TEXT["C7"],
        "evidence_asset_id": "downside-worksheet",
        "locator": "Downside worksheet, Liquidity test",
        "excerpt": "Listing is not executable liquidity",
    },
    {
        "claim_id": "C8",
        "kind": "judgment",
        "text": CLAIM_TEXT["C8"],
        "evidence_asset_id": "downside-worksheet",
        "locator": "Downside worksheet, Rating test",
        "excerpt": "dated opinion, not a guarantee",
    },
    {
        "claim_id": "C9",
        "kind": "demo_authored",
        "text": CLAIM_TEXT["C9"],
        "evidence_asset_id": "downside-worksheet",
        "locator": "Downside worksheet, Scenario",
        "excerpt": "+200bp rate move and risk-off secondary market",
    },
    {
        "claim_id": "C10",
        "kind": "unknown",
        "text": CLAIM_TEXT["C10"],
        "evidence_asset_id": "shared-fact-sheet",
        "locator": "Shared fact sheet, What is not established",
        "excerpt": "No executable price, yield, or secondary-market liquidity",
    },
    {
        "claim_id": "C11",
        "kind": "unknown",
        "text": CLAIM_TEXT["C11"],
        "evidence_asset_id": "shared-fact-sheet",
        "locator": "Shared fact sheet, What is not established",
        "excerpt": "Scheduled maturity is 18 July 2022",
    },
    {
        "claim_id": "C12",
        "kind": "unknown",
        "text": CLAIM_TEXT["C12"],
        "evidence_asset_id": "crisil-annexure",
        "locator": "S1 instrument column",
        "excerpt": "Instrument: Debenture",
    },
    {
        "claim_id": "C13",
        "kind": "judgment",
        "text": CLAIM_TEXT["C13"],
        "evidence_asset_id": "shared-fact-sheet",
        "locator": "Shared fact sheet, Outcome and limitations",
        "excerpt": "research checklist, not a buy/sell recommendation",
    },
    {
        "claim_id": "C14",
        "kind": "demo_authored",
        "text": (
            "A prepared path may open with a downside review before the credit fact pack; "
            "the evidence set does not change."
        ),
        "locator": "Prepared branch note, downside first",
        "evidence_asset_id": "downside-worksheet",
    },
    {
        "claim_id": "C15",
        "kind": "demo_authored",
        "text": (
            "A prepared path may open with the portfolio mandate so the missing market "
            "inputs are visible before the credit discussion."
        ),
        "locator": "Prepared branch note, mandate first",
        "evidence_asset_id": "portfolio-mandate",
    },
    {
        "claim_id": "C16",
        "kind": "demo_authored",
        "text": (
            "The liquidity follow-up asks whether the listed debenture can be sold before "
            "maturity without assuming a price or a buyer."
        ),
        "locator": "Prepared follow-up, liquidity",
        "evidence_asset_id": "downside-worksheet",
    },
    {
        "claim_id": "C17",
        "kind": "demo_authored",
        "text": (
            "The covenant follow-up asks which contractual protections would survive a "
            "rating downgrade; the record does not supply the covenant package."
        ),
        "locator": "Prepared follow-up, covenants",
        "evidence_asset_id": "shared-fact-sheet",
    },
    {
        "claim_id": "C18",
        "kind": "demo_authored",
        "text": (
            "The red-team turn tests whether the research checklist claims more than the "
            "retained evidence supports."
        ),
        "locator": "Prepared branch note, red team",
        "evidence_asset_id": "shared-fact-sheet",
    },
]

CREDIT_TEXT = (
    "CRISIL's annexure row for ISIN INE001A07RW5 lists a 7.87% coupon, allotment on "
    "18 July 2019, scheduled maturity on 18 July 2022, and an issue size of Rs 5,000 "
    "crore. CRISIL assigned AAA/Stable on 31 July 2020; that is the strongest credit "
    "evidence in the record, but it is an opinion, not a guarantee or a current "
    "rating. The FY20 MD&A reports standalone total income of Rs 58,763 crore, profit "
    "after tax of Rs 17,770 crore, and Rs 46,437 crore of secured redeemable NCDs "
    "raised at issuer level. The stated tenor is 1,096 days, about three years. Three "
    "scheduled annual coupons at 7.87% would sum to 23.61% of principal; that is not a "
    "yield. The annexure calls the instrument a debenture, but the retained excerpt "
    "does not establish series-level security. The record has no executable price, "
    "yield, or secondary-market liquidity, and it does not assert payment. This is a "
    "31 July 2020 information set, not a current rating."
)

DOWNSIDE_TEXT = (
    "I accept the terms. I disagree with treating AAA/Stable as sufficient comfort. "
    "The rating is a dated opinion, not a guarantee and not a current rating. My "
    "worksheet models a +200bp rate move and a risk-off secondary market; that is a "
    "scenario, not a forecast. The FY20 MD&A says the NCDs are listed on the NSE/BSE "
    "wholesale debt market, but listing is not executable liquidity. The record has no "
    "price, yield, or liquidity data, so I cannot infer a mark-to-market value or a "
    "successful refinancing. I am logging a formal disagreement on whether the rating "
    "alone supports a conclusion."
)

FOLLOWUP_TEXT = (
    "Portfolio Analyst, assume a fictional three-year mandate that requires an "
    "executable price, yield, and liquidity assessment. What can you conclude from "
    "this record?"
)

PORTFOLIO_TEXT = (
    "The mandate cannot be completed from this record. I have a fictional three-year "
    "horizon, but no executable price, yield, secondary-market liquidity, or "
    "series-level payment evidence. The coupon is not a yield. The scheduled maturity "
    "is not proof of payment. I can only recommend a research checklist: confirm the "
    "series terms and security, obtain a current price/yield and liquidity assessment, "
    "and verify the payment outcome when it occurs. I cannot size a position or "
    "recommend a purchase."
)

CONSENSUS_TEXT = (
    "The committee can align on a bounded checklist. Facts: the 2020 terms, rating, "
    "and issuer-level FY20 context. Judgments: the rating is an opinion; the downside "
    "scenarios are illustrative. Unknowns: current price, executable yield, secondary "
    "liquidity, series-level security, and payment outcome. The discussion can close "
    "on that basis; this is not an investment approval."
)

CREDIT_THINKING = (
    "Start with the instrument record: coupon, allotment, maturity, and issue size. "
    "The CRISIL annexure is the strongest credit evidence, but it is a dated opinion, "
    "so I must not present it as a current rating. Pull the FY20 issuer figures for "
    "scale, keeping them separate from series-level terms. Check the coupon arithmetic "
    "and label the result correctly: not a yield. Test whether the retained excerpt "
    "establishes security or payment; it does not. Finish by separating what the "
    "record proves from the missing price, yield, and liquidity evidence."
)

DOWNSIDE_THINKING = (
    "Accept the recorded terms, but challenge the comfort being drawn from AAA/Stable. "
    "A rating is a point-in-time opinion, not a guarantee or current market evidence. "
    "The record shows listing, not executable liquidity. Frame a +200bp and risk-off "
    "scenario as an illustration, not a forecast. Because price, yield, and liquidity "
    "data are absent, I cannot infer a mark-to-market value or a refinancing outcome. "
    "Log the disagreement so the scoreboard captures the gap between rating comfort "
    "and market evidence."
)

PORTFOLIO_THINKING = (
    "Apply the fictional three-year mandate literally: it requires an executable "
    "price, yield, and liquidity assessment. The record supplies terms and a scheduled "
    "maturity, but none of the market inputs the mandate needs. The coupon is not a "
    "yield, and scheduled maturity is not proof of payment. Do not size a position or "
    "infer a mark. The only defensible output is a research checklist: confirm the "
    "series terms and security, obtain current market evidence, and verify payment "
    "when it occurs."
)

CONSENSUS_THINKING = (
    "Reconcile the three positions. The Credit Analyst established the terms and "
    "rating; the Downside Reviewer separated a dated opinion from market evidence; the "
    "Portfolio Analyst showed the mandate cannot be completed. The shared ground is a "
    "bounded checklist of facts, judgments, and unknowns. Confirm the facts and "
    "unknowns match the record, keep the downside scenarios labeled illustrative, and "
    "avoid turning alignment into an investment approval. Log consensus at strength 4."
)

# Version 9 plays the prepared turns in visitor order, so the alignment reasoning
# cannot refer to who spoke first or what a prior speaker established.
CONSENSUS_THINKING_V9 = (
    "Reconcile the positions into shared ground. The record supplies facts, judgments, "
    "and unknowns; it does not supply an executable price, yield, or secondary-market "
    "liquidity. Confirm the checklist matches the record, keep the downside scenarios "
    "labeled illustrative, and avoid turning alignment into an investment approval. "
    "Log consensus at strength 4."
)

SUMMARY_TEXT = (
    "The committee voted to conclude. Outcome: a research checklist, not a buy/sell "
    "recommendation or investment approval. Facts: the 2020 terms and CRISIL "
    "AAA/Stable rating. Judgments: the rating is an opinion; the downside scenarios "
    "are illustrative. Unknowns: current price, executable yield, secondary liquidity, "
    "series-level security, and payment outcome. Next steps: verify the series terms "
    "and security; obtain current market evidence; monitor the scheduled 18 July 2022 "
    "maturity without asserting payment."
)

BALLOT_REASONS = {
    CREDIT: "Yes - the facts and unknowns are recorded; the discussion is complete.",
    DOWNSIDE: "Yes - the disagreement is logged; the checklist captures the missing market evidence.",
    PORTFOLIO: "Yes - the mandate cannot be completed; closing on a research checklist is appropriate.",
}

DOWNFIRST_TEXT = (
    "Testing the downside first is reasonable. AAA/Stable is a dated opinion, not a "
    "guarantee. The record shows listing, not executable liquidity, and it contains no "
    "price or yield, so any mark-to-market outcome remains unknown."
)
PORTFOLIO_FIRST_TEXT = (
    "Starting with the mandate exposes the gap immediately. It requires an executable "
    "price, yield, and liquidity assessment, and the record supplies none of them. The "
    "only defensible output is a research checklist, not a position size or a mark."
)
FOLLOWUP_FIRST_TEXT = (
    "Keep the sequence honest: the downside has been stated, but the credit terms and "
    "rating still need to be established. Please confirm the instrument record before "
    "the mandate is applied."
)
PORTFOLIO_AFTER_FIRST_TEXT = (
    "The mandate still cannot be completed. The record supplies terms and a scheduled "
    "maturity, not a current price, yield, or secondary-market liquidity. Treat the "
    "scheduled date as a maturity, not as proof of payment."
)
LIQUIDITY_FOLLOW_TEXT = (
    "Can the listed debenture be sold before maturity without assuming a buyer or a "
    "price? Separate listing from executable liquidity, and state what evidence would "
    "be needed to answer the question."
)
LIQUIDITY_RESPONSE_TEXT = (
    "Listing on the wholesale debt market is not executable liquidity. Without a price, "
    "a yield, or a demonstrated buyer, a sale before maturity cannot be assumed. The "
    "record supports a liquidity question, not a liquidity conclusion."
)
COVENANT_FOLLOW_TEXT = (
    "Which contractual protections would survive a downgrade, and does the retained "
    "record contain the covenant package? If it does not, say so rather than inferring "
    "protections from the rating."
)
COVENANT_RESPONSE_TEXT = (
    "The retained record does not include the covenant package, so downgrade "
    "protections cannot be established. A rating opinion is not a covenant, and the "
    "absence of evidence should be recorded as an unknown rather than filled in."
)
REDTEAM_TEXT = (
    "The checklist does not overstate the evidence. It records the terms and the dated "
    "rating, labels the scenarios illustrative, and keeps price, yield, liquidity, "
    "security, and payment outcome as unknowns. That is the correct boundary."
)
SUMMARY_FIRST_TEXT = (
    "The committee closed after the downside-first path. Outcome: a research checklist, "
    "not an investment approval. The terms and dated rating are recorded; the missing "
    "price, yield, liquidity, security, and payment evidence remain unknowns."
)
SUMMARY_PORTFOLIO_FIRST_TEXT = (
    "The committee closed after starting from the mandate. Outcome: the mandate cannot "
    "be completed on the retained record. Terms and the dated rating are facts; current "
    "market evidence and payment outcome remain unknown."
)
SUMMARY_LIQUIDITY_TEXT = (
    "The committee closed after the liquidity follow-up. Outcome: listing is not "
    "executable liquidity. The record supports the instrument terms and dated rating, "
    "but not a sale price, buyer, yield, or payment outcome."
)
SUMMARY_COVENANT_TEXT = (
    "The committee closed after the covenant follow-up. Outcome: the covenant package is "
    "not in the record, so downgrade protections cannot be established. The checklist "
    "keeps that gap explicit and avoids inferring protections from the rating."
)
SUMMARY_REDTEAM_TEXT = (
    "The committee closed after the red-team challenge. Outcome: the checklist stays "
    "within the evidence. Facts, judgments, and unknowns remain separated, and no "
    "recommendation or market conclusion is asserted."
)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def citation(claim_id: str) -> dict[str, Any]:
    claim = next(item for item in CLAIMS if item["claim_id"] == claim_id)
    source = {
        "fact": "CRISIL / HDFC source",
        "derived": "Derived from the recorded terms",
        "judgment": "Committee judgment",
        "unknown": "Record evidence",
        "demo_authored": "Prepared for this replay",
    }[claim["kind"]]
    if claim_id in {"C1", "C2", "C12"}:
        source = "CRISIL rating rationale"
    elif claim_id in {"C3", "C6"}:
        source = "HDFC Ltd FY20 MD&A"
    return {
        "source": source,
        "title": claim.get("source_title") or claim["locator"],
        "url": claim.get("source_url"),
        "snippet": claim["text"],
        "claim_id": claim_id,
        "locator": claim["locator"],
    }


def citations(*claim_ids: str) -> list[dict[str, Any]]:
    return [citation(claim_id) for claim_id in claim_ids]


def participant(
    participant_id: str,
    name: str,
    role: str,
    prompt: str,
    color: str,
    stack_ids: list[str],
) -> dict[str, Any]:
    return {
        "id": participant_id,
        "meeting_id": MEETING,
        "name": name,
        "role": role,
        "system_prompt": prompt,
        "provider_config": {"provider": "recorded", "model": "recorded"},
        "color": color,
        "persona_id": None,
        "stack_ids": stack_ids,
        "created_at": CREATED_AT,
        "generation_policy": {},
    }


PARTICIPANTS = [
    participant(
        CREDIT,
        "The Credit Analyst",
        "Credit Analyst",
        "You are The Credit Analyst. Test the record: terms, rating, issuer context, and what is missing.",
        "#6366f1",
        ["shared-meeting-documents", "credit-private"],
    ),
    participant(
        DOWNSIDE,
        "The Downside Reviewer",
        "Downside Reviewer",
        "You are The Downside Reviewer. Stress-test the case: ratings are opinions; rates and liquidity can change.",
        "#f59e0b",
        ["shared-meeting-documents", "downside-private"],
    ),
    participant(
        PORTFOLIO,
        "The Portfolio Analyst",
        "Portfolio Analyst",
        "You are The Portfolio Analyst. Apply a fictional mandate and distinguish what can be concluded from what cannot.",
        "#10b981",
        ["shared-meeting-documents", "portfolio-private"],
    ),
]

PARTICIPANT_BY_ID = {item["id"]: item for item in PARTICIPANTS}
STACK_LABELS = {
    "shared-meeting-documents": "Meeting documents (shared)",
    "credit-private": "Credit evidence (private to The Credit Analyst)",
    "downside-private": "Downside worksheet (private to The Downside Reviewer)",
    "portfolio-private": "Portfolio mandate (private to The Portfolio Analyst)",
}
SAMPLE_APPROVED_AT = "2026-10-31"


def upload_sample(
    *,
    sample_id: str,
    asset_id: str,
    path: str,
    content: str,
    role: str,
    destinations: list[str],
    description: str,
    accessible_label: str,
    scenario_id: str,
    chunks: int,
    failure_message: str | None = None,
) -> dict[str, Any]:
    """Build one reviewed upload sample from its retained package bytes."""

    return {
        "sample_id": sample_id,
        "asset_id": asset_id,
        "file_name": path.rsplit("/", 1)[-1],
        "media_type": "text/markdown",
        "size_bytes": len(content.encode("utf-8")),
        "sha256": sha256(content),
        "role": role,
        "destination_kinds": destinations,
        "description": description,
        "accessible_label": accessible_label,
        "provenance": "demo-authored",
        "rights_status": "approved-for-upload",
        "approved_at": SAMPLE_APPROVED_AT,
        "preview_mode": "inline",
        "scenario_id": scenario_id,
        "prepared_chunk_count": chunks,
        "failure_message": failure_message,
    }


def workspace_seed() -> dict[str, Any]:
    """Author the schema-2 practice seed for the expanded demo workspace.

    The seed mirrors the recorded board: three personas with authored revision
    history, the same four stacks, and one practice intake preset linked to the
    recorded creation beat. It contains no provider configuration or live ID.
    """

    histories = {
        CREDIT: [
            (
                "rev-credit-1",
                "You are The Credit Analyst. Test the record: terms, rating, issuer context, and what is missing.",
                "Initial authored role.",
                "2026-10-24",
            ),
            (
                "rev-credit-2",
                "You are The Credit Analyst. Test the record, separate facts from judgments, and name the retained evidence behind each conclusion.",
                "Adds evidence separation after the first board review.",
                "2026-10-27",
            ),
            (
                "rev-credit-3",
                PARTICIPANT_BY_ID[CREDIT]["system_prompt"],
                "Aligns the practice template with the recorded participant prompt.",
                "2026-10-30",
            ),
        ],
        DOWNSIDE: [
            (
                "rev-downside-1",
                "You are The Downside Reviewer. Stress-test the case and label demo-authored scenarios.",
                "Initial authored role.",
                "2026-10-25",
            ),
            (
                "rev-downside-2",
                PARTICIPANT_BY_ID[DOWNSIDE]["system_prompt"],
                "Aligns the practice template with the recorded participant prompt.",
                "2026-10-30",
            ),
        ],
        PORTFOLIO: [
            (
                "rev-portfolio-1",
                "You are The Portfolio Analyst. Apply a fictional mandate and state the residual uncertainty.",
                "Initial authored role.",
                "2026-10-26",
            ),
            (
                "rev-portfolio-2",
                PARTICIPANT_BY_ID[PORTFOLIO]["system_prompt"],
                "Aligns the practice template with the recorded participant prompt.",
                "2026-10-30",
            ),
        ],
    }
    descriptions = {
        CREDIT: "Tests the issuer record, covenant context, and evidence quality before the board relies on a fact.",
        DOWNSIDE: "Presents the strongest failure case and labels demo-authored scenarios as authored.",
        PORTFOLIO: "Checks the instrument against the fictional mandate and keeps residual uncertainty visible.",
    }
    persona_ids = {
        CREDIT: "persona-credit",
        DOWNSIDE: "persona-downside",
        PORTFOLIO: "persona-portfolio",
    }
    personas = []
    for participant in PARTICIPANTS:
        participant_id = participant["id"]
        revisions = [
            {
                "revision_id": revision_id,
                "prompt": prompt,
                "reason": reason,
                "created_at": created_at,
            }
            for revision_id, prompt, reason, created_at in histories[participant_id]
        ]
        personas.append(
            {
                "persona_id": persona_ids[participant_id],
                "name": participant["name"],
                "role": participant["role"],
                "description": descriptions[participant_id],
                "color": participant["color"],
                "stack_ids": participant["stack_ids"],
                "revisions": revisions,
                "active_revision_id": revisions[-1]["revision_id"],
                "recorded_participant_id": participant_id,
            }
        )

    stacks = [
        {
            "stack_id": stack_id,
            "label": label,
            "scope": "shared" if stack_id == "shared-meeting-documents" else "private",
            "description": (
                "Shared reference material for the recorded board."
                if stack_id == "shared-meeting-documents"
                else "Private working papers for the recorded participant."
            ),
        }
        for stack_id, label in STACK_LABELS.items()
    ]

    samples = [
        upload_sample(
            sample_id="sample-shared-fact-sheet",
            asset_id="shared-fact-sheet",
            path="shared/hdfc-v007-shared-fact-sheet.md",
            content=FACT_SHEET,
            role="shared-research",
            destinations=["meeting", "stack"],
            description=(
                "Prepared historical terms, rating, and stated limits for the "
                "HDFC debenture. Shared reference material."
            ),
            accessible_label="Shared HDFC fact sheet, Markdown, four prepared chunks",
            scenario_id="ready-after-indexing",
            chunks=4,
        ),
        upload_sample(
            sample_id="sample-credit-notes",
            asset_id="credit-evidence",
            path="private/credit-evidence.md",
            content=CREDIT_EVIDENCE,
            role="participant-notes",
            destinations=["stack"],
            description=(
                "Private credit working notes. Only the Credit Analyst is "
                "assigned to this practice stack."
            ),
            accessible_label="Credit analyst notes, Markdown, two prepared chunks",
            scenario_id="ready-after-indexing",
            chunks=2,
        ),
        upload_sample(
            sample_id="sample-portfolio-mandate",
            asset_id="portfolio-mandate",
            path="private/portfolio-mandate.md",
            content=PORTFOLIO_MANDATE,
            role="mandate-material",
            destinations=["stack"],
            description=(
                "Fictional portfolio mandate for the Portfolio Analyst practice "
                "stack, with explicit record limits."
            ),
            accessible_label="Portfolio mandate, Markdown, three prepared chunks",
            scenario_id="ready-after-indexing",
            chunks=3,
        ),
        upload_sample(
            sample_id="sample-downside-retry",
            asset_id="downside-worksheet",
            path="private/downside-worksheet.md",
            content=DOWNSIDE_WORKSHEET,
            role="failure-retry",
            destinations=["meeting", "stack"],
            description=(
                "Demo-authored downside worksheet. This sample fails once on "
                "purpose so the retry path can be practised safely."
            ),
            accessible_label="Downside worksheet failure and retry sample, Markdown",
            scenario_id="fail-once",
            chunks=3,
            failure_message=(
                "Prepared simulation: the first ingestion attempt stopped before "
                "indexing. Retry reuses this same document and operation."
            ),
        ),
    ]

    return {
        "seed_version": 3,
        "base_instructions": BASE_SYSTEM_PROMPT,
        "highlighted_persona_id": "persona-credit",
        "disclosure": {
            "practice": (
                "Practice changes live in this browser tab only and disappear "
                "when the workspace is reset or the page is refreshed."
            ),
            "recording": (
                "Participant replies, retrieval, and evidence come from the "
                "prepared recording; practice edits never change recorded content."
            ),
        },
        "personas": personas,
        "stacks": stacks,
        "practice_setups": [
            {
                "setup_id": "practice-intake",
                "label": "Practice the recorded intake",
                "description": (
                    "Try temporary setup edits against a practice meeting. The "
                    "original recorded creation stays canonical."
                ),
                "recorded_example_id": "start-the-meeting",
            }
        ],
        "samples": samples,
        "documents": [
            {
                "document_id": "practice-document-shared-fact",
                "sample_id": "sample-shared-fact-sheet",
                "scope_kind": "stack",
                "scope_id": "shared-meeting-documents",
                "status": "ready",
                "operation_id": "practice-operation-shared-fact",
                "revision_id": "practice-revision-shared-fact",
                "chunk_count": 4,
                "created_at": SAMPLE_APPROVED_AT,
            },
            {
                "document_id": "practice-document-credit-notes",
                "sample_id": "sample-credit-notes",
                "scope_kind": "stack",
                "scope_id": "credit-private",
                "status": "ready",
                "operation_id": "practice-operation-credit-notes",
                "revision_id": "practice-revision-credit-notes",
                "chunk_count": 2,
                "created_at": SAMPLE_APPROVED_AT,
            },
            {
                "document_id": "practice-document-downside-sheet",
                "sample_id": "sample-downside-retry",
                "scope_kind": "stack",
                "scope_id": "downside-private",
                "status": "ready",
                "operation_id": "practice-operation-downside-sheet",
                "revision_id": "practice-revision-downside-sheet",
                "chunk_count": 3,
                "created_at": SAMPLE_APPROVED_AT,
            },
            {
                "document_id": "practice-document-portfolio-mandate",
                "sample_id": "sample-portfolio-mandate",
                "scope_kind": "stack",
                "scope_id": "portfolio-private",
                "status": "ready",
                "operation_id": "practice-operation-portfolio-mandate",
                "revision_id": "practice-revision-portfolio-mandate",
                "chunk_count": 3,
                "created_at": SAMPLE_APPROVED_AT,
            },
        ],
    }


def message(
    message_id: str,
    sequence: int,
    content: str,
    sender_type: str,
    sender_id: str | None,
    sender_name: str,
    message_citations: list[dict[str, Any]],
    tool_artifacts: dict[str, Any] | None,
    request_key: str,
    operation_id: str | None,
    created_at: str,
    thinking_content: str | None = None,
) -> dict[str, Any]:
    return {
        "id": message_id,
        "meeting_id": MEETING,
        "content": content,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "citations": message_citations,
        "tool_artifacts": tool_artifacts,
        "thinking_content": thinking_content,
        "estimated_cost": 0.0,
        "effective_generation": None,
        "sequence": sequence,
        "request_key": request_key,
        "operation_id": operation_id,
        "created_at": created_at,
    }


def retrieval_call(
    key: str, participant_id: str, query: str, hits: int, invocation: str
) -> dict[str, Any]:
    return {
        "invocation_id": f"inv-{invocation}",
        "call_id": f"call-{invocation}",
        "tool_name": "search_knowledge_base",
        "arguments": {"query": query},
        "result": {"retrieval_key": key, "hits": hits},
        "is_error": False,
    }


CREDIT_RETRIEVAL = retrieval_call(
    "retrieval-credit",
    CREDIT,
    "HDFC 7.87% 2022 terms rating issuer context",
    4,
    "credit-1",
)
DOWNSIDE_RETRIEVAL = retrieval_call(
    "retrieval-downside",
    DOWNSIDE,
    "HDFC 7.87% 2022 rating liquidity downside",
    4,
    "downside-1",
)
DOWNSIDE_DISAGREEMENT_CALL = {
    "invocation_id": "inv-downside-2",
    "call_id": "call-downside-2",
    "tool_name": "log_disagreement",
    "arguments": {
        "target_participant_name": "The Credit Analyst",
        "topic": "Rating alone is insufficient",
        "reasoning": (
            "AAA/Stable is a dated opinion, not a guarantee or current market "
            "evidence; the record has no executable price, yield, or liquidity data."
        ),
        "severity": 3,
    },
    "result": {"disagreement_id": DISAGREEMENT},
    "is_error": False,
}
PORTFOLIO_RETRIEVAL = retrieval_call(
    "retrieval-portfolio",
    PORTFOLIO,
    "HDFC 7.87% 2022 mandate price yield liquidity",
    3,
    "portfolio-1",
)
CONSENSUS_RETRIEVAL = retrieval_call(
    "retrieval-consensus",
    CREDIT,
    "HDFC 7.87% 2022 facts judgments unknowns checklist",
    5,
    "consensus-1",
)
CONSENSUS_CALL = {
    "invocation_id": "inv-consensus-2",
    "call_id": "call-consensus-2",
    "tool_name": "log_consensus",
    "arguments": {
        "participants": [
            "The Credit Analyst",
            "The Downside Reviewer",
            "The Portfolio Analyst",
        ],
        "topic": "Research checklist separates facts, judgments, and unknowns",
        "strength": 4,
    },
    "result": {"consensus_id": CONSENSUS},
    "is_error": False,
}


def tool_artifacts(*calls: dict[str, Any]) -> dict[str, Any]:
    return {"calls": list(calls)}


OPENING = message(
    OPENING_MSG,
    0,
    "We are reviewing HDFC Ltd's 7.87% 2022 debenture (ISIN INE001A07RW5) as of "
    "31 July 2020. Credit Analyst, establish the terms and rating, and separate what "
    "the record supports from what it does not.",
    "user",
    None,
    "Director",
    [],
    None,
    "director-opening",
    None,
    "2020-07-31T09:00:30Z",
)
CREDIT_MESSAGE = message(
    CREDIT_MSG,
    1,
    CREDIT_TEXT,
    "ai",
    CREDIT,
    "The Credit Analyst",
    citations("C1", "C2", "C3", "C10", "C12"),
    tool_artifacts(CREDIT_RETRIEVAL),
    "turn-credit",
    CREDIT_OP,
    "2020-07-31T09:01:00Z",
    thinking_content=CREDIT_THINKING,
)
DOWNSIDE_MESSAGE = message(
    DOWNSIDE_MSG,
    2,
    DOWNSIDE_TEXT,
    "ai",
    DOWNSIDE,
    "The Downside Reviewer",
    citations("C6", "C7", "C8", "C9", "C10"),
    tool_artifacts(DOWNSIDE_RETRIEVAL, DOWNSIDE_DISAGREEMENT_CALL),
    "turn-downside",
    DOWNSIDE_OP,
    "2020-07-31T09:02:00Z",
    thinking_content=DOWNSIDE_THINKING,
)
FOLLOWUP = message(
    FOLLOWUP_MSG,
    3,
    FOLLOWUP_TEXT,
    "user",
    None,
    "Director",
    [],
    None,
    "director-followup",
    None,
    "2020-07-31T09:03:00Z",
)
PORTFOLIO_MESSAGE = message(
    PORTFOLIO_MSG,
    4,
    PORTFOLIO_TEXT,
    "ai",
    PORTFOLIO,
    "The Portfolio Analyst",
    citations("C10", "C11", "C13"),
    tool_artifacts(PORTFOLIO_RETRIEVAL),
    "turn-portfolio",
    PORTFOLIO_OP,
    "2020-07-31T09:04:00Z",
    thinking_content=PORTFOLIO_THINKING,
)
CONSENSUS_MESSAGE = message(
    CONSENSUS_MSG,
    5,
    CONSENSUS_TEXT,
    "ai",
    CREDIT,
    "The Credit Analyst",
    citations("C1", "C2", "C3", "C8", "C9", "C10", "C12", "C13"),
    tool_artifacts(CONSENSUS_RETRIEVAL, CONSENSUS_CALL),
    "turn-consensus",
    CONSENSUS_OP,
    "2020-07-31T09:05:00Z",
    thinking_content=CONSENSUS_THINKING,
)
SUMMARY_MESSAGE = message(
    SUMMARY_MSG,
    6,
    SUMMARY_TEXT,
    "system",
    None,
    "Sabha",
    citations("C1", "C2", "C10", "C11", "C13"),
    None,
    "closing-summary-1",
    None,
    "2020-07-31T09:06:00Z",
)


def meeting(status: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": MEETING,
        "name": "Review HDFC Ltd's 7.87% 2022 debenture (ISIN INE001A07RW5) as of 31 July 2020",
        "agenda": (
            "Prepared historical committee review. Establish the terms and rating, "
            "test the downside, apply a fictional mandate, and close with a research "
            "checklist. Not investment advice."
        ),
        "user_id": None,
        "status": status,
        "total_cost": 0.0,
        "created_at": "2020-07-31T09:00:00Z",
        "participants": PARTICIPANTS,
        "messages": messages,
    }


def meeting_summary(status: str) -> dict[str, Any]:
    item = meeting(status, [])
    item["messages"] = []
    return item


def operation(
    operation_id: str,
    participant_id: str,
    request_key: str,
    status: str,
    admission: int,
    final_message_id: str | None,
) -> dict[str, Any]:
    return {
        "operation_id": operation_id,
        "meeting_id": MEETING,
        "participant_id": participant_id,
        "request_key": request_key,
        "status": status,
        "admission": admission,
        "queue_position": 1 if status in ("queued", "executing") else None,
        "created_at": "2020-07-31T09:00:30Z",
        "started_at": "2020-07-31T09:00:30Z" if status != "queued" else None,
        "completed_at": "2020-07-31T09:05:00Z" if status == "completed" else None,
        "final_message_id": final_message_id,
        "cancel_requested": False,
        "error": None,
        "effective_generation": None,
    }


def context_stats(message_count: int) -> dict[str, Any]:
    return {
        "current_tokens": 1200 + message_count * 240,
        "max_tokens": 128000,
        "usage_percent": 1.1,
        "message_tokens": message_count * 240,
        "system_tokens": 900,
        "agenda_tokens": 120,
        "message_count": message_count,
        "participant_count": 3,
    }


def documents() -> list[dict[str, Any]]:
    return [
        {
            "id": DOCUMENT,
            "file_name": "hdfc-v007-shared-fact-sheet.md",
            "file_type": "markdown",
            "file_size_bytes": len(FACT_SHEET.encode("utf-8")),
            "chunk_count": 1,
            "qdrant_collection": None,
            "status": "ready",
            "error_message": None,
            "created_at": "2020-07-31T09:00:24Z",
            "meeting_id": MEETING,
            "persona_id": None,
            "stack_id": None,
            "revision_id": REVISION,
            "revision_state": "ready",
            "operation_id": INGEST,
        }
    ]


def closing_view(
    status: str,
    *,
    archived: bool,
    completed: bool,
    summary_text: str = SUMMARY_TEXT,
    summary_message_id: str = SUMMARY_MSG,
    closing_id: str = CLOSING,
    closing_request_key: str = "closing-request-1",
) -> dict[str, Any]:
    if not completed:
        return {
            "meeting_id": MEETING,
            "meeting_status": status,
            "archived": archived,
            "closing_id": None,
            "request_key": None,
            "mode": None,
            "stage": None,
            "failed_from_stage": None,
            "votes": [],
            "summary": None,
            "summary_message_id": None,
            "error": None,
            "retryable": False,
            "abortable": False,
            "created_at": None,
            "updated_at": None,
            "completed_at": None,
        }
    votes = []
    for participant_id, reason in BALLOT_REASONS.items():
        participant = PARTICIPANT_BY_ID[participant_id]
        votes.append(
            {
                "participant_id": participant_id,
                "participant_name": participant["name"],
                "role": participant["role"],
                "status": "completed",
                "vote": True,
                "reason": reason,
                "provider": "recorded",
                "model": "recorded",
                "usage_kind": "unknown",
                "price_kind": None,
                "estimated_cost": None,
                "reported_cost": None,
                "error_code": None,
                "error_message": None,
                "completed_at": "2020-07-31T09:06:00Z",
            }
        )
    return {
        "meeting_id": MEETING,
        "meeting_status": status,
        "archived": archived,
        "closing_id": closing_id,
        "request_key": closing_request_key,
        "mode": "vote",
        "stage": "completed",
        "failed_from_stage": None,
        "votes": votes,
        "summary": summary_text,
        "summary_message_id": summary_message_id,
        "error": None,
        "retryable": False,
        "abortable": False,
        "created_at": "2020-07-31T09:05:00Z",
        "updated_at": "2020-07-31T09:06:00Z",
        "completed_at": "2020-07-31T09:06:00Z",
    }


def disagreement() -> dict[str, Any]:
    return {
        "id": DISAGREEMENT,
        "meeting_id": MEETING,
        "source_ai_id": DOWNSIDE,
        "target_name": "The Credit Analyst",
        "topic": "Rating alone is insufficient",
        "reasoning": (
            "AAA/Stable is a dated opinion, not a guarantee or current market "
            "evidence; the record has no executable price, yield, or liquidity data."
        ),
        "severity": 3,
        "status": "open",
        "created_at": "2020-07-31T09:02:00Z",
    }


def consensus() -> dict[str, Any]:
    return {
        "id": CONSENSUS,
        "meeting_id": MEETING,
        "participants": [
            "The Credit Analyst",
            "The Downside Reviewer",
            "The Portfolio Analyst",
        ],
        "topic": "Research checklist separates facts, judgments, and unknowns",
        "strength": 4,
        "created_at": "2020-07-31T09:05:00Z",
    }


def board_safe_config() -> dict[str, Any]:
    return {
        "board": {
            "title": "Prepared board for the recorded meeting",
            "participants": [
                {
                    "participant_id": item["id"],
                    "name": item["name"],
                    "role": item["role"],
                    "persona_summary": item["system_prompt"],
                    "stack_ids": item["stack_ids"],
                    "color": item["color"],
                }
                for item in PARTICIPANTS
            ],
            "stacks": {
                stack_id: {"label": label, "scope": "shared" if "shared" in stack_id else "private"}
                for stack_id, label in STACK_LABELS.items()
            },
            "preset": {
                "agenda": meeting("active", [])["name"],
                "context": meeting("active", [])["agenda"],
                "participant_ids": [item["id"] for item in PARTICIPANTS],
                "document_id": DOCUMENT,
                "document_label": "HDFC Ltd 7.87% 2022 Debenture - Shared Fact Sheet (as of 31 July 2020)",
            },
        },
        "intake": {
            "document_id": DOCUMENT,
            "stages": [
                {"key": "received", "label": "Received", "at": "2020-07-31T09:00:00Z"},
                {"key": "validated", "label": "Validated", "at": "2020-07-31T09:00:05Z"},
                {"key": "parsed", "label": "Parsed", "at": "2020-07-31T09:00:12Z"},
                {"key": "indexed", "label": "Indexed", "at": "2020-07-31T09:00:20Z"},
                {"key": "ready", "label": "Ready", "at": "2020-07-31T09:00:24Z"},
            ],
            "note": "Recorded intake. No filesystem write or live parser ran during playback.",
        },
        "disclosure": DISCLOSURE,
        "as_of": "Information as of 31 July 2020 - sources captured 16 October 2026.",
        "settings": {"runtime": "recorded", "notice": "Guided replay; not live research."},
    }


def checkpoint_reads(
    *,
    meeting_status: str,
    messages: list[dict[str, Any]],
    operations: list[dict[str, Any]],
    include_meeting: bool,
    include_documents: bool,
    include_disagreement: bool,
    include_consensus: bool,
    closed: bool,
    archived: bool,
    summary_text: str = SUMMARY_TEXT,
    summary_message_id: str = SUMMARY_MSG,
    closing_id: str = CLOSING,
    closing_request_key: str = "closing-request-1",
) -> dict[str, Any]:
    reads: dict[str, Any] = {"safe_config": board_safe_config()}
    if include_meeting:
        reads["meeting"] = meeting(meeting_status, messages)
        reads["meetings"] = [meeting_summary(meeting_status)]
        reads["disagreements"] = [disagreement()] if include_disagreement else []
        reads["consensus"] = [consensus()] if include_consensus else []
        reads["context_stats"] = context_stats(len(messages))
        reads["documents"] = documents() if include_documents else []
        reads["closing"] = closing_view(
            meeting_status,
            archived=archived,
            completed=closed,
            summary_text=summary_text,
            summary_message_id=summary_message_id,
            closing_id=closing_id,
            closing_request_key=closing_request_key,
        )
        reads["operations"] = operations
    return reads


def checkpoint(checkpoint_id: str, ordinal: int, phase: str, reads: dict[str, Any]) -> dict[str, Any]:
    return {
        "checkpoint_id": checkpoint_id,
        "ordinal": ordinal,
        "phase": phase,
        "meeting_id": MEETING,
        "reads": reads,
    }


def text_chunks(text: str, size: int = TEXT_CHUNK_CHARS) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cut = text.rfind(" ", start, end)
            if cut > start:
                end = cut + 1
        chunks.append(text[start:end])
        start = end
    return chunks


def turn_tape(
    tape_id: str,
    operation_id: str,
    participant_id: str,
    request_key: str,
    initial_checkpoint: str,
    completed_checkpoint: str,
    final_message: dict[str, Any],
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    sequence = 1
    for chunk in text_chunks(final_message.get("thinking_content") or ""):
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "type": "thinking",
                "delay_ms": DELAY_THINKING_MS,
                "payload": {"content": chunk},
            }
        )
        sequence += 1
    for call in final_message["tool_artifacts"]["calls"]:
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "type": "tool_call",
                "delay_ms": DELAY_TOOL_CALL_MS,
                "payload": {
                    "invocation_id": call["invocation_id"],
                    "call_id": call["call_id"],
                    "tool_name": call["tool_name"],
                    "arguments": call["arguments"],
                },
            }
        )
        sequence += 1
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "type": "tool_result",
                "delay_ms": DELAY_TOOL_RESULT_MS,
                "payload": {
                    "invocation_id": call["invocation_id"],
                    "call_id": call["call_id"],
                    "result": call["result"],
                    "is_error": call["is_error"],
                },
            }
        )
        sequence += 1
    for item in final_message["citations"]:
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "type": "citation",
                "delay_ms": DELAY_CITATION_MS,
                "payload": {
                    "source": item["source"],
                    "title": item["title"],
                    "url": item["url"],
                    "snippet": item["snippet"],
                    "claim_id": item["claim_id"],
                    "locator": item["locator"],
                },
            }
        )
        sequence += 1
    for chunk in text_chunks(final_message["content"]):
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "type": "text",
                "delay_ms": DELAY_TEXT_MS,
                "payload": {"content": chunk},
            }
        )
        sequence += 1
    events.append(
        {
            "event_id": f"{tape_id}-{sequence}",
            "sequence": sequence,
            "type": "done",
            "delay_ms": DELAY_DONE_MS,
            "payload": {"message_id": final_message["id"]},
        }
    )
    return {
        "tape_id": tape_id,
        "meeting_id": MEETING,
        "operation_id": operation_id,
        "participant_id": participant_id,
        "request_key": request_key,
        "initial_checkpoint": initial_checkpoint,
        "completed_checkpoint": completed_checkpoint,
        "events": events,
    }


def closing_tape(
    *,
    tape_id: str = "tape-closing",
    closing_id: str = CLOSING,
    initial_checkpoint: str = "checkpoint-consensus",
    completed_checkpoint: str = "checkpoint-closed",
    summary_text: str = SUMMARY_TEXT,
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    sequence = 1
    for participant_id, reason in BALLOT_REASONS.items():
        provisional = reason[: len(reason) // 2].rstrip()
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "item_id": f"ballot:{participant_id}",
                "kind": "ballot",
                "text": provisional,
                "provisional": True,
                "terminal": False,
                "result": None,
                "subject_id": participant_id,
                "delay_ms": DELAY_BALLOT_PROVISIONAL_MS,
            }
        )
        sequence += 1
        events.append(
            {
                "event_id": f"{tape_id}-{sequence}",
                "sequence": sequence,
                "item_id": f"ballot:{participant_id}",
                "kind": "ballot",
                "text": reason,
                "provisional": False,
                "terminal": True,
                "result": "yes",
                "subject_id": participant_id,
                "delay_ms": DELAY_BALLOT_TERMINAL_MS,
            }
        )
        sequence += 1
    provisional_summary = summary_text[: len(summary_text) // 2].rstrip()
    events.append(
        {
            "event_id": f"closing-{sequence}",
            "sequence": sequence,
            "item_id": "summary:final",
            "kind": "summary",
            "text": provisional_summary,
            "provisional": True,
            "terminal": False,
            "result": None,
            "subject_id": None,
            "delay_ms": DELAY_SUMMARY_PROVISIONAL_MS,
        }
    )
    sequence += 1
    events.append(
        {
            "event_id": f"closing-{sequence}",
            "sequence": sequence,
            "item_id": "summary:final",
            "kind": "summary",
            "text": summary_text,
            "provisional": False,
            "terminal": True,
            "result": "completed",
            "subject_id": None,
            "delay_ms": DELAY_SUMMARY_TERMINAL_MS,
        }
    )
    return {
        "tape_id": tape_id,
        "meeting_id": MEETING,
        "closing_id": closing_id,
        "initial_checkpoint": initial_checkpoint,
        "completed_checkpoint": completed_checkpoint,
        "events": events,
    }


def retrieval(
    key: str,
    participant_id: str,
    scope: str,
    stack_id: str | None,
    query: str,
    passages: list[tuple[str, str, float, str]],
) -> dict[str, Any]:
    hits = []
    for rank, (chunk_id, passage, score, claim_id) in enumerate(passages, start=1):
        hits.append(
            {
                "rank": rank,
                "document_id": DOCUMENT,
                "revision_id": REVISION,
                "chunk_id": chunk_id,
                "content_sha256": sha256(FACT_SHEET),
                "passage": passage,
                "score": score,
                "file_name": "hdfc-v007-shared-fact-sheet.md",
                "page_number": 1,
                "locator": {"section": chunk_id},
                "citation": citation(claim_id),
            }
        )
    return {
        "retrieval_key": key,
        "meeting_id": MEETING,
        "participant_id": participant_id,
        "scope": scope,
        "stack_id": stack_id,
        "query": query,
        "hits": hits,
    }


def exploration_content(
    operations_downside: list[dict[str, Any]],
    operations_portfolio: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the bounded, separately validated exploration graph for spec 26."""

    checkpoints: dict[str, Any] = {}
    tapes: list[dict[str, Any]] = []
    closing_tapes: list[dict[str, Any]] = []
    retrievals: list[dict[str, Any]] = []
    ordinal = 9

    def ai_message(
        message_id: str,
        sequence: int,
        text: str,
        participant_id: str,
        name: str,
        claim_ids: tuple[str, ...],
        retrieval_key: str,
        operation_id: str,
        thinking: str,
    ) -> dict[str, Any]:
        call = retrieval_call(
            retrieval_key, participant_id, retrieval_key.replace("-", " "), 3, retrieval_key
        )
        return message(
            message_id,
            sequence,
            text,
            "ai",
            participant_id,
            name,
            citations(*claim_ids),
            tool_artifacts(call),
            f"turn-{retrieval_key}",
            operation_id,
            CREATED_AT,
            thinking_content=thinking,
        )

    def director_message(
        message_id: str, sequence: int, text: str, request_key: str
    ) -> dict[str, Any]:
        return message(
            message_id,
            sequence,
            text,
            "user",
            None,
            "Director",
            [],
            None,
            request_key,
            None,
            CREATED_AT,
        )

    def summary_message(
        message_id: str, sequence: int, text: str, request_key: str
    ) -> dict[str, Any]:
        return message(
            message_id,
            sequence,
            text,
            "system",
            None,
            "Sabha",
            citations("C1", "C2", "C10", "C11", "C13"),
            None,
            request_key,
            None,
            CREATED_AT,
        )

    def add_checkpoint(
        checkpoint_id: str,
        messages: list[dict[str, Any]],
        operations: list[dict[str, Any]],
        *,
        phase: str = "active",
        summary_text: str = "",
        summary_message_id: str = "",
        closing_id: str = CLOSING,
        closing_request_key: str = "closing-request-1",
    ) -> None:
        nonlocal ordinal
        closed = phase in ("closed", "archived")
        status = "archived" if phase == "archived" else "ended" if closed else "active"
        reads = checkpoint_reads(
            meeting_status=status,
            messages=list(messages),
            operations=operations,
            include_meeting=True,
            include_documents=True,
            include_disagreement=bool(summary_text),
            include_consensus=bool(summary_text),
            closed=closed,
            archived=phase == "archived",
            summary_text=summary_text or SUMMARY_TEXT,
            summary_message_id=summary_message_id or SUMMARY_MSG,
            closing_id=closing_id,
            closing_request_key=closing_request_key,
        )
        checkpoints[checkpoint_id] = checkpoint(checkpoint_id, ordinal, phase, reads)
        ordinal += 1

    def add_retrieval(
        key: str,
        participant_id: str,
        scope: str,
        stack_id: str | None,
        query: str,
        passages: list[tuple[str, str, float, str]],
    ) -> None:
        retrievals.append(retrieval(key, participant_id, scope, stack_id, query, passages))

    # --- Choice A, alternative 1: downside first -----------------------------
    a2_messages = [OPENING]
    a2_ops = [
        operation(
            BRANCH_OPS["downside-first"],
            DOWNSIDE,
            "turn-retrieval-downside-first",
            "completed",
            1,
            "a0000000-0000-4000-8000-000000000410",
        )
    ]
    a2_messages.append(
        ai_message(
            "a0000000-0000-4000-8000-000000000410",
            1,
            DOWNFIRST_TEXT,
            DOWNSIDE,
            "The Downside Reviewer",
            ("C6", "C7", "C8", "C10", "C14"),
            "retrieval-downside-first",
            BRANCH_OPS["downside-first"],
            "Test the rating and liquidity assumptions before the fact pack.",
        )
    )
    add_retrieval(
        "retrieval-downside-first",
        DOWNSIDE,
        "private",
        "downside-private",
        "downside-first rating listing liquidity",
        [
            ("listing", "NCDs listed on the NSE/BSE wholesale debt market.", 0.9, "C6"),
            ("liquidity", "Listing is not executable liquidity.", 0.88, "C7"),
            ("scenario", "+200bp rate move and risk-off secondary market scenario.", 0.8, "C9"),
        ],
    )
    add_checkpoint("checkpoint-downside-first", a2_messages, a2_ops)
    a2_messages.append(
        director_message(
            "a0000000-0000-4000-8000-000000000411",
            2,
            FOLLOWUP_FIRST_TEXT,
            "director-follow-up-first",
        )
    )
    add_checkpoint("checkpoint-followup-first", a2_messages, a2_ops)
    a2_messages.append(
        ai_message(
            "a0000000-0000-4000-8000-000000000412",
            3,
            PORTFOLIO_AFTER_FIRST_TEXT,
            PORTFOLIO,
            "The Portfolio Analyst",
            ("C10", "C11", "C13", "C15"),
            "retrieval-portfolio-after-first",
            BRANCH_OPS["portfolio-after-first"],
            "Apply the mandate after the downside has been stated.",
        )
    )
    a2_ops = a2_ops + [
        operation(
            BRANCH_OPS["portfolio-after-first"],
            PORTFOLIO,
            "turn-retrieval-portfolio-after-first",
            "completed",
            2,
            "a0000000-0000-4000-8000-000000000412",
        )
    ]
    add_retrieval(
        "retrieval-portfolio-after-first",
        PORTFOLIO,
        "private",
        "portfolio-private",
        "mandate after downside",
        [
            ("limits", "No executable price, yield, or secondary-market liquidity.", 0.93, "C10"),
            ("maturity", "Scheduled maturity is 18 July 2022; no payment assertion.", 0.86, "C11"),
            ("outcome", "A research checklist, not a recommendation.", 0.84, "C13"),
        ],
    )
    add_checkpoint("checkpoint-portfolio-first-2", a2_messages, a2_ops)
    a2_messages.append(
        summary_message(
            "a0000000-0000-4000-8000-000000000430",
            4,
            SUMMARY_FIRST_TEXT,
            "closing-summary-first",
        )
    )
    add_checkpoint(
        "checkpoint-closed-first",
        a2_messages,
        a2_ops,
        phase="closed",
        summary_text=SUMMARY_FIRST_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000430",
        closing_id="a0000000-0000-4000-8000-000000000702",
        closing_request_key="closing-request-first",
    )
    add_checkpoint(
        "checkpoint-archived-first",
        a2_messages,
        a2_ops,
        phase="archived",
        summary_text=SUMMARY_FIRST_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000430",
        closing_id="a0000000-0000-4000-8000-000000000702",
        closing_request_key="closing-request-first",
    )
    tapes.append(
        turn_tape(
            "tape-downside-first",
            BRANCH_OPS["downside-first"],
            DOWNSIDE,
            "turn-retrieval-downside-first",
            "checkpoint-created",
            "checkpoint-downside-first",
            a2_messages[1],
        )
    )
    tapes.append(
        turn_tape(
            "tape-portfolio-after-first",
            BRANCH_OPS["portfolio-after-first"],
            PORTFOLIO,
            "turn-retrieval-portfolio-after-first",
            "checkpoint-followup-first",
            "checkpoint-portfolio-first-2",
            a2_messages[3],
        )
    )
    closing_tapes.append(
        closing_tape(
            tape_id="tape-closing-first",
            closing_id="a0000000-0000-4000-8000-000000000702",
            initial_checkpoint="checkpoint-portfolio-first-2",
            completed_checkpoint="checkpoint-closed-first",
            summary_text=SUMMARY_FIRST_TEXT,
        )
    )

    # --- Choice A, alternative 2: portfolio first ----------------------------
    a3_messages = [OPENING]
    a3_ops = [
        operation(
            BRANCH_OPS["portfolio-first"],
            PORTFOLIO,
            "turn-retrieval-portfolio-first",
            "completed",
            1,
            "a0000000-0000-4000-8000-000000000413",
        )
    ]
    a3_messages.append(
        ai_message(
            "a0000000-0000-4000-8000-000000000413",
            1,
            PORTFOLIO_FIRST_TEXT,
            PORTFOLIO,
            "The Portfolio Analyst",
            ("C10", "C11", "C13", "C15"),
            "retrieval-portfolio-first",
            BRANCH_OPS["portfolio-first"],
            "Start from the mandate and expose the missing market inputs.",
        )
    )
    add_retrieval(
        "retrieval-portfolio-first",
        PORTFOLIO,
        "private",
        "portfolio-private",
        "portfolio-first mandate",
        [
            ("limits", "No executable price, yield, or secondary-market liquidity.", 0.93, "C10"),
            ("maturity", "Scheduled maturity is 18 July 2022; no payment assertion.", 0.86, "C11"),
            ("outcome", "A research checklist, not a recommendation.", 0.84, "C13"),
        ],
    )
    add_checkpoint("checkpoint-portfolio-first", a3_messages, a3_ops)
    a3_messages.append(
        summary_message(
            "a0000000-0000-4000-8000-000000000431",
            2,
            SUMMARY_PORTFOLIO_FIRST_TEXT,
            "closing-summary-portfolio-first",
        )
    )
    add_checkpoint(
        "checkpoint-closed-portfolio-first",
        a3_messages,
        a3_ops,
        phase="closed",
        summary_text=SUMMARY_PORTFOLIO_FIRST_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000431",
        closing_id="a0000000-0000-4000-8000-000000000703",
        closing_request_key="closing-request-portfolio-first",
    )
    add_checkpoint(
        "checkpoint-archived-portfolio-first",
        a3_messages,
        a3_ops,
        phase="archived",
        summary_text=SUMMARY_PORTFOLIO_FIRST_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000431",
        closing_id="a0000000-0000-4000-8000-000000000703",
        closing_request_key="closing-request-portfolio-first",
    )
    tapes.append(
        turn_tape(
            "tape-portfolio-first",
            BRANCH_OPS["portfolio-first"],
            PORTFOLIO,
            "turn-retrieval-portfolio-first",
            "checkpoint-created",
            "checkpoint-portfolio-first",
            a3_messages[1],
        )
    )
    closing_tapes.append(
        closing_tape(
            tape_id="tape-closing-portfolio-first",
            closing_id="a0000000-0000-4000-8000-000000000703",
            initial_checkpoint="checkpoint-portfolio-first",
            completed_checkpoint="checkpoint-closed-portfolio-first",
            summary_text=SUMMARY_PORTFOLIO_FIRST_TEXT,
        )
    )

    # --- Choice B, alternative 1: liquidity follow-up ------------------------
    b2_prefix = [OPENING, CREDIT_MESSAGE, DOWNSIDE_MESSAGE]
    b2_messages = b2_prefix + [
        director_message(
            "a0000000-0000-4000-8000-000000000414",
            3,
            LIQUIDITY_FOLLOW_TEXT,
            "director-follow-up-liquidity",
        )
    ]
    add_checkpoint("checkpoint-followup-liquidity", b2_messages, operations_downside)
    b2_messages = b2_messages + [
        ai_message(
            "a0000000-0000-4000-8000-000000000415",
            4,
            LIQUIDITY_RESPONSE_TEXT,
            CREDIT,
            "The Credit Analyst",
            ("C6", "C7", "C10", "C16"),
            "retrieval-credit-liquidity",
            BRANCH_OPS["credit-liquidity"],
            "Answer the liquidity follow-up without inventing a price or buyer.",
        )
    ]
    b2_ops = operations_downside + [
        operation(
            BRANCH_OPS["credit-liquidity"],
            CREDIT,
            "turn-retrieval-credit-liquidity",
            "completed",
            3,
            "a0000000-0000-4000-8000-000000000415",
        )
    ]
    add_retrieval(
        "retrieval-credit-liquidity",
        CREDIT,
        "shared",
        None,
        "liquidity before maturity",
        [
            ("listing", "NCDs listed on the NSE/BSE wholesale debt market.", 0.9, "C6"),
            ("liquidity", "Listing is not executable liquidity.", 0.88, "C7"),
            ("limits", "No executable price, yield, or secondary-market liquidity.", 0.84, "C10"),
        ],
    )
    add_checkpoint("checkpoint-credit-liquidity", b2_messages, b2_ops)
    b2_messages = b2_messages + [
        summary_message(
            "a0000000-0000-4000-8000-000000000432",
            5,
            SUMMARY_LIQUIDITY_TEXT,
            "closing-summary-liquidity",
        )
    ]
    add_checkpoint(
        "checkpoint-closed-liquidity",
        b2_messages,
        b2_ops,
        phase="closed",
        summary_text=SUMMARY_LIQUIDITY_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000432",
        closing_id="a0000000-0000-4000-8000-000000000704",
        closing_request_key="closing-request-liquidity",
    )
    add_checkpoint(
        "checkpoint-archived-liquidity",
        b2_messages,
        b2_ops,
        phase="archived",
        summary_text=SUMMARY_LIQUIDITY_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000432",
        closing_id="a0000000-0000-4000-8000-000000000704",
        closing_request_key="closing-request-liquidity",
    )
    tapes.append(
        turn_tape(
            "tape-credit-liquidity",
            BRANCH_OPS["credit-liquidity"],
            CREDIT,
            "turn-retrieval-credit-liquidity",
            "checkpoint-followup-liquidity",
            "checkpoint-credit-liquidity",
            b2_messages[4],
        )
    )
    closing_tapes.append(
        closing_tape(
            tape_id="tape-closing-liquidity",
            closing_id="a0000000-0000-4000-8000-000000000704",
            initial_checkpoint="checkpoint-credit-liquidity",
            completed_checkpoint="checkpoint-closed-liquidity",
            summary_text=SUMMARY_LIQUIDITY_TEXT,
        )
    )

    # --- Choice B, alternative 2: covenant follow-up -------------------------
    b3_messages = b2_prefix + [
        director_message(
            "a0000000-0000-4000-8000-000000000416",
            3,
            COVENANT_FOLLOW_TEXT,
            "director-follow-up-covenant",
        )
    ]
    add_checkpoint("checkpoint-followup-covenant", b3_messages, operations_downside)
    b3_messages = b3_messages + [
        ai_message(
            "a0000000-0000-4000-8000-000000000417",
            4,
            COVENANT_RESPONSE_TEXT,
            DOWNSIDE,
            "The Downside Reviewer",
            ("C8", "C10", "C17"),
            "retrieval-downside-covenant",
            BRANCH_OPS["downside-covenant"],
            "State the missing covenant evidence rather than inferring protections.",
        )
    ]
    b3_ops = operations_downside + [
        operation(
            BRANCH_OPS["downside-covenant"],
            DOWNSIDE,
            "turn-retrieval-downside-covenant",
            "completed",
            3,
            "a0000000-0000-4000-8000-000000000417",
        )
    ]
    add_retrieval(
        "retrieval-downside-covenant",
        DOWNSIDE,
        "private",
        "downside-private",
        "downgrade covenant protections",
        [
            ("rating", "AAA/Stable is a dated opinion, not a guarantee.", 0.87, "C8"),
            ("limits", "No executable price, yield, or secondary-market liquidity.", 0.84, "C10"),
        ],
    )
    add_checkpoint("checkpoint-downside-covenant", b3_messages, b3_ops)
    b3_messages = b3_messages + [
        summary_message(
            "a0000000-0000-4000-8000-000000000433",
            5,
            SUMMARY_COVENANT_TEXT,
            "closing-summary-covenant",
        )
    ]
    add_checkpoint(
        "checkpoint-closed-covenant",
        b3_messages,
        b3_ops,
        phase="closed",
        summary_text=SUMMARY_COVENANT_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000433",
        closing_id="a0000000-0000-4000-8000-000000000705",
        closing_request_key="closing-request-covenant",
    )
    add_checkpoint(
        "checkpoint-archived-covenant",
        b3_messages,
        b3_ops,
        phase="archived",
        summary_text=SUMMARY_COVENANT_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000433",
        closing_id="a0000000-0000-4000-8000-000000000705",
        closing_request_key="closing-request-covenant",
    )
    tapes.append(
        turn_tape(
            "tape-downside-covenant",
            BRANCH_OPS["downside-covenant"],
            DOWNSIDE,
            "turn-retrieval-downside-covenant",
            "checkpoint-followup-covenant",
            "checkpoint-downside-covenant",
            b3_messages[4],
        )
    )
    closing_tapes.append(
        closing_tape(
            tape_id="tape-closing-covenant",
            closing_id="a0000000-0000-4000-8000-000000000705",
            initial_checkpoint="checkpoint-downside-covenant",
            completed_checkpoint="checkpoint-closed-covenant",
            summary_text=SUMMARY_COVENANT_TEXT,
        )
    )

    # --- Choice C, alternative: red team ------------------------------------
    c2_messages = [
        OPENING,
        CREDIT_MESSAGE,
        DOWNSIDE_MESSAGE,
        FOLLOWUP,
        PORTFOLIO_MESSAGE,
    ]
    c2_ops = operations_portfolio
    c2_messages.append(
        ai_message(
            "a0000000-0000-4000-8000-000000000418",
            5,
            REDTEAM_TEXT,
            CREDIT,
            "The Credit Analyst",
            ("C1", "C2", "C10", "C13", "C18"),
            "retrieval-red-team",
            BRANCH_OPS["red-team"],
            "Test whether the checklist overstates the retained evidence.",
        )
    )
    c2_ops = c2_ops + [
        operation(
            BRANCH_OPS["red-team"],
            CREDIT,
            "turn-retrieval-red-team",
            "completed",
            5,
            "a0000000-0000-4000-8000-000000000418",
        )
    ]
    add_retrieval(
        "retrieval-red-team",
        CREDIT,
        "shared",
        None,
        "red team checklist evidence",
        [
            ("terms", "Recorded terms and rating.", 0.9, "C1"),
            ("rating", "Rating opinion dated 31 July 2020.", 0.86, "C2"),
            ("limits", "No executable price, yield, or secondary liquidity.", 0.84, "C10"),
            ("outcome", "Research checklist, not investment approval.", 0.82, "C13"),
        ],
    )
    add_checkpoint("checkpoint-red-team", c2_messages, c2_ops)
    c2_messages.append(
        summary_message(
            "a0000000-0000-4000-8000-000000000434",
            6,
            SUMMARY_REDTEAM_TEXT,
            "closing-summary-red-team",
        )
    )
    add_checkpoint(
        "checkpoint-closed-red-team",
        c2_messages,
        c2_ops,
        phase="closed",
        summary_text=SUMMARY_REDTEAM_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000434",
        closing_id="a0000000-0000-4000-8000-000000000706",
        closing_request_key="closing-request-red-team",
    )
    add_checkpoint(
        "checkpoint-archived-red-team",
        c2_messages,
        c2_ops,
        phase="archived",
        summary_text=SUMMARY_REDTEAM_TEXT,
        summary_message_id="a0000000-0000-4000-8000-000000000434",
        closing_id="a0000000-0000-4000-8000-000000000706",
        closing_request_key="closing-request-red-team",
    )
    tapes.append(
        turn_tape(
            "tape-red-team",
            BRANCH_OPS["red-team"],
            CREDIT,
            "turn-retrieval-red-team",
            "checkpoint-portfolio",
            "checkpoint-red-team",
            c2_messages[5],
        )
    )
    closing_tapes.append(
        closing_tape(
            tape_id="tape-closing-red-team",
            closing_id="a0000000-0000-4000-8000-000000000706",
            initial_checkpoint="checkpoint-red-team",
            completed_checkpoint="checkpoint-closed-red-team",
            summary_text=SUMMARY_REDTEAM_TEXT,
        )
    )

    intents = [
        {
            "intent_id": "downside-first",
            "kind": "start_participant",
            "checkpoint": "checkpoint-created",
            "participant_id": DOWNSIDE,
            "operation_id": BRANCH_OPS["downside-first"],
            "tape_id": "tape-downside-first",
            "label": "Test the downside first",
        },
        {
            "intent_id": "portfolio-first",
            "kind": "start_participant",
            "checkpoint": "checkpoint-created",
            "participant_id": PORTFOLIO,
            "operation_id": BRANCH_OPS["portfolio-first"],
            "tape_id": "tape-portfolio-first",
            "label": "Start from the mandate",
        },
        {
            "intent_id": "close-portfolio-first",
            "kind": "request_closing",
            "checkpoint": "checkpoint-portfolio-first",
            "closing_tape_id": "tape-closing-portfolio-first",
            "label": "Close the mandate-first branch",
        },
        {
            "intent_id": "archive-portfolio-first",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived-portfolio-first",
            "label": "Archive the mandate-first branch",
        },
        {
            "intent_id": "followup-downside-first",
            "kind": "director_follow_up",
            "checkpoint": "checkpoint-followup-first",
            "participant_id": DOWNSIDE,
            "label": "Ask for the instrument record",
        },
        {
            "intent_id": "portfolio-after-first",
            "kind": "start_participant",
            "checkpoint": "checkpoint-followup-first",
            "participant_id": PORTFOLIO,
            "operation_id": BRANCH_OPS["portfolio-after-first"],
            "tape_id": "tape-portfolio-after-first",
            "label": "Apply the mandate",
        },
        {
            "intent_id": "close-first",
            "kind": "request_closing",
            "checkpoint": "checkpoint-portfolio-first-2",
            "closing_tape_id": "tape-closing-first",
            "label": "Close the first branch",
        },
        {
            "intent_id": "archive-first",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived-first",
            "label": "Archive the first branch",
        },
        {
            "intent_id": "liquidity-follow-up",
            "kind": "director_follow_up",
            "checkpoint": "checkpoint-followup-liquidity",
            "participant_id": CREDIT,
            "label": "Ask about liquidity",
        },
        {
            "intent_id": "credit-liquidity",
            "kind": "start_participant",
            "checkpoint": "checkpoint-followup-liquidity",
            "participant_id": CREDIT,
            "operation_id": BRANCH_OPS["credit-liquidity"],
            "tape_id": "tape-credit-liquidity",
            "label": "Answer the liquidity question",
        },
        {
            "intent_id": "close-liquidity",
            "kind": "request_closing",
            "checkpoint": "checkpoint-credit-liquidity",
            "closing_tape_id": "tape-closing-liquidity",
            "label": "Close the liquidity branch",
        },
        {
            "intent_id": "archive-liquidity",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived-liquidity",
            "label": "Archive the liquidity branch",
        },
        {
            "intent_id": "covenant-follow-up",
            "kind": "director_follow_up",
            "checkpoint": "checkpoint-followup-covenant",
            "participant_id": DOWNSIDE,
            "label": "Ask about covenants",
        },
        {
            "intent_id": "downside-covenant",
            "kind": "start_participant",
            "checkpoint": "checkpoint-followup-covenant",
            "participant_id": DOWNSIDE,
            "operation_id": BRANCH_OPS["downside-covenant"],
            "tape_id": "tape-downside-covenant",
            "label": "Answer the covenant question",
        },
        {
            "intent_id": "close-covenant",
            "kind": "request_closing",
            "checkpoint": "checkpoint-downside-covenant",
            "closing_tape_id": "tape-closing-covenant",
            "label": "Close the covenant branch",
        },
        {
            "intent_id": "archive-covenant",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived-covenant",
            "label": "Archive the covenant branch",
        },
        {
            "intent_id": "red-team",
            "kind": "start_participant",
            "checkpoint": "checkpoint-portfolio",
            "participant_id": CREDIT,
            "operation_id": BRANCH_OPS["red-team"],
            "tape_id": "tape-red-team",
            "label": "Red-team the checklist",
        },
        {
            "intent_id": "close-red-team",
            "kind": "request_closing",
            "checkpoint": "checkpoint-red-team",
            "closing_tape_id": "tape-closing-red-team",
            "label": "Close the red-team branch",
        },
        {
            "intent_id": "archive-red-team",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived-red-team",
            "label": "Archive the red-team branch",
        },
    ]

    transitions = [
        {
            "transition_id": "canonical-create",
            "source_checkpoint": "checkpoint-initial",
            "completed_checkpoint": "checkpoint-created",
            "intent_id": "create-meeting",
            "kind": "create_meeting",
            "canonical": True,
            "prerequisites": [],
            "label": "Start the meeting",
            "explanation": "Canonical creation action.",
        },
        {
            "transition_id": "canonical-credit",
            "source_checkpoint": "checkpoint-created",
            "completed_checkpoint": "checkpoint-credit",
            "intent_id": "credit-analyst",
            "kind": "start_participant",
            "participant_id": CREDIT,
            "operation_id": CREDIT_OP,
            "tape_id": "tape-credit",
            "canonical": True,
            "prerequisites": [],
            "label": "Ask the Credit Analyst",
            "explanation": "Canonical opening turn.",
        },
        {
            "transition_id": "canonical-downside",
            "source_checkpoint": "checkpoint-credit",
            "completed_checkpoint": "checkpoint-downside",
            "intent_id": "downside-reviewer",
            "kind": "start_participant",
            "participant_id": DOWNSIDE,
            "operation_id": DOWNSIDE_OP,
            "tape_id": "tape-downside",
            "canonical": True,
            "prerequisites": [],
            "label": "Ask the Downside Reviewer",
            "explanation": "Canonical challenge turn.",
        },
        {
            "transition_id": "canonical-followup",
            "source_checkpoint": "checkpoint-downside",
            "completed_checkpoint": "checkpoint-followup",
            "intent_id": "director-follow-up",
            "kind": "director_follow_up",
            "participant_id": PORTFOLIO,
            "canonical": True,
            "prerequisites": [],
            "label": "Send the supported follow-up",
            "explanation": "Canonical Director follow-up.",
        },
        {
            "transition_id": "canonical-portfolio",
            "source_checkpoint": "checkpoint-followup",
            "completed_checkpoint": "checkpoint-portfolio",
            "intent_id": "portfolio-analyst",
            "kind": "start_participant",
            "participant_id": PORTFOLIO,
            "operation_id": PORTFOLIO_OP,
            "tape_id": "tape-portfolio",
            "canonical": True,
            "prerequisites": [],
            "label": "Ask the Portfolio Analyst",
            "explanation": "Canonical mandate turn.",
        },
        {
            "transition_id": "canonical-consensus",
            "source_checkpoint": "checkpoint-portfolio",
            "completed_checkpoint": "checkpoint-consensus",
            "intent_id": "concluding-discussion",
            "kind": "start_participant",
            "participant_id": CREDIT,
            "operation_id": CONSENSUS_OP,
            "tape_id": "tape-consensus",
            "canonical": True,
            "prerequisites": [],
            "label": "Ask the committee to align",
            "explanation": "Canonical concluding turn.",
        },
        {
            "transition_id": "canonical-close",
            "source_checkpoint": "checkpoint-consensus",
            "completed_checkpoint": "checkpoint-closed",
            "intent_id": "close-meeting",
            "kind": "request_closing",
            "closing_tape_id": "tape-closing",
            "canonical": True,
            "prerequisites": [],
            "label": "Close meeting",
            "explanation": "Canonical closing.",
        },
        {
            "transition_id": "canonical-archive",
            "source_checkpoint": "checkpoint-closed",
            "completed_checkpoint": "checkpoint-archived",
            "intent_id": "archive-meeting",
            "kind": "archive_meeting",
            "canonical": True,
            "prerequisites": ["canonical-close"],
            "label": "Archive meeting",
            "explanation": "Canonical archive.",
        },
    ]

    def transition(
        transition_id: str,
        source: str,
        completed: str,
        intent_id: str,
        kind: str,
        label: str,
        *,
        participant_id: str | None = None,
        operation_id: str | None = None,
        tape_id: str | None = None,
        closing_tape_id: str | None = None,
        prerequisites: list[str] | None = None,
    ) -> dict[str, Any]:
        return {
            "transition_id": transition_id,
            "source_checkpoint": source,
            "completed_checkpoint": completed,
            "intent_id": intent_id,
            "kind": kind,
            "participant_id": participant_id,
            "operation_id": operation_id,
            "tape_id": tape_id,
            "closing_tape_id": closing_tape_id,
            "canonical": False,
            "prerequisites": prerequisites or [],
            "label": label,
            "explanation": "Prepared exploration path; validated separately from canonical beats.",
        }

    transitions.extend(
        [
            transition(
                "explore-downside-first",
                "checkpoint-created",
                "checkpoint-downside-first",
                "downside-first",
                "start_participant",
                "Test the downside first",
                participant_id=DOWNSIDE,
                operation_id=BRANCH_OPS["downside-first"],
                tape_id="tape-downside-first",
            ),
            transition(
                "explore-portfolio-first",
                "checkpoint-created",
                "checkpoint-portfolio-first",
                "portfolio-first",
                "start_participant",
                "Start from the mandate",
                participant_id=PORTFOLIO,
                operation_id=BRANCH_OPS["portfolio-first"],
                tape_id="tape-portfolio-first",
            ),
            transition(
                "explore-close-portfolio-first",
                "checkpoint-portfolio-first",
                "checkpoint-closed-portfolio-first",
                "close-portfolio-first",
                "request_closing",
                "Close the mandate-first branch",
                closing_tape_id="tape-closing-portfolio-first",
                prerequisites=["explore-portfolio-first"],
            ),
            transition(
                "explore-archive-portfolio-first",
                "checkpoint-closed-portfolio-first",
                "checkpoint-archived-portfolio-first",
                "archive-portfolio-first",
                "archive_meeting",
                "Archive the mandate-first branch",
                prerequisites=["explore-close-portfolio-first"],
            ),
            transition(
                "explore-followup-first",
                "checkpoint-downside-first",
                "checkpoint-followup-first",
                "followup-downside-first",
                "director_follow_up",
                "Ask for the instrument record",
                participant_id=DOWNSIDE,
                prerequisites=["explore-downside-first"],
            ),
            transition(
                "explore-portfolio-after-first",
                "checkpoint-followup-first",
                "checkpoint-portfolio-first-2",
                "portfolio-after-first",
                "start_participant",
                "Apply the mandate",
                participant_id=PORTFOLIO,
                operation_id=BRANCH_OPS["portfolio-after-first"],
                tape_id="tape-portfolio-after-first",
                prerequisites=["explore-followup-first"],
            ),
            transition(
                "explore-close-first",
                "checkpoint-portfolio-first-2",
                "checkpoint-closed-first",
                "close-first",
                "request_closing",
                "Close the first branch",
                closing_tape_id="tape-closing-first",
                prerequisites=["explore-portfolio-after-first"],
            ),
            transition(
                "explore-archive-first",
                "checkpoint-closed-first",
                "checkpoint-archived-first",
                "archive-first",
                "archive_meeting",
                "Archive the first branch",
                prerequisites=["explore-close-first"],
            ),
            transition(
                "explore-liquidity-followup",
                "checkpoint-downside",
                "checkpoint-followup-liquidity",
                "liquidity-follow-up",
                "director_follow_up",
                "Ask about liquidity",
                participant_id=CREDIT,
            ),
            transition(
                "explore-credit-liquidity",
                "checkpoint-followup-liquidity",
                "checkpoint-credit-liquidity",
                "credit-liquidity",
                "start_participant",
                "Answer the liquidity question",
                participant_id=CREDIT,
                operation_id=BRANCH_OPS["credit-liquidity"],
                tape_id="tape-credit-liquidity",
                prerequisites=["explore-liquidity-followup"],
            ),
            transition(
                "explore-close-liquidity",
                "checkpoint-credit-liquidity",
                "checkpoint-closed-liquidity",
                "close-liquidity",
                "request_closing",
                "Close the liquidity branch",
                closing_tape_id="tape-closing-liquidity",
                prerequisites=["explore-credit-liquidity"],
            ),
            transition(
                "explore-archive-liquidity",
                "checkpoint-closed-liquidity",
                "checkpoint-archived-liquidity",
                "archive-liquidity",
                "archive_meeting",
                "Archive the liquidity branch",
                prerequisites=["explore-close-liquidity"],
            ),
            transition(
                "explore-covenant-followup",
                "checkpoint-downside",
                "checkpoint-followup-covenant",
                "covenant-follow-up",
                "director_follow_up",
                "Ask about covenants",
                participant_id=DOWNSIDE,
            ),
            transition(
                "explore-downside-covenant",
                "checkpoint-followup-covenant",
                "checkpoint-downside-covenant",
                "downside-covenant",
                "start_participant",
                "Answer the covenant question",
                participant_id=DOWNSIDE,
                operation_id=BRANCH_OPS["downside-covenant"],
                tape_id="tape-downside-covenant",
                prerequisites=["explore-covenant-followup"],
            ),
            transition(
                "explore-close-covenant",
                "checkpoint-downside-covenant",
                "checkpoint-closed-covenant",
                "close-covenant",
                "request_closing",
                "Close the covenant branch",
                closing_tape_id="tape-closing-covenant",
                prerequisites=["explore-downside-covenant"],
            ),
            transition(
                "explore-archive-covenant",
                "checkpoint-closed-covenant",
                "checkpoint-archived-covenant",
                "archive-covenant",
                "archive_meeting",
                "Archive the covenant branch",
                prerequisites=["explore-close-covenant"],
            ),
            transition(
                "explore-red-team-turn",
                "checkpoint-portfolio",
                "checkpoint-red-team",
                "red-team",
                "start_participant",
                "Red-team the checklist",
                participant_id=CREDIT,
                operation_id=BRANCH_OPS["red-team"],
                tape_id="tape-red-team",
            ),
            transition(
                "explore-close-red-team",
                "checkpoint-red-team",
                "checkpoint-closed-red-team",
                "close-red-team",
                "request_closing",
                "Close the red-team branch",
                closing_tape_id="tape-closing-red-team",
                prerequisites=["explore-red-team-turn"],
            ),
            transition(
                "explore-archive-red-team",
                "checkpoint-closed-red-team",
                "checkpoint-archived-red-team",
                "archive-red-team",
                "archive_meeting",
                "Archive the red-team branch",
                prerequisites=["explore-close-red-team"],
            ),
        ]
    )

    chapters = [
        {
            "chapter_id": "chapter-board",
            "title": "Prepared board",
            "objective": "Inspect the three participants and their knowledge assignments.",
            "checkpoint": "checkpoint-created",
            "route": "board",
            "tab": "roster",
            "mode": "inspection",
            "disclosure": "Prepared board; inspection does not complete a guide step.",
            "claim_ids": [],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-setup",
            "title": "Board setup",
            "objective": "Inspect the prepared setup, roster, and practice-safe configuration.",
            "checkpoint": "checkpoint-created",
            "route": "new",
            "tab": "roster",
            "mode": "inspection",
            "disclosure": "Prepared setup; editing practice settings does not change the recording.",
            "claim_ids": [],
            "input_asset_ids": [],
        },
        {
            "chapter_id": "chapter-files",
            "title": "Files and sources",
            "objective": "Inspect the meeting documents and retained source assets.",
            "checkpoint": "checkpoint-credit",
            "route": "meeting",
            "tab": "documents",
            "mode": "inspection",
            "disclosure": "Recorded sources; inspection does not add or retrieve live documents.",
            "claim_ids": ["C1", "C2", "C10"],
            "input_asset_ids": ["shared-fact-sheet", "credit-evidence"],
        },
        {
            "chapter_id": "chapter-facts",
            "title": "Recorded facts",
            "objective": "Inspect the Credit Analyst turn and its citations.",
            "checkpoint": "checkpoint-credit",
            "route": "meeting",
            "tab": "chat",
            "mode": "inspection",
            "disclosure": "Recorded turn; no new model call.",
            "claim_ids": ["C1", "C2", "C3", "C10", "C12"],
            "input_asset_ids": ["shared-fact-sheet", "credit-evidence"],
        },
        {
            "chapter_id": "chapter-disagreement",
            "title": "Recorded disagreement",
            "objective": "Inspect the Downside Reviewer's logged disagreement.",
            "checkpoint": "checkpoint-downside",
            "route": "meeting",
            "tab": "disagreements",
            "mode": "inspection",
            "disclosure": "Recorded disagreement; inspection is not a new action.",
            "claim_ids": ["C6", "C7", "C8", "C9", "C10"],
            "input_asset_ids": ["downside-worksheet"],
        },
        {
            "chapter_id": "chapter-followup",
            "title": "Recorded follow-up",
            "objective": "Inspect the supported Director follow-up.",
            "checkpoint": "checkpoint-followup",
            "route": "meeting",
            "tab": "chat",
            "mode": "inspection",
            "disclosure": "Recorded follow-up; inspection does not resend it.",
            "claim_ids": ["C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-consensus",
            "title": "Recorded consensus",
            "objective": "Inspect the formal consensus and its claims.",
            "checkpoint": "checkpoint-consensus",
            "route": "meeting",
            "tab": "consensus",
            "mode": "inspection",
            "disclosure": "Recorded consensus; inspection is not a new vote.",
            "claim_ids": ["C1", "C2", "C10", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-closing",
            "title": "Completed closing",
            "objective": "Inspect the recorded ballots and closing brief.",
            "checkpoint": "checkpoint-closed",
            "route": "meeting",
            "tab": "closing",
            "mode": "inspection",
            "disclosure": "Recorded closing; no live vote or model call.",
            "claim_ids": ["C1", "C2", "C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-summary",
            "title": "Recorded summary",
            "objective": "Inspect the approved recorded system summary in its completed context.",
            "checkpoint": "checkpoint-archived",
            "route": "meeting",
            "tab": "summary",
            "mode": "inspection",
            "disclosure": "Recorded summary from the archived meeting; not a fresh generation.",
            "summary_message_id": SUMMARY_MSG,
            "claim_ids": ["C1", "C2", "C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-archive",
            "title": "Archived result",
            "objective": "Inspect the archived meeting overlay.",
            "checkpoint": "checkpoint-archived",
            "route": "list",
            "tab": "chat",
            "mode": "inspection",
            "disclosure": "Archived overlay; the recording remains ended.",
            "claim_ids": ["C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-downside-first",
            "title": "Downside-first branch",
            "objective": "Inspect the alternative opening turn.",
            "checkpoint": "checkpoint-downside-first",
            "route": "meeting",
            "tab": "chat",
            "mode": "inspection",
            "disclosure": "Prepared branch; inspection does not complete the canonical guide.",
            "claim_ids": ["C6", "C7", "C8", "C10", "C14"],
            "input_asset_ids": ["downside-worksheet"],
        },
        {
            "chapter_id": "chapter-first-close",
            "title": "First-branch closing",
            "objective": "Inspect the completed first-branch closing.",
            "checkpoint": "checkpoint-closed-first",
            "route": "meeting",
            "tab": "closing",
            "mode": "inspection",
            "disclosure": "Recorded branch closing; no live vote.",
            "claim_ids": ["C1", "C2", "C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "chapter_id": "chapter-liquidity-close",
            "title": "Liquidity-branch closing",
            "objective": "Inspect the completed liquidity branch.",
            "checkpoint": "checkpoint-closed-liquidity",
            "route": "meeting",
            "tab": "closing",
            "mode": "inspection",
            "disclosure": "Recorded branch closing; no live vote.",
            "claim_ids": ["C6", "C7", "C10", "C16"],
            "input_asset_ids": ["downside-worksheet"],
        },
        {
            "chapter_id": "chapter-red-team",
            "title": "Red-team branch",
            "objective": "Inspect the red-team challenge before closing.",
            "checkpoint": "checkpoint-red-team",
            "route": "meeting",
            "tab": "chat",
            "mode": "inspection",
            "disclosure": "Prepared branch; inspection does not complete the canonical guide.",
            "claim_ids": ["C1", "C2", "C10", "C13", "C18"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
    ]

    return {
        "checkpoints": checkpoints,
        "tapes": tapes,
        "closing_tapes": closing_tapes,
        "retrievals": retrievals,
        "intents": intents,
        "transitions": transitions,
        "chapters": chapters,
    }


def _effect_ids(message: dict[str, Any], *extra: str) -> list[str]:
    ids = [message["id"], *extra]
    for citation in message.get("citations") or []:
        if citation.get("claim_id"):
            ids.append(citation["claim_id"])
    for call in (message.get("tool_artifacts") or {}).get("calls") or []:
        for key in ("invocation_id", "call_id"):
            if call.get(key):
                ids.append(call[key])
    return list(dict.fromkeys(ids))


def prepared_deck_content(
    root: Path,
    checkpoints: dict[str, dict[str, Any]],
    intents: list[dict[str, Any]],
    consensus_message: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Author the schema-3 closed deck, isolated results, and turn tapes."""

    ordinal = max(checkpoint["ordinal"] for checkpoint in checkpoints.values()) + 1
    base_id = "checkpoint-prepared-base"
    base_operations = [
        operation(DECK_CREDIT_OP, CREDIT, "prepared-credit", "queued", 1, None),
        operation(
            DECK_DOWNSIDE_OP, DOWNSIDE, "prepared-downside", "queued", 2, None
        ),
        operation(
            DECK_PORTFOLIO_OP, PORTFOLIO, "prepared-portfolio", "queued", 3, None
        ),
        operation(
            DECK_CONSENSUS_OP, CREDIT, "prepared-consensus", "queued", 4, None
        ),
    ]
    checkpoints[base_id] = checkpoint(
        base_id,
        ordinal,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING],
            operations=base_operations,
            include_meeting=True,
            include_documents=True,
            include_disagreement=False,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    write_json(root / "checkpoints" / f"{base_id}.json", checkpoints[base_id])
    ordinal += 1

    definitions = [
        (
            "credit",
            CREDIT,
            DECK_CREDIT_OP,
            "prepared-credit",
            CREDIT_MSG,
            "Credit Analyst opening facts",
            None,
        ),
        (
            "downside",
            DOWNSIDE,
            DECK_DOWNSIDE_OP,
            "prepared-downside",
            DOWNSIDE_MSG,
            "Downside challenge",
            DISAGREEMENT,
        ),
        (
            "portfolio",
            PORTFOLIO,
            DECK_PORTFOLIO_OP,
            "prepared-portfolio",
            PORTFOLIO_MSG,
            "Mandate review",
            None,
        ),
        (
            "consensus",
            CREDIT,
            DECK_CONSENSUS_OP,
            "prepared-consensus",
            CONSENSUS_MSG,
            "Committee alignment",
            CONSENSUS,
        ),
    ]
    messages = {
        CREDIT_MSG: CREDIT_MESSAGE,
        DOWNSIDE_MSG: DOWNSIDE_MESSAGE,
        PORTFOLIO_MSG: PORTFOLIO_MESSAGE,
        CONSENSUS_MSG: consensus_message or CONSENSUS_MESSAGE,
    }
    turns: list[dict[str, Any]] = []
    for slug, participant_id, operation_id, request_key, message_id, label, effect in definitions:
        message = {
            **messages[message_id],
            "operation_id": operation_id,
            "request_key": request_key,
        }
        checkpoint_id = f"checkpoint-prepared-{slug}"
        tape_id = f"tape-prepared-{slug}"
        intent_id = f"prepared-{slug}"
        operation_row = operation(
            operation_id, participant_id, request_key, "completed", 1, message_id
        )
        result = checkpoint(
            checkpoint_id,
            ordinal,
            "active",
            checkpoint_reads(
                meeting_status="active",
                messages=[OPENING, message],
                operations=[operation_row],
                include_meeting=True,
                include_documents=True,
                include_disagreement=effect == DISAGREEMENT,
                include_consensus=effect == CONSENSUS,
                closed=False,
                archived=False,
            ),
        )
        checkpoints[checkpoint_id] = result
        write_json(root / "checkpoints" / f"{checkpoint_id}.json", result)
        tape = turn_tape(
            tape_id,
            operation_id,
            participant_id,
            request_key,
            base_id,
            checkpoint_id,
            message,
        )
        write_json(root / "tapes" / f"{tape_id}.json", tape)
        intents.append(
            {
                "intent_id": intent_id,
                "kind": "start_participant",
                "checkpoint": base_id,
                "participant_id": participant_id,
                "operation_id": operation_id,
                "tape_id": tape_id,
                "label": label,
            }
        )
        turns.append(
            {
                "kind": "reply",
                "turn_id": intent_id,
                "participant_id": participant_id,
                "label": label,
                "intent_id": intent_id,
                "operation_id": operation_id,
                "tape_id": tape_id,
                "result_checkpoint": checkpoint_id,
                "reply_message_ids": [message_id],
                "effect_ids": _effect_ids(message, operation_id, effect)
                if effect
                else _effect_ids(message, operation_id),
                "required": True,
            }
        )
        ordinal += 1

    turns.append(
        {
            "kind": "follow_up",
            "turn_id": "prepared-followup",
            "label": "You",
            "question": FOLLOWUP["content"],
            "message_id": FOLLOWUP_MSG,
            "intent_id": "director-follow-up",
            "required": True,
        }
    )
    return {
        "prepared_base_checkpoint": base_id,
        "prepared_turns": turns,
        "prepared_closing": {
            "closing_tape_id": "tape-closing",
            "completed_checkpoint": "checkpoint-closed",
            "archived_checkpoint": "checkpoint-archived",
            "required_turn_ids": [turn["turn_id"] for turn in turns],
        },
    }


def build(
    root: Path | None = None,
    *,
    schema_version: int = 2,
    version: str = "7",
    consensus_thinking: str = CONSENSUS_THINKING,
) -> dict[str, Any]:
    consensus_message = {**CONSENSUS_MESSAGE, "thinking_content": consensus_thinking}
    root = root or ROOT
    if root.exists():
        for path in sorted(root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()

    assets = {
        "shared/hdfc-v007-shared-fact-sheet.md": FACT_SHEET,
        "evidence/crisil-annexure.md": CRISIL,
        "evidence/hdfc-fy20-mda.md": HDFC_MDA,
        "evidence/source-register.md": SOURCE_REGISTER,
        "private/credit-evidence.md": CREDIT_EVIDENCE,
        "private/downside-worksheet.md": DOWNSIDE_WORKSHEET,
        "private/portfolio-mandate.md": PORTFOLIO_MANDATE,
    }
    for relative, content in assets.items():
        path = root / "assets" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode("utf-8"))

    asset_records = [
        {
            "asset_id": "shared-fact-sheet",
            "path": "shared/hdfc-v007-shared-fact-sheet.md",
            "media_type": "text/markdown",
            "sha256": sha256(FACT_SHEET),
            "size": len(FACT_SHEET.encode("utf-8")),
            "locator": "package:shared/hdfc-v007-shared-fact-sheet.md",
            "source": "Prepared for this replay",
            "capture_date": AS_OF,
            "rights": "Authored historical fact sheet for this replay",
            "authored": True,
            "public_demo": True,
            "upload_approved": True,
            "extraction": "offline markdown",
        },
        {
            "asset_id": "crisil-annexure",
            "path": "evidence/crisil-annexure.md",
            "media_type": "text/markdown",
            "sha256": sha256(CRISIL),
            "size": len(CRISIL.encode("utf-8")),
            "locator": "https://www.crisil.com/mnt/winshare/Ratings/RatingList/RatingDocs/Housing_Development_Finance_Corporation_Limited_July_31_2020_RR.html",
            "source": "CRISIL Rating Rationale, 31 July 2020",
            "capture_date": SOURCE_DATE,
            "rights": "Short attributed transcription; source retention and redistribution approval required",
            "authored": False,
            "public_demo": True,
            "extraction": "offline transcription",
        },
        {
            "asset_id": "hdfc-fy20-mda",
            "path": "evidence/hdfc-fy20-mda.md",
            "media_type": "text/markdown",
            "sha256": sha256(HDFC_MDA),
            "size": len(HDFC_MDA.encode("utf-8")),
            "locator": "https://homeloans.hdfc.bank.in/digital-annual-report-2019-2020/mda",
            "source": "HDFC Ltd Annual Report 2019-20, MD&A",
            "capture_date": SOURCE_DATE,
            "rights": "Short attributed transcription; source retention and redistribution approval required",
            "authored": False,
            "public_demo": True,
            "extraction": "offline transcription",
        },
        {
            "asset_id": "source-register",
            "path": "evidence/source-register.md",
            "media_type": "text/markdown",
            "sha256": sha256(SOURCE_REGISTER),
            "size": len(SOURCE_REGISTER.encode("utf-8")),
            "locator": "package:evidence/source-register.md",
            "source": "Prepared for this replay",
            "capture_date": SOURCE_DATE,
            "rights": "Authored provenance record for this replay",
            "authored": True,
            "public_demo": True,
            "extraction": "offline markdown",
        },
        {
            "asset_id": "credit-evidence",
            "path": "private/credit-evidence.md",
            "media_type": "text/markdown",
            "sha256": sha256(CREDIT_EVIDENCE),
            "size": len(CREDIT_EVIDENCE.encode("utf-8")),
            "locator": "package:private/credit-evidence.md",
            "source": "Prepared for this replay",
            "capture_date": AS_OF,
            "rights": "Demo-authored private input",
            "authored": True,
            "public_demo": True,
            "upload_approved": True,
            "extraction": "offline markdown",
        },
        {
            "asset_id": "downside-worksheet",
            "path": "private/downside-worksheet.md",
            "media_type": "text/markdown",
            "sha256": sha256(DOWNSIDE_WORKSHEET),
            "size": len(DOWNSIDE_WORKSHEET.encode("utf-8")),
            "locator": "package:private/downside-worksheet.md",
            "source": "Demo-authored for this replay",
            "capture_date": AS_OF,
            "rights": "Demo-authored private input",
            "authored": True,
            "public_demo": True,
            "upload_approved": True,
            "extraction": "offline markdown",
        },
        {
            "asset_id": "portfolio-mandate",
            "path": "private/portfolio-mandate.md",
            "media_type": "text/markdown",
            "sha256": sha256(PORTFOLIO_MANDATE),
            "size": len(PORTFOLIO_MANDATE.encode("utf-8")),
            "locator": "package:private/portfolio-mandate.md",
            "source": "Demo-authored for this replay",
            "capture_date": AS_OF,
            "rights": "Demo-authored private input",
            "authored": True,
            "public_demo": True,
            "upload_approved": True,
            "extraction": "offline markdown",
        },
    ]
    write_json(root / "assets" / "index.json", {"assets": asset_records})

    operations_created = [
        operation(CREDIT_OP, CREDIT, "turn-credit", "queued", 1, None),
    ]
    operations_credit = [
        operation(CREDIT_OP, CREDIT, "turn-credit", "completed", 1, CREDIT_MSG),
        operation(DOWNSIDE_OP, DOWNSIDE, "turn-downside", "queued", 2, None),
    ]
    operations_downside = [
        operation(CREDIT_OP, CREDIT, "turn-credit", "completed", 1, CREDIT_MSG),
        operation(DOWNSIDE_OP, DOWNSIDE, "turn-downside", "completed", 2, DOWNSIDE_MSG),
    ]
    operations_followup = operations_downside + [
        operation(PORTFOLIO_OP, PORTFOLIO, "turn-portfolio", "queued", 3, None),
    ]
    operations_portfolio = operations_downside + [
        operation(PORTFOLIO_OP, PORTFOLIO, "turn-portfolio", "completed", 3, PORTFOLIO_MSG),
        operation(CONSENSUS_OP, CREDIT, "turn-consensus", "queued", 4, None),
    ]
    operations_consensus = operations_downside + [
        operation(PORTFOLIO_OP, PORTFOLIO, "turn-portfolio", "completed", 3, PORTFOLIO_MSG),
        operation(CONSENSUS_OP, CREDIT, "turn-consensus", "completed", 4, CONSENSUS_MSG),
    ]

    initial = checkpoint(
        "checkpoint-initial",
        0,
        "initial",
        {"safe_config": board_safe_config()},
    )
    created = checkpoint(
        "checkpoint-created",
        1,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING],
            operations=operations_created,
            include_meeting=True,
            include_documents=True,
            include_disagreement=False,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    credit = checkpoint(
        "checkpoint-credit",
        2,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING, CREDIT_MESSAGE],
            operations=operations_credit,
            include_meeting=True,
            include_documents=True,
            include_disagreement=False,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    downside = checkpoint(
        "checkpoint-downside",
        3,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING, CREDIT_MESSAGE, DOWNSIDE_MESSAGE],
            operations=operations_downside,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    followup = checkpoint(
        "checkpoint-followup",
        4,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING, CREDIT_MESSAGE, DOWNSIDE_MESSAGE, FOLLOWUP],
            operations=operations_followup,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    portfolio = checkpoint(
        "checkpoint-portfolio",
        5,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[OPENING, CREDIT_MESSAGE, DOWNSIDE_MESSAGE, FOLLOWUP, PORTFOLIO_MESSAGE],
            operations=operations_portfolio,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=False,
            closed=False,
            archived=False,
        ),
    )
    consensus_cp = checkpoint(
        "checkpoint-consensus",
        6,
        "active",
        checkpoint_reads(
            meeting_status="active",
            messages=[
                OPENING,
                CREDIT_MESSAGE,
                DOWNSIDE_MESSAGE,
                FOLLOWUP,
                PORTFOLIO_MESSAGE,
                consensus_message,
            ],
            operations=operations_consensus,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=True,
            closed=False,
            archived=False,
        ),
    )
    closed = checkpoint(
        "checkpoint-closed",
        7,
        "closed",
        checkpoint_reads(
            meeting_status="ended",
            messages=[
                OPENING,
                CREDIT_MESSAGE,
                DOWNSIDE_MESSAGE,
                FOLLOWUP,
                PORTFOLIO_MESSAGE,
                CONSENSUS_MESSAGE,
                SUMMARY_MESSAGE,
            ],
            operations=operations_consensus,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=True,
            closed=True,
            archived=False,
        ),
    )
    archived = checkpoint(
        "checkpoint-archived",
        8,
        "archived",
        checkpoint_reads(
            meeting_status="archived",
            messages=[
                OPENING,
                CREDIT_MESSAGE,
                DOWNSIDE_MESSAGE,
                FOLLOWUP,
                PORTFOLIO_MESSAGE,
                CONSENSUS_MESSAGE,
                SUMMARY_MESSAGE,
            ],
            operations=operations_consensus,
            include_meeting=True,
            include_documents=True,
            include_disagreement=True,
            include_consensus=True,
            closed=True,
            archived=True,
        ),
    )

    checkpoints = {
        "checkpoint-initial": initial,
        "checkpoint-created": created,
        "checkpoint-credit": credit,
        "checkpoint-downside": downside,
        "checkpoint-followup": followup,
        "checkpoint-portfolio": portfolio,
        "checkpoint-consensus": consensus_cp,
        "checkpoint-closed": closed,
        "checkpoint-archived": archived,
    }
    exploration = exploration_content(operations_downside, operations_portfolio)
    checkpoints.update(exploration["checkpoints"])
    # Choice states expose every prepared operation as queued at the source. The
    # runtime selects the operation for the explicit transition that was chosen.
    checkpoints["checkpoint-created"]["reads"]["operations"].extend(
        [
            operation(
                BRANCH_OPS["downside-first"],
                DOWNSIDE,
                "turn-retrieval-downside-first",
                "queued",
                2,
                None,
            ),
            operation(
                BRANCH_OPS["portfolio-first"],
                PORTFOLIO,
                "turn-retrieval-portfolio-first",
                "queued",
                3,
                None,
            ),
        ]
    )
    checkpoints["checkpoint-followup-first"]["reads"]["operations"].append(
        operation(
            BRANCH_OPS["portfolio-after-first"],
            PORTFOLIO,
            "turn-retrieval-portfolio-after-first",
            "queued",
            3,
            None,
        )
    )
    checkpoints["checkpoint-followup-liquidity"]["reads"]["operations"].append(
        operation(
            BRANCH_OPS["credit-liquidity"],
            CREDIT,
            "turn-retrieval-credit-liquidity",
            "queued",
            3,
            None,
        )
    )
    checkpoints["checkpoint-followup-covenant"]["reads"]["operations"].append(
        operation(
            BRANCH_OPS["downside-covenant"],
            DOWNSIDE,
            "turn-retrieval-downside-covenant",
            "queued",
            3,
            None,
        )
    )
    checkpoints["checkpoint-portfolio"]["reads"]["operations"].append(
        operation(
            BRANCH_OPS["red-team"],
            CREDIT,
            "turn-retrieval-red-team",
            "queued",
            5,
            None,
        )
    )
    for checkpoint_id, payload in checkpoints.items():
        write_json(root / "checkpoints" / f"{checkpoint_id}.json", payload)

    credit_tape = turn_tape(
        "tape-credit",
        CREDIT_OP,
        CREDIT,
        "turn-credit",
        "checkpoint-created",
        "checkpoint-credit",
        CREDIT_MESSAGE,
    )
    downside_tape = turn_tape(
        "tape-downside",
        DOWNSIDE_OP,
        DOWNSIDE,
        "turn-downside",
        "checkpoint-credit",
        "checkpoint-downside",
        DOWNSIDE_MESSAGE,
    )
    portfolio_tape = turn_tape(
        "tape-portfolio",
        PORTFOLIO_OP,
        PORTFOLIO,
        "turn-portfolio",
        "checkpoint-followup",
        "checkpoint-portfolio",
        PORTFOLIO_MESSAGE,
    )
    consensus_tape = turn_tape(
        "tape-consensus",
        CONSENSUS_OP,
        CREDIT,
        "turn-consensus",
        "checkpoint-portfolio",
        "checkpoint-consensus",
        consensus_message,
    )
    for tape in (credit_tape, downside_tape, portfolio_tape, consensus_tape):
        write_json(root / "tapes" / f"{tape['tape_id']}.json", tape)
    write_json(root / "closing_tapes" / "tape-closing.json", closing_tape())
    for tape in exploration["tapes"]:
        write_json(root / "tapes" / f"{tape['tape_id']}.json", tape)
    for tape in exploration["closing_tapes"]:
        write_json(root / "closing_tapes" / f"{tape['tape_id']}.json", tape)

    retrievals = [
        retrieval(
            "retrieval-credit",
            CREDIT,
            "private",
            "credit-private",
            "HDFC 7.87% 2022 terms rating issuer context",
            [
                ("terms", "ISIN INE001A07RW5; 7.87% coupon; 18 July 2019; 18 July 2022; Rs 5,000 crore.", 0.96, "C1"),
                ("rating", "CRISIL AAA/Stable, 31 July 2020.", 0.94, "C2"),
                ("issuer", "FY20 standalone total income and profit after tax.", 0.88, "C3"),
                ("open-items", "No executable price, yield, or secondary-market liquidity.", 0.82, "C10"),
            ],
        ),
        retrieval(
            "retrieval-downside",
            DOWNSIDE,
            "private",
            "downside-private",
            "HDFC 7.87% 2022 rating liquidity downside",
            [
                ("listing", "NCDs listed on the NSE/BSE wholesale debt market.", 0.9, "C6"),
                ("liquidity", "Listing is not executable liquidity.", 0.89, "C7"),
                ("rating", "AAA/Stable is a dated opinion, not a guarantee.", 0.87, "C8"),
                ("scenario", "+200bp rate move and risk-off secondary market scenario.", 0.8, "C9"),
            ],
        ),
        retrieval(
            "retrieval-portfolio",
            PORTFOLIO,
            "private",
            "portfolio-private",
            "HDFC 7.87% 2022 mandate price yield liquidity",
            [
                ("limits", "No executable price, yield, or secondary-market liquidity.", 0.93, "C10"),
                ("maturity", "Scheduled maturity is 18 July 2022; no payment assertion.", 0.86, "C11"),
                ("outcome", "A research checklist, not a recommendation.", 0.84, "C13"),
            ],
        ),
        retrieval(
            "retrieval-consensus",
            CREDIT,
            "shared",
            None,
            "HDFC 7.87% 2022 facts judgments unknowns checklist",
            [
                ("terms", "Recorded terms and rating.", 0.9, "C1"),
                ("rating", "Rating opinion dated 31 July 2020.", 0.86, "C2"),
                ("limits", "No executable price, yield, or liquidity.", 0.84, "C10"),
                ("outcome", "Research checklist, not investment approval.", 0.82, "C13"),
            ],
        ),
    ]
    retrievals.extend(exploration["retrievals"])
    for record in retrievals:
        write_json(root / "retrieval" / f"{record['retrieval_key']}.json", record)

    intents = [
        {
            "intent_id": "create-meeting",
            "kind": "create_meeting",
            "checkpoint": "checkpoint-created",
            "label": "Start the meeting",
        },
        {
            "intent_id": "credit-analyst",
            "kind": "start_participant",
            "checkpoint": "checkpoint-created",
            "participant_id": CREDIT,
            "operation_id": CREDIT_OP,
            "tape_id": "tape-credit",
            "label": "Ask the Credit Analyst",
        },
        {
            "intent_id": "downside-reviewer",
            "kind": "start_participant",
            "checkpoint": "checkpoint-credit",
            "participant_id": DOWNSIDE,
            "operation_id": DOWNSIDE_OP,
            "tape_id": "tape-downside",
            "label": "Ask the Downside Reviewer",
        },
        {
            "intent_id": "director-follow-up",
            "kind": "director_follow_up",
            "checkpoint": "checkpoint-followup",
            "participant_id": PORTFOLIO,
            "label": "Send the supported follow-up",
        },
        {
            "intent_id": "portfolio-analyst",
            "kind": "start_participant",
            "checkpoint": "checkpoint-followup",
            "participant_id": PORTFOLIO,
            "operation_id": PORTFOLIO_OP,
            "tape_id": "tape-portfolio",
            "label": "Ask the Portfolio Analyst",
        },
        {
            "intent_id": "concluding-discussion",
            "kind": "start_participant",
            "checkpoint": "checkpoint-portfolio",
            "participant_id": CREDIT,
            "operation_id": CONSENSUS_OP,
            "tape_id": "tape-consensus",
            "label": "Ask the committee to align",
        },
        {
            "intent_id": "close-meeting",
            "kind": "request_closing",
            "checkpoint": "checkpoint-consensus",
            "closing_tape_id": "tape-closing",
            "label": "Close meeting",
        },
        {
            "intent_id": "archive-meeting",
            "kind": "archive_meeting",
            "checkpoint": "checkpoint-archived",
            "label": "Archive meeting",
        },
    ]
    intents.extend(exploration["intents"])

    beats = [
        {
            "beat_id": "meet-the-board",
            "ordinal": 1,
            "title": "Meet the board",
            "objective": "Inspect the three participants and their shared and private knowledge assignments.",
            "anchor": "board-roster",
            "route": "board",
            "tab": "roster",
            "checkpoint": "checkpoint-initial",
            "start_checkpoint": "checkpoint-initial",
            "completed_checkpoint": "checkpoint-initial",
            "disclosure": "Prepared board for the recorded meeting.",
            "steps": [
                {
                    "step_id": "inspect-board",
                    "label": "Inspect the three participants and knowledge assignments",
                    "completion": "acknowledge",
                    "requires_tab": "roster",
                }
            ],
            "claim_ids": [],
            "input_asset_ids": [
                "shared-fact-sheet",
                "credit-evidence",
                "downside-worksheet",
                "portfolio-mandate",
            ],
        },
        {
            "beat_id": "start-the-meeting",
            "ordinal": 2,
            "title": "Start the meeting",
            "objective": "Complete the prepared creation form and confirm the supplied historical document.",
            "anchor": "creation-form",
            "route": "new",
            "checkpoint": "checkpoint-initial",
            "start_checkpoint": "checkpoint-initial",
            "completed_checkpoint": "checkpoint-created",
            "disclosure": "No upload or write occurs; the intake receipt is recorded.",
            "steps": [
                {
                    "step_id": "create-meeting",
                    "label": "Confirm the prepared preset and supplied document",
                    "intent_id": "create-meeting",
                    "completion": "checkpoint",
                }
            ],
            "claim_ids": [],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "beat_id": "establish-facts",
            "ordinal": 3,
            "title": "Establish the facts",
            "objective": "Ask the Credit Analyst to separate supported facts from open items.",
            "anchor": "credit-analyst-action",
            "route": "meeting",
            "tab": "chat",
            "checkpoint": "checkpoint-created",
            "start_checkpoint": "checkpoint-created",
            "completed_checkpoint": "checkpoint-credit",
            "disclosure": "Prepared retrieval; no live search or model call.",
            "steps": [
                {
                    "step_id": "ask-credit",
                    "label": "Ask the Credit Analyst",
                    "intent_id": "credit-analyst",
                    "completion": "turn_terminal",
                    "requires_tab": "chat",
                }
            ],
            "claim_ids": ["C1", "C2", "C3", "C10", "C12"],
            "input_asset_ids": ["shared-fact-sheet", "credit-evidence"],
        },
        {
            "beat_id": "challenge-the-case",
            "ordinal": 4,
            "title": "Challenge the case",
            "objective": "Ask the Downside Reviewer to test the rating and liquidity assumptions.",
            "anchor": "downside-reviewer-action",
            "route": "meeting",
            "tab": "chat",
            "checkpoint": "checkpoint-credit",
            "start_checkpoint": "checkpoint-credit",
            "completed_checkpoint": "checkpoint-downside",
            "disclosure": "The downside worksheet is demo-authored, not issuer research.",
            "steps": [
                {
                    "step_id": "ask-downside",
                    "label": "Ask the Downside Reviewer",
                    "intent_id": "downside-reviewer",
                    "completion": "turn_terminal",
                    "requires_tab": "chat",
                },
                {
                    "step_id": "review-disagreement",
                    "label": "Review the formal disagreement",
                    "completion": "acknowledge",
                    "requires_tab": "disagreements",
                },
            ],
            "claim_ids": ["C6", "C7", "C8", "C9", "C10"],
            "input_asset_ids": ["shared-fact-sheet", "downside-worksheet"],
        },
        {
            "beat_id": "address-uncertainty",
            "ordinal": 5,
            "title": "Address uncertainty",
            "objective": "Send the supported follow-up and ask the Portfolio Analyst what the mandate can conclude.",
            "anchor": "portfolio-analyst-action",
            "route": "meeting",
            "tab": "chat",
            "checkpoint": "checkpoint-downside",
            "start_checkpoint": "checkpoint-downside",
            "completed_checkpoint": "checkpoint-portfolio",
            "disclosure": "The mandate is fictional and demo-authored. No current price, yield, or liquidity is available.",
            "steps": [
                {
                    "step_id": "send-follow-up",
                    "label": "Send the supported Director follow-up",
                    "intent_id": "director-follow-up",
                    "completion": "checkpoint",
                    "requires_tab": "chat",
                },
                {
                    "step_id": "ask-portfolio",
                    "label": "Ask the Portfolio Analyst",
                    "intent_id": "portfolio-analyst",
                    "completion": "turn_terminal",
                    "requires_tab": "chat",
                },
            ],
            "claim_ids": ["C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet", "portfolio-mandate"],
        },
        {
            "beat_id": "align",
            "ordinal": 6,
            "title": "Align on the checklist",
            "objective": "Ask for the concluding discussion and review the formal consensus.",
            "anchor": "consensus-action",
            "route": "meeting",
            "tab": "chat",
            "checkpoint": "checkpoint-portfolio",
            "start_checkpoint": "checkpoint-portfolio",
            "completed_checkpoint": "checkpoint-consensus",
            "disclosure": "The checklist is bounded by the evidence; it is not an investment approval.",
            "steps": [
                {
                    "step_id": "ask-consensus",
                    "label": "Ask the committee to align",
                    "intent_id": "concluding-discussion",
                    "completion": "turn_terminal",
                    "requires_tab": "chat",
                },
                {
                    "step_id": "review-consensus",
                    "label": "Review the formal consensus",
                    "completion": "acknowledge",
                    "requires_tab": "consensus",
                },
            ],
            "claim_ids": ["C1", "C2", "C3", "C8", "C9", "C10", "C12", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "beat_id": "close-the-meeting",
            "ordinal": 7,
            "title": "Close the meeting",
            "objective": "Use the real close entry and review the recorded ballots and final brief.",
            "anchor": "closing-entry",
            "route": "meeting",
            "tab": "closing",
            "checkpoint": "checkpoint-consensus",
            "start_checkpoint": "checkpoint-consensus",
            "completed_checkpoint": "checkpoint-closed",
            "disclosure": "Recorded closing. No live vote or model call occurs.",
            "steps": [
                {
                    "step_id": "close-meeting",
                    "label": "Close the meeting",
                    "intent_id": "close-meeting",
                    "completion": "closing_completed",
                    "requires_tab": "closing",
                }
            ],
            "claim_ids": ["C1", "C2", "C10", "C11", "C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
        {
            "beat_id": "archive-the-meeting",
            "ordinal": 8,
            "title": "Archive the meeting",
            "objective": "Archive the ended meeting from the real list and confirm the archived overlay.",
            "anchor": "meeting-list",
            "route": "list",
            "checkpoint": "checkpoint-closed",
            "start_checkpoint": "checkpoint-closed",
            "completed_checkpoint": "checkpoint-archived",
            "disclosure": "Archiving is an overlay. The meeting remains ended and cannot be reopened in this replay.",
            "steps": [
                {
                    "step_id": "archive-meeting",
                    "label": "Archive the ended meeting",
                    "intent_id": "archive-meeting",
                    "completion": "checkpoint",
                }
            ],
            "claim_ids": ["C13"],
            "input_asset_ids": ["shared-fact-sheet"],
        },
    ]

    deck = (
        prepared_deck_content(root, checkpoints, intents, consensus_message)
        if schema_version >= 3
        else None
    )
    if schema_version >= 3:
        def visitor_copy(value: str) -> str:
            return value.replace("Director", "You")

        for checkpoint_payload in checkpoints.values():
            safe_config = checkpoint_payload["reads"].get("safe_config") or {}
            intake = safe_config.get("intake") or {}
            if intake.get("note"):
                intake["note"] = "Recorded intake."
            meeting_read = checkpoint_payload["reads"].get("meeting") or {}
            for message in meeting_read.get("messages") or []:
                if message.get("sender_type") == "user":
                    message["sender_name"] = "You"
        for transition in exploration["transitions"]:
            transition["label"] = visitor_copy(transition["label"])
            transition["explanation"] = visitor_copy(transition["explanation"])
        for beat in beats:
            for key in ("title", "objective", "disclosure"):
                if beat.get(key):
                    beat[key] = visitor_copy(beat[key])
            for step in beat.get("steps") or []:
                step["label"] = visitor_copy(step["label"])
        for chapter in exploration["chapters"]:
            for key in ("title", "objective", "disclosure"):
                chapter[key] = visitor_copy(chapter[key])
        for intent in intents:
            if intent.get("label"):
                intent["label"] = visitor_copy(intent["label"])
        for checkpoint_id, checkpoint_payload in checkpoints.items():
            write_json(
                root / "checkpoints" / f"{checkpoint_id}.json",
                checkpoint_payload,
            )

    seed_payload = workspace_seed()
    if schema_version >= 3 and seed_payload.get("base_instructions"):
        seed_payload["base_instructions"] = seed_payload[
            "base_instructions"
        ].replace("The Director", "You").replace("Director", "You")
    write_json(root / "workspace_seed.json", seed_payload)
    seed_sha256 = hashlib.sha256(
        json.dumps(
            seed_payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
    ).hexdigest()

    manifest = {
        "package_id": "hdfc-ine001a07rw5",
        "version": version,
        "schema_version": schema_version,
        "read_version": 1,
        "event_version": 1,
        "title": "HDFC Ltd 7.87% 2022 debenture - guided replay",
        "as_of": AS_OF,
        "content_sha256": "0" * 64,
        "meeting_id": MEETING,
        "initial_checkpoint": "checkpoint-initial",
        "checkpoints": list(checkpoints),
        "tapes": ["tape-credit", "tape-downside", "tape-portfolio", "tape-consensus"]
        + [item["tape_id"] for item in exploration["tapes"]]
        + ([turn["tape_id"] for turn in deck["prepared_turns"] if turn["kind"] == "reply"] if deck else []),
        "closing_tapes": ["tape-closing"]
        + [item["tape_id"] for item in exploration["closing_tapes"]],
        "retrieval": [item["retrieval_key"] for item in retrievals],
        "provenance": {
            "kind": "recorded",
            "authored": True,
            "synthetic": False,
            "model_run": "none",
            "source_capture_date": SOURCE_DATE,
            "prepared_date": "2026-10-30",
            "note": "Authored historical educational replay; no live model run or current-market lookup.",
        },
        "label": "Guided replay",
        "disclosure": DISCLOSURE,
        "stack_labels": STACK_LABELS,
        "intents": intents,
        "beats": beats,
        "transitions": exploration["transitions"],
        "chapters": exploration["chapters"],
        "claims": CLAIMS,
        "workspace_seed": "workspace_seed.json",
        "workspace_seed_sha256": seed_sha256,
    }
    if deck:
        manifest.update(deck)
        manifest["title"] = "HDFC Ltd 7.87% 2022 debenture - prepared demo"
        manifest["label"] = "Prepared demo"
        manifest["disclosure"] = (
            "Prepared demo · recorded responses, not live AI generation."
        )
    write_json(root / "manifest.json", manifest)

    files: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name != "manifest.json":
            relative = path.relative_to(root).as_posix()
            files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest["content_sha256"] = compute_content_sha256(files, manifest)
    write_json(root / "manifest.json", manifest)
    print(f"Wrote {root}")
    print(f"content_sha256={manifest['content_sha256']}")
    return manifest


if __name__ == "__main__":
    build()
