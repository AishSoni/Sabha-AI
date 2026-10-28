"""Composition root for the backend (spec-04).

Constructs the dependency container once and assembles the FastAPI app
that ``main.py`` exposes as ``app`` (``uvicorn main:app`` keeps working).
Defaults to the production container; tests inject their own
``Container`` with replacement adapters, which is what makes the use case
provable end-to-end without SDK reach.

Assembly owns the CORS policy, the demo write guard, the startup-recovery
lifespan and the final module router set. ``main.py`` and ``worker.py`` are
thin entry points over this root; application layers never import it.
"""

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Callable, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.platform.config import settings
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
from app.replay.http import router as replay_router
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
from app.modules.meetings.infrastructure.turns import TurnQueueService
from app.capabilities.runtime.runner import TurnRunner


def _system_ai_reader():
    """Read shared System AI policy through the settings adapter."""
    from app.modules.settings.infrastructure.system_ai import load_system_ai_config

    return load_system_ai_config()


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
        from app.platform.database import get_supabase
        from app.modules.knowledge.public import get_knowledge_lifecycle
        from app.modules.persona_catalog.infrastructure.supabase import (
            SupabasePersonaCatalog,
            SupabasePromptCatalog,
        )

        meeting_service = build_meeting_service(get_supabase())
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
            prompt_catalog=SupabasePromptCatalog(get_supabase),
            persona_catalog=SupabasePersonaCatalog(get_supabase),
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


def _ensure_demo_guard(app: FastAPI) -> None:
    """Deny mutating API calls before dispatch when running in demo mode.

    Demo is a no-write replay workspace: reads stay open (no-auth API is kept),
    but POST/PUT/PATCH/DELETE to any /api endpoint returns 403 before routing
    so no route handler ever executes a write. Full local/hosted runtimes are
    unaffected.
    """
    from fastapi import Request
    from fastapi.responses import JSONResponse

    @app.middleware("http")
    async def demo_write_guard(request: Request, call_next):
        if settings.runtime_mode == "demo":
            if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api"):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Demo workspace is read-only — mutations are disabled"},
                )
        return await call_next(request)


def create_app(
    container: Optional[Container] = None,
    replay: Optional[ReplayContainer] = None,
    *,
    mount_live: bool | None = None,
) -> FastAPI:
    """Assemble the application.

    ``container=None`` selects the production live composition; tests inject
    their own ``Container`` built with double adapters. ``replay`` is always a
    separate graph stored at ``app.state.replay``; it is never derived from the
    live container. ``mount_live=False`` (or ``REPLAY_ONLY=true``) produces a
    replay-only process that constructs no live adapters.
    """
    live_enabled = (not settings.replay_only) if mount_live is None else mount_live
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
    app.state.replay = replay
    register_error_handlers(app)

    if live_enabled:
        # Include routers (unchanged order; cutover will remove migrated
        # duplicates from the legacy routers)
        mount_routes(app)
        _ensure_demo_guard(app)
    # The replay namespace is present in every composition. Without a
    # configured source it answers 503; it never falls back to live data.
    app.include_router(replay_router)

    @app.get("/")
    async def root():
        return {"message": "Sabha API", "version": "0.1.0"}

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app
