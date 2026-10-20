"""Persona catalog HTTP presentation.

The activation route was the first production caller routed through the
module composition (spec-04). Spec-06 adds the template CRUD surface on
the same posture: dependencies resolve use cases from the container's
injected ``persona_catalog`` port, response bodies are module views and
every failure maps to a typed HTTP outcome — 404 unknown template,
422 unknown stacks / validation, 409 lost edit race and 503 for
infrastructure failures through the central safe handler.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.modules.persona_catalog.application.commands import UpdateTemplateCommand
from app.modules.persona_catalog.application.contracts import (
    PersonaEditConflict,
    PromptCatalogUnavailable,
    TemplateNotFound,
    UnknownStacks,
)
from app.modules.persona_catalog.application.use_cases import (
    ActivatePromptVersion,
    CreatePromptVersion,
    CreateTemplate,
    DeleteTemplate,
    ListPromptVersions,
    ListTemplates,
    ReadTemplate,
    UpdateTemplate,
)
from app.modules.persona_catalog.domain.activations import (
    PromptSelectionActivated,
    PromptSelectionRefused,
)
from app.modules.persona_catalog.domain.models import CreationSnapshot
from app.modules.persona_catalog.domain.services import TemplateValidationFailed
from app.modules.persona_catalog.presentation.schemas import (
    PromptRevisionInput,
    TemplateCreate,
    TemplateUpdate,
    create_request_to_command,
    prompt_version_view,
    template_view,
    update_request_to_fields,
)
from app.presentation.dependencies import (
    activate_prompt_version,
    create_prompt_revision,
    create_template,
    delete_template,
    list_prompt_versions,
    list_templates,
    read_template,
    update_template,
)

router = APIRouter()


_HTTP_404_DETAIL = "Persona not found"


def _refusals(handler):
    """Wrap a use-case call so typed refusals map to HTTP outcomes.

    ``PromptCatalogUnavailable`` re-raises deliberately: the registered
    central handler owns the safe 503 translation (one site).
    """

    async def wrapped(*args, **kwargs):
        try:
            return await handler(*args, **kwargs)
        except PromptCatalogUnavailable:
            raise
        except UnknownStacks as exc:
            unknown = ", ".join(exc.unknown)
            raise HTTPException(
                status_code=422,
                detail=f"Unknown knowledge stacks: {unknown}",
            ) from exc
        except TemplateValidationFailed as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except PersonaEditConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except TemplateNotFound as exc:
            raise HTTPException(status_code=404, detail=_HTTP_404_DETAIL) from exc

    return wrapped


@router.get("/api/personas")
async def list_personas(
    user_id: Optional[str] = None,
    include_defaults: bool = True,
    templates: ListTemplates = Depends(list_templates),
):
    rows = await _refusals(templates.execute)(user_id, include_defaults)
    views = [template_view(row) for row in rows]
    return {"personas": views, "total": len(views)}


@router.post("/api/personas", status_code=201)
async def create_persona(
    payload: TemplateCreate,
    creator: CreateTemplate = Depends(create_template),
):
    command = create_request_to_command(payload)
    row = await _refusals(creator.execute)(command)
    return template_view(row)


@router.get("/api/personas/{persona_id}")
async def get_persona(
    persona_id: str,
    reader: ReadTemplate = Depends(read_template),
):
    row = await _refusals(reader.execute)(persona_id)
    if row is None:
        raise HTTPException(status_code=404, detail=_HTTP_404_DETAIL)
    snapshot = CreationSnapshot.from_rpc_row(row)
    return template_view(snapshot.as_row())


@router.put("/api/personas/{persona_id}")
async def update_persona(
    persona_id: str,
    payload: TemplateUpdate,
    updater: UpdateTemplate = Depends(update_template),
):
    fields = update_request_to_fields(payload)
    command = UpdateTemplateCommand(**fields)
    row = await _refusals(updater.execute)(persona_id, command)
    return template_view(row)


@router.delete("/api/personas/{persona_id}", status_code=204)
async def delete_persona(
    persona_id: str,
    deleter: DeleteTemplate = Depends(delete_template),
):
    deleted = await _refusals(deleter.execute)(persona_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_HTTP_404_DETAIL)


@router.get("/api/personas/{persona_id}/prompts")
async def list_prompt_version_rows(
    persona_id: str,
    history: ListPromptVersions = Depends(list_prompt_versions),
):
    rows = await _refusals(history.execute)(persona_id)
    return [prompt_version_view(row) for row in rows]


@router.post("/api/personas/{persona_id}/prompts", status_code=201)
async def post_prompt_revision(
    persona_id: str,
    payload: PromptRevisionInput,
    creator: CreatePromptVersion = Depends(create_prompt_revision),
):
    row = await _refusals(creator.execute)(persona_id, payload.content)
    return prompt_version_view(row)


@router.post("/api/personas/{persona_id}/prompts/{version}/activate")
async def activate_prompt_version_route(
    persona_id: str,
    version: int,
    use_case: ActivatePromptVersion = Depends(activate_prompt_version),
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
