"""Citation pipeline: stable IDs, orphan filtering, no Unknown sources."""

import pytest

pytestmark = pytest.mark.anyio


class _Hit:
    def __init__(self, text, score, document_id, chunk_index, metadata=None):
        self.text = text
        self.score = score
        self.document_id = document_id
        self.chunk_index = chunk_index
        self.metadata = metadata or {}


class _Vectors:
    def __init__(self, hits):
        self._hits = hits

    async def collection_exists(self, name):
        return True

    async def search_multiple_collections(self, collection_names, query, limit=5):
        return list(self._hits[:limit])


def _db(documents):
    class _Chain:
        def __init__(self, rows):
            self._rows = rows

        def eq(self, *a, **k):
            return self

        def in_(self, *a, **k):
            return self

        def execute(self):
            class _R:
                data = list(documents)

            return _R()

    class _Table:
        def select(self, *a, **k):
            return _Chain(documents)

    class _DB:
        def table(self, name):
            return _Table()

    return _DB()


async def test_orphan_hits_filtered_with_stable_citation_ids():
    from app.modules.meetings.knowledge import ServerKnowledgeSearch

    hits = [
        _Hit("good passage", 0.9, "doc-1", 2, {"file_name": "bond.pdf"}),
        _Hit("orphan passage", 0.8, "", 0, {}),
        _Hit("missing doc", 0.7, "doc-gone", 0, {"file_name": "gone.pdf"}),
    ]
    search = ServerKnowledgeSearch(
        vector_store=_Vectors(hits), db_factory=lambda: _db([
            {"id": "doc-1", "file_name": "bond.pdf", "status": "indexed"},
        ])
    )
    result = await search.search("coupon", meeting_id="m-1", persona_id=None)
    # Orphans and docs absent from current state must not surface as valid.
    assert [c.source for c in result.citations] == ["doc-1"]
    assert result.citations[0].snippet.startswith("good passage")
    assert all("Unknown" not in (c.title or "") for c in result.citations)
