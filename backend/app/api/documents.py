"""
Documents API router.
Handles document upload, listing, deletion, and semantic search.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from typing import Optional, List
import asyncio
import logging
import threading
import uuid
from weakref import WeakKeyDictionary

from app.platform.database import get_supabase
from app.models.document_schemas import (
    Document,
    DocumentUploadResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchResult,
)
from app.services.document_processor import DocumentProcessor
from app.services.ingestion import DocumentDeletedError, get_ingestion_registry
from app.services.vector_store import get_vector_store, VectorStoreManager


router = APIRouter(prefix="/api/documents", tags=["documents"])

logger = logging.getLogger(__name__)


# Supported file types
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx", "csv", "txt", "md"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Uploads are streamed in bounded chunks instead of being materialized in one
# `read()` call, so an oversized body is rejected without ever being fully
# read into memory (spec-02 E1).
UPLOAD_CHUNK_SIZE = 1024 * 1024

# The declared Content-Length of a multipart request covers the whole body
# (boundaries + form fields), not just the file bytes. The declared-size
# precheck therefore allows a bounded overhead on top of the file limit;
# the bounded read remains the authoritative guard.
MULTIPART_OVERHEAD_ALLOWANCE = 1024 * 1024


class UploadTooLargeError(ValueError):
    """Raised when an upload exceeds the configured byte budget."""


def parse_declared_size(value: Optional[str]) -> Optional[int]:
    """Best-effort parse of a declared Content-Length header.

    A missing or malformed header returns None — unknown sizes fall through
    to the bounded read, which remains the real guard.
    """
    if not value:
        return None
    value = value.strip()
    if not value.isdigit():
        return None
    return int(value)


async def read_bounded(upload_file: UploadFile, limit: int) -> bytes:
    """Read at most `limit` bytes from an upload.

    The read aborts (and closes the stream) as soon as the budget is
    exceeded, so oversized bodies are never fully materialized.
    """
    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await upload_file.read(UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            await upload_file.close()
            raise UploadTooLargeError(
                f"File exceeds the {limit // (1024 * 1024)} MB upload limit."
            )
        chunks.append(chunk)
    return b"".join(chunks)


# Heavy parsing (pypdf/python-docx/openpyxl materialize everything) and the
# sync status writes of the ingestion path run on a small worker pool so one
# hostile file cannot freeze the API event loop (spec-02 E2). asyncio
# primitives are loop-bound: tests drive ingestion from dedicated loop
# threads, so the semaphore is created per running loop.
_INGESTION_WORKERS = 2
_semaphore_by_loop: "WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = WeakKeyDictionary()
_semaphore_lock = threading.Lock()


def ingestion_semaphore() -> asyncio.Semaphore:
    """Return (creating on first use) this loop's ingestion semaphore."""
    loop = asyncio.get_running_loop()
    with _semaphore_lock:
        sem = _semaphore_by_loop.get(loop)
        if sem is None:
            sem = asyncio.Semaphore(_INGESTION_WORKERS)
            _semaphore_by_loop[loop] = sem
        return sem


async def _off_loop(fn, /, *args, **kwargs):
    """Run a synchronous helper on the bounded ingestion pool."""
    async with ingestion_semaphore():
        return await asyncio.to_thread(fn, *args, **kwargs)


