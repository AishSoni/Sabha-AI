"""Regression (spec-02 E1): uploads are read under a byte budget.

The Knowledge upload surface must abort the read as soon as the byte budget
is exceeded and use the declared Content-Length as a cheap precheck while the
bounded read remains the real guard. Route-level receipt behavior is covered
in ``test_knowledge_routes.py``; these tests pin the helpers themselves.
"""

import pytest

import app.modules.knowledge.presentation.http as knowledge_http
from app.modules.knowledge.presentation.http import (
    UploadTooLargeError,
    parse_declared_size,
    read_bounded,
)


class CountingUploadFake:
    """UploadFile double: read(n) yields up to n bytes; reads are counted."""

    def __init__(self, payload: bytes):
        self._data = payload
        self._offset = 0
        self.read_calls: list[int] = []
        self.closed = False

    async def read(self, n: int) -> bytes:
        self.read_calls.append(n)
        chunk = self._data[self._offset:self._offset + n]
        self._offset += len(chunk)
        return chunk

    async def close(self) -> None:
        self.closed = True


async def test_read_bounded_returns_payload_within_limit():
    upload = CountingUploadFake(b"small payload")
    assert await read_bounded(upload, 100) == b"small payload"
    assert upload.closed is False


async def test_read_bounded_allows_the_exact_boundary():
    upload = CountingUploadFake(b"x" * 16)
    assert await read_bounded(upload, 16) == b"x" * 16
    assert upload.closed is False


async def test_read_bounded_aborts_after_budget_exceeded(monkeypatch):
    # Small chunk size so the budget is crossed across reads deterministically.
    monkeypatch.setattr(knowledge_http, "UPLOAD_CHUNK_SIZE", 16)
    upload = CountingUploadFake(b"x" * 17)

    with pytest.raises(UploadTooLargeError) as error:
        await read_bounded(upload, 16)

    assert "upload limit" in str(error.value)
    assert upload.closed is True
    # Exactly one chunk beyond the limit was read — not the whole body.
    assert upload.read_calls == [16, 16]


def test_parse_declared_size_handles_missing_and_malformed_headers():
    assert parse_declared_size(None) is None
    assert parse_declared_size("") is None
    assert parse_declared_size("not-a-number") is None
    assert parse_declared_size("42") == 42
    assert parse_declared_size(" 42 ") == 42
