"""Scripted journey actions J00-J09: normalized invocations, verified results.

Each guided step declares its expected tool calls with original provider call
IDs. Tool results are hashed before continuation; a corrupt or omitted fixture
result cannot produce an evidence-based success (P10-TEST02). All final texts
carry the pinned ISIN, snapshot date and not-financial-advice positioning.
"""

import hashlib
import json
from typing import Any

ISIN = "INE001A07RW5"
SNAPSHOT = "2020-07-31"
DISCLOSURE = (
    "Historical scripted analysis of INE001A07RW5 (snapshot 2020-07-31). "
    "Not financial advice; verify independently before any decision."
)

JOURNEY_ACTION_IDS = [
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

_SPECS: dict[str, dict[str, Any]] = {
    "start_walkthrough": {
        "stage": "J00",
        "specialist_id": None,
        "expected_tools": [],
        "final_text": (
            f"Welcome to the single-bond review of {ISIN} (snapshot {SNAPSHOT}). "
            f"{DISCLOSURE}"
        ),
    },
    "inspect_board": {
        "stage": "J01",
        "specialist_id": None,
        "expected_tools": [],
        "final_text": (
            "Board shows Credit & Business, Bond Structure & Downside, and "
            f"Treasury & Market specialists for {ISIN}. {DISCLOSURE}"
        ),
    },
    "submit_bond_question": {
        "stage": "J02",
        "specialist_id": "credit-business",
        "expected_tools": [
            {
                "call_id": "call-search-1",
                "name": "search_knowledge_base",
                "arguments": {"query": "INE001A07RW5 coupon maturity rating"},
            }
        ],
        "final_text": (
            f"Question accepted for {ISIN}: coupon, maturity and rating will be "
            f"answered from dated sources. {DISCLOSURE}"
        ),
    },
    "ask_credit_analysis": {
        "stage": "J03",
        "specialist_id": "credit-business",
        "expected_tools": [
            {
                "call_id": "call-search-2",
                "name": "search_knowledge_base",
                "arguments": {"query": "HDFC credit quality rating drivers"},
            },
            {
                "call_id": "call-disagree-1",
                "name": "log_disagreement",
                "arguments": {
                    "target_participant_name": "Treasury & Market specialist",
                    "topic": "Coupon and rating sufficiency",
                    "reasoning": "A AAA anchor at the snapshot date does not "
                    "settle refinancing and asset-quality questions.",
                    "severity": 3,
                },
            },
        ],
        "final_text": (
            f"Credit view on {ISIN}: AAA anchor at {SNAPSHOT} with open "
            f"asset-quality verification needs. {DISCLOSURE}"
        ),
    },
    "ask_structure_downside": {
        "stage": "J04",
        "specialist_id": "structure-downside",
        "expected_tools": [
            {
                "call_id": "call-search-3",
                "name": "search_knowledge_base",
                "arguments": {"query": "cashflow dates seniority downside"},
            }
        ],
        "final_text": (
            f"Structure view on {ISIN}: 3-year tenor, contractual cashflows with "
            f"worksheet assumptions labeled analysis. {DISCLOSURE}"
        ),
    },
    "queue_verification_question": {
        "stage": "J05",
        "specialist_id": None,
        "expected_tools": [],
        "final_text": (
            "Queued verification question exercises the real editable FIFO "
            "queue; it dispatches only after the active turn completes."
        ),
    },
    "ask_treasury_analysis": {
        "stage": "J06",
        "specialist_id": "treasury-market",
        "expected_tools": [
            {
                "call_id": "call-search-4",
                "name": "search_knowledge_base",
                "arguments": {"query": "rate liquidity reinvestment historical"},
            }
        ],
        "final_text": (
            f"Treasury view on {ISIN}: no executable quote asserted; market "
            f"gaps recorded as verification needs. {DISCLOSURE}"
        ),
    },
    "agree_verification_agenda": {
        "stage": "J07",
        "specialist_id": None,
        "expected_tools": [
            {
                "call_id": "call-consensus-1",
                "name": "log_consensus",
                "arguments": {
                    "participants": [
                        "Credit & Business specialist",
                        "Bond Structure & Downside specialist",
                        "Treasury & Market specialist",
                    ],
                    "topic": "Verification agenda for INE001A07RW5",
                    "strength": 4,
                },
            }
        ],
        "final_text": (
            "Consensus recorded on the verification agenda: trustee payment "
            "confirmation and independent market checks. Votes mean ready to "
            "summarize, not approval to invest."
        ),
    },
    "end_walkthrough": {
        "stage": "J08",
        "specialist_id": None,
        "expected_tools": [],
        "final_text": (
            f"Executive brief for {ISIN} (snapshot {SNAPSHOT}): terms, rating "
            "anchor, downside sensitivities, open verification steps. "
            "Subjective analysis for the user's decision; not financial advice."
        ),
    },
    "explore_followup": {
        "stage": "J09",
        "specialist_id": None,
        "expected_tools": [],
        "final_text": (
            f"Exploration stays on {ISIN} only; the ended walkthrough is "
            "read-only and forks create a new meeting on the same instrument."
        ),
    },
}


def action_script(action_id: str) -> dict[str, Any]:
    if action_id not in _SPECS:
        raise KeyError(f"unsupported journey action: {action_id}")
    return _SPECS[action_id]


class _ToolResultGuard:
    """Hash-then-compare gate for scripted tool results."""

    @staticmethod
    def hash_result(result: Any) -> str:
        canonical = json.dumps(result, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def expect(self, *, expected_hash: str, actual: Any, action_id: str) -> None:
        if self.hash_result(actual) != expected_hash:
            raise ValueError(
                f"tool result mismatch for {action_id}: expected fixture hash "
                "does not match actual result; progression stays retryable"
            )


verify_tool_result = _ToolResultGuard()


def build_journey_provider(action_id: str):
    """Build a RecordedProvider playing tool calls then the final text."""
    from app.infrastructure.demo.recorded_provider import (
        RecordedProvider,
        final_text_response,
        tool_call_response,
    )

    spec = action_script(action_id)
    script = []
    for tool in spec["expected_tools"]:
        script.append(
            tool_call_response(
                tool["call_id"], tool["name"], dict(tool["arguments"])
            )
        )
    script.append(final_text_response(spec["final_text"]))
    return RecordedProvider(script)
