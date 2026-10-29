"""Runtime supervision for the durable turn queue (spec 07).

The runner owns only concurrency, lease heartbeat, deadlines and graceful
shutdown. Admission, ordering, fencing and publication stay in the database
service, so running this loop inside the API process and in a dedicated
worker is safe: the database's one-executing-turn-per-meeting index and
global concurrency limit arbitrate between them.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid
from typing import Awaitable, Callable, Optional

from app.capabilities.runtime.contracts import TurnClaim, TurnExecutor
from app.platform.config import settings

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {"completed", "failed", "interrupted", "cancelled"}


def default_worker_id() -> str:
    return os.environ.get(
        "TURN_WORKER_ID",
        f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}",
    )


class TurnRunner:
    """Claim and execute turn operations with bounded local concurrency."""

    def __init__(
        self,
        service: TurnExecutor,
        *,
        concurrency: Optional[int] = None,
        poll_seconds: Optional[float] = None,
        execution_timeout_seconds: Optional[int] = None,
        worker_id: Optional[str] = None,
        on_turn_terminal: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> None:
        self.service = service
        self.concurrency = concurrency or settings.turn_global_concurrency
        self.poll_seconds = poll_seconds or settings.turn_poll_seconds
        self.execution_timeout_seconds = (
            execution_timeout_seconds or settings.turn_execution_timeout_seconds
        )
        self.worker_id = worker_id or default_worker_id()
        self.on_turn_terminal = on_turn_terminal
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._running: set[asyncio.Task] = set()

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.is_running:
            return
        self._stop.clear()
        await self._recover()
        self._task = asyncio.create_task(self._loop(), name="turn-runner")

    async def stop(self, grace_seconds: float = 5.0) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=grace_seconds)
            except asyncio.TimeoutError:
                self._task.cancel()
                await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
        if self._running:
            pending = list(self._running)
            done, still_running = await asyncio.wait(pending, timeout=grace_seconds)
            for task in still_running:
                task.cancel()
            await asyncio.gather(*still_running, return_exceptions=True)
            self._running.clear()

    async def _recover(self) -> None:
        try:
            summary = await self.service.recover()
            if summary:
                logger.info("Turn queue recovery: %s", summary)
        except Exception:
            # Recovery failure must not prevent the API from starting; the DB
            # claim RPC performs the same expired-lease pass on every claim.
            logger.warning("Turn queue recovery failed", exc_info=True)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Turn runner iteration failed", exc_info=True)
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=self.poll_seconds
                )
            except asyncio.TimeoutError:
                pass

    async def run_once(self) -> int:
        """Claim and execute available work up to local capacity.

        Returns the number of claims started. Exposed for deterministic tests
        and for a one-shot worker invocation.
        """
        started = 0
        while not self._stop.is_set() and len(self._running) < self.concurrency:
            claim = await self.service.claim(self.worker_id)
            if claim is None:
                break
            task = asyncio.create_task(
                self._execute(claim), name=f"turn-{claim.operation_id}"
            )
            self._running.add(task)
            task.add_done_callback(self._running.discard)
            started += 1
            # Do not spin: if the claim was the only item, the next call
            # returns null immediately, but this keeps tests deterministic.
            if started >= self.concurrency:
                break
        return started

    async def wait_idle(self) -> None:
        """Wait for all in-flight executions (test/drain helper)."""
        if self._running:
            await asyncio.gather(*list(self._running), return_exceptions=True)

    async def _execute(self, claim: TurnClaim) -> None:
        try:
            try:
                await asyncio.wait_for(
                    self.service.execute_claim(claim),
                    timeout=self.execution_timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.warning("Turn %s exceeded its execution deadline", claim.operation_id)
                await self.service.interrupt_claim(
                    claim,
                    "execution_timeout",
                    "The turn exceeded its execution deadline; its outcome is unknown.",
                )
            except asyncio.CancelledError:
                # Shutdown or timeout cancellation. The lease will expire and
                # recovery will mark a started attempt interrupted; never publish
                # from a cancelled task.
                raise
            except Exception:
                logger.warning("Turn %s failed unexpectedly", claim.operation_id, exc_info=True)
                await self.service.interrupt_claim(
                    claim,
                    "runner_error",
                    "The turn failed unexpectedly; its outcome is unknown.",
                )
        finally:
            await self._after_terminal(claim)

    async def _after_terminal(self, claim: TurnClaim) -> None:
        """Let a closing operation drain once its executing turn is terminal.

        The callback reads committed state; it never assumes the turn
        succeeded. A failure here must not corrupt the turn outcome, and the
        next closing request/startup reconciliation retries the guard.
        """
        if self.on_turn_terminal is None:
            return
        try:
            await self.on_turn_terminal(claim.meeting_id)
        except Exception:
            logger.warning(
                "Closing advance after turn %s failed",
                claim.operation_id,
                exc_info=True,
            )
