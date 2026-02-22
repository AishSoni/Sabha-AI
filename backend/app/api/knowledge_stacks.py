from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime
import uuid

from app.core.database import get_supabase
from app.models.knowledge_stacks_schemas import (
    KnowledgeStack,
    KnowledgeStackCreate,
    KnowledgeStackUpdate,
    KnowledgeStackListResponse
)

router = APIRouter(prefix="/api/knowledge_stacks", tags=["knowledge_stacks"])

@router.get("", response_model=KnowledgeStackListResponse)
async def list_knowledge_stacks(user_id: Optional[str] = None):
    """List all knowledge stacks, optionally filtered by user."""
    db = get_supabase()
    query = db.table("knowledge_stacks").select("*")
    
    if user_id:
        # Get user's stacks
        query = query.eq("user_id", user_id)
        
    result = query.order("created_at", desc=True).execute()
    stacks = [KnowledgeStack(**s) for s in result.data]
    
    return KnowledgeStackListResponse(stacks=stacks, total=len(stacks))


@router.post("", response_model=KnowledgeStack, status_code=201)
async def create_knowledge_stack(data: KnowledgeStackCreate):
    """Create a new knowledge stack."""
    db = get_supabase()
    stack_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
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
async def get_knowledge_stack(stack_id: str):
    """Get a specific knowledge stack."""
    db = get_supabase()
    result = db.table("knowledge_stacks").select("*").eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
        
    return KnowledgeStack(**result.data[0])


@router.put("/{stack_id}", response_model=KnowledgeStack)
async def update_knowledge_stack(stack_id: str, data: KnowledgeStackUpdate):
    """Update a knowledge stack."""
    db = get_supabase()
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
        
    if not update_data:
        return await get_knowledge_stack(stack_id)
        
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    result = db.table("knowledge_stacks").update(update_data).eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
        
    return KnowledgeStack(**result.data[0])


@router.delete("/{stack_id}", status_code=204)
async def delete_knowledge_stack(stack_id: str):
    """Delete a knowledge stack."""
    db = get_supabase()
    result = db.table("knowledge_stacks").delete().eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