async def _process_and_index_document(
    document_id: str,
    ticket,
    file_content: bytes,
    file_name: str,
    file_type: str,
    collection_name: str,
):
    """Background task to process and index a document.

    Fenced against racing deletes (spec-02 B1):
    - tombstone before the pre-publish fence: nothing is ever upserted;
    - tombstone after points went live: the post-publish fence compensates
      by deleting the freshly published points immediately.

    Parsing and this path's sync DB writes run on a bounded worker pool via
    `_off_loop` so a huge file never starves the event loop (spec-02 E2).
    """
    db = get_supabase()
    vector_store = get_vector_store()
    processor = DocumentProcessor()

    try:
        # Fence 0: the document was deleted before this task even started.
        if ticket.deleted:
            raise DocumentDeletedError(
                f"Document {document_id} was deleted during ingestion"
            )

        # Process the file into chunks (off the event loop: parsing
        # materializes everything, so it runs on the bounded worker pool).
        chunks = await _off_loop(
            processor.process_file,
            file_content=file_content,
            file_name=file_name,
            file_type=file_type,
            additional_metadata={"document_id": document_id},
        )

        if not chunks:
            raise ValueError("No text content extracted from document")

        # Fence 1: do not publish costs/points for a tombstoned document.
        await ticket.await_publishable()

        # Index chunks in Qdrant
        chunk_count = await vector_store.index_document(
            collection_name=collection_name,
            document_id=document_id,
            chunks=chunks,
        )

        # Fence 2: a delete that landed between fence 1 and here removes the
        # upserted points immediately (compensation), so no orphan survives.
        if ticket.deleted:
            await vector_store.delete_document(
                collection_name=collection_name,
                document_id=document_id,
            )
            raise DocumentDeletedError(
                f"Document {document_id} was deleted during ingestion"
            )

        # Update document status to indexed (sync DB call → worker pool)
        def _mark_indexed():
            db.table("documents").update({
                "status": "indexed",
                "chunk_count": chunk_count,
            }).eq("id", document_id).execute()

        await _off_loop(_mark_indexed)

    except DocumentDeletedError as e:
        # The delete route owns the document lifecycle from the tombstone on;
        # no status flip of ours can resurrect what it is deleting.
        logger.info("Ingestion fenced for deleted document %s: %s", document_id, e)

    except Exception as e:
        # Update document status to failed (sync DB call → worker pool)
        logger.warning("Ingestion failed for document %s: %s", document_id, e)

        def _mark_failed():
            db.table("documents").update({
                "status": "failed",
                "error_message": str(e),
            }).eq("id", document_id).execute()

        await _off_loop(_mark_failed)


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    request: Request,
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
    
    # Cheap declared-size precheck: reject a grossly oversized body before
    # reading anything (allowing multipart overhead for boundaries and form
    # fields). A missing or lying Content-Length falls through to the
    # bounded read below, which remains the real guard.
    declared_size = parse_declared_size(request.headers.get("content-length"))
    if declared_size is not None and declared_size > MAX_FILE_SIZE + MULTIPART_OVERHEAD_ALLOWANCE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB",
        )

    # Read the body under the byte budget; an oversized upload is rejected
    # before any documents row is created.
    try:
        file_content = await read_bounded(file, MAX_FILE_SIZE)
    except UploadTooLargeError as error:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB",
        ) from error
    file_size = len(file_content)
    
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
    elif persona_id:
        doc_data["persona_id"] = persona_id
    elif stack_id:
        doc_data["stack_id"] = stack_id
    
    db.table("documents").insert(doc_data).execute()

    # Register the in-flight ingestion (delete routes fence against it).
    registry = get_ingestion_registry()
    ticket = registry.create_ticket(document_id)

    # Queue background processing
    background_tasks.add_task(
        _process_and_index_document,
        document_id=document_id,
        ticket=ticket,
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

    # Tombstone FIRST (spec-02 B1): any in-flight ingestion of this document
    # must be fenced before we delete vectors or the record row.
    get_ingestion_registry().mark_tombstone(document_id)

    # Delete vectors from Qdrant. Fail closed (spec-02 B2): if the vector
    # cleanup cannot run, keep the record row so the user can retry — a
    # deleted row with still-indexed points would be permanently orphaned.
    if doc.get("qdrant_collection"):
        try:
            await vector_store.delete_document(
                collection_name=doc["qdrant_collection"],
                document_id=document_id,
            )
        except Exception as exc:
            logger.warning(
                "Vector cleanup failed for document %s: %s", document_id, exc
            )
            raise HTTPException(
                status_code=503,
                detail=(
                    "Vector cleanup failed; the document was not deleted. "
                    "Try again shortly."
                ),
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
        
    stack_ids = request.stack_ids or []
    for stack_id in stack_ids:
        collections_to_search.append(VectorStoreManager.stack_collection_name(stack_id))

    if not (request.meeting_id or request.persona_id or stack_ids):
        raise HTTPException(
            status_code=400,
            detail="A search scope is required"
        )
    
    # Perform search
    results = await vector_store.search_multiple_collections(
        collection_names=collections_to_search,
        query=request.query,
        limit=request.limit,
    )
    
    # Enrich with document info, then DROP points whose document row is gone
    # (spec-02 B2): a destroyed document (or stale injected point) must not
    # come back as a `file_name="Unknown"` hit.
    document_ids = list(set(r.document_id for r in results))
    doc_info = {}

    if document_ids:
        docs = db.table("documents")\
            .select("id, file_name")\
            .in_("id", document_ids)\
            .execute()
        doc_info = {d["id"]: d["file_name"] for d in docs.data}

    kept_results = [r for r in results if r.document_id in doc_info]

    return DocumentSearchResponse(
        query=request.query,
        results=[
            DocumentSearchResult(
                text=r.text,
                score=r.score,
                document_id=r.document_id,
                file_name=doc_info[r.document_id],
                chunk_index=r.chunk_index,
            )
            for r in kept_results
        ],
        total_results=len(kept_results),
    )
