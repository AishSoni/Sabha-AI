"""
Documents API router.
Handles document upload, listing, deletion, and semantic search.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import Optional, List
import uuid

from app.core.database import get_supabase
from app.models.document_schemas import (
    Document,
    DocumentUploadResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchResult,
)
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import get_vector_store, VectorStoreManager


router = APIRouter(prefix="/api/documents", tags=["documents"])


# Supported file types
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx", "xls", "csv", "txt", "md"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def _process_and_index_document(
    document_id: str,
    file_content: bytes,
    file_name: str,
    file_type: str,
    collection_name: str,
):
    """Background task to process and index a document."""
    db = get_supabase()
    vector_store = get_vector_store()
    processor = DocumentProcessor()
    
    try:
        # Process the file into chunks
        chunks = processor.process_file(
            file_content=file_content,
            file_name=file_name,
            file_type=file_type,
            additional_metadata={"document_id": document_id},
        )
        
        if not chunks:
            raise ValueError("No text content extracted from document")
        
        # Index chunks in Qdrant
        chunk_count = await vector_store.index_document(
            collection_name=collection_name,
            document_id=document_id,
            chunks=chunks,
        )
        
        # Update document status to indexed
        db.table("documents").update({
            "status": "indexed",
            "chunk_count": chunk_count,
        }).eq("id", document_id).execute()
        
    except Exception as e:
        # Update document status to failed
        db.table("documents").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", document_id).execute()


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    meeting_id: Optional[str] = Form(None),
    persona_id: Optional[str] = Form(None),
):
    """
    Upload a document for indexing.
    
    Either meeting_id OR persona_id must be provided (but not both).
    - meeting_id: Document is shared with all AI participants in the meeting
    - persona_id: Document is private to the persona's knowledge stack
    """
    # Validate ownership
    if not meeting_id and not persona_id:
        raise HTTPException(
            status_code=400,
            detail="Either meeting_id or persona_id must be provided"
        )
    if meeting_id and persona_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot provide both meeting_id and persona_id"
        )
    
    # Validate file type
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Validate file size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB"
        )
    
    # Determine collection name
    if meeting_id:
        collection_name = VectorStoreManager.meeting_collection_name(meeting_id)
    else:
        collection_name = VectorStoreManager.persona_collection_name(persona_id)
    
    # Create document record
    document_id = str(uuid.uuid4())
    db = get_supabase()
    
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
    else:
        doc_data["persona_id"] = persona_id
    
    db.table("documents").insert(doc_data).execute()
    
    # Queue background processing
    background_tasks.add_task(
        _process_and_index_document,
        document_id=document_id,
        file_content=file_content,
        file_name=file.filename,
        file_type=file_ext,
        collection_name=collection_name,
    )
    
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
    Delete a document and its indexed vectors.
    """
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
    
    # Delete vectors from Qdrant
    if doc.get("qdrant_collection"):
        await vector_store.delete_document(
            collection_name=doc["qdrant_collection"],
            document_id=document_id,
        )
    
    # Delete document record
    db.table("documents").delete().eq("id", document_id).execute()
    
    return {"message": "Document deleted", "id": document_id}


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
    
    if not collections_to_search:
        raise HTTPException(
            status_code=400,
            detail="Either meeting_id or persona_id must be provided for search"
        )
    
    # Perform search
    results = await vector_store.search_multiple_collections(
        collection_names=collections_to_search,
        query=request.query,
        limit=request.limit,
    )
    
    # Enrich with document info
    document_ids = list(set(r.document_id for r in results))
    doc_info = {}
    
    if document_ids:
        docs = db.table("documents")\
            .select("id, file_name")\
            .in_("id", document_ids)\
            .execute()
        doc_info = {d["id"]: d["file_name"] for d in docs.data}
    
    return DocumentSearchResponse(
        query=request.query,
        results=[
            DocumentSearchResult(
                text=r.text,
                score=r.score,
                document_id=r.document_id,
                file_name=doc_info.get(r.document_id, "Unknown"),
                chunk_index=r.chunk_index,
            )
            for r in results
        ],
        total_results=len(results),
    )
