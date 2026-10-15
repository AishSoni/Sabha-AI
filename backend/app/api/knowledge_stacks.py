from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import uuid

from app.core.database import get_supabase
from app.models.knowledge_stacks_schemas import (
    KnowledgeStack,
    KnowledgeStackCreate,
    KnowledgeStackUpdate,
    KnowledgeStackListResponse
)
from app.modules.access.actors import Actor
from app.modules.access.deps import require_actor

router = APIRouter(prefix="/api/knowledge_stacks", tags=["knowledge_stacks"])


def _owned_or_404(actor: Actor, row: dict) -> dict:
    """Cross-owner and ownerless stacks read as not-found."""
    if not row.get("user_id") or row["user_id"] != actor.identity:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
    return row


@router.get("", response_model=KnowledgeStackListResponse)
async def list_knowledge_stacks(actor: Actor = Depends(require_actor)):
    """List the caller's own knowledge stacks."""
    db = get_supabase()
    query = db.table("knowledge_stacks").select("*")

    query = query.eq("user_id", actor.identity)

    result = query.order("created_at", desc=True).execute()
    stacks = [KnowledgeStack(**s) for s in result.data]

    return KnowledgeStackListResponse(stacks=stacks, total=len(stacks))


@router.post("", response_model=KnowledgeStack, status_code=201)
async def create_knowledge_stack(
    data: KnowledgeStackCreate, actor: Actor = Depends(require_actor)
):
    """Create a new knowledge stack owned by the caller."""
    db = get_supabase()
    stack_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    stack_data = {
        "id": stack_id,
        "name": data.name,
        "description": data.description,
        "user_id": actor.identity,
        "created_at": now,
        "updated_at": now,
    }

    result = db.table("knowledge_stacks").insert(stack_data).execute()
    return KnowledgeStack(**result.data[0])


@router.get("/{stack_id}", response_model=KnowledgeStack)
async def get_knowledge_stack(stack_id: str, actor: Actor = Depends(require_actor)):
    """Get a specific knowledge stack."""
    db = get_supabase()
    result = db.table("knowledge_stacks").select("*").eq("id", stack_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")

    return KnowledgeStack(**_owned_or_404(actor, result.data[0]))


@router.put("/{stack_id}", response_model=KnowledgeStack)
async def update_knowledge_stack(
    stack_id: str, data: KnowledgeStackUpdate, actor: Actor = Depends(require_actor)
):
    """Update a knowledge stack."""
    db = get_supabase()

    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description

    if not update_data:
        return await get_knowledge_stack(stack_id, actor)

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = db.table("knowledge_stacks").update(update_data).eq("id", stack_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")

    return KnowledgeStack(**_owned_or_404(actor, result.data[0]))


@router.delete("/{stack_id}", status_code=204)
async def delete_knowledge_stack(stack_id: str, actor: Actor = Depends(require_actor)):
    """Delete a knowledge stack after tombstoning its documents."""
    from datetime import timezone
    from app.modules.knowledge import lifecycle as lifecycle_service
    from app.services.vector_store import VectorStoreManager, get_vector_store

    db = get_supabase()
    existing = db.table("knowledge_stacks").select("*").eq("id", stack_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
    _owned_or_404(actor, existing.data[0])
    try:
        docs = db.table("documents")\
            .select("id, qdrant_collection")\
            .eq("stack_id", stack_id)\
            .execute()
        if docs.data:
            vectors = get_vector_store()
            now = datetime.now(timezone.utc).isoformat()
            for doc in docs.data:
                document_id = doc.get("id", "")
                collection = doc.get("qdrant_collection", "")
                db.table("documents").update({
                    "status": "deleting",
                    "cleanup_pending": True,
                    "deleted_at": now,
                }).eq("id", document_id).execute()
                if collection:
                    await lifecycle_service.enqueue_cleanup(db, document_id, collection)
                    await lifecycle_service.run_cleanup_job(db, vectors, document_id)
        # Drop the stack collection even with zero document rows so empty
        # stacks leave no orphan points behind.
        try:
            from app.services.vector_store import get_vector_store as _get_vs
            await _get_vs().delete_collection(
                VectorStoreManager.stack_collection_name(stack_id)
            )
        except Exception:
            pass
    except Exception:
        pass
    result = db.table("knowledge_stacks").delete().eq("id", stack_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge stack not found")
