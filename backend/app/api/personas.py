"""
API routes for AI Persona CRUD and prompt versioning.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.models import (
    PersonaCreate,
    PersonaUpdate,
    PersonaWithPrompt,
    PromptVersionCreate,
    PromptVersion,
    PersonaListResponse,
)
from app.modules.access.actors import Actor
from app.modules.access.deps import persona_visible_or_404 as _visible_or_404
from app.modules.access.deps import require_actor
from app.services.persona_manager import PersonaManager

router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("", response_model=PersonaListResponse)
async def list_personas(
    include_defaults: bool = True,
    actor: Actor = Depends(require_actor),
):
    """List the caller's own personas, plus shared defaults on request."""
    manager = PersonaManager()
    personas = await manager.list_personas(actor.identity, include_defaults)
    return PersonaListResponse(personas=personas, total=len(personas))


@router.post("", response_model=PersonaWithPrompt, status_code=201)
async def create_persona(data: PersonaCreate, actor: Actor = Depends(require_actor)):
    """Create a new persona owned by the caller."""
    manager = PersonaManager()
    owned = data.model_copy(update={"user_id": actor.identity})
    return await manager.create_persona(owned)


@router.get("/{persona_id}", response_model=PersonaWithPrompt)
async def get_persona(persona_id: str, actor: Actor = Depends(require_actor)):
    """Get a persona with its active prompt."""
    manager = PersonaManager()
    persona = await manager.get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, persona)
    return persona


@router.put("/{persona_id}", response_model=PersonaWithPrompt)
async def update_persona(
    persona_id: str, data: PersonaUpdate, actor: Actor = Depends(require_actor)
):
    """Update persona metadata (not prompt)."""
    manager = PersonaManager()
    existing = await manager.get_persona(persona_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, existing)
    persona = await manager.update_persona(persona_id, data)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona


@router.delete("/{persona_id}", status_code=204)
async def delete_persona(persona_id: str, actor: Actor = Depends(require_actor)):
    """Delete a persona and all its prompt versions."""
    manager = PersonaManager()
    existing = await manager.get_persona(persona_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, existing)
    success = await manager.delete_persona(persona_id)
    if not success:
        raise HTTPException(status_code=404, detail="Persona not found")


# ============== Prompt Version Routes ==============

@router.get("/{persona_id}/prompts", response_model=list[PromptVersion])
async def list_prompt_versions(persona_id: str, actor: Actor = Depends(require_actor)):
    """List all prompt versions for a persona."""
    manager = PersonaManager()
    persona = await manager.get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, persona)
    return await manager.list_prompt_versions(persona_id)


@router.post("/{persona_id}/prompts", response_model=PromptVersion, status_code=201)
async def create_prompt_version(
    persona_id: str, data: PromptVersionCreate, actor: Actor = Depends(require_actor)
):
    """Create a new prompt version (automatically becomes active)."""
    manager = PersonaManager()

    # Verify persona exists
    persona = await manager.get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, persona)

    return await manager.create_prompt_version(persona_id, data)


@router.post("/{persona_id}/prompts/{version}/activate", status_code=200)
async def activate_prompt_version(
    persona_id: str, version: int, actor: Actor = Depends(require_actor)
):
    """Activate a specific prompt version."""
    manager = PersonaManager()
    persona = await manager.get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    _visible_or_404(actor, persona)
    success = await manager.activate_prompt_version(persona_id, version)
    if not success:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    return {"message": f"Version {version} activated"}
