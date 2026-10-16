"""Bond fixture retrieval: scoped, labeled, no fabrication (red first)."""

import pytest

pytestmark = pytest.mark.anyio


async def test_shared_sources_reach_all_specialists():
    from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
    from app.infrastructure.demo.bond_scenario import build_hdfc_rw5_pack

    search = BondKnowledgeSearch(pack=build_hdfc_rw5_pack())
    for specialist in ("credit-business", "treasury-market", "structure-downside"):
        result = await search.search("coupon and rating", "m-1", specialist)
        ids = {c.source for c in result.citations}
        assert "instrument-terms-v1" in ids
        assert "rating-rationale-v1" in ids


async def test_private_worksheet_only_for_assigned_specialist():
    from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
    from app.infrastructure.demo.bond_scenario import build_hdfc_rw5_pack

    search = BondKnowledgeSearch(pack=build_hdfc_rw5_pack())
    allowed = await search.search("downside assumptions", "m-1", "structure-downside")
    assert "downside-worksheet-v1" in {c.source for c in allowed.citations}

    for other in ("credit-business", "treasury-market"):
        denied = await search.search("downside assumptions", "m-1", other)
        assert "downside-worksheet-v1" not in {c.source for c in denied.citations}
        assert denied.items, "shared evidence must still return"


async def test_empty_query_returns_no_items_without_fabrication():
    from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
    from app.infrastructure.demo.bond_scenario import build_hdfc_rw5_pack

    search = BondKnowledgeSearch(pack=build_hdfc_rw5_pack())
    result = await search.search("   ", "m-1", "credit-business")
    assert result.items == []
    assert result.citations == []


async def test_citations_carry_snapshot_and_locator():
    from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
    from app.infrastructure.demo.bond_scenario import build_hdfc_rw5_pack

    search = BondKnowledgeSearch(pack=build_hdfc_rw5_pack())
    result = await search.search("INE001A07RW5", "m-1", "credit-business")
    assert result.citations
    for citation in result.citations:
        assert citation.source
        assert citation.title
        assert citation.snippet
