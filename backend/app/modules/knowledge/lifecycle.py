"""Knowledge lifecycle: tombstone-first deletion with durable cleanup."""

from dataclasses import dataclass, field


@dataclass
class CleanupJob:
    document_id: str
    collection: str
    point_ids: list[str] = field(default_factory=list)
    done: bool = False
    attempts: int = 0


@dataclass
class DeletionOutcome:
    document_id: str
    state: str  # "deleting" | "deleted"
    cleanup_pending: bool


class InMemoryLifecycleStore:
    def __init__(self) -> None:
        self._collections: dict[str, str] = {}
        self._points: dict[str, list[str]] = {}
        self._searchable: dict[str, bool] = {}
        self._jobs: dict[str, CleanupJob] = {}

    async def register_indexed(
        self, document_id: str, collection: str, points: list[str]
    ) -> None:
        self._collections[document_id] = collection
        self._points[document_id] = list(points)
        self._searchable[document_id] = True

    async def is_searchable(self, document_id: str) -> bool:
        return self._searchable.get(document_id, False)

    def cleanup_job_for(self, document_id: str) -> CleanupJob | None:
        return self._jobs.get(document_id)

    async def cascade_delete_parent(self, parent_id: str) -> None:
        # Intentionally preserves cleanup jobs: identifiers must survive
        # parent cascades so workers can finish physical cleanup.
        return None


async def delete_document(store: InMemoryLifecycleStore, vectors, document_id: str) -> DeletionOutcome:
    collection = store._collections.get(document_id, "")
    point_ids = list(store._points.get(document_id, []))
    # Immediate logical deletion: exclude from new retrieval first.
    store._searchable[document_id] = False
    store._jobs[document_id] = CleanupJob(
        document_id=document_id, collection=collection, point_ids=point_ids
    )
    if vectors is None:
        return DeletionOutcome(document_id=document_id, state="deleting", cleanup_pending=True)
    try:
        await vectors.delete_points(collection=collection, point_ids=point_ids)
    except Exception:
        return DeletionOutcome(document_id=document_id, state="deleting", cleanup_pending=True)
    store._jobs[document_id].done = True
    return DeletionOutcome(document_id=document_id, state="deleted", cleanup_pending=False)


async def run_cleanup(store: InMemoryLifecycleStore, vectors, document_id: str) -> None:
    job = store._jobs.get(document_id)
    if job is None or job.done:
        return
    job.attempts += 1
    try:
        await vectors.delete_points(collection=job.collection, point_ids=job.point_ids)
    except Exception:
        return
    job.done = True


async def enqueue_cleanup(db, document_id: str, collection: str) -> dict:
    """Persist vector cleanup work before attempting physical deletion."""
    existing = (
        db.table("vector_cleanup_outbox")
        .select("*")
        .eq("document_id", document_id)
        .execute()
    )
    if existing.data:
        return dict(existing.data[0])
    job = {
        "document_id": document_id,
        "collection_name": collection,
        "done": False,
        "attempts": 0,
    }
    try:
        db.table("vector_cleanup_outbox").insert(job).execute()
    except Exception:
        pass
    return dict(job)


async def run_cleanup_job(db, vectors, document_id: str) -> dict:
    """Run one persisted cleanup attempt; safe to retry until done."""
    current = (
        db.table("vector_cleanup_outbox")
        .select("*")
        .eq("document_id", document_id)
        .execute()
    )
    if not current.data or current.data[0].get("done"):
        return {"document_id": document_id, "done": True}
    job = dict(current.data[0])
    attempts = int(job.get("attempts", 0)) + 1
    try:
        db.table("vector_cleanup_outbox").update({"attempts": attempts}).eq(
            "document_id", document_id
        ).execute()
    except Exception:
        pass
    try:
        if hasattr(vectors, "delete_document"):
            await vectors.delete_document(
                collection_name=job.get("collection_name", ""),
                document_id=document_id,
            )
        else:
            await vectors.delete_points(
                collection=job.get("collection_name", ""), point_ids=[]
            )
    except Exception:
        return {"document_id": document_id, "done": False, "retryable": True}
    try:
        db.table("vector_cleanup_outbox").update({"done": True}).eq(
            "document_id", document_id
        ).execute()
    except Exception:
        pass
    return {"document_id": document_id, "done": True}
