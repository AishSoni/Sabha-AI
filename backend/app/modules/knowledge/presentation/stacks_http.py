from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timezone
import uuid

from app.presentation.dependencies import get_knowledge_db, get_knowledge_lifecycle
from app.modules.knowledge.presentation.stacks_schemas import (
    KnowledgeStack,
    KnowledgeStackCreate,
    KnowledgeStackUpdate,
    KnowledgeStackListResponse
)

router = APIRouter(prefix="/api/knowledge_stacks", tags=["knowledge_stacks"])

@router.get("", response_model=KnowledgeStackListResponse)
async def list_knowledge_stacks(
    user_id: Optional[str] = None, db=Depends(get_knowledge_db)
):
    """List all knowledge stacks, optionally filtered by user."""
    query = db.table("knowledge_stacks").select("*")
    
    if user_id:
        # Get user's stacks
        query = query.eq("user_id", user_id)
        
    result = query.order("created_at", desc=True).execute()
    stacks = [KnowledgeStack(**s) for s in result.data]
    
    return KnowledgeStackListResponse(stacks=stacks, total=len(stacks))


@router.post("", response_model=KnowledgeStack, status_code=201)
async def create_knowledge_stack(
    data: KnowledgeStackCreate, db=Depends(get_knowledge_db)
):
    """Create a new knowledge stack."""
    stack_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    stack_data = {
        "id": stack_id,
        "name": data.name,
        "description": data.description,
        "user_id": data.user_id,
        "created_at": now,
        "updated_at": now,
    }
    
    result = db.table("knowledge_stacks").insert(stack_data).execute()
    return KnowledgeStack(**result.data[0])


@router.get("/{stack_id}", response_model=KnowledgeStack)
async def get_knowledge_stack(
    stack_id: str, db=Depends(get_knowledge_db)
):
    """Get a specific knowledge stack."""
    result = db.table("knowledge_stacks").select("*").eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
        
    return KnowledgeStack(**result.data[0])


@router.put("/{stack_id}", response_model=KnowledgeStack)
async def update_knowledge_stack(
    stack_id: str, data: KnowledgeStackUpdate, db=Depends(get_knowledge_db)
):
    """Update a knowledge stack."""
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
        
    if not update_data:
        return await get_knowledge_stack(stack_id, db=db)
        
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = db.table("knowledge_stacks").update(update_data).eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
        
    return KnowledgeStack(**result.data[0])


@router.delete("/{stack_id}", status_code=204)
async def delete_knowledge_stack(
    stack_id: str,
    db=Depends(get_knowledge_db),
    lifecycle=Depends(get_knowledge_lifecycle),
):
    """Delete a stack after Knowledge revokes its documents and collection.

    Revocation and cleanup intents commit before the stack row cascades; a
    transient physical failure stays retryable but never restores access.
    """
    from app.modules.knowledge.domain.errors import KnowledgeUnavailable

    existing = (
        db.table("knowledge_stacks").select("id").eq("id", stack_id).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")

    try:
        await lifecycle.delete_parent("stack", stack_id, reason="stack_deleted")
    except KnowledgeUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail="Knowledge cleanup is temporarily unavailable; try again",
        ) from exc

    result = db.table("knowledge_stacks").delete().eq("id", stack_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
