"""Phase 01 (P01-T02) minimal application factory for offline tests.

Runtime entrypoint remains `main:app`. Tests use `create_app()` so lifespan
can be exercised explicitly without importing production credentials.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 01: explicit startup/shutdown hooks with no network I/O.
    # Later phases attach durable runner/lease recovery here.
    app.state.startup_complete = True
    try:
        yield
    finally:
        app.state.startup_complete = False
        # Drain in-flight detached turns so shutdown never abandons them.
        from app.modules.meetings.runner import drain_turn_tasks

        await drain_turn_tasks()
        # Ensure singletons do not leak across tests.
        from app.core.database import reset_supabase_client
        from app.core.qdrant import reset_qdrant_client

        reset_supabase_client()
        reset_qdrant_client()


def create_app() -> FastAPI:
    from app.api import meetings, participants, personas
    from app.api import settings as settings_api, documents, knowledge_stacks
    from app.infrastructure.demo.routes import router as demo_router

    effective = get_settings()
    app = FastAPI(
        title="Sabha API",
        description="Multi-Agent AI Advisory Board Backend",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=effective.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
    app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
    app.include_router(personas.router)
    app.include_router(settings_api.router)
    app.include_router(documents.router)
    app.include_router(knowledge_stacks.router)
    # Demo scaffold entry stays registered but disabled: every handler
    # returns typed demo_unavailable. No recruiter start action is exposed.
    app.include_router(demo_router, prefix="/api/v2/demo", tags=["demo-scaffold"])

    @app.get("/")
    async def root():
        return {"message": "Sabha API", "version": "0.1.0"}

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app
