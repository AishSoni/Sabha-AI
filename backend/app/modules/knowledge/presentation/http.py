"""Knowledge HTTP surface: document upload, observation, search, deletion."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import JSONResponse

from app.modules.knowledge.application.ingestion import (
    PendingReceipt,
    ReadyReceipt,
    UploadRequest,
)
from app.modules.knowledge.application.retrieval import (
    KnowledgeScope,
    RetrievalIdentity,
    RetrievalRequest,
)
from app.modules.knowledge.domain.errors import (
    DocumentNotFound,
    KnowledgeError,
    KnowledgeUnavailable,
    ProjectionUnavailable,
    SourceTooLarge,
    UnsupportedFileType,
    UploadRejected,
)
from app.modules.knowledge.domain.models import KnowledgeOwner
from app.modules.knowledge.domain.services import (
    ALLOWED_EXTENSIONS,
    MAX_SOURCE_BYTES,
)
from app.presentation.dependencies import get_knowledge_lifecycle
from app.modules.knowledge.presentation.schemas import (
    DocumentResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchResult,
    IngestionStatusResponse,
    UploadReceiptResponse,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = MAX_SOURCE_BYTES
UPLOAD_CHUNK_SIZE = 1024 * 1024
MULTIPART_OVERHEAD_ALLOWANCE = 1024 * 1024


class UploadTooLargeError(ValueError):
    """Raised when an upload exceeds the configured byte budget."""


def parse_declared_size(value: Optional[str]) -> Optional[int]:
    """Best-effort parse of a declared Content-Length header."""

    if not value:
        return None
    value = value.strip()
    if not value.isdigit():
        return None
    return int(value)


async def read_bounded(upload_file: UploadFile, limit: int) -> bytes:
    """Read at most ``limit`` bytes, aborting as soon as the budget is crossed."""

    chunks: list[bytes] = []
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


def _owner(meeting_id, persona_id, stack_id) -> KnowledgeOwner:
    provided = [value for value in (meeting_id, persona_id, stack_id) if value]
    if not provided:
        raise HTTPException(
            status_code=400,
            detail="Either meeting_id, persona_id, or stack_id must be provided",
        )
    if len(provided) > 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot provide more than one of meeting_id, persona_id, or stack_id",
        )
    if meeting_id:
        kind, raw = "meeting", meeting_id
    elif persona_id:
        kind, raw = "persona", persona_id
    else:
        kind, raw = "stack", stack_id
    try:
        return KnowledgeOwner(kind=kind, id=UUID(str(raw)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid {kind}_id"
        ) from exc


def _as_uuid(value: UUID | str, *, label: str) -> UUID:
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc


def _document_payload(
    record,
    *,
    meeting_id: UUID | None = None,
    persona_id: UUID | None = None,
    stack_id: UUID | None = None,
) -> dict:
    return {
        "id": record.document_id,
        "file_name": record.file_name,
        "file_type": record.file_type,
        "file_size_bytes": record.file_size_bytes,
        "chunk_count": record.chunk_count,
        "qdrant_collection": record.qdrant_collection,
        "status": record.status,
        "error_message": record.error_message,
        "created_at": record.created_at,
        "meeting_id": meeting_id,
        "persona_id": persona_id,
        "stack_id": stack_id,
        "revision_id": record.revision_id,
        "revision_state": (
            record.revision_state.value if record.revision_state else None
        ),
        "operation_id": record.operation_id,
    }


def _unavailable(exc: Exception) -> HTTPException:
    logger.warning("knowledge request failed: %s", exc)
    return HTTPException(
        status_code=503,
        detail="Knowledge storage is temporarily unavailable; try again",
    )


@router.post("/upload", response_model=UploadReceiptResponse)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    meeting_id: Optional[str] = Form(None),
    persona_id: Optional[str] = Form(None),
    stack_id: Optional[str] = Form(None),
    lifecycle=Depends(get_knowledge_lifecycle),
):
    """Persist original bytes and admit a durable ingestion.

    A ``pending`` receipt means accepted, not ready. The caller observes
    ``operationId`` until the ingestion reports an authoritative ready state.
    """
    owner = _owner(meeting_id, persona_id, stack_id)
    file_name = file.filename or ""
    suffix = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File type '{suffix}' not supported. Allowed: "
                f"{', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    declared_size = parse_declared_size(request.headers.get("content-length"))
    if (
        declared_size is not None
        and declared_size > MAX_FILE_SIZE + MULTIPART_OVERHEAD_ALLOWANCE
    ):
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    upload_request = UploadRequest(
        file_name=file_name,
        size_bytes=file.size if file.size is not None else MAX_FILE_SIZE,
        stream=file.file,
        owner=owner,
        content_type=file.content_type or "application/octet-stream",
    )
    try:
        receipt = await lifecycle.upload(upload_request)
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    except SourceTooLarge as exc:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
        ) from exc
    except UploadRejected as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (UnsupportedFileType, KnowledgeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if isinstance(receipt, PendingReceipt):
        background_tasks.add_task(
            lifecycle.process_ingestion, receipt.operation_id
        )
        payload = UploadReceiptResponse(
            state="pending",
            documentId=receipt.document_id,
            operationId=receipt.operation_id,
            id=receipt.document_id,
            file_name=file_name,
            status="processing",
            chunk_count=0,
            message="Upload accepted; processing is still pending",
        )
        return JSONResponse(
            status_code=202, content=payload.model_dump(mode="json", by_alias=True)
        )

    assert isinstance(receipt, ReadyReceipt)
    payload = UploadReceiptResponse(
        state="ready",
        documentId=receipt.document_id,
        revisionId=receipt.revision_id,
        id=receipt.document_id,
        file_name=file_name,
        status="ready",
        chunk_count=0,
        message="Document is ready for retrieval",
    )
    return JSONResponse(
        status_code=200, content=payload.model_dump(mode="json", by_alias=True)
    )


@router.get(
    "/operations/{operation_id}", response_model=IngestionStatusResponse
)
async def get_ingestion_status(
    operation_id: UUID,
    lifecycle=Depends(get_knowledge_lifecycle),
):
    """Observe durable progress for an accepted upload."""
    try:
        status = await lifecycle.ingestion_status(operation_id)
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    if status is None:
        raise HTTPException(status_code=404, detail="Upload operation not found")
    return IngestionStatusResponse(
        operationId=status.operation_id,
        documentId=status.document_id,
        revisionId=status.revision_id,
        state=status.state.value,
        revisionState=status.revision_state.value,
        documentStatus=status.document_status,
        fileName=status.file_name,
        fileType=status.file_type,
        chunkCount=status.chunk_count,
        errorMessage=status.error_message,
    )


@router.post(
    "/operations/{operation_id}/retry", response_model=UploadReceiptResponse
)
async def retry_ingestion(
    operation_id: UUID,
    background_tasks: BackgroundTasks,
    lifecycle=Depends(get_knowledge_lifecycle),
):
    """Re-run a failed ingestion without changing its document/operation ids."""
    try:
        status = await lifecycle.ingestion_status(operation_id)
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    if status is None:
        raise HTTPException(status_code=404, detail="Upload operation not found")
    if status.state.value == "ready":
        payload = UploadReceiptResponse(
            state="ready",
            documentId=status.document_id,
            revisionId=status.revision_id,
            id=status.document_id,
            file_name=status.file_name,
            status="ready",
            chunk_count=status.chunk_count,
            message="Document is already ready for retrieval",
        )
        return JSONResponse(
            status_code=200, content=payload.model_dump(mode="json", by_alias=True)
        )
    background_tasks.add_task(lifecycle.retry_ingestion, operation_id)
    payload = UploadReceiptResponse(
        state="pending",
        documentId=status.document_id,
        operationId=status.operation_id,
        id=status.document_id,
        file_name=status.file_name,
        status="processing",
        chunk_count=status.chunk_count,
        message="Retry accepted; processing is still pending",
    )
    return JSONResponse(
        status_code=202, content=payload.model_dump(mode="json", by_alias=True)
    )


async def _list(lifecycle, owner_kind: str, owner_id: UUID, **scope) -> list[dict]:
    try:
        records = await lifecycle.list_documents(
            owner_kind=owner_kind, owner_id=owner_id
        )
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    return [_document_payload(record, **scope) for record in records]


@router.get("/meeting/{meeting_id}", response_model=list[DocumentResponse])
async def list_meeting_documents(
    meeting_id: UUID, lifecycle=Depends(get_knowledge_lifecycle)
):
    return await _list(lifecycle, "meeting", meeting_id, meeting_id=meeting_id)


@router.get("/persona/{persona_id}", response_model=list[DocumentResponse])
async def list_persona_documents(
    persona_id: UUID, lifecycle=Depends(get_knowledge_lifecycle)
):
    return await _list(lifecycle, "persona", persona_id, persona_id=persona_id)


@router.get("/stack/{stack_id}", response_model=list[DocumentResponse])
async def list_stack_documents(
    stack_id: UUID, lifecycle=Depends(get_knowledge_lifecycle)
):
    return await _list(lifecycle, "stack", stack_id, stack_id=stack_id)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID, lifecycle=Depends(get_knowledge_lifecycle)
):
    try:
        record = await lifecycle.get_document(document_id)
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return _document_payload(record)


@router.delete("/{document_id}")
async def delete_document(
    document_id: UUID, lifecycle=Depends(get_knowledge_lifecycle)
):
    """Revoke eligibility, then attempt source/vector/evidence cleanup."""
    try:
        await lifecycle.delete_document(document_id, reason="user_requested")
        await lifecycle.purge_document_row(document_id)
    except DocumentNotFound as exc:
        raise HTTPException(status_code=404, detail="Document not found") from exc
    except KnowledgeUnavailable as exc:
        raise _unavailable(exc) from exc
    return {"message": "Document deleted", "id": str(document_id)}


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(
    request: DocumentSearchRequest,
    lifecycle=Depends(get_knowledge_lifecycle),
):
    """Search only currently eligible revisions in the requested scope."""
    stack_ids = [
        _as_uuid(value, label="stack_id") for value in (request.stack_ids or [])
    ]
    meeting_id = (
        _as_uuid(request.meeting_id, label="meeting_id")
        if request.meeting_id
        else None
    )
    if not meeting_id and not stack_ids:
        raise HTTPException(status_code=400, detail="A search scope is required")

    try:
        passages = await lifecycle.search(
            RetrievalRequest(
                query=request.query,
                scope=KnowledgeScope(meeting_id=meeting_id, stack_ids=stack_ids),
                identity=RetrievalIdentity(),
                limit=request.limit,
            )
        )
    except (KnowledgeUnavailable, ProjectionUnavailable) as exc:
        raise _unavailable(exc) from exc

    results = [
        DocumentSearchResult(
            text=passage.text,
            score=passage.score,
            document_id=str(passage.document_id),
            revision_id=str(passage.revision_id),
            chunk_id=str(passage.chunk_id) if passage.chunk_id else None,
            chunk_index=passage.chunk_index,
            file_name=passage.file_name,
            page_number=passage.page_number,
        )
        for passage in passages
    ]
    return DocumentSearchResponse(
        query=request.query, results=results, total_results=len(results)
    )
