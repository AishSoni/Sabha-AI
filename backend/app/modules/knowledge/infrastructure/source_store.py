"""Supabase Storage adapter for original document bytes."""

from __future__ import annotations

import hashlib
import os
import tempfile
from typing import Any, BinaryIO, Callable

import httpx
from storage3 import SyncStorageClient
from storage3.exceptions import StorageApiError

from app.modules.knowledge.application.ports import (
    SourceNotFound,
    SourceObjectTooLarge,
    SourceStoreError,
    SourceStoreUnavailable,
    StoredSource,
)


def _status(exc: StorageApiError) -> int:
    try:
        return int(exc.status)
    except (TypeError, ValueError):
        return 0


def _spool_bounded(
    stream: BinaryIO, *, max_bytes: int, key: str
) -> tuple[str, int, str]:
    """Copy the upload stream to a bounded temporary file.

    ``storage3`` only accepts bytes, a path, or a handful of concrete file
    types. Spooling keeps the read budget explicit and lets the SDK open a
    real path instead of copying an arbitrary stream into memory. The digest
    is computed in the same single pass so admission never rereads bytes.
    """
    fd, path = tempfile.mkstemp(prefix="sabha-source-")
    total = 0
    digest = hashlib.sha256()
    try:
        with os.fdopen(fd, "wb") as spool:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise SourceObjectTooLarge(
                        f"source object {key!r} exceeds the {max_bytes} byte budget"
                    )
                digest.update(chunk)
                spool.write(chunk)
            spool.flush()
            os.fsync(spool.fileno())
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return path, total, digest.hexdigest()


class SupabaseSourceStore:
    """A private bucket of original uploads behind the ``SourceStore`` port.

    The bucket is created on first ``ensure_ready`` when it does not exist.
    Object keys are supplied by the caller; this adapter never invents keys
    or decides whether a revision is eligible for retrieval.
    """

    def __init__(
        self,
        *,
        url: str,
        service_key: str,
        bucket: str,
        client_factory: Callable[[], SyncStorageClient] | None = None,
    ) -> None:
        self._url = url.rstrip("/")
        self._service_key = service_key
        self._bucket_id = bucket
        self._client_factory = client_factory
        self._client: SyncStorageClient | None = None

    # -- client ----------------------------------------------------------

    def _storage(self) -> SyncStorageClient:
        if self._client is None:
            if not self._url or not self._service_key:
                raise SourceStoreUnavailable(
                    "Supabase Storage is not configured: SUPABASE_URL and a "
                    "server-side service key are required"
                )
            factory = self._client_factory or self._default_client
            self._client = factory()
        return self._client

    def _default_client(self) -> SyncStorageClient:
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
        }
        return SyncStorageClient(
            url=f"{self._url}/storage/v1",
            headers=headers,
        )

    def _bucket(self):
        return self._storage().from_(self._bucket_id)

    # -- SourceStore -----------------------------------------------------

    def ensure_ready(self) -> None:
        storage = self._storage()
        try:
            storage.get_bucket(self._bucket_id)
            return
        except StorageApiError as exc:
            if _status(exc) != 404:
                raise SourceStoreUnavailable(
                    f"cannot read Supabase Storage bucket {self._bucket_id!r}: "
                    f"{exc.message}"
                ) from exc

        try:
            storage.create_bucket(self._bucket_id, options={"public": False})
        except StorageApiError as exc:
            # Another process won the create race; the bucket now exists.
            if _status(exc) in (400, 409):
                return
            raise SourceStoreUnavailable(
                f"cannot create Supabase Storage bucket {self._bucket_id!r}: "
                f"{exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

    def put(
        self,
        key: str,
        stream: BinaryIO,
        *,
        content_type: str,
        max_bytes: int,
    ) -> StoredSource:
        spool, size, sha256 = _spool_bounded(stream, max_bytes=max_bytes, key=key)
        try:
            self._bucket().upload(
                key,
                spool,
                {"content-type": content_type, "upsert": "true"},
            )
        except StorageApiError as exc:
            raise SourceStoreError(
                f"cannot store source object {key!r}: {exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc
        finally:
            try:
                os.unlink(spool)
            except OSError:
                pass
        return StoredSource(key=key, size=size, sha256=sha256)

    def move(self, source_key: str, destination_key: str) -> None:
        bucket = self._bucket()
        try:
            bucket.move(source_key, destination_key)
            return
        except StorageApiError as exc:
            if _status(exc) != 404:
                raise SourceStoreError(
                    f"cannot finalize source object {source_key!r}: {exc.message}"
                ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

        # Retrying a finalize after the move already succeeded is a no-op.
        if bucket.exists(destination_key):
            return
        raise SourceNotFound(f"staged source object {source_key!r} is missing")

    def download(self, key: str, *, max_bytes: int) -> bytes:
        bucket = self._bucket()
        try:
            info = bucket.info(key)
            size = info.get("size") or (info.get("metadata") or {}).get("size")
            if size is not None and int(size) > max_bytes:
                raise SourceObjectTooLarge(
                    f"source object {key!r} is larger than the {max_bytes} byte budget"
                )
            data = bucket.download(key)
        except StorageApiError as exc:
            if _status(exc) == 404:
                raise SourceNotFound(f"source object {key!r} is missing") from exc
            raise SourceStoreError(
                f"cannot read source object {key!r}: {exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

        if len(data) > max_bytes:
            raise SourceObjectTooLarge(
                f"source object {key!r} is larger than the {max_bytes} byte budget"
            )
        return data

    def exists(self, key: str) -> bool:
        try:
            return self._bucket().exists(key)
        except StorageApiError as exc:
            if _status(exc) == 404:
                return False
            raise SourceStoreError(
                f"cannot inspect source object {key!r}: {exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

    def delete(self, key: str) -> None:
        try:
            self._bucket().remove([key])
        except StorageApiError as exc:
            if _status(exc) == 404:
                return
            raise SourceStoreError(
                f"cannot delete source object {key!r}: {exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

    def list_prefix(self, prefix: str, *, limit: int = 100) -> list[StoredSource]:
        normalized = prefix.rstrip("/")
        try:
            entries: list[dict[str, Any]] = self._bucket().list(
                normalized, {"limit": limit}
            )
        except StorageApiError as exc:
            raise SourceStoreError(
                f"cannot list source prefix {prefix!r}: {exc.message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceStoreUnavailable(
                f"cannot reach Supabase Storage: {exc}"
            ) from exc

        found: list[StoredSource] = []
        for entry in entries:
            name = entry.get("name")
            if not name or entry.get("id") is None:
                # Folder entries carry no object id.
                continue
            size = entry.get("size") or (entry.get("metadata") or {}).get("size")
            found.append(
                StoredSource(
                    key=f"{normalized}/{name}" if normalized else name,
                    size=int(size) if size is not None else None,
                )
            )
        return found
