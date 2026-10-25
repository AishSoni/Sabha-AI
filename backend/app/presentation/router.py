"""HTTP surface assembly (spec-04).

Mounts the legacy routers exactly as ``main.py`` did. Extracted module
routes mount here as their vertical slices accept; a caller's duplicate
legacy route is removed in the same cutover commit so exactly one handler
answers each path/model combination.
"""


def mount_routes(app) -> None:
    """Include every router the composed API serves."""
    from fastapi import FastAPI  # noqa: F401  (type only)

    from app.modules.meetings.presentation.compat_http import (
        router as meeting_compat_router,
    )
    from app.modules.meetings.presentation.turns_http import router as turn_router
    from app.modules.settings.presentation import http as settings_module

    # The meeting lifecycle router owns durable work; the compatibility router
    # keeps the interim summary and the synchronous/streaming turn adapters.
    app.include_router(
        meeting_compat_router, prefix="/api/meetings", tags=["meetings"]
    )
    app.include_router(turn_router, prefix="/api")
    app.include_router(settings_module.router)

    # Extracted module routes: their paths are absolute (the router carries
    # no prefix), and each one replaces the legacy route removed in its
    # cutover commit.
    from app.modules.persona_catalog.presentation.http import (
        router as persona_catalog_router,
    )
    from app.modules.meetings.presentation.http import router as meetings_router
    from app.modules.meetings.presentation.meetings_http import (
        router as meeting_lifecycle_router,
    )
    from app.modules.meetings.presentation.participants_http import (
        router as participants_router,
    )

    app.include_router(persona_catalog_router)
    app.include_router(meetings_router, prefix="/api")
    app.include_router(meeting_lifecycle_router, prefix="/api")
    app.include_router(participants_router, prefix="/api")

    from app.modules.knowledge.presentation.http import router as knowledge_router
    from app.modules.knowledge.presentation.stacks_http import (
        router as knowledge_stacks_router,
    )

    app.include_router(knowledge_router)
    app.include_router(knowledge_stacks_router)
