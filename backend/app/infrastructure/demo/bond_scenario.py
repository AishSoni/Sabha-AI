"""Verified single-bond evidence pack (Phase 10 content entry, D-01).

Exactly one real instrument: HDFC Ltd 7.87% NCD INE001A07RW5, allotted
18-Jul-2019, matured 18-Jul-2022, Rs 5000 crore, CRISIL AAA/Stable as of the
31-Jul-2020 rationale. Pre-merger series so no HDFC Bank ISIN transfer applies.
Maturity outcome and historical market quotes are explicit verification needs,
never asserted facts. No live research calls originate here.
"""

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

REAL_SCENARIO_ID = "indian-corporate-bond-review"
VERIFIED_ISIN = "INE001A07RW5"
SNAPSHOT_DATE = "2020-07-31"


class ClaimKind(str, Enum):
    SOURCED_FACT = "sourced_fact"
    DERIVED_CALCULATION = "derived_calculation"
    SUBJECTIVE_JUDGMENT = "subjective_judgment"
    UNVERIFIED_QUESTION = "unverified_question"


class BondInstrument(BaseModel):
    isin: str = Field(min_length=12, max_length=12)
    issuer: str = Field(min_length=1, max_length=300)
    coupon_pct: float = Field(ge=0, le=30)
    allotment_date: str = Field(min_length=8, max_length=32)
    maturity_date: str = Field(min_length=8, max_length=32)
    issue_size_cr: float = Field(gt=0)
    rating: str = Field(min_length=1, max_length=120)
    rating_date: str = Field(min_length=8, max_length=32)

    model_config = {"frozen": True}

    @field_validator("isin")
    @classmethod
    def _exactly_one_verified_isin(cls, value: str) -> str:
        if value != VERIFIED_ISIN:
            raise ValueError(
                f"exactly one verified ISIN is approved: {VERIFIED_ISIN}"
            )
        return value


class BondSource(BaseModel):
    source_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=300)
    publisher: str = Field(min_length=1, max_length=300)
    visibility: Literal["shared", "private"] = "shared"
    content_hash: str = Field(min_length=8, max_length=128)
    snapshot_date: str = Field(min_length=8, max_length=32)
    page_locator: str = Field(min_length=1, max_length=500)
    url: Optional[str] = Field(default=None, max_length=1000)
    excerpt: Optional[str] = Field(default=None, max_length=4000)

    model_config = {"frozen": True}


class BondClaim(BaseModel):
    kind: ClaimKind
    text: str = Field(min_length=1, max_length=2000)
    source_id: str = Field(min_length=1, max_length=120)
    inputs: Optional[str] = Field(default=None, max_length=1000)

    model_config = {"frozen": True}


class BondSpecialist(BaseModel):
    specialist_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    remit: str = Field(min_length=1, max_length=2000)
    evidence_scope: list[str] = Field(min_length=1, max_length=10)
    key_questions: list[str] = Field(min_length=1, max_length=10)
    output_obligations: list[str] = Field(min_length=1, max_length=10)
    handoffs: list[str] = Field(default_factory=list, max_length=10)

    model_config = {"frozen": True}


class BondEvidencePack(BaseModel):
    schema_version: str = Field(pattern=r"^[0-9]+$")
    scenario_id: str = Field(min_length=1, max_length=120)
    content_version: int = Field(ge=1, le=9999)
    scenario_revision: int = Field(ge=1, le=9999)
    instrument: BondInstrument
    source_snapshot_date: str = Field(min_length=8, max_length=32)
    sources: list[BondSource] = Field(min_length=5, max_length=20)
    claims: list[BondClaim] = Field(min_length=8, max_length=200)
    specialists: list[BondSpecialist] = Field(min_length=3, max_length=10)

    model_config = {"frozen": True}

    @field_validator("scenario_id")
    @classmethod
    def _single_scenario_only(cls, value: str) -> str:
        if value != REAL_SCENARIO_ID:
            raise ValueError(f"only {REAL_SCENARIO_ID} is approved for Phase 10")
        return value

    @model_validator(mode="after")
    def _check_source_claim_integrity(self):
        source_ids = {s.source_id for s in self.sources}
        required = {
            "instrument-terms-v1",
            "issuer-financials-v1",
            "rating-rationale-v1",
            "market-evidence-v1",
            "downside-worksheet-v1",
        }
        missing = required - source_ids
        if missing:
            raise ValueError(f"evidence pack missing required sources: {sorted(missing)}")
        for claim in self.claims:
            if claim.source_id not in source_ids:
                raise ValueError(
                    f"claim references unknown source: {claim.source_id}"
                )
        worksheet_claims = [
            c for c in self.claims if c.source_id == "downside-worksheet-v1"
        ]
        if not worksheet_claims:
            raise ValueError("downside worksheet must back at least one claim")
        if any(c.kind != ClaimKind.SUBJECTIVE_JUDGMENT for c in worksheet_claims):
            raise ValueError("worksheet-backed claims must be subjective_judgment")
        specialist_ids = {s.specialist_id for s in self.specialists}
        if specialist_ids != {
            "credit-business",
            "structure-downside",
            "treasury-market",
        }:
            raise ValueError("pack must carry exactly the three bond specialists")
        return self


