"""Composition root for the backend (spec-04).

Constructs the dependency container once and assembles the FastAPI app
that ``main.py`` exposes as ``app`` (``uvicorn main:app`` keeps working).
Defaults to the production container; tests inject their own
``Container`` with replacement adapters, which is what makes the use case
provable end-to-end without SDK reach.

Assembly owns the CORS policy, the private-response cache policy, operator
admission for the live graph, the startup-recovery lifespan and the final
module router set. ``main.py`` and ``worker.py`` are
thin entry points over this root; application layers never import it.
"""

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Callable, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.platform.config import settings
from app.platform.blocking import run_blocking, shutdown_blocking
from app.platform.database import close_supabase
from app.platform.replay_database import close_replay_pool
from app.modules.meetings.application.closing import ClosingService
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.application.ports import MeetingReads, TurnObservation
from app.modules.meetings.infrastructure.supabase_closing import (
    SupabaseClosingRepository,
    SupabaseInvocationFactory,
)
from app.modules.persona_catalog.application.contracts import (
    PersonaCatalogPort,
    PromptCatalogPort,
)
from app.presentation.errors import register_error_handlers
from app.presentation.router import mount_routes
from app.replay.contracts import ReplayContainer
from app.replay.http import register_replay_error_handlers
from app.replay.http import router as replay_router
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
from app.modules.meetings.infrastructure.turns import TurnQueueService
from app.capabilities.runtime.runner import TurnRunner


async def _system_ai_reader():
    """Read shared System AI policy through the cached settings source."""
    from app.modules.settings.infrastructure.system_ai import SYSTEM_AI_DEFAULTS

    return await SYSTEM_AI_DEFAULTS.acurrent_config()


async def _startup_reconciliation():
    """Recover orphaned knowledge work through the live adapter."""
    from app.modules.knowledge.public import reconcile_startup_state

    return await reconcile_startup_state()


@dataclass(frozen=True)
class Container:
    """The single composition point: every adapter is constructed here.

    Route dependencies read ports from ``request.app.state.container``; no
    route constructs a client or service itself.
    """

    prompt_catalog: PromptCatalogPort
    persona_catalog: PersonaCatalogPort | None = None
    # Spec-14: the meeting service, closing service, and slow knowledge
    # adapters are constructed once by the composition root. Presentation
    # resolves them from here; no request handler builds a default.
    meeting_service: MeetingService | None = None
    # Read and observation ports may be the live services themselves or a
    # recorded source; presentation depends only on these interfaces.
    meeting_reads: MeetingReads | None = None
    # Spec-07: the queue service is always present in production so the HTTP
    # surface can submit/observe even when inference runs in a separate
    # process. The runner is optional so tests can disable background work.
    turn_queue: TurnQueueService | None = None
    turn_observation: TurnObservation | None = None
    turn_runner: TurnRunner | None = None
    closing: ClosingService | None = None
    # Knowledge adapters are lazy so importing the app never reaches Qdrant or
    # embeddings, and a replay-only composition can leave them unset.
    knowledge_lifecycle: Any | None = None
    knowledge_lifecycle_factory: Callable[[], Any] | None = None
    knowledge_db_factory: Callable[[], Any] | None = None
    system_ai_reader: Callable[[], Any] | None = None
    # Live-only startup hooks. A replay-only composition leaves them unset so
    # serving recorded requests never reaches live storage or recovery work.
    startup_reconciliation: Callable[[], Any] | None = None

    @classmethod
    def production(cls) -> "Container":
        """Real composition: one Supabase client, adapters built once."""
        from app.platform.cache import TTLCache
        from app.platform.database import get_supabase
        from app.modules.knowledge.public import get_knowledge_lifecycle
        from app.modules.persona_catalog.infrastructure.supabase import (
            SupabasePersonaCatalog,
            SupabasePromptCatalog,
        )

        persona_list_cache = TTLCache(
            max_entries=settings.persona_cache_max_entries,
            ttl_seconds=settings.persona_cache_ttl_seconds,
        )

        meeting_service = build_meeting_service(
            get_supabase(), run_blocking=run_blocking
        )
        turn_queue = TurnQueueService(meeting_service)
        closing = ClosingService(
            SupabaseClosingRepository(meeting_service),
            SupabaseInvocationFactory(),
            lease_seconds=settings.closing_attempt_lease_seconds,
            drain_timeout_seconds=settings.closing_drain_timeout_seconds,
        )
        runner = (
            TurnRunner(turn_queue, on_turn_terminal=closing.advance)
            if settings.turn_runner_enabled
            else None
        )
        return cls(
            prompt_catalog=SupabasePromptCatalog(
                get_supabase, list_cache=persona_list_cache
            ),
            persona_catalog=SupabasePersonaCatalog(
                get_supabase, list_cache=persona_list_cache
            ),
            meeting_service=meeting_service,
            meeting_reads=meeting_service,
            turn_queue=turn_queue,
            turn_observation=turn_queue,
            turn_runner=runner,
            closing=closing,
            knowledge_lifecycle_factory=get_knowledge_lifecycle,
            knowledge_db_factory=get_supabase,
            system_ai_reader=_system_ai_reader,
            startup_reconciliation=_startup_reconciliation,
        )


