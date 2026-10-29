import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions

from app.platform.config import settings
from app.platform.http_client import build_client


class DatabaseConfigurationError(RuntimeError):
    """The live backend credential is missing or unusable."""


_supabase_client: Client | None = None
_http_client: httpx.Client | None = None


def _service_key() -> str:
    """Return the server-only credential; never silently fall back to anon.

    After migration 030 anonymous clients have no live schema USAGE or table
    privileges, so an anon-key client would fail unpredictably at query time.
    Failing at the credential boundary makes the misconfiguration obvious.
    """
    key = (settings.supabase_service_key or "").strip()
    if not key:
        raise DatabaseConfigurationError(
            "SUPABASE_SERVICE_KEY is required for live database access; "
            "the backend never falls back to SUPABASE_KEY"
        )
    return key


def _shared_http_client() -> httpx.Client:
    """One retrying pool shared by every Supabase sub-client.

    A single pool keeps connection setup out of the polling path and means a
    stale keep-alive connection is retried once instead of becoming a failed
    request. See ``app/platform/http_client.py`` for why that race exists.
    """
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = build_client(
            timeout_seconds=settings.supabase_http_timeout_seconds,
            max_connections=settings.supabase_http_max_connections,
            keepalive_seconds=settings.supabase_http_keepalive_seconds,
            retries=settings.supabase_http_retries,
        )
    return _http_client


def _client_options() -> SyncClientOptions:
    return SyncClientOptions(
        httpx_client=_shared_http_client(),
        postgrest_client_timeout=settings.supabase_http_timeout_seconds,
    )


def get_supabase() -> Client:
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_url, _service_key(), _client_options()
        )
    return _supabase_client


def get_supabase_admin() -> Client:
    """Get a Supabase client with the service role key for admin operations."""
    return create_client(settings.supabase_url, _service_key(), _client_options())


def close_supabase() -> None:
    """Release the shared pool on shutdown (idempotent)."""
    global _supabase_client, _http_client
    _supabase_client = None
    if _http_client is not None:
        try:
            _http_client.close()
        except Exception:  # noqa: BLE001 - closing is best effort
            pass
        _http_client = None
