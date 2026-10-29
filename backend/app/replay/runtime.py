"""Bind one replay request to one immutable package checkpoint (spec-17).

The runtime owns the server-side package/version pin; a visitor may select an
approved checkpoint but never a package, workspace, session, or provider. The
run id is ephemeral and never stored: two visitors get separate run ids and no
shared cursor.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Callable

from app.replay.contracts import (
    ReplayCapabilities,
    ReplayContainer,
    ReplaySession,
)
from app.replay.reads import ReplayObservation, ReplayReads
from app.replay.source import (
    PublishedPackage,
    ReplayNotConfigured,
    ReplaySelectorInvalid,
    ReplaySource,
)
from app.replay.streaming import (
    ReplayClosingStream,
    ReplayStreamLimit,
    ReplayTurnStream,
    StreamLimiter,
)


def _capabilities(published: PublishedPackage) -> ReplayCapabilities:
    keys: set[str] = set()
    for checkpoint in published.checkpoints:
        keys.update(checkpoint.reads)
    return ReplayCapabilities(
        meeting_read=True,
        turn_observation=True,
        disagreements="disagreements" in keys,
        consensus="consensus" in keys,
        context_stats="context_stats" in keys,
        create_meeting=any(
            intent.kind == "create_meeting" for intent in published.manifest.intents
        ),
        send_message=False,
        submit_turn=False,
        cancel_turn=False,
        summary=False,
        documents="documents" in keys,
        closing="closing" in keys,
    )


class ReplayRuntime:
    def __init__(
        self,
        source: ReplaySource,
        *,
        package_id: str,
        version: str | None = None,
        content_sha256: str | None = None,
        clock: Callable[[float], Any] | None = None,
        limiter: StreamLimiter | None = None,
        max_stream_bytes: int = 256 * 1024,
        max_stream_seconds: float = 120.0,
    ) -> None:
        self.source = source
        self.package_id = package_id
        self.version = version or None
        self.content_sha256 = content_sha256 or None
        self._clock = clock
        self.limiter = limiter or StreamLimiter()
        self._max_stream_bytes = max_stream_bytes
        self._max_stream_seconds = max_stream_seconds

    async def warm(self) -> None:
        """Load the pinned package once so the first visitor starts warm.

        Warm-up is best-effort: the lifespan logs and continues on failure and
        the first real request retries through the same source.
        """
        if not self.package_id:
            raise ReplayNotConfigured("replay package is not configured")
        await self.source.resolve_package(self.package_id, self.version)

    async def for_request(
        self,
        package_id: str | None = None,
        version: str | None = None,
        checkpoint_id: str | None = None,
    ) -> ReplayContainer:
        if not self.package_id:
            raise ReplayNotConfigured("replay package is not configured")
        if package_id is not None and package_id != self.package_id:
            raise ReplaySelectorInvalid("the requested package is not served here")
        if version is not None and self.version is not None and version != self.version:
            raise ReplaySelectorInvalid("the requested version is not served here")

        published = await self.source.resolve_package(
            self.package_id, version or self.version
        )
        if (
            self.content_sha256 is not None
            and published.content_sha256 != self.content_sha256
        ):
            raise ReplaySelectorInvalid("the published package hash is not served here")

        checkpoint_ids = {item.checkpoint_id for item in published.checkpoints}
        selected = checkpoint_id or published.manifest.initial_checkpoint
        if selected not in checkpoint_ids:
            raise ReplaySelectorInvalid("the requested checkpoint is not published")

        capabilities = _capabilities(published)
        session = ReplaySession(
            run_id=uuid.uuid4().hex,
            package_version=published.version,
            meeting_id=published.meeting_id,
            label=published.label,
            title=published.title,
            as_of=published.as_of,
            disclosure=published.manifest.disclosure,
            stack_labels=dict(published.manifest.stack_labels),
            provenance={
                **published.manifest.provenance,
                "package_id": published.package_id,
                "version": published.version,
                "content_sha256": published.content_sha256,
                "checkpoint": selected,
                "retired": published.status == "retired",
            },
            capabilities=capabilities,
            package_id=published.package_id,
            content_sha256=published.content_sha256,
            checkpoint_id=selected,
            initial_checkpoint=published.manifest.initial_checkpoint,
            checkpoints=tuple(
                checkpoint.checkpoint_id for checkpoint in published.checkpoints
            ),
            intents=tuple(
                intent.model_dump(mode="json")
                for intent in published.manifest.intents
            ),
            beats=tuple(
                beat.model_dump(mode="json") for beat in published.manifest.beats
            ),
            tapes=published.tapes,
            assets=published.assets,
            retired=published.status == "retired",
        )
        return ReplayContainer(
            session=session,
            reads=ReplayReads(self.source, published, selected),
            observation=ReplayObservation(self.source, published, selected),
            stream=ReplayTurnStream(
                self.source,
                published,
                clock=self._clock or asyncio.sleep,
                max_bytes=self._max_stream_bytes,
                max_seconds=self._max_stream_seconds,
            ),
            closing_events=ReplayClosingStream(
                self.source,
                published,
                clock=self._clock or asyncio.sleep,
                max_bytes=self._max_stream_bytes,
                max_seconds=self._max_stream_seconds,
            ),
            checkpoint_id=selected,
            limiter=self.limiter,
        )


__all__ = ["ReplayRuntime", "ReplaySelectorInvalid", "ReplayStreamLimit"]
