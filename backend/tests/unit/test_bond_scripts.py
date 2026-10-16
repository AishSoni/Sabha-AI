"""Journey script contracts: normalized invocations with verified tool results."""

import pytest

pytestmark = pytest.mark.anyio


def test_journey_covers_all_ten_steps():
    from app.infrastructure.demo.bond_scripts import JOURNEY_ACTION_IDS

    assert JOURNEY_ACTION_IDS == [
        "start_walkthrough",
        "inspect_board",
        "submit_bond_question",
        "ask_credit_analysis",
        "ask_structure_downside",
        "queue_verification_question",
        "ask_treasury_analysis",
        "agree_verification_agenda",
        "end_walkthrough",
        "explore_followup",
    ]


def test_credit_step_requires_disagreement_before_final():
    from app.infrastructure.demo.bond_scripts import action_script

    spec = action_script("ask_credit_analysis")
    assert spec["specialist_id"] == "credit-business"
    tool_names = [t["name"] for t in spec["expected_tools"]]
    assert "search_knowledge_base" in tool_names
    assert "log_disagreement" in tool_names
    assert "Coupon and rating sufficiency" in str(spec)


def test_consensus_step_records_strength_four():
    from app.infrastructure.demo.bond_scripts import action_script

    spec = action_script("agree_verification_agenda")
    consensus = next(
        t for t in spec["expected_tools"] if t["name"] == "log_consensus"
    )
    assert consensus["arguments"]["strength"] == 4


def test_corrupt_tool_result_blocks_success():
    from app.infrastructure.demo.bond_scripts import verify_tool_result

    good_hash = verify_tool_result.hash_result({"items": ["rating-rationale-v1"]})
    with pytest.raises(ValueError, match="tool result mismatch"):
        verify_tool_result.expect(
            expected_hash=good_hash, actual={"items": ["tampered"]}, action_id="x"
        )


async def test_scripted_provider_preserves_call_ids():
    from app.infrastructure.demo.bond_scripts import build_journey_provider

    provider = build_journey_provider("ask_credit_analysis")
    assert provider.remaining >= 2
