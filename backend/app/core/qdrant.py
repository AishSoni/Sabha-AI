"""
Qdrant client connection utility.
Provides a singleton async client for vector database operations.
"""

from qdrant_client import AsyncQdrantClient
from app.core.config import get_settings

# Singleton client instance
_client: AsyncQdrantClient | None = None


def reset_qdrant_client() -> None:
    """Phase 01 (P01-T02) test seam: clear cached client without closing."""
    global _client
    _client = None


def get_qdrant_client() -> AsyncQdrantClient:
    """
    Get or create the Qdrant async client instance.
    The client is deployment agnostic - same interface for cloud or local.
    """
    global _client
    
    if _client is None:
        effective = get_settings()
        if effective.qdrant_api_key:
            # Qdrant Cloud
            _client = AsyncQdrantClient(
                url=effective.qdrant_url,
                api_key=effective.qdrant_api_key,
            )
        else:
            # Local Qdrant (no API key needed)
            _client = AsyncQdrantClient(url=effective.qdrant_url)
    
    return _client


async def close_qdrant_client() -> None:
    """Close the Qdrant client connection."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None
