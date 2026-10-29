"""Offline asset publication for replay packages (spec-17).

Assets live in a public read-only Supabase Storage bucket under immutable,
content-addressed object keys. The runtime never receives a Storage
credential: browsers load the passive public URLs recorded in asset/read DTOs.
Only the offline publish tool creates the bucket, uploads bytes, and verifies
the uploaded hash before the database rows are exposed.
"""

from __future__ import annotations

import hashlib
from typing import Protocol
from urllib.parse import quote

import httpx

from app.replay.constants import STORAGE_TIMEOUT_SECONDS


class StorageError(RuntimeError):
    """The offline storage publisher could not complete a safe operation."""


class StoragePublisher(Protocol):
    def ensure_bucket(self) -> None: ...

    def upload(self, path: str, data: bytes, content_type: str) -> None: ...

    def verify(self, path: str, sha256: str) -> None: ...

    def public_url(self, path: str) -> str: ...

    def delete(self, path: str) -> None: ...


class SupabaseStoragePublisher:
    """Thin Storage REST client used only by the offline publication tool."""

    def __init__(
        self,
        url: str,
        service_key: str,
        bucket: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = STORAGE_TIMEOUT_SECONDS,
    ) -> None:
        if not url or not service_key:
            raise StorageError(
                "REPLAY_STORAGE_URL and REPLAY_STORAGE_SERVICE_KEY are required "
                "for offline publication"
            )
        self._base = url.rstrip("/")
        self._bucket = bucket
        self._client = httpx.Client(
            timeout=timeout,
            transport=transport,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
        )

    def __enter__(self) -> "SupabaseStoragePublisher":
        return self

    def __exit__(self, *exc_info) -> None:
        self._client.close()

    def _bucket_url(self, suffix: str = "") -> str:
        return f"{self._base}/storage/v1/bucket{suffix}"

    def _object_url(self, path: str, *, public: bool = False) -> str:
        mode = "public/" if public else ""
        return (
            f"{self._base}/storage/v1/object/{mode}"
            f"{quote(self._bucket, safe='')}/{quote(path, safe='/')}"
        )

    def _raise(self, action: str, response: httpx.Response) -> None:
        detail = response.text[:300].strip() if response.text else ""
        raise StorageError(
            f"{action} failed with status {response.status_code}"
            + (f": {detail}" if detail else "")
        )

    def ensure_bucket(self) -> None:
        response = self._client.get(self._bucket_url(f"/{quote(self._bucket, safe='')}"))
        if response.status_code == 200:
            payload = response.json()
            if payload.get("public") is not True:
                raise StorageError(
                    f"bucket {self._bucket!r} exists but is not public; replay "
                    "assets are served as passive public URLs"
                )
            return
        if response.status_code not in (400, 404):
            self._raise("bucket lookup", response)

        created = self._client.post(
            self._bucket_url(),
            json={
                "name": self._bucket,
                "id": self._bucket,
                "public": True,
                "file_size_limit": 10 * 1024 * 1024,
                "allowed_mime_types": [
                    "text/markdown",
                    "text/plain",
                    "application/pdf",
                    "application/json",
                ],
            },
        )
        if created.status_code not in (200, 201):
            self._raise("bucket creation", created)

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        response = self._client.post(
            self._object_url(path),
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "false"},
        )
        if response.status_code in (200, 201):
            return
        if response.status_code in (400, 409) and self._exists(path):
            return
        self._raise("asset upload", response)

    def _exists(self, path: str) -> bool:
        response = self._client.head(self._object_url(path))
        return response.status_code == 200

    def verify(self, path: str, sha256: str) -> None:
        response = self._client.get(self._object_url(path, public=True))
        if response.status_code != 200:
            self._raise("asset verification", response)
        actual = hashlib.sha256(response.content).hexdigest()
        if actual != sha256:
            raise StorageError(
                f"asset {path!r} hash mismatch: expected {sha256}, found {actual}"
            )

    def public_url(self, path: str) -> str:
        return self._object_url(path, public=True)

    def delete(self, path: str) -> None:
        response = self._client.delete(self._object_url(path))
        if response.status_code not in (200, 204, 400, 404):
            self._raise("asset deletion", response)
