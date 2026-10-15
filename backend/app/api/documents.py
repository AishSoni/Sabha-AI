"""
Documents API router.
Handles document upload, listing, deletion, and semantic search.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import Optional, List
import os
import uuid
from pathlib import Path

from app.core.database import get_supabase
from app.models.document_schemas import (
    Document,
    DocumentUploadResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchResult,
)
from app.modules.knowledge import ingestion as ingestion_service
from app.modules.knowledge import lifecycle as lifecycle_service
from app.modules.knowledge import policy as knowledge_policy
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import get_vector_store, VectorStoreManager


router = APIRouter(prefix="/api/documents", tags=["documents"])


# Supported file types
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx", "xls", "csv", "txt", "md"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
_READ_CHUNK = 1024 * 1024  # 1 MB streaming reads so oversize fails before buffering all

# Durable payload store: uploaded bytes land here so a restart can replay
# the persisted ingestion job. Single-host default; move to object storage
# for multi-instance deployments.
STORAGE_DIR = Path(os.environ.get("DOCUMENT_STORAGE_DIR", "storage/documents"))


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    """Stream the upload and fail once the size cap is exceeded."""
    parts: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {limit // (1024*1024)} MB",
            )
        parts.append(chunk)
    return b"".join(parts)


def _require_owner_row(db, table: str, row_id: str, label: str) -> None:
    try:
        result = db.table(table).select("id").eq("id", row_id).single().execute()
    except Exception:
        result = None
    if not result or not getattr(result, "data", None):
        raise HTTPException(status_code=404, detail=f"{label} not found")


async def _process_ingestion_job(document_id: str):
    """Background worker: replay the persisted job from durable bytes."""
    db = get_supabase()
    vector_store = get_vector_store()
    processor = DocumentProcessor()
    try:
        job_rows = (
            db.table("document_ingestion_jobs")
            .select("*")
            .eq("document_id", document_id)
            .execute()
        )
    except Exception:
        return
    if not job_rows.data:
        return
    job = job_rows.data[0]
    payload_path = STORAGE_DIR / document_id / "payload.bin"
    try:
        file_content = payload_path.read_bytes()
    except OSError:
        return
    try:
        await vector_store.ensure_collection(job.get("collection_name", ""))
    except Exception:
        pass
    await ingestion_service.process_ingestion_job(
        db,
        vector_store,
        processor,
        document_id=document_id,
        file_content=file_content,
        file_name=job.get("file_name", ""),
        file_type=job.get("file_type", ""),
    )


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    meeting_id: Optional[str] = Form(None),
    persona_id: Optional[str] = Form(None),
    stack_id: Optional[str] = Form(None),
):
    """
    Upload a document for indexing.
    
    Exactly one of meeting_id, persona_id, or stack_id must be provided.
    - meeting_id: Document is shared with all AI participants in the meeting
    - persona_id: Document is private to the persona's knowledge stack (legacy)
    - stack_id: Document is part of a curated knowledge stack
    """
    # Count how many are provided
    provided = sum([bool(meeting_id), bool(persona_id), bool(stack_id)])
    
    # Validate ownership
    if provided == 0:
        raise HTTPException(
            status_code=400,
            detail="Either meeting_id, persona_id, or stack_id must be provided"
        )
    if provided > 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot provide more than one of meeting_id, persona_id, or stack_id"
        )
    
    # Validate file type
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Stream the upload so oversize files fail before full buffering.
    file_content = await _read_limited(file, MAX_FILE_SIZE)
    file_size = len(file_content)

    db = get_supabase()

    # Verify ownership server-side; never trust caller-supplied IDs alone.
    if meeting_id:
        _require_owner_row(db, "meetings", meeting_id, "Meeting")
    elif persona_id:
        _require_owner_row(db, "personas", persona_id, "Persona")
    elif stack_id:
        _require_owner_row(db, "knowledge_stacks", stack_id, "Knowledge stack")

    # Determine collection name
    if meeting_id:
        collection_name = VectorStoreManager.meeting_collection_name(meeting_id)
    elif persona_id:
        collection_name = VectorStoreManager.persona_collection_name(persona_id)
    elif stack_id:
        collection_name = VectorStoreManager.stack_collection_name(stack_id)
    else:
        raise HTTPException(status_code=400, detail="Invalid target for document upload")
    
    # Create document record
    document_id = str(uuid.uuid4())
    storage_path = str(STORAGE_DIR / document_id / (file.filename or "upload.bin"))

    doc_data = {
        "id": document_id,
        "file_name": file.filename,
        "file_type": file_ext,
        "file_size_bytes": file_size,
        "qdrant_collection": collection_name,
        "status": "processing",
    }
    
    if meeting_id:
        doc_data["meeting_id"] = meeting_id
    elif persona_id:
        doc_data["persona_id"] = persona_id
    elif stack_id:
        doc_data["stack_id"] = stack_id
    
    db.table("documents").insert(doc_data).execute()

    # Persist payload bytes so the job survives API restarts, then enqueue
    # the replayable ingestion job and schedule the worker attempt.
    payload_path = STORAGE_DIR / document_id / "payload.bin"
    payload_path.parent.mkdir(parents=True, exist_ok=True)
    payload_path.write_bytes(file_content)

    await ingestion_service.enqueue_ingestion(
        db,
        document_id=document_id,
        collection=collection_name,
        file_name=file.filename,
        file_type=file_ext,
        storage_path=storage_path,
    )

    # Queue background processing (replays the persisted job from disk).
    background_tasks.add_task(_process_ingestion_job, document_id=document_id)
    
    return DocumentUploadResponse(
        id=document_id,
        file_name=file.filename,
        status="processing",
        chunk_count=0,
        message="Document uploaded and queued for processing",
    )


@router.get("/meeting/{meeting_id}", response_model=List[Document])
async def list_meeting_documents(meeting_id: str):
    """List all documents for a meeting."""
    db = get_supabase()
    
    result = db.table("documents")\
        .select("*")\
        .eq("meeting_id", meeting_id)\
        .order("created_at", desc=True)\
        .execute()
    
    return result.data


@router.get("/persona/{persona_id}", response_model=List[Document])
async def list_persona_documents(persona_id: str):
    """List all documents in a persona's knowledge stack."""
    db = get_supabase()
    
    result = db.table("documents")\
        .select("*")\
        .eq("persona_id", persona_id)\
        .order("created_at", desc=True)\
        .execute()
    
    return result.data


