"""Fail-closed demo capability policy (scaffold only).

Unconfigured capabilities report typed unavailable results rather than
pretending to complete them. No live provider, embedding, search,
market-data, or discovery call is permitted from the scaffold.
"""


class DemoUnavailable(Exception):
    """Typed unavailable error for disabled demo capabilities."""

    def __init__(self, capability: str, reason: str) -> None:
        super().__init__(f"demo capability unavailable: {capability}: {reason}")
        self.capability = capability
        self.reason = reason
        self.code = "demo_unavailable"


# Capabilities that exist in the target journey but are intentionally
# unavailable from the Phase 03 scaffold. Ownership:
# - fixture_retrieval: available here (synthetic only)
# - votes/summaries/metadata/live_search/live_inference: Phase 08/10
UNAVAILABLE_CAPABILITIES = frozenset(
    {
        "real_scenario_bootstrap",
        "guided_actions",
        "votes",
        "summaries",
        "metadata",
        "live_search",
        "live_inference",
        "market_data",
        "exploration_fork",
        "authored_ending",
    }
)

AVAILABLE_CAPABILITIES = frozenset({"fixture_retrieval", "synthetic_smoke"})


def is_available(capability: str) -> bool:
    """Report whether a capability is served by the scaffold."""
    return capability in AVAILABLE_CAPABILITIES


def require(capability: str) -> None:
    """Raise DemoUnavailable unless the capability is served by the scaffold."""
    if not is_available(capability):
        raise DemoUnavailable(capability, "owned by a later phase; not served here")
