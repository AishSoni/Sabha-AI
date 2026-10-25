"""HTTP surface assembly (spec-04).

Mounts the legacy routers exactly as ``main.py`` did. Extracted module
routes mount here as their vertical slices accept; a caller's duplicate
legacy route is removed in the same cutover commit so exactly one handler
answers each path/model combination.
"""


def mount_routes(app) -> None:
    """Include every router the composed API serves."""
    from fastapi import FastAPI  # noqa: F401  (type only)

    from app.api import meetings, participants, knowledge_stacks, turns
    from app.modules.settings.presentation import http as settings_module

    app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
    # Spec-07 turn routes are additive; both legacy turn routes stay mounted
    # until the frontend cutover removes their duplicate policy.
    app.include_router(turns.router, prefix="/api")
    app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
    app.include_router(settings_module.router)
    app.include_router(knowledge_stacks.router)

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

    app.include_router(persona_catalog_router)
    app.include_router(meetings_router, prefix="/api")
    app.include_router(meeting_lifecycle_router, prefix="/api")

    from app.modules.knowledge.presentation.http import router as knowledge_router

    app.include_router(knowledge_router)
