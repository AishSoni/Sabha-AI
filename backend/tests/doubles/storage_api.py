"""In-memory HTTP double for the Supabase Storage API contract.

Only the endpoints and response shapes the Knowledge source store uses are
implemented. Tests inject it through ``httpx.MockTransport`` so the real
``storage3`` client and our adapter execute, without Docker or a hosted
project.
"""

from __future__ import annotations

import json
import uuid
from email import policy
from email.parser import BytesParser
from typing import Any
from urllib.parse import unquote

import httpx


def _error(status: int, code: str, message: str) -> httpx.Response:
    return httpx.Response(
        status,
        json={"statusCode": status, "error": code, "message": message},
    )


def _bucket_json(bucket_id: str) -> dict[str, Any]:
    return {
        "id": bucket_id,
        "name": bucket_id,
        "owner": "",
        "public": False,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "file_size_limit": None,
        "allowed_mime_types": None,
    }


def _multipart_file(request: httpx.Request) -> bytes:
    content_type = request.headers.get("content-type", "")
    header = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
    message = BytesParser(policy=policy.default).parsebytes(header + request.content)
    for part in message.iter_parts():
        if part.get_filename() is not None:
            payload = part.get_payload(decode=True)
            return payload or b""
    return b""


class FakeStorageApi:
    """A tiny, stateful Supabase Storage HTTP double."""

    def __init__(self, *buckets: str) -> None:
        self.buckets: dict[str, dict[str, bytes]] = {
            bucket: {} for bucket in buckets
        }
        self.requests: list[tuple[str, str]] = []
        self.failures: dict[str, list[int]] = {}

    # -- scripting -------------------------------------------------------

    def fail(self, method: str, path: str, status: int) -> None:
        self.failures.setdefault(f"{method.upper()} {path}", []).append(status)

    def seed(self, bucket: str, key: str, data: bytes) -> None:
        self.buckets.setdefault(bucket, {})[key] = data

    def keys(self, bucket: str) -> list[str]:
        return sorted(self.buckets.get(bucket, ()))

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    # -- routing ---------------------------------------------------------

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        key = f"{request.method.upper()} {path}"
        self.requests.append((request.method.upper(), path))

        scripted = self.failures.get(key)
        if scripted:
            status = scripted.pop(0)
            return _error(status, "scripted_error", "scripted storage failure")

        if not path.startswith("/storage/v1/"):
            return _error(404, "not_found", "unknown path")
        relative = path[len("/storage/v1/") :]

        if relative == "bucket" and request.method == "POST":
            payload = json.loads(request.content or b"{}")
            bucket_id = payload.get("id")
            if not bucket_id:
                return _error(400, "bad_request", "bucket id is required")
            if bucket_id in self.buckets:
                return _error(409, "Duplicate", "The resource already exists")
            self.buckets[bucket_id] = {}
            return httpx.Response(200, json={"name": bucket_id})

        if relative.startswith("bucket/") and relative.count("/") == 1:
            bucket_id = relative.split("/", 1)[1]
            if request.method == "GET":
                if bucket_id not in self.buckets:
                    return _error(404, "not_found", "Bucket not found")
                return httpx.Response(200, json=_bucket_json(bucket_id))
            if request.method == "DELETE":
                if bucket_id not in self.buckets:
                    return _error(404, "not_found", "Bucket not found")
                if self.buckets[bucket_id]:
                    return _error(400, "bad_request", "Bucket is not empty")
                del self.buckets[bucket_id]
                return httpx.Response(200, json={"message": "Successfully deleted"})

        if relative == "object/move" and request.method == "POST":
            payload = json.loads(request.content or b"{}")
            bucket_id = payload.get("bucketId", "")
            source = payload.get("sourceKey", "")
            destination = payload.get("destinationKey", "")
            objects = self.buckets.get(bucket_id)
            if objects is None:
                return _error(404, "not_found", "Bucket not found")
            if source not in objects:
                return _error(404, "not_found", "Object not found")
            objects[destination] = objects.pop(source)
            return httpx.Response(200, json={"message": "Successfully moved"})

        if relative.startswith("object/info/") and request.method == "GET":
            _, _, bucket_id, object_key = relative.split("/", 3)
            data = self.buckets.get(bucket_id, {}).get(object_key)
            if data is None:
                return _error(404, "not_found", "Object not found")
            return httpx.Response(
                200,
                json={
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, object_key)),
                    "name": object_key.rsplit("/", 1)[-1],
                    "size": len(data),
                    "metadata": {"size": len(data)},
                },
            )

        if relative.startswith("object/list/") and request.method == "POST":
            bucket_id = relative.split("/", 2)[2]
            if bucket_id not in self.buckets:
                return _error(404, "not_found", "Bucket not found")
            payload = json.loads(request.content or b"{}")
            prefix = (payload.get("prefix") or "").strip("/")
            limit = int(payload.get("limit") or 100)
            entries = []
            for object_key, data in sorted(self.buckets[bucket_id].items()):
                if prefix and not object_key.startswith(f"{prefix}/"):
                    continue
                remainder = object_key[len(prefix) + 1 :] if prefix else object_key
                if "/" in remainder:
                    continue
                entries.append(
                    {
                        "name": remainder,
                        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, object_key)),
                        "updated_at": "2026-01-01T00:00:00Z",
                        "metadata": {"size": len(data)},
                    }
                )
            return httpx.Response(200, json=entries[:limit])

        if relative.startswith("object/") and request.method == "DELETE":
            bucket_id = relative.split("/", 1)[1]
            if "/" in bucket_id:
                return _error(400, "bad_request", "delete takes no object key")
            objects = self.buckets.get(bucket_id)
            if objects is None:
                return _error(404, "not_found", "Bucket not found")
            payload = json.loads(request.content or b"{}")
            removed = []
            for object_key in payload.get("prefixes", []):
                if objects.pop(object_key, None) is not None:
                    removed.append({"name": object_key})
            return httpx.Response(200, json=removed)

        if relative.startswith("object/"):
            parts = relative.split("/")
            if len(parts) >= 3:
                bucket_id = parts[1]
                object_key = "/".join(parts[2:])
                objects = self.buckets.get(bucket_id)
                if objects is None:
                    return _error(404, "not_found", "Bucket not found")

                if request.method == "POST":
                    objects[object_key] = _multipart_file(request)
                    return httpx.Response(
                        200,
                        json={"Key": f"{bucket_id}/{object_key}", "Id": str(uuid.uuid4())},
                    )
                if request.method == "GET":
                    data = objects.get(object_key)
                    if data is None:
                        return _error(404, "not_found", "Object not found")
                    return httpx.Response(200, content=data)
                if request.method == "HEAD":
                    if object_key not in objects:
                        return httpx.Response(404)
                    return httpx.Response(200)

        return _error(404, "not_found", f"unhandled storage route {key}")
