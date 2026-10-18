"""Universal inference accounting (spec-02).

Every COMPLETED inference attempt (turn rounds, votes, summaries, forced
summaries) is recorded exactly once in the `inference_events` ledger through
the idempotent `record_inference_cost` RPC, which alone moves
`meetings.total_cost`. Rules encoded here:

- a stable client-generated id makes a repeated submission a no-op;
- failed attempts are never charged (callers only record completed attempts);
- unknown usage records a zero-cost event (the attempt stays visible, the
  price is never fabricated);
- a ledger write failure is logged, never propagated — accounting failure
  cannot fail an inference attempt that already completed and returned value
  to the user. The idempotent RPC makes a later manual replay safe.
"""

import logging
import uuid as uuid_module

logger = logging.getLogger(__name__)


async def record_inference_attempt(
    meeting_manager,
    *,
    meeting_id: str,
    purpose: str,
    provider: str | None,
    model: str | None,
    usage: dict | None,
    estimator,
) -> float:
    """Record one completed inference attempt; return its counted cost."""
    cost = estimator.estimate_cost(usage if usage is not None else {})
    try:
        await meeting_manager.record_inference_cost(
            inference_id=str(uuid_module.uuid4()),
            meeting_id=meeting_id,
            purpose=purpose,
            provider=provider,
            model=model,
            cost=cost,
        )
    except Exception as exc:  # noqa: BLE001 - accounting must not break inference
        logger.warning(
            "Inference ledger write failed (meeting %s, purpose %s): %s",
            meeting_id, purpose, exc,
        )
    return cost
