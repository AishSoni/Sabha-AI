"""Bond fixture retrieval: scoped to authorization, no fabrication.

Shared sources reach every specialist. The private downside worksheet reaches
only the assigned structure-downside specialist; other participants receive
shared evidence only. Empty queries return no items. Citations carry source
identity, title and snapshot-anchored snippets.
"""

from typing import Any, Optional

from app.infrastructure.demo.bond_scenario import BondEvidencePack
from app.modules.meetings.ports import CitationItem, KnowledgeResult

WORKSHEET_SOURCE_ID = "downside-worksheet-v1"
WORKSHEET_OWNER = "structure-downside"


class BondKnowledgeSearch:
    """KnowledgeSearch port backed by the frozen bond evidence pack."""

    def __init__(self, pack: BondEvidencePack) -> None:
        self._pack = pack
        self.queries: list[dict[str, Any]] = []

    def _visible_sources(self, persona_id: Optional[str]):
        if persona_id == WORKSHEET_OWNER:
            return list(self._pack.sources)
        return [s for s in self._pack.sources if s.visibility == "shared"]

    async def search(
        self, query: str, meeting_id: str, persona_id: Optional[str]
    ) -> KnowledgeResult:
        self.queries.append(
            {"query": query, "meeting_id": meeting_id, "persona_id": persona_id}
        )
        if not (query or "").strip():
            return KnowledgeResult(items=[], citations=[])
        visible = self._visible_sources(persona_id)
        items: list[dict[str, Any]] = []
        citations: list[CitationItem] = []
        for source in visible:
            snippet = (
                f"{source.title} — snapshot {source.snapshot_date}; "
                f"{source.page_locator}"
            )[:500]
            items.append(
                {
                    "text": snippet,
                    "score": 0.99,
                    "metadata": {
                        "source_id": source.source_id,
                        "file_name": source.title,
                        "snapshot_date": source.snapshot_date,
                    },
                }
            )
            citations.append(
                CitationItem(
                    source=source.source_id,
                    title=source.title,
                    snippet=snippet,
                )
            )
        return KnowledgeResult(items=items, citations=citations)