def _configured_replay():
    """Build the packaged replay runtime only when the server pins one."""
    if not settings.replay_database_url or not settings.replay_package_id:
        return None
    from app.replay.cache import ReplayCache
    from app.replay.runtime import ReplayRuntime
    from app.replay.source import ReplaySource
    from app.replay.streaming import StreamLimiter

    return ReplayRuntime(
        ReplaySource(
            cache=ReplayCache(
                max_entries=settings.replay_cache_max_entries,
                registry_ttl_seconds=settings.replay_registry_ttl_seconds,
                status_ttl_seconds=settings.replay_status_ttl_seconds,
            )
        ),
        package_id=settings.replay_package_id,
        version=settings.replay_package_version or None,
        content_sha256=settings.replay_package_sha256 or None,
        limiter=StreamLimiter(
            max_global=settings.replay_stream_max_global,
            max_per_client=settings.replay_stream_max_per_client,
        ),
        max_stream_bytes=settings.replay_stream_max_bytes,
        max_stream_seconds=settings.replay_stream_max_seconds,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Recover from interrupted work, then serve.

    Startup reconciliation (spec-02): orphaned 'processing' documents are
    marked failed with a re-upload message and deferred vector-collection
    cleanups are retried. The pass must never break startup; its failure mode
    is a loud warning, retried next boot.

    Spec-07 adds turn recovery plus an optional inline runner. A dedicated
    ``worker.py`` can own inference instead; the database guards make both
    placements safe.
    """
    import logging

    logger = logging.getLogger("sabha.startup")
    container: Container | None = getattr(app.state, "container", None)
    if container is None:
        yield
        return

    # Spec 20: the defaults port is a process-local cache. Reset it per app
    # start so an embedded database or a fresh deployment is observed.
    from app.modules.settings.infrastructure.system_ai import SYSTEM_AI_DEFAULTS

    SYSTEM_AI_DEFAULTS.invalidate()

    # Spec 20: load the pinned replay package once, on one pooled connection.
    # A failed warm-up is a warning; the first request retries.
    replay = getattr(app.state, "replay", None)
    if replay is not None and settings.replay_cache_warm_enabled:
        try:
            await replay.warm()
        except Exception:  # noqa: BLE001 - warm-up must never block startup
            logger.warning(
                "Replay package warm-up failed; the first request will retry",
                exc_info=True,
            )

    reconciler = getattr(container, "startup_reconciliation", None)
    if reconciler is not None:
        try:
            summary = await reconciler()
            if summary.get("documents_failed") or summary.get("cleanups_attempted"):
                logger.info("Startup reconciliation: %s", summary)
        except Exception:
            logger.warning("Startup reconciliation failed", exc_info=True)

    runner = container.turn_runner
    try:
        if runner is not None:
            await runner.start()
        elif container.turn_queue is not None:
            await container.turn_queue.recover()
    except Exception:
        logger.warning("Turn queue startup recovery failed", exc_info=True)

    try:
        closing = getattr(container, "closing", None)
        if closing is not None:
            await closing.reconcile_open_closings()
    except Exception:
        logger.warning("Closing startup reconciliation failed", exc_info=True)

    factory = getattr(container, "knowledge_lifecycle_factory", None)
    if factory is not None:
        try:
            lifecycle = factory()
            report = await lifecycle.run_cleanup()
            if report.attempted:
                logger.info("Knowledge cleanup reconciliation: %s", report)
            recovered = await lifecycle.recover_ingestions()
            if recovered:
                logger.info("Knowledge ingestion recovery: %s operations", recovered)
            staged = await lifecycle.sweep_staging()
            if staged:
                logger.info("Knowledge staging sweep removed %s objects", staged)
        except Exception:
            logger.warning("Knowledge startup reconciliation failed", exc_info=True)

    try:
        yield
    finally:
        if runner is not None:
            try:
                await runner.stop()
            except Exception:
                logger.warning("Turn runner shutdown failed", exc_info=True)

        close_replay_pool()
        access = getattr(app.state, "access", None)
        if access is not None:
            try:
                await access.aclose()
            except Exception:
                logger.warning("Access verifier shutdown failed", exc_info=True)
        close_supabase()
        shutdown_blocking()


def _ensure_request_timing(app: FastAPI) -> None:
    """Record one structured timing line per request (spec-20)."""
    if not settings.request_timing_enabled:
        return
    from app.presentation.timing import RequestTimingMiddleware

    app.add_middleware(RequestTimingMiddleware)


def _build_operator_access(verifier=None):
    """Validate operator config, then build the live admission guard.

    Runs before the live container so a missing/unsafe operator setting stops
    startup without constructing Supabase, Qdrant, provider or recovery
    adapters. Replay-only compositions never call this function.
    """
    from app.modules.access.application.guard import OperatorGuard
    from app.modules.access.domain.policy import OperatorAccessConfig
    from app.modules.access.infrastructure.supabase_auth import SupabaseAuthVerifier

    config = OperatorAccessConfig.from_settings(settings)
    if verifier is None:
        verifier = SupabaseAuthVerifier(
            supabase_url=config.supabase_url,
            publishable_key=config.auth_publishable_key,
            timeout_seconds=config.verification_timeout_seconds,
            max_connections=config.verification_max_connections,
        )
    return OperatorGuard(
        verifier=verifier,
        operator_user_id=config.operator_user_id,
    )


def create_app(
    container: Optional[Container] = None,
    replay: Optional[ReplayContainer] = None,
    *,
    mount_live: bool | None = None,
    access_verifier: Any | None = None,
) -> FastAPI:
    """Assemble the application.

    ``container=None`` selects the production live composition; tests inject
    their own ``Container`` built with double adapters. ``replay`` is always a
    separate graph stored at ``app.state.replay``; it is never derived from the
    live container. ``mount_live=False`` (or ``REPLAY_ONLY=true``) produces a
    replay-only process that constructs no live adapters.

    ``access_verifier`` is a test seam: configuration is still validated and
    the HTTP dependency still runs, but token verification is replaced with a
    controlled adapter. Production never sets it.
    """
    live_enabled = (not settings.replay_only) if mount_live is None else mount_live
    access_guard = _build_operator_access(access_verifier) if live_enabled else None
    active = None
    if live_enabled:
        active = container if container is not None else Container.production()

    app = FastAPI(
        title="Sabha API",
        description="Multi-Agent AI Advisory Board Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS configuration (unchanged from main.py)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.container = active
    app.state.replay = replay if replay is not None else _configured_replay()
    app.state.access = access_guard
    register_error_handlers(app)

    if live_enabled:
        # Include the whole live graph behind one admission dependency.
        mount_routes(app)
    # The replay namespace is present in every composition. Without a
    # configured source it answers 503; it never falls back to live data.
    # It is deliberately mounted outside the protected live parent.
    app.include_router(replay_router)
    register_replay_error_handlers(app)
    _ensure_request_timing(app)
    # Spec-22: live JSON, bytes and streams are never shared-cacheable.
    from app.presentation.cache import PrivateApiCacheMiddleware

    app.add_middleware(PrivateApiCacheMiddleware)

    @app.get("/")
    async def root():
        return {"message": "Sabha API", "version": "0.1.0"}

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app