def _hash(seed: str) -> str:
    import hashlib

    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]


def build_hdfc_rw5_pack(
    content_version: int = 1, scenario_revision: int = 1
) -> BondEvidencePack:
    """Assemble the verified HDFC RW5 evidence pack (frozen, offline)."""
    instrument = {
        "isin": VERIFIED_ISIN,
        "issuer": "Housing Development Finance Corporation Limited",
        "coupon_pct": 7.87,
        "allotment_date": "2019-07-18",
        "maturity_date": "2022-07-18",
        "issue_size_cr": 5000,
        "rating": "CRISIL AAA/Stable",
        "rating_date": "2020-07-31",
    }
    sources = [
        {
            "source_id": "instrument-terms-v1",
            "title": "HDFC Ltd 7.87% NCD terms — INE001A07RW5 "
            "(placement memorandum / exchange listing record)",
            "publisher": "NSE/BSE debt archives + issuer placement memorandum",
            "visibility": "shared",
            "content_hash": _hash("instrument-terms-v1|INE001A07RW5|7.87|5000cr"),
            "snapshot_date": SNAPSHOT_DATE,
            "page_locator": "ISIN record: coupon 7.87%, allotment 2019-07-18, "
            "maturity 2022-07-18, issue size Rs 5000 crore",
        },
        {
            "source_id": "issuer-financials-v1",
            "title": "HDFC Ltd Annual Report 2019-20 — audited financials",
            "publisher": "Housing Development Finance Corporation Limited",
            "visibility": "shared",
            "content_hash": _hash("issuer-financials-v1|hdfc-annual-2019-20"),
            "snapshot_date": SNAPSHOT_DATE,
            "page_locator": "Standalone financial statements + "
            "management discussion and analysis",
        },
        {
            "source_id": "rating-rationale-v1",
            "title": "CRISIL rating rationale 31-Jul-2020 — HDFC Ltd "
            "NCD programme AAA/Stable",
            "publisher": "CRISIL Ratings",
            "visibility": "shared",
            "content_hash": _hash("rating-rationale-v1|crisil-2020-07-31|AAA"),
            "snapshot_date": SNAPSHOT_DATE,
            "page_locator": "ISIN table entry: INE001A07RW5 7.87% Rs 5000 cr; "
            "rating AAA/Stable; outlook and key drivers section",
        },
        {
            "source_id": "market-evidence-v1",
            "title": "NSE WDM trade archive — historical price/yield lookup "
            "(gaps explicitly recorded)",
            "publisher": "NSE debt archives",
            "visibility": "shared",
            "content_hash": _hash("market-evidence-v1|wdm-gaps-recorded"),
            "snapshot_date": SNAPSHOT_DATE,
            "page_locator": "No executable quote asserted in this snapshot; "
            "independent verification required before any relative-value view",
        },
        {
            "source_id": "downside-worksheet-v1",
            "title": "Downside worksheet — demo-authored analysis "
            "(not issuer disclosure)",
            "publisher": "Sabha demo authoring",
            "visibility": "private",
            "content_hash": _hash("downside-worksheet-v1|demo-analysis-only"),
            "snapshot_date": SNAPSHOT_DATE,
            "page_locator": "Assumption log + sensitivity notes; "
            "assigned specialist only",
        },
    ]
    claims = [
        {
            "kind": "sourced_fact",
            "text": "INE001A07RW5 is an HDFC Ltd NCD with 7.87% coupon, "
            "allotted 2019-07-18, maturing 2022-07-18, issue size Rs 5000 crore.",
            "source_id": "instrument-terms-v1",
        },
        {
            "kind": "sourced_fact",
            "text": "CRISIL rated the HDFC Ltd NCD programme AAA/Stable "
            "as of the 31-Jul-2020 rationale, covering INE001A07RW5.",
            "source_id": "rating-rationale-v1",
        },
        {
            "kind": "sourced_fact",
            "text": "HDFC Ltd was a housing finance company reporting audited "
            "standalone financials for FY2019-20; details per annual report.",
            "source_id": "issuer-financials-v1",
        },
        {
            "kind": "derived_calculation",
            "text": "Contractual tenor is 3.0 years from 2019-07-18 to 2022-07-18.",
            "source_id": "instrument-terms-v1",
            "inputs": "maturity_date minus allotment_date; Gregorian calendar; "
            "excludes settlement conventions",
        },
        {
            "kind": "derived_calculation",
            "text": "Simple coupon sum over the full tenor is 23.61% of principal "
            "(3 x 7.87%), before compounding, tax, fees and timing effects.",
            "source_id": "instrument-terms-v1",
            "inputs": "coupon_pct=7.87; periods=3; sum not yield; rounding to 2dp",
        },
        {
            "kind": "subjective_judgment",
            "text": "Analyst view: refinancing and rate-path sensitivity deserve "
            "explicit downside attention even for a highly rated issuer.",
            "source_id": "downside-worksheet-v1",
        },
        {
            "kind": "subjective_judgment",
            "text": "Analyst view: the AAA anchor at the snapshot date does not "
            "remove the need to test asset-quality and funding assumptions.",
            "source_id": "downside-worksheet-v1",
        },
        {
            "kind": "unverified_question",
            "text": "Was the 18-Jul-2022 maturity amount paid on schedule per the "
            "debenture trustee / RTA confirmation? Independent verification "
            "required; not asserted from the snapshot alone.",
            "source_id": "market-evidence-v1",
        },
        {
            "kind": "unverified_question",
            "text": "What were executable market price/yield levels around the "
            "snapshot date? No quote is asserted here; verify independently "
            "from WDM records before any market view.",
            "source_id": "market-evidence-v1",
        },
    ]
    specialists = [
        {
            "specialist_id": "credit-business",
            "title": "Credit & Business specialist",
            "remit": "Assess issuer credit quality and business durability: "
            "earnings stability, asset quality, funding mix and rating drivers. "
            "Distinguish dated source facts from judgment.",
            "evidence_scope": ["issuer-financials-v1", "rating-rationale-v1"],
            "key_questions": [
                "What supports the AAA anchor at the snapshot date?",
                "Which asset-quality or funding shifts would weaken it?",
                "What must be verified before relying on historical financials?",
            ],
            "output_obligations": [
                "Cite at least one dated financial or rating fact per claim.",
                "Label judgments and open verification needs explicitly.",
            ],
            "handoffs": ["Pass rating-driver doubts to structure-downside."],
        },
        {
            "specialist_id": "structure-downside",
            "title": "Bond Structure & Downside specialist",
            "remit": "Own the contractual terms and downside sensitivities: "
            "cashflow dates, seniority/security, optionality and worksheet "
            "assumptions. Sole reader of the private downside worksheet.",
            "evidence_scope": ["instrument-terms-v1", "downside-worksheet-v1"],
            "key_questions": [
                "What are the exact contractual cashflow dates and amounts?",
                "Where do timing, tax or seniority assumptions change outcomes?",
                "Which downside must the board verify independently?",
            ],
            "output_obligations": [
                "Show calculation inputs, units and rounding.",
                "Keep worksheet assumptions labeled as analysis, not disclosure.",
            ],
            "handoffs": ["Pass cashflow certainties and gaps to treasury-market."],
        },
        {
            "specialist_id": "treasury-market",
            "title": "Treasury & Market specialist",
            "remit": "Cover rate, liquidity and reinvestment context without "
            "inventing quotes: what the snapshot does and does not prove about "
            "market execution.",
            "evidence_scope": ["market-evidence-v1", "rating-rationale-v1"],
            "key_questions": [
                "What market evidence is present vs explicitly missing?",
                "How would rate moves affect reinvestment, not the fixed coupon?",
                "What independent market checks does the board still need?",
            ],
            "output_obligations": [
                "Never assert a price or yield without a dated source.",
                "Record missing market inputs as verification needs.",
            ],
            "handoffs": ["Return open market questions to the board agenda."],
        },
    ]
    return BondEvidencePack(
        schema_version="1",
        scenario_id=REAL_SCENARIO_ID,
        content_version=content_version,
        scenario_revision=scenario_revision,
        instrument=instrument,
        source_snapshot_date=SNAPSHOT_DATE,
        sources=sources,
        claims=claims,
        specialists=specialists,
    )
