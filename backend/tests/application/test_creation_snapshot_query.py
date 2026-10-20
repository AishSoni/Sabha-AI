"""GetCreationSnapshot use case (spec 06).

The query that participant construction (Meetings playbook, next slice)
consumes: one port call in, fully mapped CreationSnapshot or None out —
never persistence rows, never a second template read.
"""

from datetime import datetime, timezone

from app.modules.persona_catalog.application.queries import GetCreationSnapshot

SNAPSHOT_ROW = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Skeptical Investor",
    "subtitle": "Capital Efficiency Lead",
    "color": "#f97316",
    "avatar_url": None,
    "provider_config": {"provider": "", "model": "", "temperature": 0.7, "max_tokens": 2000},
    "is_default": True,
    "user_id": None,
    "created_at": datetime.now(timezone.utc),
    "updated_at": datetime.now(timezone.utc),
    "active_prompt": "Interrogate the numbers.",
    "active_prompt_version": 3,
    "stack_ids": [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
    ],
}


class SnapshotCatalogFake:
    def __init__(self, row) -> None:
        self.row = row
        self.calls: list[str] = []

    async def read_creation_snapshot(self, persona_id: str):
        self.calls.append(persona_id)
        return self.row


async def test_the_query_maps_a_snapshot_row_into_the_domain_view():
    fake = SnapshotCatalogFake(dict(SNAPSHOT_ROW))
    snapshot = await GetCreationSnapshot(fake).execute(SNAPSHOT_ROW["id"])

    assert fake.calls == [SNAPSHOT_ROW["id"]]
    assert snapshot.template.id == SNAPSHOT_ROW["id"]
    assert snapshot.template.name == "Skeptical Investor"
    assert snapshot.template.created_at is not None
    assert snapshot.template.provider_config["temperature"] == 0.7
    assert snapshot.active_prompt == "Interrogate the numbers."
    assert snapshot.active_prompt_version == 3
    assert snapshot.stack_ids == (
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
    )


async def test_an_unknown_template_maps_to_none_one_call_only():
    fake = SnapshotCatalogFake(None)
    snapshot = await GetCreationSnapshot(fake).execute("99999999-9999-4999-8999-999999999999")
    assert snapshot is None
    assert len(fake.calls) == 1


async def test_a_snapshot_row_uses_the_template_carrier_verbatim():
    fake = SnapshotCatalogFake(dict(SNAPSHOT_ROW))
    snapshot = await GetCreationSnapshot(fake).execute(SNAPSHOT_ROW["id"])
    # The carrier is time-stamped evidence: the snapshot does not
    # derive, inherit or re-express it — consumer modules map it.
    assert snapshot.template.provider_config == SNAPSHOT_ROW["provider_config"]