@router.get("/stack/{stack_id}", response_model=List[Document])
async def list_stack_documents(stack_id: str):
    """List all documents in a knowledge stack."""
    db = get_supabase()
    
    result = db.table("documents")\
        .select("*")\
        .eq("stack_id", stack_id)\
        .order("created_at", desc=True)\
        .execute()
    
    return result.data


@router.get("/{document_id}", response_model=Document)
async def get_document(document_id: str):
    """Get a single document by ID."""
    db = get_supabase()
    
    result = db.table("documents")\
        .select("*")\
        .eq("id", document_id)\
        .single()\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return result.data


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """
    Tombstone-first deletion: the row is excluded from retrieval before
    any vector work, cleanup is persisted to the outbox, and the record
    is hard-deleted only after vectors confirm removal.
    """
    from datetime import datetime, timezone

    db = get_supabase()
    vector_store = get_vector_store()

    # Get document info
    result = db.table("documents")\
        .select("*")\
        .eq("id", document_id)\
        .single()\
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = result.data
    collection = doc.get("qdrant_collection", "")

    # Immediate logical deletion: exclude from new retrieval first.
    db.table("documents").update({
        "status": "deleting",
        "cleanup_pending": True,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", document_id).execute()

    if collection:
        await lifecycle_service.enqueue_cleanup(db, document_id, collection)
        outcome = await lifecycle_service.run_cleanup_job(db, vector_store, document_id)
        if outcome.get("done"):
            db.table("documents").delete().eq("id", document_id).execute()
            return {"message": "Document deleted", "id": document_id}
        db.table("documents").update({"status": "deleted"}).eq("id", document_id).execute()
        return {"message": "Document tombstoned; vector cleanup pending", "id": document_id}

    db.table("documents").delete().eq("id", document_id).execute()
    return {"message": "Document deleted", "id": document_id}


@router.post("/jobs/replay-pending")
async def replay_pending_jobs(limit: int = 20):
    """Re-drive queued/processing ingestion jobs from durable payload bytes."""
    db = get_supabase()
    vector_store = get_vector_store()
    processor = DocumentProcessor()
    try:
        rows = db.table("document_ingestion_jobs").select("*").in_(
            "state", ["queued", "processing", "failed"]
        ).execute()
    except Exception:
        rows = None
    replayed = 0
    indexed = 0
    if rows and rows.data:
        for job in rows.data[: max(1, limit)]:
            document_id = job.get("document_id", "")
            payload_path = STORAGE_DIR / document_id / "payload.bin"
            try:
                file_content = payload_path.read_bytes()
            except OSError:
                continue
            replayed += 1
            try:
                await vector_store.ensure_collection(job.get("collection_name", ""))
            except Exception:
                pass
            outcome = await ingestion_service.process_ingestion_job(
                db, vector_store, processor,
                document_id=document_id,
                file_content=file_content,
                file_name=job.get("file_name", ""),
                file_type=job.get("file_type", ""),
            )
            if outcome.get("state") == "indexed":
                indexed += 1
    return {"replayed": replayed, "indexed": indexed}


@router.post("/cleanup/replay-pending")
async def replay_pending_cleanups(limit: int = 50):
    """Finish persisted vector cleanups, then hard-delete confirmed rows."""
    db = get_supabase()
    vector_store = get_vector_store()
    try:
        rows = db.table("vector_cleanup_outbox").select("*").eq(
            "done", False
        ).execute()
    except Exception:
        rows = None
    finished = 0
    if rows and rows.data:
        for job in rows.data[: max(1, limit)]:
            document_id = job.get("document_id", "")
            outcome = await lifecycle_service.run_cleanup_job(db, vector_store, document_id)
            if outcome.get("done"):
                db.table("documents").delete().eq("id", document_id).execute()
                finished += 1
    return {"finished": finished}


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(request: DocumentSearchRequest):
    """
    Semantic search across documents.
    
    Provide either meeting_id or persona_id to scope the search.
    """
    vector_store = get_vector_store()
    db = get_supabase()
    
    # Determine collection(s) to search
    collections_to_search = []
    
    if request.meeting_id:
        collections_to_search.append(
            VectorStoreManager.meeting_collection_name(request.meeting_id)
        )
    
    if request.persona_id:
        collections_to_search.append(
            VectorStoreManager.persona_collection_name(request.persona_id)
        )
        
    stack_ids = getattr(request, 'stack_ids', []) or []
    for stack_id in stack_ids:
        _require_owner_row(db, "knowledge_stacks", stack_id, "Knowledge stack")
        collections_to_search.append(VectorStoreManager.stack_collection_name(stack_id))
    
    if not collections_to_search:
        raise HTTPException(
            status_code=400,
            detail="At least one of meeting_id, persona_id, or stack_ids must be provided for search"
        )
    
    # Perform search
    results = await vector_store.search_multiple_collections(
        collection_names=collections_to_search,
        query=request.query,
        limit=request.limit,
    )
    
    # Enrich with document info; drop orphans and tombstoned rows rather
    # than labeling them as valid "Unknown" sources.
    document_ids = list({r.document_id for r in results if r.document_id})
    doc_info = {}

    if document_ids:
        docs = db.table("documents")\
            .select("id, file_name, status")\
            .in_("id", document_ids)\
            .execute()
        doc_info = {
            d["id"]: d for d in docs.data
            if d.get("status") not in ("deleted", "deleting", "failed")
        }

    filtered = [
        DocumentSearchResult(
            text=r.text,
            score=r.score,
            document_id=r.document_id,
            file_name=doc_info[r.document_id]["file_name"],
            chunk_index=r.chunk_index,
        )
        for r in results
        if r.document_id in doc_info
    ]

    return DocumentSearchResponse(
        query=request.query,
        results=filtered,
        total_results=len(filtered),
    )
