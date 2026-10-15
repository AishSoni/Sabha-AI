"""Phase 01 (P01-T03) bounded fake knowledge results."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class FakeHit:
    text: str
    score: float
    document_id: str
    file_name: str = "test-doc.pdf"
    chunk_index: int = 0


@dataclass
class FakeKnowledge:
    """Bounded, deterministic retrieval double with failure injection."""

    hits: List[FakeHit] = field(default_factory=list)
    existing_collections: List[str] = field(default_factory=list)
    fail_with: Optional[BaseException] = None
    max_results: int = 5
    queries: List[Dict[str, object]] = field(default_factory=list)

    def collection_exists(self, name: str) -> bool:
        return name in self.existing_collections

    def search(self, collection: str, query: str, limit: int = 5) -> List[FakeHit]:
        self.queries.append({"collection": collection, "query": query, "limit": limit})
        if self.fail_with is not None:
            raise self.fail_with
        if collection not in self.existing_collections:
            return []
        q = query.lower()
        ranked = [h for h in self.hits if not q or q in h.text.lower()] or list(self.hits)
        return ranked[: min(limit, self.max_results)]
