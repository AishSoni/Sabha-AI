"""Knowledge scope policy (CONTRACTS section 7).

Pure domain: no FastAPI, Supabase, Qdrant, or provider imports.
Resolves authorized document scope from meeting/participant context,
snapshot assignments, current grants, and tombstones.
"""

from dataclasses import dataclass, field


class UnauthorizedScope(ValueError):
    """Requested collections escape the authorized scope."""


def meeting_collection_name(meeting_id: str) -> str:
    return f"meeting_{meeting_id}_shared"


def persona_collection_name(persona_id: str) -> str:
    return f"persona_{persona_id}_knowledge"


def stack_collection_name(stack_id: str) -> str:
    return f"stack_{stack_id}_knowledge"


@dataclass
class Scope:
    document_ids: list[str] = field(default_factory=list)
    collections: list[str] = field(default_factory=list)


class InMemoryKnowledgePolicyStore:
    """Testable store for ownership, grants, and tombstones.

    Production SQL implementation must preserve the same predicate:
    shared docs by meeting + assigned private stacks intersected with
    current grants, minus tombstones/deleted.
    """

    def __init__(self) -> None:
        self._docs: dict[str, dict] = {}
        self._grants: dict[str, set[str]] = {}
        self._tombstones: set[str] = set()

    def add_document(self, document_id: str, owner: dict, state: str = "indexed") -> None:
        self._docs[document_id] = {"owner": dict(owner), "state": state}

    def grant_stack(self, persona_id: str, stack_id: str) -> None:
        self._grants.setdefault(persona_id, set()).add(stack_id)

    def revoke_stack(self, persona_id: str, stack_id: str) -> None:
        self._grants.get(persona_id, set()).discard(stack_id)

    def tombstone(self, document_id: str) -> None:
        self._tombstones.add(document_id)

    def is_tombstoned(self, document_id: str) -> bool:
        return document_id in self._tombstones


async def resolve_scope(
    store: InMemoryKnowledgePolicyStore,
    meeting_id: str,
    persona_id: str | None,
    snapshot_stacks: list[str] | None = None,
) -> Scope:
    """Authorized document IDs for a meeting/participant context."""
    snapshot_stacks = list(snapshot_stacks or [])
    current = set(store._grants.get(persona_id or "", set()))
    allowed_private = set(snapshot_stacks) & current

    document_ids: list[str] = []
    collections = [meeting_collection_name(meeting_id)]
    for stack_id in sorted(allowed_private):
        collections.append(stack_collection_name(stack_id))

    for doc_id, row in store._docs.items():
        if store.is_tombstoned(doc_id):
            continue
        if row.get("state") == "deleted":
            continue
        owner = row.get("owner", {})
        if owner.get("meeting_id") == meeting_id and row.get("state") == "indexed":
            document_ids.append(doc_id)
            continue
        stack_id = owner.get("stack_id")
        if (
            stack_id
            and stack_id in allowed_private
            and row.get("state") == "indexed"
        ):
            document_ids.append(doc_id)

    return Scope(document_ids=sorted(document_ids), collections=collections)


async def resolve_collections(
    store: InMemoryKnowledgePolicyStore,
    meeting_id: str,
    persona_id: str | None,
    requested_collections: list[str],
) -> list[str]:
    """Validate caller-requested collections against authorized scope.

    Raises UnauthorizedScope before any vector call on escape.
    """
    allowed = {meeting_collection_name(meeting_id)}
    for stack_id in store._grants.get(persona_id or "", set()):
        allowed.add(stack_collection_name(stack_id))
    for name in requested_collections:
        if name not in allowed:
            raise UnauthorizedScope(f"collection not in authorized scope: {name}")
    return list(requested_collections)
