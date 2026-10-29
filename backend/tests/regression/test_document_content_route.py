"""Route contract for exact-revision document content."""

from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

import main
from app.bootstrap import Container
from app.modules.knowledge.application.content import RevisionContent
from app.modules.knowledge.application.ports import SourceStoreUnavailable
from app.modules.knowledge.domain.errors import (
    RevisionNotFound,
    RevisionUnavailable,
    UnsupportedRepresentation,
)

DOCUMENT_ID = UUID("00000000-0000-4000-8000-000000000010")
REVISION_ID = UUID("00000000-0000-4000-8000-000000000012")
OTHER_REVISION_ID = UUID("00000000-0000-4000-8000-000000000013")


class FakeLifecycle:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, UUID, str]] = []
        self.content = RevisionContent(
            data=b"%PDF-1.7 retained",
            media_type="application/pdf",
            file_name="board pack.pdf",
            representation="original",
        )
        self.error: Exception | None = None

    async def read_revision_content(
        self, document_id, revision_id, *, representation="original"
    ):
        self.calls.append((document_id, revision_id, representation))
        if self.error is not None:
            raise self.error
        return self.content


@pytest.fixture()
def route_env(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        main.app.state,
        "container",
        Container(prompt_catalog=object(), knowledge_lifecycle=lifecycle),
    )
    return TestClient(main.app), lifecycle


def _get(client, revision_id=REVISION_ID, **params):
    return client.get(
        f"/api/documents/{DOCUMENT_ID}/revisions/{revision_id}/content",
        params=params,
    )


def test_original_bytes_are_private_inline_and_exact(route_env):
    client, lifecycle = route_env

    response = _get(client)

    assert response.status_code == 200
    assert response.content == b"%PDF-1.7 retained"
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["content-disposition"].startswith("inline;")
    assert "attachment" not in response.headers["content-disposition"]
    assert "board_pack.pdf" in response.headers["content-disposition"]
    assert lifecycle.calls == [(DOCUMENT_ID, REVISION_ID, "original")]


def test_derived_text_is_plain_text(route_env):
    client, lifecycle = route_env
    lifecycle.content = RevisionContent(
        data=b"Extracted body",
        media_type="text/plain; charset=utf-8",
        file_name="board pack.txt",
        representation="text",
        derived_from="docx",
    )

    response = _get(client, representation="text")

    assert response.status_code == 200
    assert response.content == b"Extracted body"
    assert response.headers["content-type"].startswith("text/plain")
    assert lifecycle.calls == [(DOCUMENT_ID, REVISION_ID, "text")]


def test_missing_or_mismatched_revision_is_404(route_env):
    client, lifecycle = route_env
    lifecycle.error = RevisionNotFound("Document revision not found")

    response = _get(client, revision_id=OTHER_REVISION_ID)

    assert response.status_code == 404


def test_revoked_revision_is_410(route_env):
    client, lifecycle = route_env
    lifecycle.error = RevisionUnavailable("no longer available")

    response = _get(client)

    assert response.status_code == 410


def test_unsupported_representation_is_422(route_env):
    client, lifecycle = route_env
    lifecycle.error = UnsupportedRepresentation("use text")

    response = _get(client, representation="text")

    assert response.status_code == 422


def test_storage_outage_is_503(route_env):
    client, lifecycle = route_env
    lifecycle.error = SourceStoreUnavailable("down")

    response = _get(client)

    assert response.status_code == 503


def test_unknown_representation_is_rejected_by_the_contract(route_env):
    client, _lifecycle = route_env

    response = _get(client, representation="html")

    assert response.status_code == 422


def test_filename_header_strips_controls_and_encodes_unicode(route_env):
    client, lifecycle = route_env
    lifecycle.content = RevisionContent(
        data=b"safe",
        media_type="text/plain; charset=utf-8",
        file_name='..\\evil\r\nname-é.md',
        representation="original",
    )

    response = _get(client)

    disposition = response.headers["content-disposition"]
    assert "\r" not in disposition
    assert "\n" not in disposition
    assert "filename*=UTF-8''" in disposition
    assert 'filename="evil__name-.md"' in disposition


def test_route_never_exposes_storage_identity(route_env):
    client, _lifecycle = route_env

    response = _get(client)

    assert "location" not in response.headers
    assert "x-storage-key" not in response.headers
    assert "sources/" not in response.text
