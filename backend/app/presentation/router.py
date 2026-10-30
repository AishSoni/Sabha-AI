"""Final HTTP surface assembly.

Every public route is owned by a business module. This file only chooses the
mount point and tag set so the composed paths keep their Phase 1 URLs.

Spec-22: every live module router is mounted under one parent router whose
dependencies authenticate the operator before any business adapter, body
validation or streaming subscription runs. ``/api/replay/*`` is mounted by the
composition root outside this parent and stays account-free.
"""


def mount_routes(app) -> None:
    """Include every router the composed API serves."""
    from fastapi import APIRouter, Depends

    from app.modules.access.presentation.http import (
        FORBIDDEN_RESPONSE,
        UNAUTHORIZED_RESPONSE,
        UNAVAILABLE_RESPONSE,
        require_operator_access,
        router as access_router,
    )
    from app.modules.meetings.presentation.compat_http import (
        router as meeting_compat_router,
    )
    from app.modules.meetings.presentation.turns_http import router as turn_router
    from app.modules.settings.presentation import http as settings_module
    from app.presentation.demo_guard import deny_demo_writes

    protected = APIRouter(
        dependencies=[
            Depends(require_operator_access),
            Depends(deny_demo_writes),
        ],
        responses={
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            503: UNAVAILABLE_RESPONSE,
        },
    )

    # The meeting lifecycle router owns durable work; the compatibility router
    # keeps the interim summary and the synchronous/streaming turn adapters.
    protected.include_router(
        meeting_compat_router, prefix="/api/meetings", tags=["meetings"]
    )
    protected.include_router(turn_router, prefix="/api")
    protected.include_router(settings_module.router)

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

    protected.include_router(persona_catalog_router)
    protected.include_router(meetings_router, prefix="/api")
    protected.include_router(meeting_lifecycle_router, prefix="/api")
    protected.include_router(participants_router, prefix="/api")

    from app.modules.knowledge.presentation.http import router as knowledge_router
    from app.modules.knowledge.presentation.stacks_http import (
        router as knowledge_stacks_router,
    )

    protected.include_router(knowledge_router)
    protected.include_router(knowledge_stacks_router)

    # Admission probe belongs to the protected graph and returns only its
    # boolean result, never workspace or provider data.
    protected.include_router(access_router)

    app.include_router(protected)
