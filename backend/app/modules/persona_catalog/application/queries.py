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
