"""Offline Storage publisher behavior (spec-17)."""

from __future__ import annotations

import hashlib

import httpx
import pytest

from app.replay.storage import StorageError, SupabaseStoragePublisher

SERVICE_KEY = "offline-service-key"
BUCKET = "replay-assets"


def _publisher(handler) -> SupabaseStoragePublisher:
    return SupabaseStoragePublisher(
        "https://project.supabase.co",
        SERVICE_KEY,
        BUCKET,
        transport=httpx.MockTransport(handler),
    )


def test_creates_a_missing_public_bucket() -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.method == "GET":
            return httpx.Response(404, json={"message": "not found"})
        return httpx.Response(200, json={})

    storage = _publisher(handler)
    storage.ensure_bucket()

    assert calls[0][0] == "GET"
    assert calls[1][0] == "POST"
    assert calls[1][1].endswith("/storage/v1/bucket")


def test_refuses_an_existing_private_bucket() -> None:
    storage = _publisher(
        lambda request: httpx.Response(
            200, json={"name": BUCKET, "public": False}
        )
    )
    with pytest.raises(StorageError):
        storage.ensure_bucket()


def test_upload_tolerates_an_existing_identical_object() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(409, json={"message": "duplicate"})
        return httpx.Response(200)

    _publisher(handler).upload("pkg/1/abc.md", b"hello", "text/markdown")


def test_verify_compares_the_downloaded_hash() -> None:
    payload = b"replay asset"
    digest = hashlib.sha256(payload).hexdigest()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=payload)

    storage = _publisher(handler)
    storage.verify("pkg/1/abc.md", digest)

    with pytest.raises(StorageError):
        storage.verify("pkg/1/abc.md", "0" * 64)


def test_public_url_is_passive_and_content_addressed() -> None:
    storage = _publisher(lambda request: httpx.Response(200))
    url = storage.public_url("pkg/1/abc.md")
    assert url.startswith("https://project.supabase.co/storage/v1/object/public/")
    assert url.endswith("/pkg/1/abc.md")
    assert SERVICE_KEY not in url
