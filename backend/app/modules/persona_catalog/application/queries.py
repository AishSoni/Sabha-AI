"""Persona catalog application queries (spec 06).

Read use cases over the catalog port; the creation-snapshot query is
the one participant construction consumes, so it never re-reads
template tables itself.
"""

from __future__ import annotations

from typing import Optional

from app.modules.persona_catalog.domain.models import CreationSnapshot


class GetCreationSnapshot:
    """Read one template's coherent creation snapshot via the port.

    ``None`` means the template does not exist; a surviving snapshot is
    fully mapped (``CreationSnapshot.from_rpc_row``) so consumers never
    touch raw persistence rows.
    """

    def __init__(self, catalog) -> None:
        from app.modules.persona_catalog.application.contracts import (
            PersonaCatalogPort,
        )

        self._catalog: PersonaCatalogPort = catalog

    async def execute(self, persona_id: str) -> Optional[CreationSnapshot]:
        row = await self._catalog.read_creation_snapshot(persona_id)
        if row is None:
            return None
        return CreationSnapshot.from_rpc_row(row)

    async def execute_many(
        self, persona_ids: list[str]
    ) -> list[Optional[CreationSnapshot]]:
        """Read a roster in one round trip when the adapter supports it.

        Spec 20: meeting creation should not spend N WAN round trips on N
        templates. Adapters that expose ``read_creation_snapshots`` answer
        the whole roster at once; older doubles and adapters keep working
        through the per-id fallback.
        """
        if not persona_ids:
            return []
        batch_reader = getattr(self._catalog, "read_creation_snapshots", None)
        if batch_reader is None:
            return [await self.execute(persona_id) for persona_id in persona_ids]
        rows = await batch_reader(list(persona_ids))
        by_id = {
            str(row.get("id")): row
            for row in rows or []
            if isinstance(row, dict) and row.get("id") is not None
        }
        snapshots: list[Optional[CreationSnapshot]] = []
        for persona_id in persona_ids:
            row = by_id.get(str(persona_id))
            snapshots.append(
                CreationSnapshot.from_rpc_row(row) if row is not None else None
            )
        return snapshots
