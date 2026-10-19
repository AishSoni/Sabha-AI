"""Persona catalog HTTP presentation.

The activation route is the first production caller routed through the
module composition (spec-04): the dependency resolves the use case from
the container, and every response maps typed outcomes — refusals are
values here, not faults; persistence failures are translated centrally
in ``app.presentation.errors`` (503 without provider detail).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.modules.persona_catalog.application.contracts import (
    PromptCatalogUnavailable,
)
from app.modules.persona_catalog.application.use_cases import (
    ActivatePromptVersion,
)
from app.modules.persona_catalog.domain.activations import (
    PromptSelectionActivated,
    PromptSelectionRefused,
)
from app.presentation.dependencies import activate_prompt_version as build_use_case

router = APIRouter()


@router.post("/api/personas/{persona_id}/prompts/{version}/activate")
async def activate_prompt_version(
    persona_id: str,
    version: int,
    use_case: ActivatePromptVersion = Depends(build_use_case),
):
    try:
        outcome = await use_case.execute(persona_id, version)
    except PromptCatalogUnavailable:
        # The registered exception handler owns the safe 503 translation;
        # re-raising keeps a single translation site.
        raise

    if isinstance(outcome, PromptSelectionRefused):
        raise HTTPException(status_code=404, detail="Prompt version not found")

    assert isinstance(outcome, PromptSelectionActivated)
    return {"message": f"Version {outcome.version} activated"}
