"""Bond scenario manifest validation: exactly one verified real ISIN (red first).

Covers P10-TEST06 structure: missing/incorrect instrument identity, source
locators, snapshot, claim mappings and worksheet labels fail validation.
Human source verification is recorded separately in specs/evidence/phase-10.md.
"""

import pytest
from pydantic import ValidationError

from app.infrastructure.demo.bond_scenario import (
    BondClaim,
    BondEvidencePack,
    BondSource,
    build_hdfc_rw5_pack,
)


def test_accepts_verified_hdfc_rw5_pack():
    pack = build_hdfc_rw5_pack()
    assert pack.scenario_id == "indian-corporate-bond-review"
    assert pack.instrument.isin == "INE001A07RW5"
    assert pack.instrument.coupon_pct == 7.87
    assert pack.instrument.maturity_date == "2022-07-18"
    assert pack.content_version == 1
    assert len(pack.sources) == 5
    assert len(pack.claims) >= 8


def test_rejects_second_isin():
    pack = build_hdfc_rw5_pack()
    with pytest.raises(ValidationError, match="exactly one verified ISIN"):
        BondEvidencePack(
            schema_version="1",
            scenario_id=pack.scenario_id,
            content_version=1,
            scenario_revision=1,
            instrument={
                "isin": "INE001A07RS3",
                "issuer": "Housing Development Finance Corporation Limited",
                "coupon_pct": 8.58,
                "allotment_date": "2019-03-18",
                "maturity_date": "2022-03-18",
                "issue_size_cr": 5000,
                "rating": "CRISIL AAA/Stable",
                "rating_date": "2020-07-31",
            },
            source_snapshot_date=pack.source_snapshot_date,
            sources=[s.model_dump() for s in pack.sources],
            claims=[c.model_dump() for c in pack.claims],
            specialists=[s.model_dump() for s in pack.specialists],
        )


def test_source_locators_are_required():
    with pytest.raises(ValidationError):
        BondSource(
            source_id="instrument-terms-v1",
            title="Missing locator",
            publisher="NSE",
            visibility="shared",
            content_hash="abc12345def67890",
            snapshot_date="2020-07-31",
            page_locator=None,
        )


def test_private_worksheet_is_labeled_analysis():
    pack = build_hdfc_rw5_pack()
    worksheet = next(s for s in pack.sources if s.source_id == "downside-worksheet-v1")
    assert worksheet.visibility == "private"
    assert "analysis" in worksheet.title.lower() or "worksheet" in worksheet.title.lower()
    claims = [c for c in pack.claims if c.source_id == "downside-worksheet-v1"]
    assert claims, "worksheet must back at least one claim"
    assert all(c.kind == "subjective_judgment" for c in claims)


def test_missing_market_inputs_are_explicit_unknowns():
    pack = build_hdfc_rw5_pack()
    unknowns = [c for c in pack.claims if c.kind == "unverified_question"]
    assert len(unknowns) >= 2
    texts = " ".join(c.text for c in unknowns).lower()
    assert "market" in texts or "price" in texts or "yield" in texts
    assert "verif" in texts


def test_claim_kinds_are_closed():
    with pytest.raises(ValidationError, match="kind"):
        BondClaim(
            kind="analyst_opinion",
            text="Free-form opinion without classification",
            source_id="rating-rationale-v1",
        )
