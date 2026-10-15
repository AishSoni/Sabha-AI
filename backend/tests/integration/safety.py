"""Phase 01 (P01-T07) integration safety helpers.

Every integration target must be recognizably a test instance before any
destructive setup runs. Owned resources are tracked so teardown removes only
what the test created.
"""

import re

_TEST_PATTERNS = (
    re.compile(r"localhost", re.IGNORECASE),
    re.compile(r"127\.0\.0\.1"),
    re.compile(r"\btest\b", re.IGNORECASE),
)


def require_test_target(url: str, kind: str = "database") -> str:
    """Return url if it is recognizably a test instance, else raise."""
    if not url or not any(p.search(url) for p in _TEST_PATTERNS):
        raise RuntimeError(
            f"P01 safety: refusing destructive {kind} setup against "
            f"non-test target {url!r}. Use an isolated test instance."
        )
    return url


class OwnedResources:
    """Tracks collections/tables created by a test for scoped teardown."""

    def __init__(self):
        self.collections = []
        self.tables = []

    def own_collection(self, name: str) -> str:
        self.collections.append(name)
        return name

    def own_table(self, name: str) -> str:
        self.tables.append(name)
        return name

    def release_all(self, drop_collection, drop_table=None) -> dict:
        removed = {"collections": [], "tables": []}
        for name in self.collections:
            drop_collection(name)
            removed["collections"].append(name)
        self.collections.clear()
        if drop_table is not None:
            for name in self.tables:
                drop_table(name)
                removed["tables"].append(name)
            self.tables.clear()
        return removed
