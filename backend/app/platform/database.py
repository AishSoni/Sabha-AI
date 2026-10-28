from supabase import create_client, Client
from app.platform.config import settings


class DatabaseConfigurationError(RuntimeError):
    """The live backend credential is missing or unusable."""


_supabase_client: Client | None = None


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


def get_supabase() -> Client:
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(settings.supabase_url, _service_key())
    return _supabase_client


def get_supabase_admin() -> Client:
    """Get a Supabase client with the service role key for admin operations."""
    return create_client(settings.supabase_url, _service_key())
