"""Approved model endpoint destinations (P05-T06, B-06).

Caller-controlled base_url values never reach the transport. Only pinned
hosts are allowed, redirects are rejected, and validation runs before
every outbound request.
"""

from __future__ import annotations

from urllib.parse import urlparse

ALLOWED_HOSTS = {
    "openrouter.ai",
    "generativelanguage.googleapis.com",
    "127.0.0.1",
    "localhost",
}

BLOCKED_SCHEMES = {"file", "ftp", "gopher"}


class DestinationDenied(ValueError):
    pass


def validate_destination(url: str | None) -> str:
    if not url or not str(url).strip():
        raise DestinationDenied("empty destination")
    parsed = urlparse(str(url).strip())
    if parsed.scheme in BLOCKED_SCHEMES:
        raise DestinationDenied(f"blocked scheme {parsed.scheme!r}")
    if parsed.scheme not in ("http", "https"):
        raise DestinationDenied(f"unsupported scheme {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        raise DestinationDenied(f"unapproved host {host!r}")
    return str(url).strip()


def validate_ollama_base_url(base_url: str | None, *, allow_env_loopback: bool = True) -> str:
    """Ollama specifically: loopback or explicitly approved host only."""
    url = validate_destination(base_url)
    host = (urlparse(url).hostname or "").lower()
    if host in ("127.0.0.1", "localhost"):
        return url
    # Non-loopback Ollama hosts must still be pinned; deny by default.
    raise DestinationDenied(f"ollama host {host!r} is not approved")


HTTPX_NO_REDIRECTS = {"follow_redirects": False}
