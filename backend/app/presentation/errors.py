"""Typed-outcome to safe-HTTP error translation (spec-04).

Infrastructure failures become a 503 with a static detail: the response
must never carry SQL, provider, or SDK text. The chained exception keeps
the real cause in the server-side traceback for operators.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.modules.persona_catalog.application.contracts import PromptCatalogUnavailable

_SAFE_DETAIL = "Prompt catalog unavailable"


def register_error_handlers(app: FastAPI) -> None:
    """Mount the typed-failure handlers on the composed app."""

    @app.exception_handler(PromptCatalogUnavailable)
    async def prompt_catalog_unavailable_handler(
        request: Request, exc: PromptCatalogUnavailable
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": _SAFE_DETAIL})
