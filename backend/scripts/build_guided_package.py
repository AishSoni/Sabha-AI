"""Build the approved guided bond journey package.

The package is authored content, not a live model run. The build is deterministic:
run this script, validate the package offline, and publish the pinned version.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.replay.constants import (
    DELAY_BALLOT_PROVISIONAL_MS,
    DELAY_BALLOT_TERMINAL_MS,
    DELAY_CITATION_MS,
    DELAY_DONE_MS,
    DELAY_SUMMARY_PROVISIONAL_MS,
    DELAY_SUMMARY_TERMINAL_MS,
    DELAY_TEXT_MS,
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
        "thinking_content": None,
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
        "closing_id": CLOSING,
        "request_key": "closing-request-1",
        "mode": "vote",
        "stage": "completed",
        "failed_from_stage": None,
        "votes": votes,
        "summary": SUMMARY_TEXT,
        "summary_message_id": SUMMARY_MSG,
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


def closing_tape() -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    sequence = 1
    for participant_id, reason in BALLOT_REASONS.items():
        provisional = reason[: len(reason) // 2].rstrip()
        events.append(
            {
                "event_id": f"closing-{sequence}",
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
                "event_id": f"closing-{sequence}",
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
    provisional_summary = SUMMARY_TEXT[: len(SUMMARY_TEXT) // 2].rstrip()
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
            "text": SUMMARY_TEXT,
            "provisional": False,
            "terminal": True,
            "result": "completed",
            "subject_id": None,
            "delay_ms": DELAY_SUMMARY_TERMINAL_MS,
        }
    )
    return {
        "tape_id": "tape-closing",
        "meeting_id": MEETING,
        "closing_id": CLOSING,
        "initial_checkpoint": "checkpoint-consensus",
        "completed_checkpoint": "checkpoint-closed",
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


def build() -> None:
    if ROOT.exists():
        for path in sorted(ROOT.rglob("*"), reverse=True):
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
        path = ROOT / "assets" / relative
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
            "extraction": "offline markdown",
        },
    ]
    write_json(ROOT / "assets" / "index.json", {"assets": asset_records})

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
                CONSENSUS_MESSAGE,
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
    for checkpoint_id, payload in checkpoints.items():
        write_json(ROOT / "checkpoints" / f"{checkpoint_id}.json", payload)

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
        CONSENSUS_MESSAGE,
    )
    for tape in (credit_tape, downside_tape, portfolio_tape, consensus_tape):
        write_json(ROOT / "tapes" / f"{tape['tape_id']}.json", tape)
    write_json(ROOT / "closing_tapes" / "tape-closing.json", closing_tape())

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
    for record in retrievals:
        write_json(ROOT / "retrieval" / f"{record['retrieval_key']}.json", record)

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

    manifest = {
        "package_id": "hdfc-ine001a07rw5",
        "version": "1",
        "schema_version": 1,
        "read_version": 1,
        "event_version": 1,
        "title": "HDFC Ltd 7.87% 2022 debenture - guided replay",
        "as_of": AS_OF,
        "content_sha256": "0" * 64,
        "meeting_id": MEETING,
        "initial_checkpoint": "checkpoint-initial",
        "checkpoints": list(checkpoints),
        "tapes": ["tape-credit", "tape-downside", "tape-portfolio", "tape-consensus"],
        "closing_tapes": ["tape-closing"],
        "retrieval": [item["retrieval_key"] for item in retrievals],
        "provenance": {
            "kind": "recorded",
            "authored": True,
            "synthetic": False,
            "model_run": "none",
            "source_capture_date": SOURCE_DATE,
            "prepared_date": "2026-10-28",
            "note": "Authored historical educational replay; no live model run or current-market lookup.",
        },
        "label": "Guided replay",
        "disclosure": DISCLOSURE,
        "stack_labels": STACK_LABELS,
        "intents": intents,
        "beats": beats,
        "claims": CLAIMS,
    }
    write_json(ROOT / "manifest.json", manifest)

    files: dict[str, str] = {}
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and path.name != "manifest.json":
            relative = path.relative_to(ROOT).as_posix()
            files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest["content_sha256"] = compute_content_sha256(files, manifest)
    write_json(ROOT / "manifest.json", manifest)
    print(f"Wrote {ROOT}")
    print(f"content_sha256={manifest['content_sha256']}")


if __name__ == "__main__":
    build()
