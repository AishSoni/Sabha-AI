"""Dedicated durable turn worker (spec 07).

Run this beside the API when inference should not consume API event-loop
capacity::

    python worker.py

It uses the same composition root and database guards as the inline runner,
so running both is safe. The worker does not serve HTTP.
"""

from __future__ import annotations

import asyncio
import logging

from app.bootstrap import Container
from app.platform.config import settings


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    if settings.replay_only:
        raise SystemExit("Refusing to run a live turn worker with REPLAY_ONLY=true")
    container = Container.production()
    runner = container.turn_runner
    if runner is None:
        raise SystemExit("Turn runner is disabled (TURN_RUNNER_ENABLED=false)")
    from app.modules.settings.infrastructure.system_ai import SYSTEM_AI_DEFAULTS

    try:
        await SYSTEM_AI_DEFAULTS.refresh()
    except Exception:  # noqa: BLE001 - warm-up must not block worker startup
        logging.getLogger("sabha.worker").warning(
            "System AI settings warm-up failed", exc_info=True
        )
    await runner.start()
    try:
        await asyncio.Event().wait()
    finally:
        await runner.stop()


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass
