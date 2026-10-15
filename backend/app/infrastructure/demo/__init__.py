"""Demo scaffold package: fixture composition and disabled entry only.

No J00-J09 journey, no real-bond content, no specialist seeds. The full
recruiter walkthrough is owned by Phase 10; lifecycle by Phase 04; runtime
by Phase 08.
"""

from app.infrastructure.demo.capabilities import DemoUnavailable
from app.infrastructure.demo.composition import (
    FixtureKnowledgeSearch,
    build_fixture_composition,
)
from app.infrastructure.demo.manifest import (
    ClaimKind,
    DemoSession,
    ScenarioAction,
    ScenarioManifest,
    SourceProvenance,
)

__all__ = [
    "ClaimKind",
    "DemoSession",
    "DemoUnavailable",
    "FixtureKnowledgeSearch",
    "ScenarioAction",
    "ScenarioManifest",
    "SourceProvenance",
    "build_fixture_composition",
]
