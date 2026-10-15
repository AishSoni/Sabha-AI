from supabase import create_client, Client
from app.core.config import get_settings

_supabase_client: Client | None = None


def reset_supabase_client() -> None:
    """Phase 01 (P01-T02) test seam: clear the cached singleton."""
    global _supabase_client
    _supabase_client = None


def get_supabase() -> Client:
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        effective = get_settings()
        _supabase_client = create_client(
            effective.supabase_url,
            effective.supabase_key
        )
    return _supabase_client


def get_supabase_admin() -> Client:
    """Get Supabase client with service role key for admin operations."""
    effective = get_settings()
    return create_client(
        effective.supabase_url,
        effective.supabase_service_key or effective.supabase_key
    )
