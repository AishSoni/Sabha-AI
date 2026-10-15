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
        for r in results or []:
            metadata = getattr(r, "metadata", {}) or {}
            text = getattr(r, "text", "") or ""
            items.append({"text": text, "score": getattr(r, "score", 0.0), "metadata": metadata})
            citations.append(
                CitationItem(
                    source=str(metadata.get("file_name", "document")),
                    title=str(metadata.get("file_name", "document")),
                    snippet=text[:500],
                )
            )
        return KnowledgeResult(items=items, citations=citations)
