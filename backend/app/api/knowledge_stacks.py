from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime
import logging
import uuid

from app.core.database import get_supabase
from app.models.knowledge_stacks_schemas import (
    KnowledgeStack,
    KnowledgeStackCreate,
    KnowledgeStackUpdate,
    KnowledgeStackListResponse
)

_log = logging.getLogger(__name__)

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
    """Delete a knowledge stack and its vector collection (pending-cleanup
    recorded first; a transient vector-store failure only defers the
    collection deletion to reconciliation, never blocks the SQL delete)."""
    from app.services.vector_cleanup import get_vector_cleanup_ledger
    from app.services.vector_store import VectorStoreManager, get_vector_store

    db = get_supabase()
    result = db.table("knowledge_stacks").delete().eq("id", stack_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")

    ledger = get_vector_cleanup_ledger()
    collection_name = VectorStoreManager.stack_collection_name(stack_id)
    pending_id = await ledger.record(
        collection_name=collection_name,
        target_kind="stack",
        target_id=stack_id,
    )
    try:
        await get_vector_store().delete_collection(collection_name)
        await ledger.resolve(pending_id)
    except Exception as exc:
        _log.warning(
            "Vector cleanup deferred for deleted stack %s (%s): %s",
            stack_id, collection_name, exc,
        )
        await ledger.set_last_error(pending_id, str(exc))
