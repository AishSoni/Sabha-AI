"""Authorized knowledge search behind an injected port (B-02 boundary).

No undefined globals: the database accessor and vector store are injected.
Collection names are resolved server-side; the model supplies only a query.
"""

from typing import Any, Callable, Optional

from app.modules.meetings.policies import TurnPolicies
from app.modules.meetings.ports import CitationItem, KnowledgeResult


class ServerKnowledgeSearch:
    """Resolve shared + persona-private scope server-side."""

    def __init__(
        self,
        vector_store: Any,
        db_factory: Optional[Callable[[], Any]] = None,
        policies: TurnPolicies | None = None,
    ) -> None:
        self._vectors = vector_store
        self._db_factory = db_factory
        self._policies = policies or TurnPolicies()

    async def search(
        self,
        query: str,
        meeting_id: str,
        persona_id: Optional[str],
    ) -> KnowledgeResult:
        q = (query or "").strip()
        if not q:
            return KnowledgeResult(items=[], citations=[])
        q = q[: self._policies.max_query_chars]

        collections: list[str] = []
        try:
            from app.services.vector_store import VectorStoreManager

            shared = VectorStoreManager.meeting_collection_name(meeting_id)
            if await self._vectors.collection_exists(shared):
                collections.append(shared)

            if persona_id and self._db_factory is not None:
                db = self._db_factory()
                stacks = (
                    db.table("persona_knowledge_stacks")
                    .select("stack_id")
                    .eq("persona_id", persona_id)
                    .execute()
                )
                for row in stacks.data or []:
                    name = VectorStoreManager.stack_collection_name(row["stack_id"])
                    if await self._vectors.collection_exists(name):
                        collections.append(name)
        except Exception:
            # Infrastructure failure is reported as empty with no leak; the
            # engine maps it to a structured tool failure.
            return KnowledgeResult(items=[], citations=[])

        if not collections:
            return KnowledgeResult(items=[], citations=[])

        try:
            results = await self._vectors.search_multiple_collections(
                collection_names=collections,
                query=q,
                limit=5,
            )
        except Exception:
            return KnowledgeResult(items=[], citations=[])

        items: list[dict[str, Any]] = []
        citations: list[CitationItem] = []
        live: dict[str, dict[str, Any]] = {}
        if self._db_factory is not None:
            try:
                db = self._db_factory()
                rows = (
                    db.table("documents")
                    .select("id,file_name,status")
                    .eq("meeting_id", meeting_id)
                    .execute()
                )
                for row in (rows.data or []):
                    if (row or {}).get("status") == "deleted":
                        continue
                    if row.get("id"):
                        live[str(row["id"])] = row
            except Exception:
                live = {}
        for r in results or []:
            metadata = getattr(r, "metadata", {}) or {}
            text = getattr(r, "text", "") or ""
            document_id = str(getattr(r, "document_id", "") or metadata.get("document_id", ""))
            if not document_id:
                continue
            if live and document_id not in live:
                continue
            title = str(
                metadata.get("file_name", "")
                or (live.get(document_id) or {}).get("file_name", "")
                or document_id
            )
            if "Unknown" in title:
                continue
            chunk_index = getattr(r, "chunk_index", 0)
            try:
                chunk_index = int(chunk_index if chunk_index is not None else 0)
            except (TypeError, ValueError):
                chunk_index = 0
            items.append(
                {
                    "text": text,
                    "score": getattr(r, "score", 0.0),
                    "metadata": metadata,
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                }
            )
            citations.append(
                CitationItem(
                    source=document_id,
                    title=title,
                    snippet=text[:500],
                )
            )
        return KnowledgeResult(items=items, citations=citations)
