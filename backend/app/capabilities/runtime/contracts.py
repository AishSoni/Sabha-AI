"""Contracts the runtime supervisor needs from a turn executor.

The runtime owns concurrency, lease heartbeats, deadlines and graceful
shutdown. It must not import a module's infrastructure or policy code, so
the durable turn workflow is injected through this narrow protocol from the
composition root.
"""

from __future__ import annotations

from typing import Protocol


class TurnClaim(Protocol):
    """One claimed operation, as far as supervision is concerned."""

    operation_id: str
    meeting_id: str


class TurnExecutor(Protocol):
    """The operations the runner may invoke on a durable turn service."""

    async def recover(self) -> dict:
        ...

    async def claim(
        self,
        claimant: str,
        *,
        meeting_id: str | None = None,
        global_limit: int | None = None,
    ) -> TurnClaim | None:
        ...

    def interrupt_claim(
        self, claim: TurnClaim, code: str, message: str
    ) -> object:
        ...

    async def execute_claim(self, claim: TurnClaim) -> object:
        ...
