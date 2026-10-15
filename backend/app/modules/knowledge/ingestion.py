"""Durable ingestion jobs: enqueue persists replayable rows; worker is idempotent.

Pure application service over injected db/vectors/processor ports. No
FastAPI, Supabase, or Qdrant imports here; the API layer supplies fakes
in tests and Supabase/Qdrant adapters in production.
"""

from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def enqueue_ingestion(
    db,
    document_id: str,
    collection: str,
    file_name: str,
    file_type: str,
    storage_path: str,
) -> dict:
    """Create (or reuse) the replayable ingestion job for a document."""
    existing = (
        db.table("document_ingestion_jobs")
        .select("*")
        .eq("document_id", document_id)
        .execute()
    )
    if existing.data:
        return dict(existing.data[0])
    job = {
        "document_id": document_id,
        "collection_name": collection,
        "file_name": file_name,
        "file_type": file_type,
        "storage_object_path": storage_path,
        "state": "queued",
        "attempts": 0,
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.table("document_ingestion_jobs").insert(job).execute()
    db.table("documents").update(
        {"status": "processing", "storage_object_path": storage_path}
    ).eq("id", document_id).execute()
    return dict(job)


async def process_ingestion_job(
    db,
    vectors,
    processor,
    document_id: str,
    file_content: bytes,
    file_name: str,
    file_type: str,
) -> dict:
    """Run one ingestion attempt; success and failure both persist."""
    current = (
        db.table("document_ingestion_jobs")
        .select("*")
        .eq("document_id", document_id)
        .execute()
    )
    row = dict(current.data[0]) if current.data else {"state": "queued", "attempts": 0}
    if row.get("state") == "indexed":
        return {"document_id": document_id, "state": "indexed", "retryable": False}

    attempts = int(row.get("attempts", 0)) + 1
    db.table("document_ingestion_jobs").update(
        {"state": "processing", "attempts": attempts, "updated_at": _now()}
    ).eq("document_id", document_id).execute()
    try:
        # Race guard: a delete that lands mid-processing tombstones first;
        # the worker must not resurrect the document back to indexed.
        try:
            doc_rows = (
                db.table("documents").select("id,status").eq("id", document_id).execute()
            )
            doc_status = (doc_rows.data[0].get("status") if doc_rows.data else None)
        except Exception:
            doc_status = None
        if doc_status in ("deleting", "deleted"):
            try:
                from app.modules.knowledge import lifecycle as lifecycle_service

                collection = (row.get("collection_name") or "").strip()
                if collection:
                    await lifecycle_service.enqueue_cleanup(db, document_id, collection)
            except Exception:
                pass
            return {"document_id": document_id, "state": doc_status, "retryable": False}
        chunks = processor.process_file(
            file_content=file_content,
            file_name=file_name,
            file_type=file_type,
            additional_metadata={"document_id": document_id},
        )
        if not chunks:
            raise ValueError("No text content extracted from document")
        collection = (row.get("collection_name") or "").strip()
        if not collection:
            jobs = (
                db.table("document_ingestion_jobs")
                .select("*")
                .eq("document_id", document_id)
                .execute()
            )
            collection = (jobs.data[0].get("collection_name") or "") if jobs.data else ""
        chunk_count = await vectors.index_document(
            collection_name=collection,
            document_id=document_id,
            chunks=chunks,
        )
        db.table("document_ingestion_jobs").update(
            {"state": "indexed", "error_message": None, "updated_at": _now()}
        ).eq("document_id", document_id).execute()
        db.table("documents").update(
            {
                "status": "indexed",
                "chunk_count": chunk_count,
                "ingestion_attempts": attempts,
                "error_message": None,
            }
        ).eq("id", document_id).execute()
        return {"document_id": document_id, "state": "indexed", "retryable": False}
    except Exception as exc:
        db.table("document_ingestion_jobs").update(
            {"state": "failed", "error_message": str(exc), "updated_at": _now()}
        ).eq("document_id", document_id).execute()
        db.table("documents").update(
            {
                "status": "failed",
                "ingestion_attempts": attempts,
                "error_message": str(exc),
            }
        ).eq("id", document_id).execute()
        return {"document_id": document_id, "state": "failed", "retryable": True}
